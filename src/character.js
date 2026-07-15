// Shared low-poly blocky humanoid. Returns a group with references to
// limbs for walk animation. Height ~1.7 units.
import * as THREE from 'three';

const matCache = new Map();
export function mat(hex) {
  if (!matCache.has(hex)) {
    matCache.set(hex, new THREE.MeshLambertMaterial({ color: hex, flatShading: true }));
  }
  return matCache.get(hex);
}

function limb(w, h, d, hex, pivotY) {
  // pivot at the top of the limb so rotation swings naturally
  const pivot = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(hex));
  m.position.y = -h / 2;
  m.castShadow = true;
  pivot.add(m);
  pivot.position.y = pivotY;
  return pivot;
}

export function makeHumanoid({ shirt = 0x4a90d9, pants = 0x37474f, skin = 0xf0c8a0, hair = 0x5d4037 } = {}) {
  const g = new THREE.Group();

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), mat(shirt));
  torso.position.y = 1.09;
  torso.castShadow = true;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.32), mat(skin));
  head.position.y = 1.58;
  head.castShadow = true;
  g.add(head);

  const hairMesh = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.14, 0.35), mat(hair));
  hairMesh.position.y = 1.76;
  g.add(hairMesh);

  const armL = limb(0.14, 0.6, 0.16, shirt, 1.36);
  armL.position.x = -0.35;
  const armR = limb(0.14, 0.6, 0.16, shirt, 1.36);
  armR.position.x = 0.35;

  const legL = limb(0.18, 0.78, 0.2, pants, 0.78);
  legL.position.x = -0.13;
  const legR = limb(0.18, 0.78, 0.2, pants, 0.78);
  legR.position.x = 0.13;

  g.add(armL, armR, legL, legR);
  return { group: g, armL, armR, legL, legR };
}

// Swing limbs by phase (radians) and amplitude (0..1).
export function animateWalk(h, phase, amp) {
  const swing = Math.sin(phase) * 0.9 * amp;
  h.legL.rotation.x = swing;
  h.legR.rotation.x = -swing;
  h.armL.rotation.x = -swing * 0.8;
  h.armR.rotation.x = swing * 0.8;
}
