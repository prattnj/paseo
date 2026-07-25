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

// `robe` (hex) dresses the figure in a long robe (thobe/abaya) covering the
// legs; `headwear` is 'cap' | 'keffiyeh' | 'hijab' (with `headColor`), replacing
// the default hair — for traditional dress.
export function makeHumanoid({ shirt = 0x4a90d9, pants = 0x37474f, skin = 0xf0c8a0, hair = 0x5d4037, robe = null, headwear = null, headColor = 0xf2f4f5 } = {}) {
  const g = new THREE.Group();
  const upper = robe || shirt;

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), mat(upper));
  torso.position.y = 1.09;
  torso.castShadow = true;
  g.add(torso);

  if (robe) { // ankle-length robe skirt over the legs
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.92, 0.34), mat(robe));
    skirt.position.y = 0.56;
    skirt.castShadow = true;
    g.add(skirt);
  }

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.32), mat(skin));
  head.position.y = 1.58;
  head.castShadow = true;
  g.add(head);

  const box = (w, h, d, hex, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(hex)); m.position.set(x, y, z); m.castShadow = true; g.add(m); };
  if (headwear === 'cap') {                 // taqiyah
    box(0.36, 0.12, 0.34, headColor, 0, 1.78, 0);
  } else if (headwear === 'keffiyeh') {     // headscarf + black agal band
    box(0.42, 0.26, 0.42, headColor, 0, 1.75, 0);
    box(0.42, 0.34, 0.14, headColor, 0, 1.52, -0.19);
    box(0.44, 0.07, 0.44, 0x1a1a1a, 0, 1.69, 0);
  } else if (headwear === 'hijab') {        // frames the face, drapes to shoulders
    box(0.42, 0.22, 0.42, headColor, 0, 1.73, 0);
    box(0.42, 0.52, 0.16, headColor, 0, 1.42, -0.16);
    for (const sx of [-1, 1]) box(0.09, 0.44, 0.34, headColor, sx * 0.2, 1.5, 0.02);
  } else {
    box(0.37, 0.14, 0.35, hair, 0, 1.76, 0);
  }

  const armL = limb(0.14, 0.6, 0.16, upper, 1.36);
  armL.position.x = -0.35;
  const armR = limb(0.14, 0.6, 0.16, upper, 1.36);
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
