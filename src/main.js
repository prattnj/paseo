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
import { updateStore, storeHint } from './world/landmarks/store.js';
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
sun.shadow.camera.near = 50;
sun.shadow.camera.far = 2600;
const S = 1050; // half-size: covers the ±885 grid + beaches from the sun's tilt
sun.shadow.camera.left = -S;
sun.shadow.camera.right = S;
sun.shadow.camera.top = S;
sun.shadow.camera.bottom = -S;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 1.0; // larger frustum/texel needs a normal offset vs acne
// The sun is fixed and the whole static city casts into a 4096² map — re-rendering
// that every frame is the scene's single biggest cost. Only actors move, so we drive
// the shadow map manually (see the loop) and refresh it every few frames instead.
sun.shadow.autoUpdate = false;
sun.shadow.needsUpdate = true; // render it once for the title-screen frame
scene.add(sun, sun.target);

// ---- world ----
const colliders = new Colliders();
buildIsland(scene, colliders);
buildCity(scene, colliders);
buildForest(scene, colliders);

// Collapse the static world's ~1600 loose landmark/terrain meshes into a few
// merged meshes per material — must run here, after every static builder and
// before any actor or animated object is added to the scene.
mergeStatic(scene);

const lighthouse = new Lighthouse(scene, colliders);
const pooManHero = new PooManHero(scene); // the town hero flying his sky patrol
const smoke = new Smoke(scene);

// The minimap is a one-time top-down render of the finished static world, so
// take it here — before the actors are added — to keep cars/peds off the map.
const minimap = new Minimap(document.getElementById('minimap'), renderer, scene);
sun.shadow.needsUpdate = true; // the map render consumed the pending shadow pass; redo it for the title frame

const traffic = new Traffic(scene, colliders);
const player = new Player(scene, camera, colliders, traffic);
const peds = new Pedestrians(scene, colliders);
const balls = new Balls(scene, colliders);
for (const s of BALL_SPAWNS) balls.add(s.x, s.z);
player.settleCamera(); // frame the spawn view for the title screen (before pointer lock)
window.__game = { player, traffic, peds, pooManHero, groundHeight, nearestBeach, renderer, scene, camera }; // debug/testing hook

// ---- background music ----
const bgm = document.getElementById('bgm');
bgm.volume = 0.35;

// ---- Poo Man memorial speakers (positional music that ducks the bgm) ----
const listener = new THREE.AudioListener();
camera.add(listener);
const speakers = new Speakers(scene, listener);

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
overlay.addEventListener('click', () => {
  acquireLock();
  if (bgm.paused) bgm.play().catch(() => {});
  speakers.play();
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  if (locked) clearTimeout(relockTimer);
  overlay.classList.toggle('hidden', locked);
  // ESC unlocks the pointer → treat it as a full pause: silence all music (the
  // world/actors are frozen in the loop below). Clicking to re-lock resumes.
  if (!locked) {
    bgm.pause();
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
const SUN_DIR = new THREE.Vector3(0.45, 1, 0.35).normalize();

// Fixed sun over the island centre — the shadow frustum is large enough to
// cover everything, so it never needs to move.
sun.position.copy(SUN_DIR).multiplyScalar(1300);
sun.target.position.set(0, 0, 0);
sun.target.updateMatrixWorld();
sun.shadow.camera.updateProjectionMatrix();

const fpsEl = document.getElementById('fps');
let fpsAccum = 0; // smoothed frame time (s), EMA
let fpsSince = 0; // time since last readout refresh
let shadowTick = 0; // drives the throttled shadow-map refresh

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
    speakers.update(dt, player, bgm);

    // Refresh the (manually driven) shadow map every 3rd active frame. Static
    // casters never change; this only re-captures moving actors, and 20fps
    // shadow updates on cars/peds are imperceptible. Paused → skip entirely.
    if (shadowTick++ % 3 === 0) sun.shadow.needsUpdate = true;
  }

  // near-car HUD hint
  const hint = document.getElementById('hint');
  if (hint) {
    const text = player.car ? 'E — get out' : player.nearCar ? 'E — drive' : storeHint();
    if (hint.textContent !== text) hint.textContent = text;
    hint.style.display = text ? 'block' : 'none';
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
tick();
