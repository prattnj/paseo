import * as THREE from 'three';
import { buildCity } from './city.js';
import { buildIsland, groundHeight, nearestBeach } from './island.js';
import { Colliders } from './collision.js';
import { Player } from './player.js';
import { Traffic } from './traffic.js';
import { Pedestrians } from './peds.js';
import { Minimap } from './minimap.js';

const app = document.getElementById('app');
const overlay = document.getElementById('overlay');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
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
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 400;
const S = 85;
sun.shadow.camera.left = -S;
sun.shadow.camera.right = S;
sun.shadow.camera.top = S;
sun.shadow.camera.bottom = -S;
sun.shadow.bias = -0.0004;
scene.add(sun, sun.target);

// ---- world ----
const colliders = new Colliders();
buildIsland(scene, colliders);
buildCity(scene, colliders);

const traffic = new Traffic(scene, colliders);
const player = new Player(scene, camera, colliders, traffic);
const peds = new Pedestrians(scene);
const minimap = new Minimap(document.getElementById('minimap'), colliders);
window.__game = { player, traffic, peds, groundHeight, nearestBeach }; // debug/testing hook

// ---- background music ----
const bgm = document.getElementById('bgm');
bgm.volume = 0.35;

// ---- pointer lock ----
let locked = false;
overlay.addEventListener('click', () => {
  renderer.domElement.requestPointerLock();
  if (bgm.paused) bgm.play().catch(() => {});
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  overlay.classList.toggle('hidden', locked);
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

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);

  player.update(dt);
  traffic.update(dt, player);
  peds.update(dt, traffic, player);

  // near-car HUD hint
  const hint = document.getElementById('hint');
  if (hint) {
    const text = player.car ? 'E — get out' : player.nearCar ? 'E — drive' : '';
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

  // shadow camera follows the player
  sun.target.position.copy(player.pos);
  sun.position.copy(player.pos).addScaledVector(SUN_DIR, 180);

  minimap.update(player);

  renderer.render(scene, camera);
}
tick();
