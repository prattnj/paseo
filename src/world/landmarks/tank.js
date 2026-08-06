// Driveable tank on a raised concrete parade platform, filling the last empty
// half-cell at grid (1,7) on the west coast, world ~(-705, -52). Like
// garden.js / arena.js / prison.js this is a hand-placed WORLD-COORDINATE
// feature, not a CITY grid entry: (1,7) is a REMOVED_CELLS gap (its outer edge
// is sliced off by the coastal parkway), so nothing in layout.js / city.js owns
// it.
//
// The build is two independent pieces:
//   1. A large square concrete pad, rotated 45deg about its centre, sat 0.4m
//      proud of the plateau. 0.4m is below the STEP/curb threshold (0.45) used
//      by both the walking player and the car resolver, so the tank drives on
//      and off it smoothly and the player can walk up too.
//   2. The tank itself — spawned as a real, driveable "car" (SPECS.tank in
//      traffic.js) by pushing a spot into the shared PARKED registry, exactly
//      like a parked car. It sits centred on the pad, aligned to the pad
//      diagonal with its nose to the north-west, matching the reference image.
//      Its turret is a separate child mesh that slowly tracks the camera while
//      driving (see player.js updateDrive).
//
// Flanking the pad are two tall prison-style guard towers, one off each side of
// the tank (perpendicular to its NW heading, i.e. the pad's NE and SW edges),
// each carrying an M2 .50-cal on a cantilevered gun deck aimed NW — the same
// way the tank and its turret face — with the barrels elevated ~20deg. A ring
// of four traditional wheeled field cannons sits on the lawn around the pad
// corners, each aimed radially outward. The pitched barrels are standalone
// meshes because GeoBatch only supports a yaw (no elevation), everything else
// is batched.
//
// Everything is deterministic (no Math.random): the pad is fixed geometry and
// the tank's single fixed spawn carries a constant seed.
import * as THREE from 'three';
import { PALETTE as P } from '../../core/palette.js';
import { groundHeight } from '../island.js';
import { PARKED } from '../blocks/index.js';

// Platform centre + orientation. Kept a little inboard of the cell centre so
// the whole pad stays on the flat plateau, clear of the parkway-cut outer edge.
const CX = -705, CZ = -52;
const PAD_RY = Math.PI / 4;   // 45deg parade pad
const PAD = 24, PAD_Z = 24;   // square pad footprint (m)
const PAD_H = 0.4;            // proud of the plateau, below the 0.45 step limit

// Tank spawn: aligned to the pad diagonal, nose to the NW (matches the image).
const TANK_RY = -Math.PI * 3 / 4;
const TANK_SEED = 74107;

// Shared heading + military colours. FWD is the tank/gun compass heading (NW),
// SIDE is one flank (rotate FWD 90deg) used to place the two towers.
const UP = new THREE.Vector3(0, 1, 0);
const FWD = new THREE.Vector3(Math.sin(TANK_RY), 0, Math.cos(TANK_RY)); // NW
const SIDE = new THREE.Vector3(FWD.z, 0, -FWD.x);                       // SW flank
const GUN_EL = 20 * Math.PI / 180;   // .50-cal barrel elevation
const OLIVE = 0x3c5230, OLIVE_D = 0x2c3d20;   // matches the tank body
const GUN = 0x2e2f33, GUN_D = 0x1a1b1e;       // gunmetal / near-black steel

// Two guard towers, 15 m off each flank so they clear the tank and sit just off
// the pad edge on the lawn.
const TOWER_R = 25;
const TOWERS = [
  [CX + SIDE.x * TOWER_R, CZ + SIDE.z * TOWER_R],   // SW flank
  [CX - SIDE.x * TOWER_R, CZ - SIDE.z * TOWER_R],   // NE flank
];

// Four field cannons on the lawn just past the pad's four corners (which, on a
// 45deg pad, point N/E/S/W), each aimed radially outward.
const CANNON_R = 18;
const CANNONS = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dz]) => ({
  x: CX + dx * CANNON_R, z: CZ + dz * CANNON_R, dir: new THREE.Vector3(dx, 0, dz),
}));

// A single straight cylinder oriented along an arbitrary 3D direction — used
// for the pitched gun/cannon barrels the yaw-only GeoBatch can't express.
function angledCyl(scene, x, y, z, len, r, dir, hex) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, len, 8),
    new THREE.MeshLambertMaterial({ color: hex, flatShading: true }),
  );
  const d = dir.clone().normalize();
  mesh.quaternion.setFromUnitVectors(UP, d);           // lay the +y axle along dir
  mesh.position.set(x + d.x * len / 2, y + d.y * len / 2, z + d.z * len / 2);
  mesh.castShadow = true;
  scene.add(mesh);
}

// M2 .50-cal on a pintle mount, sitting at (bx,by,bz) and aimed NW (TANK_RY)
// with the barrel elevated GUN_EL. Mount/shield are batched; the barrel and its
// cooling jacket are standalone so they can pitch up.
function gun50(g, scene, bx, by, bz) {
  g.cyl(bx, by, bz, 0.09, 0.12, 0.9, GUN);                    // pintle post
  const my = by + 0.9;
  g.box(bx, my, bz, 0.55, 0.2, 0.55, GUN_D, TANK_RY);         // cradle
  g.box(bx, my + 0.33, bz, 0.34, 0.34, 1.1, GUN, TANK_RY);    // receiver body
  g.box(bx + FWD.x * 0.4, my + 0.4, bz + FWD.z * 0.4, 1.1, 0.9, 0.1, GUN_D, TANK_RY); // shield
  g.box(bx - FWD.x * 0.6, my + 0.35, bz - FWD.z * 0.6, 0.5, 0.28, 0.1, GUN_D, TANK_RY); // spade grips
  const dir = new THREE.Vector3(FWD.x * Math.cos(GUN_EL), Math.sin(GUN_EL), FWD.z * Math.cos(GUN_EL));
  const b0x = bx + FWD.x * 0.55, b0y = my + 0.36, b0z = bz + FWD.z * 0.55;
  angledCyl(scene, b0x, b0y, b0z, 0.9, 0.08, dir, GUN);       // perforated jacket (rear half)
  angledCyl(scene, b0x, b0y, b0z, 1.9, 0.05, dir, GUN_D);     // barrel
}

// A tall prison-style guard tower (tapered concrete pylon + glazed cabin under
// a hipped roof), scaled up, with a cantilevered gun deck out the NW face
// carrying the .50-cal behind a low olive parapet.
function militaryTower(g, col, scene, x, z) {
  const base = groundHeight(x, z) - 0.02;
  const legH = 8.5, upH = 4.5;
  g.boxB(x, base, z, 3.0, legH, 3.0, P.concrete);            // lower pylon
  g.boxB(x, base + legH, z, 2.4, upH, 2.4, P.concreteDark);  // upper pylon
  col.add(x, base, z, 3.0, legH + upH, 3.0);
  const y0 = base + legH + upH;
  g.boxB(x, y0 - 0.2, z, 4.8, 0.25, 4.8, P.concreteDark);    // catwalk lip
  g.boxB(x, y0, z, 4.0, 0.8, 4.0, P.offwhite);               // cabin sill
  g.boxB(x, y0 + 0.8, z, 3.9, 1.9, 3.9, P.glass);            // glass band
  g.boxB(x, y0 + 2.7, z, 4.2, 0.6, 4.2, OLIVE);              // olive cabin header
  g.cone(x, y0 + 3.3, z, 3.1, 1.8, OLIVE_D, 4);              // hipped roof

  // gun deck cantilevered out the NW face, low sandbag-ish parapet, .50-cal
  const gx = x + FWD.x * 3.2, gz = z + FWD.z * 3.2;
  g.boxB(gx, y0 - 0.05, gz, 2.8, 0.3, 2.8, P.concreteDark, TANK_RY);              // deck
  g.boxB(x + FWD.x * 4.3, y0 + 0.25, z + FWD.z * 4.3, 2.8, 0.55, 0.4, OLIVE, TANK_RY); // parapet
  gun50(g, scene, gx, y0 + 0.25, gz);
}

// A traditional wheeled field cannon at (x,z), aimed along horizontal unit
// `dir` and slightly elevated. Built as a standalone group (wooden carriage,
// iron-rimmed wheels, tapered iron barrel) modelled facing local +z, then
// rotated to point outward.
function cannon(scene, col, x, z, dir) {
  const gy = groundHeight(x, z);
  const grp = new THREE.Group();
  const WOOD = 0x6b4a2b, WOOD_D = 0x4e3722, RIM = 0x15161a;
  const lam = hex => new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
  const add = (geo, hex, px, py, pz, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, lam(hex));
    m.position.set(px, py, pz);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    grp.add(m);
  };
  for (const sx of [-1, 1]) {                                 // wheels (axle across = local X)
    add(new THREE.CylinderGeometry(0.62, 0.62, 0.2, 14), WOOD, sx * 0.72, 0.62, -0.15, 0, 0, Math.PI / 2);
    add(new THREE.TorusGeometry(0.6, 0.06, 6, 18), RIM, sx * 0.72, 0.62, -0.15, 0, Math.PI / 2, 0);
    add(new THREE.CylinderGeometry(0.14, 0.14, 0.28, 10), RIM, sx * 0.72, 0.62, -0.15, 0, 0, Math.PI / 2);
  }
  add(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 8), RIM, 0, 0.62, -0.15, 0, 0, Math.PI / 2); // axle
  add(new THREE.BoxGeometry(0.85, 0.5, 1.3), WOOD_D, 0, 0.72, 0.05);          // carriage cheeks
  add(new THREE.BoxGeometry(0.4, 0.26, 1.9), WOOD, 0, 0.45, -1.1, 0.16);      // trail
  add(new THREE.BoxGeometry(0.5, 0.34, 0.3), WOOD_D, 0, 0.2, -2.0);           // ground spade
  const EL = 9 * Math.PI / 180, len = 2.5;                    // barrel, elevated ~9deg
  const d = new THREE.Vector3(0, Math.sin(EL), Math.cos(EL));
  add(new THREE.CylinderGeometry(0.12, 0.18, len, 14), GUN, d.x * len / 2, 0.9 + d.y * len / 2, 0.15 + d.z * len / 2, Math.PI / 2 - EL);
  add(new THREE.TorusGeometry(0.14, 0.035, 6, 16), GUN_D, d.x * len, 0.9 + d.y * len, 0.15 + d.z * len, Math.PI / 2 - EL); // muzzle band
  add(new THREE.SphereGeometry(0.16, 10, 8), GUN, 0, 0.9, 0);                 // cascabel knob
  grp.position.set(x, gy, z);
  grp.rotation.y = Math.atan2(dir.x, dir.z);
  scene.add(grp);
  col.add(x, gy, z, 1.7, 1.2, 2.8, grp.rotation.y);
}

export function buildTank(g, col, scene) {
  const base = groundHeight(CX, CZ) - 0.02; // pad base, tucked just into the lawn

  // Wide low plinth lip, then the main slab on top — reads as a solid cast pad.
  g.boxB(CX, base, CZ, PAD + 1.6, 0.16, PAD_Z + 1.6, P.concreteDark, PAD_RY);
  g.boxB(CX, base + 0.14, CZ, PAD, PAD_H - 0.14, PAD_Z, P.concrete, PAD_RY);
  // A darker inset border groove on the deck for a bit of relief.
  g.boxB(CX, base + PAD_H - 0.01, CZ, PAD - 3, 0.03, PAD_Z - 3, P.concreteDark, PAD_RY);
  col.add(CX, base, CZ, PAD, PAD_H, PAD_Z, PAD_RY);

  // The tank is a driveable car: register it in the parked-car pool. Traffic
  // spawns it (type 'tank') at the pad top so it starts resting on the concrete.
  PARKED.push({ x: CX, z: CZ, ry: TANK_RY, seed: TANK_SEED, y: base + PAD_H, type: 'tank' });

  // Flanking guard towers + a ring of field cannons around the pad.
  for (const [tx, tz] of TOWERS) militaryTower(g, col, scene, tx, tz);
  for (const c of CANNONS) cannon(scene, col, c.x, c.z, c.dir);
}
