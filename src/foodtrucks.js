// Nosh Yard: a food-truck circle on the empty grass cell just outside the
// street grid, centred at world (-50, 270). Like arena.js / dragstrip.js /
// factory.js it is a hand-placed WORLD-COORDINATE feature, not a CITY grid
// entry — grid cell (7,10) is a REMOVED_CELL (undeveloped lawn inside the
// parkway), so nothing else is built here.
//
// Layout (world metres, +z is south): a smooth dirt plaza pad sits on the
// lawn; seven food trucks ring its rim on the grass, each rotated so its
// serving window/awning opens inward onto the plaza; five picnic tables
// cluster in the middle. A short dirt path drops in from the north — off the
// z=225 street that borders the grid one cell up — entering through a gap in
// the truck ring left clear at due north. A few lamps light the plaza and a
// scatter of trees frames the outside.
//
// Everything static draws into the shared city GeoBatch + Colliders; the dirt
// pad and connecting path are flat meshes added straight to the scene (same as
// paths.js). All "variety" (truck body/awning colours, table yaws, framing
// trees) is index/coordinate-seeded via hash/frac/pick — no Math.random.
import * as THREE from 'three';
import { hash, frac, pick } from './util.js';
import { PALETTE as P } from './palette.js';
import { buildCurve, sampleTs, ribbon } from './curve.js';
import { lamp, tree } from './blocks/index.js';

// ---- placement ----------------------------------------------------------
const CX = -50, CZ = 270; // plaza centre
const RING = 20;          // radius of the truck ring (truck centres)
const PAD_R = 18;         // dirt plaza pad radius (trucks park on its rim)
const N_TRUCKS = 7;
const PAD_Y = 0.035;      // pad sits a hair above the lawn
const PATH_Y = 0.03;

// Bright food-truck body colours; awnings pull from the shared awning set.
const TRUCK_BODIES = [0xe04f43, 0x4a90d9, 0xf4c542, 0x3aa7a3, 0xe07f9a, 0x9ccc4e, 0xf39a3a];

export function buildFoodTrucks(g, col, scene) {
  disc(scene, CX, CZ, PAD_R, PAD_Y, P.path);      // dirt plaza floor
  buildApproach(scene);                            // dirt path in from the north

  // Trucks evenly around the ring, offset by half a step so a clean gap lands
  // at due north (a = -PI/2) for the path to enter through.
  for (let i = 0; i < N_TRUCKS; i++) {
    const a = -Math.PI / 2 + (2 * Math.PI / N_TRUCKS) * (i + 0.5);
    const tx = CX + Math.cos(a) * RING, tz = CZ + Math.sin(a) * RING;
    const ry = Math.atan2(-Math.cos(a), -Math.sin(a)); // serving side (+local z) faces centre
    foodTruck(g, col, tx, tz, ry, hash(i, 71));
  }

  // Picnic tables clustered in the middle, on a small inner ring.
  const N_TABLES = 5;
  for (let j = 0; j < N_TABLES; j++) {
    const b = (2 * Math.PI / N_TABLES) * j + Math.PI / 5;
    const px = CX + Math.cos(b) * 7, pz = CZ + Math.sin(b) * 7;
    picnicTable(g, col, px, pz, b + Math.PI / 2 + (frac(j, 3) - 0.5) * 0.5, hash(j, 88));
  }

  // Lamps on the plaza between the tables and the trucks (skip the north gap).
  for (let k = 0; k < 4; k++) {
    const a = -Math.PI / 2 + (2 * Math.PI / N_TRUCKS) * (k + 1.5); // seam angles, past the gap
    lamp(g, col, CX + Math.cos(a) * 13.5, CZ + Math.sin(a) * 13.5);
  }

  // A loose ring of framing trees on the lawn outside the trucks, kept off the
  // north approach so the path stays open.
  for (let t = 0; t < 9; t++) {
    const a = (2 * Math.PI / 9) * t + 0.2;
    if (Math.sin(a) < -0.6) continue; // leave the northern approach clear
    const r = 27 + frac(t, 4) * 4;
    tree(g, col, CX + Math.cos(a) * r, CZ + Math.sin(a) * r,
      0.85 + frac(t, 6) * 0.5, hash(t, 9) % 3);
  }
}

// ---- dirt path in from the z=225 street --------------------------------
function buildApproach(scene) {
  // z=225 road spans z[220,230]; its south shoulder (z≈230) is the nearest
  // grid street. Drop straight south with a gentle kink to the pad's north
  // edge (z = CZ - PAD_R = 252).
  const points = [[-50, 230], [-52, 241], [-50, 253]];
  const curve = buildCurve(points, 10);
  const ts = sampleTs(curve);
  ribbon(scene, curve, ts, -2.5, 2.5, PATH_Y, P.path);
}

// Flat filled disc (triangle fan) — smoother than a 10-gon GeoBatch cylinder.
function disc(scene, cx, cz, r, y, hex, seg = 40) {
  const pos = new Float32Array((seg + 2) * 3);
  const nrm = new Float32Array((seg + 2) * 3);
  pos.set([cx, y, cz], 0);
  nrm.set([0, 1, 0], 0);
  for (let k = 0; k <= seg; k++) {
    const a = (k / seg) * Math.PI * 2;
    pos.set([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r], (k + 1) * 3);
    nrm.set([0, 1, 0], (k + 1) * 3);
  }
  const idx = [];
  for (let k = 1; k <= seg; k++) idx.push(0, k + 1, k); // CCW seen from above
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: hex, side: THREE.DoubleSide }));
  m.receiveShadow = true;
  scene.add(m);
}

// ---- a single food truck ------------------------------------------------
// Authored in a LOCAL frame: +local x = truck length, +local z = the serving
// side (window/awning). Placed with `ry` so +z faces the plaza centre.
function foodTruck(g, col, tx, tz, ry, seed) {
  const c = Math.cos(ry), s = Math.sin(ry);
  // boxB at a local (dx,dz) offset, rotated into world by ry (base at baseY).
  const put = (dx, dz, baseY, sx, sy, sz, hex) => {
    const X = tx + dx * c + dz * s, Z = tz - dx * s + dz * c;
    g.boxB(X, baseY, Z, sx, sy, sz, hex, ry);
  };
  const body = TRUCK_BODIES[hash(seed, 2) % TRUCK_BODIES.length];
  const awn = pick(P.awnings, seed, 5);
  const FACE = 1.1; // +z outer face of the body (kitchen box is 2.2 wide)

  // --- running gear: round wheels on the sides, a narrower dark skirt behind
  // them reading as one chassis line (the tyres poke proud of it so they show).
  const wheelAt = (dx, dz, radius, width) => {
    const X = tx + dx * c + dz * s, Z = tz - dx * s + dz * c;
    g.wheel(X, radius, Z, radius, width, 0x20211f, ry + Math.PI / 2);
  };
  for (const dx of [-1.7, 1.7]) for (const dz of [-1.0, 1.0]) wheelAt(dx, dz, 0.34, 0.32);
  put(0, 0, 0.42, 5.0, 0.5, 1.74, P.roofDark);
  put(-2.88, 0, 0.95, 0.16, 0.4, 2.06, P.roofDark); // front bumper

  // --- one continuous hull: a low cab up front steps up to the tall kitchen
  // box at the rear, both in the body colour so they read as a single van
  // (the two meet with no gap around x = -1.1).
  put(-2.0, 0, 0.9, 1.7, 1.45, 2.05, body);   // cab
  put(0.85, 0, 0.9, 3.9, 2.0, 2.2, body);     // kitchen box
  // wraparound cab glazing (front windshield + side windows in one band) and
  // a thin white cornice running the roof edge to tie the top together
  put(-2.0, 0, 1.55, 1.78, 0.5, 2.12, P.glassDark);
  put(0.85, 0, 2.86, 4.0, 0.12, 2.28, P.white);
  put(1.0, 0, 2.9, 1.2, 0.32, 1.0, P.roofDark); // roof vent

  // --- serving side (+local z): a framed window, counter and awning that all
  // sit on the same opening so the serving area reads as one composed unit.
  // white frame plate, then the dark window recessed just proud of it
  put(1.0, FACE + 0.02, 1.05, 3.0, 1.15, 0.06, P.offwhite);
  put(1.0, FACE + 0.07, 1.15, 2.7, 0.9, 0.08, P.glassDark);
  // menu board mounted flush on the body beside/above the window
  put(1.0, FACE + 0.03, 2.15, 1.3, 0.5, 0.05, P.white);
  // fold-down counter with two brackets pinning it back onto the body
  put(1.0, 1.55, 1.0, 2.9, 0.1, 0.95, P.offwhite);
  for (const dx of [-1.3, 1.3]) put(dx, 1.5, 0.9, 0.08, 0.08, 0.85, P.roofDark);
  // awning: a valance at the hinge above the window, a canopy reaching out
  // over the counter, and two ground poles at its lip framing the stall
  put(1.0, FACE + 0.05, 2.5, 3.0, 0.2, 0.16, awn);
  put(1.0, 2.0, 2.55, 3.0, 0.09, 1.9, awn);
  for (const dx of [-1.35, 1.35]) put(dx, 2.9, 0.0, 0.08, 2.55, 0.08, P.roofDark);

  // one OBB for the whole van (the awning overhang stays walk-under)
  col.add(tx, 0, tz, 5.7, 2.9, 2.35, ry);
}

// ---- a picnic table -----------------------------------------------------
function picnicTable(g, col, x, z, ry, seed) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const put = (dx, dz, baseY, sx, sy, sz, hex) => {
    const X = x + dx * c + dz * s, Z = z - dx * s + dz * c;
    g.boxB(X, baseY, Z, sx, sy, sz, hex, ry);
  };
  const wood = pick([0xa9793f, 0xb07a45, 0x9c6b3f], seed, 1);
  // solid end panels double as the legs
  for (const dx of [-0.95, 0.95]) put(dx, 0, 0.0, 0.14, 0.72, 2.0, wood);
  // two bench seats
  for (const dz of [-0.72, 0.72]) put(0, dz, 0.42, 2.2, 0.08, 0.34, wood);
  // tabletop
  put(0, 0, 0.72, 2.2, 0.1, 0.92, wood);
  col.add(x, 0, z, 2.2, 0.85, 1.95, ry);
}
