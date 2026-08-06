// The east woods: a very dense, hand-seeded forest filling the open grass
// pocket on the far east side of the island — the almond-shaped lens of
// plateau that sits east of the built grid (its easternmost column, x>=885,
// is entirely unbuilt) and runs out to the coast. There are no roads, paths,
// parkway or parked cars anywhere in here, so the only way across is to weave
// between the trunks on foot.
//
// Hidden in the middle (nudged east, toward the beach) is a small quaint log
// cabin. It has no approach of any kind — you only find it by pushing through
// the trees — so we leave just a tight clearing around it and let the forest
// close in on every side.
//
// Determinism: like everything else in the project, there is no Math.random.
// Every tree's position, species and size comes from coordinate-seeded hashes
// (util.js), so the woods are identical on every load. Placement is gated by
// island.js `onLand` so the tree line conforms exactly to the traced coast,
// and by a west cutoff (x>=FOREST_X0) so it never spills into the city blocks.
import * as THREE from 'three';
import { GeoBatch } from '../../core/geo.js';
import { onLand, groundHeight } from '../island.js';
import { PALETTE as P } from '../../core/palette.js';
import { hash, frac } from '../../core/util.js';

// ---- forest extent ---------------------------------------------------------
// The scatter box; each candidate is still gated by onLand (coast) and the
// west cutoff, so only the genuine east pocket fills in.
const FOREST_X0 = 896;   // west edge: clear of the built grid's east column
const FOREST_X1 = 1044;  // beyond the plateau's easternmost reach (onLand clips)
const FOREST_Z0 = -80;
const FOREST_Z1 = 500;

const STEP = 4.4;        // jittered grid pitch — small pitch = very dense
const JIT = 1.9;         // max positional jitter (leaves weavable gaps)
const FSEED = 4242;

// Log cabin: east of the pocket's centre (~955,210), so it reads as "toward
// the beach". A tight tree-free clearing keeps it findable once you stumble
// onto it without ever advertising itself from a distance.
const CABIN_X = 985;
const CABIN_Z = 205;
const CLEARING = 8;      // radius kept clear of trees around the cabin

// Foliage palettes: broadleaf greens and darker conifer greens.
const GREENS = [0x4e9b47, 0x3e7d3a, 0x67ab3f, 0x5aa83e, 0x3f8f52, 0x74b84a];
const PINES = [0x2f6b34, 0x356f3a, 0x3d7a3f, 0x2b5f32];

export function buildForest(scene, colliders) {
  const g = new GeoBatch();

  scatterTrees(g, colliders);
  drawCabin(g, colliders, scene);

  scene.add(g.build());
}

// A jittered grid of trees over the pocket, plus a lighter undergrowth pass
// (shrubs, no colliders) offset by half a cell so the ground never reads bare.
function scatterTrees(g, col) {
  for (let gx = FOREST_X0; gx <= FOREST_X1; gx += STEP) {
    for (let gz = FOREST_Z0; gz <= FOREST_Z1; gz += STEP) {
      const ix = Math.round(gx), iz = Math.round(gz);
      const seed = hash(FSEED, ix * 131 + iz);
      // decorrelated 2D jitter (see util.js caveat: pair via nested hashes)
      const jx = (frac(hash(seed, 1, 1), 5) - 0.5) * 2 * JIT;
      const jz = (frac(hash(seed, 2, 2), 9) - 0.5) * 2 * JIT;
      const x = gx + jx, z = gz + jz;
      if (!plantable(x, z)) continue;
      const gy = groundHeight(x, z);
      drawTree(g, col, x, gy, z, seed);

      // undergrowth: a low shrub half a cell over, only sometimes, no collider
      const ux = gx + STEP * 0.5 + jz * 0.4;
      const uz = gz + STEP * 0.5 - jx * 0.4;
      if (hash(seed, 9) % 3 === 0 && plantable(ux, uz)) {
        const s = 0.5 + frac(seed, 10, 7) * 0.6;
        const uy = groundHeight(ux, uz);
        g.ico(ux, uy + 0.5 * s, uz, 0.7 * s, GREENS[hash(seed, 11) % GREENS.length]);
      }
    }
  }
}

// On the east plateau, clear of the city (west cutoff) and the cabin clearing.
function plantable(x, z) {
  if (x < FOREST_X0 - 2) return false;
  const dx = x - CABIN_X, dz = z - CABIN_Z;
  if (dx * dx + dz * dz < CLEARING * CLEARING) return false;
  return onLand(x, z);
}

// One tree of a hash-chosen species. Six archetypes — round broadleaf, layered
// broadleaf, big oak, conifer, and two tall kinds (spruce, slim poplar) — so
// the canopy reads as a real mixed wood. Collider is a single trunk box sized
// to the species; canopies overlap freely (no self-avoidance) for density.
function drawTree(g, col, x, gy, z, seed) {
  const r = hash(seed, 7) % 100;
  const f = (k) => frac(seed, 8, k);            // per-tree size roll
  const leaf = () => GREENS[hash(seed, 20 + (hash(seed, 21) % 3)) % GREENS.length];
  const pine = () => PINES[hash(seed, 22) % PINES.length];

  if (r < 30) {
    // round broadleaf
    const s = 0.9 + f(1) * 0.7;
    g.cyl(x, gy, z, 0.22 * s, 0.3 * s, 1.7 * s, P.trunk);
    g.ico(x, gy + 2.9 * s, z, 1.7 * s, leaf());
    col.add(x, gy, z, 0.9, 2.6 * s, 0.9);
  } else if (r < 50) {
    // layered broadleaf (two clumps)
    const s = 0.9 + f(2) * 0.6;
    g.cyl(x, gy, z, 0.22 * s, 0.3 * s, 1.7 * s, P.trunk);
    g.ico(x, gy + 2.5 * s, z, 1.4 * s, leaf());
    g.ico(x + 0.5 * s, gy + 3.5 * s, z - 0.3 * s, 1.0 * s, leaf());
    col.add(x, gy, z, 0.9, 2.5 * s, 0.9);
  } else if (r < 64) {
    // big old oak — thick trunk, wide multi-clump crown
    const s = 1.2 + f(3) * 0.7;
    g.cyl(x, gy, z, 0.34 * s, 0.5 * s, 2.0 * s, P.trunk);
    g.ico(x, gy + 3.2 * s, z, 2.3 * s, leaf());
    g.ico(x - 1.3 * s, gy + 2.8 * s, z + 0.6 * s, 1.5 * s, leaf());
    g.ico(x + 1.2 * s, gy + 3.0 * s, z - 0.7 * s, 1.5 * s, leaf());
    col.add(x, gy, z, 1.4, 3.0 * s, 1.4);
  } else if (r < 80) {
    // conifer
    const s = 0.9 + f(4) * 0.6;
    g.cyl(x, gy, z, 0.2 * s, 0.32 * s, 1.3 * s, P.trunk);
    g.cone(x, gy + 1.3 * s, z, 1.5 * s, 3.6 * s, pine());
    col.add(x, gy, z, 0.9, 4.6 * s, 0.9);
  } else if (r < 92) {
    // tall spruce — slim trunk, three stacked cones reaching high
    const s = 1.1 + f(5) * 0.7;
    g.cyl(x, gy, z, 0.2 * s, 0.34 * s, 2.4 * s, P.trunk);
    g.cone(x, gy + 2.0 * s, z, 1.7 * s, 3.2 * s, pine());
    g.cone(x, gy + 4.0 * s, z, 1.3 * s, 2.8 * s, pine());
    g.cone(x, gy + 6.0 * s, z, 0.9 * s, 2.4 * s, pine());
    col.add(x, gy, z, 0.85, 8.4 * s, 0.85);
  } else {
    // slim poplar/cypress — very tall, narrow spire
    const s = 1.2 + f(6) * 0.8;
    g.cyl(x, gy, z, 0.18 * s, 0.28 * s, 3.0 * s, P.trunk);
    g.cone(x, gy + 2.6 * s, z, 1.0 * s, 5.2 * s, leaf());
    col.add(x, gy, z, 0.7, 7.6 * s, 0.7);
  }
}

// Small quaint log cabin: walls built from real round logs (horizontal
// cylinders that cross-lap at the corners), a gabled shingle roof, a stone
// chimney, and a raised covered porch you can step up onto running the length
// of the front (north) long wall. Solid decorative — a body collider (plus
// chimney) keeps you out; the low porch deck/step are their own step-up-able
// colliders so you can walk onto them (see collision.js STEP = 0.45).
function drawCabin(g, col, scene) {
  const cx = CABIN_X, cz = CABIN_Z;
  const gy = groundHeight(cx, cz);
  const WX = 7, WZ = 5, roofH = 2.2;
  const R = 0.28, PITCH = 0.5, COURSES = 6;   // log radius / vertical pitch / count
  const FY = gy + 0.15;           // floor sits just above a stone footing
  const ROOF = 0x6f5636;          // shingled-wood roof (dark warm brown)
  const wallTop = FY + 2 * R + (COURSES - 1) * PITCH + PITCH / 2; // top of last log

  // stone footing
  g.boxB(cx, gy - 0.3, cz, WX + 1.0, 0.5, WZ + 1.0, P.rock);

  // Round-log walls. Front/back logs run along X; side logs run along Z and
  // stagger up half a pitch, so their overhanging ends cross-lap at the four
  // corners like a real notched cabin. The overhang alternates per course
  // (OA) so stacked end-caps never sit on one plane — that coplanarity was the
  // log-end z-fighting. A doorway gap is left in the low front (north) courses.
  const dg0 = cx - 0.7, dg1 = cx + 0.7; // door opening in X (north wall)
  for (let c = 0; c < COURSES; c++) {
    const OA = 0.30 + (c % 2) * 0.14;        // per-course overhang (breaks coplanar ends)
    const yA = FY + R + c * PITCH;           // front/back logs
    const yB = yA + PITCH / 2;               // staggered side logs
    const shA = c % 2 ? P.trunk : P.dirtDark;
    const shB = c % 2 ? P.dirtDark : P.trunk;
    const xA = cx - WX / 2 - OA, xB = cx + WX / 2 + OA;
    const zA = cz - WZ / 2 - OA, zB = cz + WZ / 2 + OA;
    // front (north) long wall — split around the door on the low courses
    if (c < 4) {
      logMesh(scene, 'x', (xA + dg0) / 2, yA, cz - WZ / 2, dg0 - xA, R, shA);
      logMesh(scene, 'x', (dg1 + xB) / 2, yA, cz - WZ / 2, xB - dg1, R, shA);
    } else {                                  // lintel courses run full width
      logMesh(scene, 'x', cx, yA, cz - WZ / 2, xB - xA, R, shA);
    }
    logMesh(scene, 'x', cx, yA, cz + WZ / 2, xB - xA, R, shA);       // back (south)
    logMesh(scene, 'z', cx + WX / 2, yB, cz, zB - zA, R, shB);       // east wall
    logMesh(scene, 'z', cx - WX / 2, yB, cz, zB - zA, R, shB);       // west wall
  }

  // gabled roof (ridge runs along the long X axis, closing both gable ends)
  g.prism(cx, wallTop - 0.15, cz, WX + 1.2, roofH, WZ + 1.2, ROOF);

  // closed plank door filling the north opening
  g.boxB(cx, FY, cz - WZ / 2 - 0.02, 1.3, 2.3, 0.16, P.doorDark);

  // two windows (framed) on the back (south) wall
  window4(g, cx - 1.8, FY + 1.55, cz + WZ / 2 + 0.05, 0, 1);
  window4(g, cx + 1.8, FY + 1.55, cz + WZ / 2 + 0.05, 0, 1);

  // ---- raised, walkable porch running along the front (north) wall ----
  const Dz = 2.6;                             // porch depth (out from the wall)
  const wallN = cz - WZ / 2;                  // north wall face
  const deckCz = wallN - Dz / 2, deckTop = gy + 0.35;
  const zN = wallN - Dz;                      // outer deck edge
  g.boxB(cx, gy, deckCz, WX, 0.35, Dz, P.dirt);            // plank deck (runs along x)
  g.boxB(cx, gy, zN - 0.25, WX - 1.0, 0.18, 0.7, P.rockDark); // step (tucks under deck edge)
  // posts at the outer deck corners + a small gabled awning over the deck
  const awnBase = FY + 2.2;
  for (const px of [-WX / 2 + 0.4, WX / 2 - 0.4]) {
    g.cyl(cx + px, deckTop, zN + 0.2, 0.14, 0.14, awnBase - deckTop, P.trunk);
  }
  g.prism(cx, awnBase, deckCz + 0.1, WX + 0.6, 0.8, Dz + 0.6, ROOF);

  // stone chimney climbing the east gable end
  g.boxB(cx + WX / 2 + 0.1, gy, cz + 1.2, 1.1, wallTop + 2.9 - gy, 1.1, P.rock);
  g.boxB(cx + WX / 2 + 0.1, wallTop + 2.9, cz + 1.2, 1.3, 0.35, 1.3, P.rockDark);

  // colliders: body (through the roof), chimney, and the walkable porch pieces
  col.add(cx, gy, cz, WX + 0.4, wallTop + roofH - gy, WZ + 0.4);
  col.add(cx + WX / 2 + 0.1, gy, cz + 1.2, 1.1, wallTop + 2.9 - gy, 1.1);
  col.add(cx, gy, deckCz, WX, 0.35, Dz);            // step up onto the deck
  col.add(cx, gy, zN - 0.25, WX - 1.0, 0.18, 0.7);  // and the stone step
}

// A round log: a low-poly horizontal cylinder along the 'x' or 'z' axis. Added
// as a standalone mesh because GeoBatch cylinders are vertical-only.
const _logMats = new Map();
function logMesh(scene, axis, cx, cy, cz, len, r, hex) {
  let m = _logMats.get(hex);
  if (!m) { m = new THREE.MeshLambertMaterial({ color: hex, flatShading: true }); _logMats.set(hex, m); }
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), m);
  mesh.position.set(cx, cy, cz);
  if (axis === 'x') mesh.rotation.z = Math.PI / 2; else mesh.rotation.x = Math.PI / 2;
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
}

// A small framed window on a wall face. (nx,nz) is the outward normal so the
// glass sits just proud of its frame.
function window4(g, x, y, z, nx, nz) {
  g.boxB(x, y - 0.55, z, 1.35, 1.15, 0.1, P.offwhite);        // frame
  g.boxB(x + nx * 0.04, y - 0.55, z + nz * 0.04, 1.05, 0.9, 0.1, P.window); // glass
}
