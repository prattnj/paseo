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

// Every humanoid's non-moving parts (torso, head, hair/headwear, robe skirt) are
// baked into ONE vertex-coloured mesh — the same trick traffic.js uses for cars —
// so a crowd of ~250 peds is ~250 body nodes + limbs instead of ~2000 separate
// boxes, each of which would be its own draw call in the main and shadow passes.
// Only the four swinging limbs stay separate, since they rotate independently.
const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const _boxCache = new Map();
function boxGeo(w, h, d) {
  const k = w + 'x' + h + 'x' + d;
  if (!_boxCache.has(k)) _boxCache.set(k, new THREE.BoxGeometry(w, h, d));
  return _boxCache.get(k);
}
// Bake a list of positioned, coloured boxes into one non-indexed, vertex-coloured
// BufferGeometry (parts never move relative to the body, so this is lossless).
function mergeBoxes(parts) {
  const c = new THREE.Color();
  const baked = parts.map((p) => boxGeo(p.w, p.h, p.d).clone().toNonIndexed().translate(p.x, p.y, p.z));
  let total = 0;
  for (const g of baked) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  baked.forEach((g, i) => {
    const pa = g.attributes.position.array, na = g.attributes.normal.array;
    c.set(parts[i].hex);
    for (let j = 0; j < pa.length; j += 3) {
      pos[o] = pa[j]; pos[o + 1] = pa[j + 1]; pos[o + 2] = pa[j + 2];
      nor[o] = na[j]; nor[o + 1] = na[j + 1]; nor[o + 2] = na[j + 2];
      col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
      o += 3;
    }
    g.dispose();
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
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

// A hairstyle is a small set of hair-coloured boxes stacked on top of the head
// (head top sits at ~y1.75). `hairStyle` selects the shape; the catalog of ids
// lives in core/appearance.js and is what the player wardrobe swaps between.
// Each box is pushed via the same `box(w,h,d,hex,x,y,z)` collector used for the
// rest of the body, so it bakes into the one merged mesh for free.
function addHair(box, style, hair) {
  switch (style) {
    case 'bald':
      break;
    case 'buzz': // close-cropped cap out to the head edges (a hair proud, so it
      // fully encloses the crown to the very edge without z-fighting the head faces)
      box(0.35, 0.05, 0.33, hair, 0, 1.74, 0);
      break;
    case 'flattop': // tall squared-off block
      box(0.38, 0.22, 0.36, hair, 0, 1.81, 0);
      break;
    case 'afro': // big rounded pouf, wider than the head all round
      box(0.48, 0.34, 0.46, hair, 0, 1.82, 0);
      break;
    case 'mohawk': // narrow crest running front-to-back (shaved sides: no cap)
      box(0.1, 0.24, 0.34, hair, 0, 1.85, 0);
      break;
    case 'ponytail': // crown that carries down the back of the head, plus the tail
      box(0.37, 0.16, 0.35, hair, 0, 1.75, 0);      // crown
      box(0.37, 0.3, 0.12, hair, 0, 1.58, -0.15);   // hair down the back of the head
      box(0.12, 0.44, 0.13, hair, 0, 1.5, -0.24);   // ponytail
      break;
    case 'bun': // top knot
      box(0.37, 0.13, 0.35, hair, 0, 1.76, 0);
      box(0.17, 0.17, 0.17, hair, 0, 1.9, -0.02);
      break;
    case 'long': // full crown wrapping the head, side locks + a drape down the back
      box(0.4, 0.2, 0.38, hair, 0, 1.74, 0);                  // oversized crown covers top + sides (no skin gap)
      box(0.42, 0.5, 0.12, hair, 0, 1.42, -0.19);             // back drape, tall enough to meet the crown
      for (const sx of [-1, 1]) box(0.09, 0.5, 0.34, hair, sx * 0.205, 1.45, -0.04); // side locks reaching up into the crown (recessed so they don't z-fight the face)
      break;
    case 'short':
    default: // the original single hair box
      box(0.37, 0.14, 0.35, hair, 0, 1.76, 0);
      break;
  }
}

// `robe` (hex) dresses the figure in a long robe (thobe/abaya) covering the
// legs; `headwear` is 'cap' | 'keffiyeh' | 'hijab' (with `headColor`), replacing
// the default hair — for traditional dress. `hairStyle` (default 'short')
// selects the hair shape when no headwear covers it.
export function makeHumanoid({ shirt = 0x4a90d9, pants = 0x37474f, skin = 0xf0c8a0, hair = 0x5d4037, hairStyle = 'short', robe = null, headwear = null, headColor = 0xf2f4f5 } = {}) {
  const g = new THREE.Group();
  const upper = robe || shirt;

  // Collect the static body parts, then bake them into a single merged mesh.
  const parts = [];
  const box = (w, h, d, hex, x, y, z) => parts.push({ w, h, d, hex, x, y, z });
  box(0.52, 0.62, 0.3, upper, 0, 1.09, 0);          // torso
  if (robe) box(0.56, 0.92, 0.34, robe, 0, 0.56, 0); // ankle-length robe skirt
  box(0.34, 0.34, 0.32, skin, 0, 1.58, 0);           // head
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
    addHair(box, hairStyle, hair);
  }
  const body = new THREE.Mesh(mergeBoxes(parts), bodyMat);
  body.castShadow = true;
  g.add(body);

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
