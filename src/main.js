import * as THREE from 'three';
import { buildCity } from './world/city.js';
import { buildIsland, groundHeight, nearestBeach } from './world/island.js';
import { Colliders } from './core/collision.js';
import { Player } from './actors/player.js';
import { Traffic } from './actors/traffic.js';
import { Pedestrians } from './actors/peds.js';
import { Balls, BALL_SPAWNS } from './world/balls.js';
import { Lighthouse } from './world/landmarks/lighthouse.js';
import { PooManHero } from './fx/poo-man-hero.js';
import { buildForest } from './world/landmarks/forest.js';
import { Smoke } from './world/landmarks/factory.js';
import { Minimap } from './core/minimap.js';
import { Speakers } from './fx/speakers.js';
import { Fountains } from './fx/fountains.js';
import { FOUNTAINS } from './world/blocks/index.js';
import { updateStore, storeHint, inStore } from './world/landmarks/store.js';
import { key } from './core/keycap.js';
import { mergeStatic } from './core/merge.js';

const app = document.getElementById('app');
const overlay = document.getElementById('overlay');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd8ef);
scene.fog = new THREE.Fog(0xbde4f2, 180, 900);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.15, 2000);

// ---- lights ----
const hemi = new THREE.HemisphereLight(0xdff3ff, 0x9db08a, 1.05);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff3dc, 1.9);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
// Rather than one shadow map stretched over the whole 2100m island (~0.5m/texel,
// which turns thin posts into jagged blocks), the map covers a small window that
// FOLLOWS the camera — effectively a single tight cascade. Same map, same light,
// same cost, but ~0.15m/texel where you actually are, so near shadows are crisp.
// Distant buildings fall outside the window and go shadowless, but they're fog-
// hazed and looked bad at 0.5m anyway. Tune SHADOW_R (crispness vs coverage) and
// SHADOW_AHEAD (how far ahead of the camera the window sits) to taste.
const SHADOW_R = 300;         // half-size of the follow window (m) → 600/4096 ≈ 0.146m/texel
const SHADOW_AHEAD = 180;     // push the window ahead of the camera so the foreground is covered
const SUN_DIST = 1300;        // how far up-sun the light sits from the window centre
const SHADOW_EVERY = 2;       // refresh the shadow map every Nth active frame. 1 = fully smooth
                              // moving shadows (max cost), higher = cheaper but steppier movers.
sun.shadow.camera.left = -SHADOW_R;
sun.shadow.camera.right = SHADOW_R;
sun.shadow.camera.top = SHADOW_R;
sun.shadow.camera.bottom = -SHADOW_R;
// Depth range bracketing SUN_DIST ± (window + tall towers + hills). Tighter than the
// old 50..2600 because the window is small now, which sharpens depth precision.
sun.shadow.camera.near = 800;
sun.shadow.camera.far = 1800;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.6;
sun.shadow.radius = 3; // soften the PCF edge a touch
// Only actors move (and now the window follows the camera), so we drive the shadow
// map manually and refresh it every few frames (see the loop) — never every frame.
sun.shadow.autoUpdate = false;
sun.shadow.needsUpdate = true; // render it once for the title-screen frame
scene.add(sun, sun.target);

// Fixed sun DIRECTION (only the position slides with the window); the light always
// shines down this vector so shadows keep a consistent angle across the city.
const SUN_DIR = new THREE.Vector3(0.45, 1, 0.35).normalize();

// Re-centre the shadow window on a ground point ahead of the camera, snapped to the
// shadow-map texel grid so the shadow edges don't crawl/shimmer as the window slides.
// (Snap in light space — the two axes perpendicular to SUN_DIR are the map's plane.)
const _lightOrient = new THREE.Matrix4().lookAt(
  new THREE.Vector3(), SUN_DIR.clone().negate(), new THREE.Vector3(0, 1, 0));
const _lightOrientInv = _lightOrient.clone().invert();
const _shadowCentre = new THREE.Vector3();
const _camFwd = new THREE.Vector3();
function updateSunShadow() {
  camera.getWorldDirection(_camFwd);
  _camFwd.y = 0;
  if (_camFwd.lengthSq() < 1e-6) _camFwd.set(0, 0, -1); else _camFwd.normalize();
  _shadowCentre.set(
    camera.position.x + _camFwd.x * SHADOW_AHEAD, 0,
    camera.position.z + _camFwd.z * SHADOW_AHEAD);
  const texel = (2 * SHADOW_R) / sun.shadow.mapSize.x;
  _shadowCentre.applyMatrix4(_lightOrientInv);
  _shadowCentre.x = Math.floor(_shadowCentre.x / texel) * texel;
  _shadowCentre.y = Math.floor(_shadowCentre.y / texel) * texel;
  _shadowCentre.applyMatrix4(_lightOrient);
  sun.target.position.copy(_shadowCentre);
  sun.position.copy(_shadowCentre).addScaledVector(SUN_DIR, SUN_DIST);
  sun.updateMatrixWorld(true);
  sun.target.updateMatrixWorld(true);
}
sun.shadow.camera.updateProjectionMatrix();

const colliders = new Colliders();

// ---- opening panorama ----
// The very first screen (before the player has ever clicked Play) is NOT the
// gameplay camera: it's a fixed, elevated oblique view over the city. Tune the
// two vectors to reframe it (live: __game.applyPanorama() after editing, or set
// __game.camera.position/lookAt in the console while the opening screen is up).
const PANORAMA = {
  pos: new THREE.Vector3(-140, 120, 300),
  look: new THREE.Vector3(150, -35, -150),
};
function applyPanorama() {
  camera.position.copy(PANORAMA.pos);
  camera.lookAt(PANORAMA.look);
}

// ---- background music (DOM element — cheap to grab up front) ----
const bgm = document.getElementById('bgm');
const BGM_VOL = 0.35;    // city bgm's full volume
bgm.volume = BGM_VOL;

// Hansen's store song: swaps in for the city bgm while you're inside the
// grocery. `storeMix` eases 0→1 as you enter (and back), and the crossfade in
// tick() (run after speakers.update so it composes with the memorial duck)
// applies it. Restarted from the top on each entry — see the tick block.
const storeBgm = document.getElementById('store-bgm');
const STORE_VOL = 0.5;   // Hansen's song's full volume
const STORE_FADE = 0.6;  // crossfade time-constant (s)
storeBgm.volume = 0;
let storeMix = 0;        // 0 = city bgm, 1 = Hansen's song
let storeWasIn = false;  // edge-detect entering the store, to restart the song

// World / actor objects are created asynchronously in boot() below (so the
// loading screen can animate between build phases); declared here so the event
// handlers and the render loop can close over them. They're all populated
// before tick() starts, and every handler only fires after the player has
// clicked Play — i.e. long after boot() has finished.
let lighthouse, pooManHero, smoke, minimap, traffic, player, peds, balls;
let listener, speakers, fountains;
let started = false; // flips true the first time the player clicks Play

// ---- pointer lock ----
let locked = false;
let relockTimer = 0;
// After ESC exits the lock, the browser rejects requestPointerLock() for ~1s
// ("Pointer lock cannot be acquired immediately after the user has exited the
// lock"). Swallow that rejection and keep retrying until the cooldown passes so
// the click still takes effect instead of silently failing.
function acquireLock() {
  clearTimeout(relockTimer);
  const p = renderer.domElement.requestPointerLock();
  if (p && typeof p.catch === 'function') {
    p.catch(() => {
      if (!locked) relockTimer = setTimeout(acquireLock, 150);
    });
  }
}
// Only the Play button enters the world (not a click anywhere on the overlay),
// so the pause screen's panels are freely clickable without launching.
const playBtn = document.getElementById('playBtn');
playBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!started) {
    started = true;
    overlay.classList.remove('opening');       // leave the panorama for the gameplay cam
    document.body.classList.remove('opening');  // reveal the gameplay HUD
    player.settleCamera();                      // reset camera smoothing to the spawn view
  }
  acquireLock();
  if (bgm.paused) bgm.play().catch(() => {});
  speakers.play();
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  if (locked) clearTimeout(relockTimer);
  if (locked) {
    // drop focus from any menu button, or SPACE (jump) would "click" it mid-game
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  }
  overlay.classList.toggle('hidden', locked);
  // ESC unlocks the pointer → treat it as a full pause: silence all music (the
  // world/actors are frozen in the loop below). Clicking Play re-locks to resume.
  if (!locked) {
    playBtn.textContent = 'Resume';
    bgm.pause();
    storeBgm.pause();
    speakers.pause();
  }
});
document.addEventListener('mousemove', (e) => {
  if (locked) player.onMouseMove(e.movementX, e.movementY);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- loop ----
const clock = new THREE.Clock();
const fpsEl = document.getElementById('fps');
let fpsAccum = 0; // smoothed frame time (s), EMA
let fpsSince = 0; // time since last readout refresh
let shadowTick = 0; // drives the throttled shadow-map refresh
let lastHintHtml = ''; // last HUD hint HTML written, so we only re-render on change

function tick() {
  requestAnimationFrame(tick);
  const raw = clock.getDelta();
  const dt = Math.min(raw, 0.05);

  // tiny fps readout — EMA-smoothed, refreshed a few times a second
  fpsAccum = fpsAccum ? fpsAccum * 0.9 + raw * 0.1 : raw;
  fpsSince += raw;
  if (fpsEl && fpsSince > 0.25) {
    fpsSince = 0;
    fpsEl.textContent = Math.round(1 / fpsAccum) + ' fps';
  }

  // Paused (pointer unlocked / overlay showing): freeze the world — no player
  // control, no cars, peds, balls, or speaker animation — but keep rendering the
  // still frame. clock.getDelta() above still drains the elapsed time, so there
  // is no dt spike on resume.
  if (locked) {
    player.update(dt);
    updateStore(player, dt); // Hansen's doorway hint + fade-and-teleport
    traffic.update(dt, player);
    peds.update(dt, traffic, player);
    balls.update(dt, player, traffic);
    lighthouse.update(dt);
    pooManHero.update(dt);
    fountains.update(dt); // fountain spray arcs
    const memorialDuck = speakers.update(dt, player); // 1 = full bgm, 0 = at the memorial

    // Hansen's store music: crossfade the city bgm out and the store song in
    // while inside the grocery. Runs after speakers.update so it composes with
    // (and overrides) the memorial duck. The song restarts from the top on each
    // entry, and pauses once it's fully faded back out.
    const wantStore = inStore();
    if (wantStore && !storeWasIn) { storeBgm.currentTime = 0; storeBgm.play().catch(() => {}); }
    storeWasIn = wantStore;
    storeMix += ((wantStore ? 1 : 0) - storeMix) * Math.min(1, dt / STORE_FADE);
    if (storeMix < 0.001) { storeMix = 0; if (!wantStore && !storeBgm.paused) storeBgm.pause(); }
    if (wantStore && storeBgm.paused) storeBgm.play().catch(() => {}); // resume after an ESC pause
    // ONE write per element per frame — never write an intermediate value and
    // then scale it (the audio thread can catch the intermediate → audible blip).
    const bgmVol = BGM_VOL * memorialDuck * (1 - storeMix);
    if (bgm.volume !== bgmVol) bgm.volume = bgmVol;
    const storeVol = STORE_VOL * storeMix;
    if (storeBgm.volume !== storeVol) storeBgm.volume = storeVol;

    // Refresh the (manually driven) shadow map every SHADOW_EVERY active frames:
    // re-centre the follow window on the current view, then re-capture (static
    // casters + moving actors). Higher-frequency refreshes make cars/peds/the
    // player's own shadow track more smoothly. Paused → skip entirely.
    if (shadowTick++ % SHADOW_EVERY === 0) { updateSunShadow(); sun.shadow.needsUpdate = true; }
  }

  // near-car HUD hint (HTML: the key letter is drawn as a keycap icon)
  const hint = document.getElementById('hint');
  if (hint) {
    const html = player.car ? `${key('E')} get out` : (player.nearCar ? `${key('E')} drive` : storeHint());
    if (lastHintHtml !== html) { hint.innerHTML = html; lastHintHtml = html; }
    hint.style.display = html ? 'block' : 'none';
  }

  // boost meter + speedometer (visible while driving)
  const boostEl = document.getElementById('boost');
  if (boostEl) {
    boostEl.style.display = player.car ? 'block' : 'none';
    if (player.car) {
      const fill = boostEl.querySelector('.fill');
      fill.style.width = (player.car.boost * 100).toFixed(1) + '%';
      fill.style.background = player.car.boost < 0.25 ? '#ff9f43' : '#6ee7ff';
    }
  }
  const spdEl = document.getElementById('speedo');
  if (spdEl) {
    spdEl.style.display = player.car ? 'block' : 'none';
    if (player.car) {
      const mph = String(Math.round(Math.abs(player.driveSpeed) * 2.23694));
      const num = spdEl.querySelector('.num');
      if (num.textContent !== mph) num.textContent = mph;
    }
  }

  minimap.update(player);
  smoke.update(dt); // smoke drifts even while paused, so the plant is never dead

  renderer.render(scene, camera);
}

// ---- boot: build the world in phases so the loading screen can animate ----
// Every phase is a chunk of the (heavy, synchronous) world build; yielding a
// frame between them lets the browser paint the spinner + progress bar and keeps
// the tab responsive. The order is load-bearing: all static builders run, then
// mergeStatic collapses them, then the minimap is captured, and only then are
// the moving actors added (see the module header for why).
const raf = () => new Promise(requestAnimationFrame);
const loadingEl = document.getElementById('loading');
const barFill = loadingEl.querySelector('.fill');
const phaseEl = loadingEl.querySelector('.phase');
function setProgress(pct, label) {
  barFill.style.width = pct + '%';
  if (label) phaseEl.textContent = label;
}

async function boot() {
  await raf(); // let the loading screen paint before the first heavy chunk

  setProgress(8, 'Shaping the island…');
  buildIsland(scene, colliders);
  await raf();

  setProgress(34, 'Raising the city…');
  buildCity(scene, colliders);
  await raf();

  setProgress(52, 'Planting the forest…');
  buildForest(scene, colliders);
  await raf();

  setProgress(64, 'Setting the scene…');
  mergeStatic(scene); // collapse the static meshes (before any actor is added)
  lighthouse = new Lighthouse(scene, colliders);
  pooManHero = new PooManHero(scene); // the town hero flying his sky patrol
  smoke = new Smoke(scene);
  fountains = new Fountains(scene, FOUNTAINS); // animated water over every wet fountain
  await raf();

  setProgress(74, 'Drawing the map…');
  // The minimap is a one-time top-down render of the finished static world —
  // taken before the actors are added so cars/peds stay off the map.
  minimap = new Minimap(document.getElementById('minimap'), renderer, scene);
  sun.shadow.needsUpdate = true; // the map render consumed the pending shadow pass
  await raf();

  setProgress(84, 'Filling the streets…');
  traffic = new Traffic(scene, colliders);
  await raf();

  setProgress(94, 'Waking the locals…');
  player = new Player(scene, camera, colliders, traffic);
  peds = new Pedestrians(scene, colliders);
  balls = new Balls(scene, colliders);
  for (const s of BALL_SPAWNS) balls.add(s.x, s.z);
  player.settleCamera(); // place the character at spawn (camera gets overridden below)
  applyPanorama();        // frame the title screen with the static city vista
  updateSunShadow();      // centre the shadow window on the panorama view before its render

  // Poo Man memorial speakers (positional music that ducks the bgm).
  listener = new THREE.AudioListener();
  camera.add(listener);
  speakers = new Speakers(scene, listener);

  window.__game = { player, traffic, peds, pooManHero, groundHeight, nearestBeach, renderer, scene, camera, applyPanorama }; // debug/testing hook
  await raf();

  setProgress(100, 'Ready');
  sun.shadow.needsUpdate = true;  // render the (re-centred) shadow map into the panorama frame
  renderer.render(scene, camera); // paint the panorama once behind the (still hidden) overlay
  finishLoading();
  tick();
}

// Reveal the title screen: drop the loading gate (which un-hides the overlay +
// its Play button and the minimap frame) and fade the loader out.
function finishLoading() {
  document.body.classList.remove('loading');
  loadingEl.classList.add('done');
  setTimeout(() => { loadingEl.style.display = 'none'; }, 500);
}

boot();
