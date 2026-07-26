// Deterministic traffic: low-poly cars driving fixed rectangular loops on
// the road network, plus parked cars registered by the city builder.
// Every car (moving or parked) can be hijacked and driven by the player.
import * as THREE from 'three';
import { PALETTE as P } from './palette.js';
import { PARKED } from './blocks/index.js';
import { groundHeight } from './island.js';
import { hash, pick } from './util.js';

// Rect loop corners at road centerlines, offset to the driving lane.
// Positive lane = inside the rect (clockwise traffic drives on the right);
// reversed (counter-clockwise) loops must use the OUTSIDE lane so pass
// reverse: true together with the same rect — the lane flips automatically.
function rectLoop(x0, z0, x1, z1, lane = 2.6) {
  return [
    [x0 + lane, z0 + lane],
    [x1 - lane, z0 + lane],
    [x1 - lane, z1 - lane],
    [x0 + lane, z1 - lane],
  ];
}

const NORTH_LOOP = rectLoop(-445, -445, 115, -335);

const LOOPS = [
  { pts: rectLoop(0, -225, 225, 0), cars: 16 },       // around the plaza
  { pts: rectLoop(0, -225, 225, 0, -2.6), cars: 12, reverse: true },
  { pts: rectLoop(-335, -225, -115, 0), cars: 12 },   // around Central Park
  { pts: rectLoop(0, -335, 335, 335), cars: 20 },     // east avenue loop
  { pts: rectLoop(-445, -445, 0, -225, -2.6), cars: 12, reverse: true },
  { pts: rectLoop(-115, 0, 115, 225), cars: 16 },     // south of downtown
  { pts: rectLoop(225, -335, 445, 115, -2.6), cars: 12, reverse: true },
  { pts: NORTH_LOOP, cars: 16 },                      // north side
  // outskirts loops — suburbs, industrial, midrise, apartments
  { pts: rectLoop(-335, 0, -115, 115), cars: 10 },    // SW suburbs
  { pts: rectLoop(-445, -225, -335, 115, -2.6), cars: 8, reverse: true }, // old town W
  { pts: rectLoop(115, 115, 335, 445), cars: 10 },    // SE industrial
  { pts: rectLoop(335, -225, 445, 115, -2.6), cars: 8, reverse: true },  // east midrise
  { pts: rectLoop(-225, -445, 115, -225, -2.6), cars: 8, reverse: true }, // apartments N
  // far edges — keep traffic present all the way out to the city rim
  { pts: rectLoop(-665, -665, -225, -445), cars: 10 },  // north upper-class suburbs
  { pts: rectLoop(-665, -115, -445, 115), cars: 8 },    // far-west apartments
  { pts: rectLoop(445, -115, 775, 335), cars: 14 },     // far-east lower suburbs
  { pts: rectLoop(115, 555, 445, 775), cars: 10 },      // south industrial belt
];

// Driving characteristics per car type.
export const SPECS = {
  normal: { maxSpeed: 16, accel: 14, turn: 2.05, halfLen: 2.3, hoodH: 1.15 },
  truck:  { maxSpeed: 12, accel: 9, turn: 1.55, halfLen: 2.9, hoodH: 1.15 },
  police: { maxSpeed: 24, accel: 18, turn: 2.15, halfLen: 2.3, hoodH: 1.15 },
  sports: { maxSpeed: 32, accel: 24, turn: 2.3, halfLen: 2.35, hoodH: 0.95 },
  // Speed boosted for development, don't forget to reset this
  //normal: { maxSpeed: 32, accel: 28, turn: 2.05, halfLen: 2.3, hoodH: 1.15 },
  //truck:  { maxSpeed: 24, accel: 18, turn: 1.55, halfLen: 2.9, hoodH: 1.15 },
  //police: { maxSpeed: 48, accel: 36, turn: 2.15, halfLen: 2.3, hoodH: 1.15 },
  //sports: { maxSpeed: 64, accel: 48, turn: 2.3, halfLen: 2.35, hoodH: 0.95 },
  // Fire apparatus (only ever the two parked in the station garage — never
  // spawned into traffic loops). Moderate: heavier and slower than a car but
  // still driveable through the streets.
  ladder: { maxSpeed: 24, accel: 15, turn: 1.30, halfLen: 4.5, hoodH: 1.45 },
  pumper: { maxSpeed: 26, accel: 16, turn: 1.50, halfLen: 3.6, hoodH: 1.45 },
  // Top Fuel dragster (only the two staged at the west-side drag strip — never
  // spawned into traffic loops). Absurdly fast with brutal acceleration and a
  // long wheelbase that barely turns — built for the strip, a handful on the
  // street. Tune maxSpeed/accel to taste; these are deliberately extreme.
  dragster: { maxSpeed: 100, accel: 95, turn: 1.15, halfLen: 4.0, hoodH: 1.0 },
};

// Collision footprint: three discs along the car's long axis.
export const CAR_R = 1.05;

const SPORTS_COLORS = [0xe0342b, 0xf4c518, 0xf3701d, 0x2fbf71];
const DRAG_COLORS = [0xe0342b, 0x2b6fe0, 0xf4c518, 0xf3701d];

// shared geometry cache — parked cars would otherwise allocate hundreds of boxes
const _geo = new Map();
function boxGeo(w, h, d) {
  const k = w + 'x' + h + 'x' + d;
  if (!_geo.has(k)) _geo.set(k, new THREE.BoxGeometry(w, h, d));
  return _geo.get(k);
}

// One shared vertex-coloured material for every car. Each car's parts are baked
// into a SINGLE merged mesh (see mergeCar), so the whole scene's ~1500 cars are
// ~1500 nodes instead of ~13500 — the renderer's per-object matrix + frustum
// cost (the frame's real bottleneck) scales with node count, not triangles.
const carMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

// `part`/`roundWheel`/`wheels` no longer build meshes — they push a positioned,
// coloured geometry descriptor onto `parts`, which makeCar merges in one pass.
// (The `shadow` arg is kept for call-site compatibility but is now a no-op: the
// whole car casts or not as a unit, toggled per-car by setCarShadow.)
function part(parts, w, h, d, hex, x, y, z, shadow = true) {
  parts.push({ geo: boxGeo(w, h, d), hex, x, y, z });
}

function wheels(parts, zOff = 1.3) {
  for (const [wx, wz] of [[-0.85, zOff], [0.85, zOff], [-0.85, -zOff], [0.85, -zOff]]) {
    roundWheel(parts, wx, 0.3, wz, 0.3, 0.3, 0x24262b, 14);
  }
}

// A properly round wheel: a cylinder laid on its side so the axle runs along
// the car's x-axis (used by the dragster's fat slicks and needle-nose fronts).
function roundWheel(parts, x, y, z, radius, width, hex, seg = 16) {
  const geo = new THREE.CylinderGeometry(radius, radius, width, seg);
  geo.rotateZ(Math.PI / 2); // stand the cylinder on its side, axle along +x
  parts.push({ geo, hex, x, y, z });
}

// Bake a list of positioned, coloured part geometries into one BufferGeometry
// with per-vertex colours. Parts never move relative to the car, so this is
// lossless — the merged mesh animates as a rigid body via its own transform.
function mergeCar(parts) {
  const c = new THREE.Color();
  let total = 0;
  const baked = parts.map((p) => {
    let g = p.geo.clone().translate(p.x, p.y, p.z);
    if (g.index) g = g.toNonIndexed();
    total += g.attributes.position.count;
    return g;
  });
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  baked.forEach((g, i) => {
    const pa = g.attributes.position.array, na = g.attributes.normal.array;
    c.set(parts[i].hex);
    for (let j = 0; j < pa.length; j += 3) {
      pos[o] = pa[j];     pos[o + 1] = pa[j + 1];     pos[o + 2] = pa[j + 2];
      nor[o] = na[j];     nor[o + 1] = na[j + 1];     nor[o + 2] = na[j + 2];
      col[o] = c.r;       col[o + 1] = c.g;           col[o + 2] = c.b;
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

// Toggle shadow-casting for a whole car. Parked cars (the ~1500 registered
// citywide) sit motionless, so casting them into the sun's map every shadow
// update is ~8 wasted draw calls each — by far the scene's biggest cost. We
// switch a car's cast off while parked and back on the moment it moves, which
// drops the shadow pass from ~12.6k draw calls to a few hundred with no visible
// loss (a stationary car's low ground shadow reads against the building shadows
// already there). See the reconcile in update().
function setCarShadow(mesh, on) {
  mesh.traverse((o) => { if (o.isMesh) o.castShadow = on; });
}

function makeCar(seed, type) {
  const g = []; // parts accumulator (positioned, coloured geometry descriptors)
  if (type === 'truck') {
    const body = pick(P.carBodies, seed, 1);
    part(g, 1.9, 0.7, 5.2, body, 0, 0.75, 0);
    part(g, 1.7, 0.62, 1.4, hash(seed, 3) % 3 === 0 ? body : P.glassDark, 0, 1.35, 1.5);
    part(g, 2.0, 0.9, 3.0, P.concreteDark, 0, 1.2, -1.0);
    wheels(g);
  } else if (type === 'police') {
    part(g, 1.9, 0.7, 4.3, P.white, 0, 0.75, 0);
    part(g, 1.92, 0.28, 1.6, 0x24262b, 0, 0.7, 0);     // black side band
    part(g, 1.7, 0.6, 2.0, P.glassDark, 0, 1.38, -0.2); // cabin
    part(g, 0.42, 0.22, 0.5, 0xe0342b, -0.35, 1.76, -0.2); // light bar red
    part(g, 0.42, 0.22, 0.5, 0x2b6fe0, 0.35, 1.76, -0.2);  // light bar blue
    wheels(g);
  } else if (type === 'sports') {
    const body = pick(SPORTS_COLORS, seed, 1);
    part(g, 1.9, 0.5, 4.4, body, 0, 0.62, 0);
    part(g, 1.86, 0.3, 1.3, body, 0, 0.98, 1.35);       // sloped-ish nose hump
    part(g, 1.6, 0.42, 1.7, P.glassDark, 0, 1.05, -0.35); // low cabin
    part(g, 1.8, 0.1, 0.55, 0x24262b, 0, 1.25, -1.95);  // spoiler wing
    part(g, 0.12, 0.5, 0.12, 0x24262b, -0.7, 1.0, -1.95, false);
    part(g, 0.12, 0.5, 0.12, 0x24262b, 0.7, 1.0, -1.95, false);
    wheels(g, 1.4);
  } else if (type === 'dragster') {
    // Top Fuel dragster, nose along +z (forward). A long slender chassis tube
    // rides between tiny front wheels way out on a needle nose and two huge
    // fat rear slicks; between them sits an exposed blown engine (block +
    // supercharger + injector hat) flanked by zoomie headers, a small cockpit
    // just ahead of the rear axle, and a big rear wing on struts.
    const body = pick(DRAG_COLORS, seed, 1);
    const DK = 0x1a1b1e, MET = 0xb8bcc0, CHR = 0xd7dbdf;
    part(g, 0.5, 0.32, 6.6, body, 0, 0.55, 0.3);            // chassis tube
    part(g, 0.34, 0.26, 1.6, body, 0, 0.5, 3.7);            // needle nose
    part(g, 2.0, 0.07, 0.5, DK, 0, 0.44, 4.2);              // front wing
    part(g, 1.9, 0.05, 0.4, body, 0, 0.52, 4.15);
    part(g, 1.7, 0.08, 0.08, DK, 0, 0.3, 3.5, false);       // front axle
    for (const sx of [-1, 1]) roundWheel(g, sx * 0.85, 0.3, 3.5, 0.3, 0.16, DK, 14); // front wheels
    part(g, 0.62, 0.5, 1.5, body, 0, 0.78, -1.5);           // cockpit fairing
    part(g, 0.5, 0.36, 0.5, P.glassDark, 0, 1.06, -1.1);    // headrest / screen
    part(g, 0.55, 0.5, 0.12, DK, 0, 1.2, -2.05, false);     // roll hoop
    part(g, 0.86, 0.7, 1.3, MET, 0, 0.75, 0.1);             // engine block
    part(g, 0.7, 0.5, 0.72, DK, 0, 1.18, 0.15);             // supercharger
    part(g, 0.82, 0.18, 0.82, CHR, 0, 1.5, 0.15);           // injector hat
    for (const sx of [-1, 1]) for (let i = 0; i < 4; i++)   // zoomie headers
      part(g, 0.16, 0.16, 0.44, CHR, sx * 0.62, 0.92, 0.6 - i * 0.32, false);
    part(g, 1.9, 0.12, 0.12, DK, 0, 0.72, -2.7, false);     // rear axle
    for (const sx of [-1, 1]) roundWheel(g, sx * 1.12, 0.72, -2.7, 0.72, 0.95, DK, 22); // fat rear slicks
    for (const sx of [-1, 1]) roundWheel(g, sx * 1.12, 0.72, -2.7, 0.34, 1.02, MET, 12); // hubs (poke proud of the tyre)
    // rear wing: struts embed up into the plane, endplates enclose the tips
    // (proud on every side), a gurney bar straddles the trailing edge — no two
    // like-coloured faces are ever coplanar, so nothing z-fights.
    for (const sx of [-1, 1]) part(g, 0.1, 0.95, 0.5, DK, sx * 0.85, 1.48, -3.35, false); // struts
    part(g, 2.3, 0.1, 0.95, body, 0, 1.95, -3.4);           // wing plane
    part(g, 2.3, 0.12, 0.12, DK, 0, 2.0, -3.82, false);     // gurney bar (on the top-rear edge)
    for (const sx of [-1, 1]) part(g, 0.12, 0.62, 1.06, body, sx * 1.3, 1.68, -3.4, false); // endplates
  } else if (type === 'ladder' || type === 'pumper') {
    // Parts are stacked so an upper piece's underside sits just *below* the
    // piece it rests on (never exactly coplanar), and surface details are
    // centred on the face they sit on (half embedded, half proud) — so no two
    // differently-coloured faces share a plane (which z-fights).
    const RED = 0xcf2a24, GL = P.glassDark, SIL = 0xc0c4c8, DK = 0x26282c;
    const ladder = type === 'ladder', L = ladder ? 9.2 : 7.4, F = L / 2;
    const BZ = -1.2, BL = L - 3.4;                                      // rear body centre/length
    part(g, 2.3, 0.5, L - 0.2, DK, 0, 0.55, 0);                        // chassis
    part(g, 2.42, 0.9, BL, SIL, 0, 1.0, BZ);                           // lower body (compartments)
    part(g, 2.42, 0.9, BL, RED, 0, 1.9, BZ);                           // upper body
    for (const sx of [-1, 1]) part(g, 0.1, 0.24, BL - 0.2, 0xeadf4e, sx * 1.21, 1.45, BZ); // reflective stripe (proud)
    part(g, 2.46, 1.9, 2.9, RED, 0, 1.42, F - 1.55);                  // crew cab
    part(g, 2.52, 0.24, 3.0, P.white, 0, 2.44, F - 1.55);             // white roof (embedded onto cab)
    part(g, 2.0, 0.95, 0.16, GL, 0, 2.05, F - 0.1);                   // windshield (proud of cab front)
    for (const sx of [-1, 1]) part(g, 0.16, 0.85, 1.7, GL, sx * 1.23, 2.05, F - 1.7); // side windows (proud)
    part(g, 1.4, 0.5, 0.16, 0x17181c, 0, 1.05, F - 0.1);              // grille
    part(g, 2.5, 0.4, 0.5, 0xd6dade, 0, 0.68, F);                    // bumper (straddles cab front)
    for (const sx of [-1, 1]) part(g, 0.12, 0.45, 0.28, DK, sx * 1.4, 1.95, F - 0.55, false); // mirrors
    part(g, 1.9, 0.16, 0.46, 0x0e1014, 0, 2.62, F - 1.55);            // light bar (embedded onto roof)
    for (const [ox, cc] of [[-0.5, 0xe0342b], [0.5, 0x2b6fe0]]) part(g, 0.5, 0.16, 0.42, cc, ox, 2.76, F - 1.55, false); // beacons
    if (ladder) {
      part(g, 1.5, 0.5, 1.5, 0x3a3d42, 0, 2.52, -1.9);               // turntable (embedded onto body)
      part(g, 1.06, 0.16, BL + 2.0, 0xcfd3d7, 0, 2.9, -1.3);         // ladder bed
      for (const sx of [-1, 1]) part(g, 0.14, 0.34, BL + 2.2, 0xaeb2b6, sx * 0.50, 3.05, -1.3); // rails (outer proud of bed)
      const lz0 = -1.3 - (BL + 2.0) / 2;
      for (let i = 0; i < 10; i++) part(g, 0.94, 0.06, 0.09, 0xd8dce0, 0, 3.12, lz0 + (i + 0.5) * (BL + 2.0) / 10, false); // rungs (ends embedded in rails)
      for (const sx of [-1, 1]) part(g, 0.55, 0.3, 0.95, 0x2b2b2b, sx * 1.42, 0.55, -2.5, false); // outriggers
    } else {
      part(g, 2.2, 0.6, BL - 0.6, 0x7a6640, 0, 2.55, BZ);            // open hose bed (embedded onto body)
      part(g, 0.32, 0.55, 0.32, 0x3a3d42, 0, 2.6, 0.5);             // deck-gun base
      part(g, 0.14, 0.5, 0.14, 0xd6dade, 0.02, 3.05, 0.65, false);  // deck-gun barrel
    }
    const rz = -F + 1.9, fz = F - 1.6;
    for (const wz of [fz, rz, rz - 1.5]) for (const sx of [-1, 1]) roundWheel(g, sx * 1.09, 0.42, wz, 0.41, 0.4, 0x141518, 16); // round tyres, three axles
  } else {
    const body = pick(P.carBodies, seed, 1);
    part(g, 1.9, 0.7, 4.1, body, 0, 0.75, 0);
    part(g, 1.7, 0.62, 2.0, hash(seed, 3) % 3 === 0 ? body : P.glassDark, 0, 1.35, -0.2);
    wheels(g);
  }
  const mesh = new THREE.Mesh(mergeCar(g), carMat);
  mesh.castShadow = true;
  return mesh;
}

function loopLength(pts) {
  let L = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    L += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return L;
}

function pointAt(pts, dist) {
  let d = dist;
  for (let i = 0; ; i = (i + 1) % pts.length) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d <= seg) {
      const t = d / seg;
      return {
        x: a[0] + (b[0] - a[0]) * t,
        z: a[1] + (b[1] - a[1]) * t,
        heading: Math.atan2(b[0] - a[0], b[1] - a[1]),
      };
    }
    d -= seg;
  }
}

// closest point on a loop to (x, z), as arc-length parameter + position
function closestOnLoop(pts, x, z) {
  let best = { dist: 0, x: pts[0][0], z: pts[0][1], d2: Infinity };
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const abx = b[0] - a[0], abz = b[1] - a[1];
    const seg = Math.hypot(abx, abz);
    let t = ((x - a[0]) * abx + (z - a[1]) * abz) / (seg * seg);
    t = Math.max(0, Math.min(1, t));
    const px = a[0] + abx * t, pz = a[1] + abz * t;
    const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d2 < best.d2) best = { dist: acc + seg * t, x: px, z: pz, d2 };
    acc += seg;
  }
  return best;
}

// Global car indexes that get the rare fast cars (deterministic, spread out).
const SPORTS_AT = new Set([5, 21, 38, 55, 77, 102]);

// Resolve a car (positioned at pos, facing heading) against static world
// colliders using three discs along its axis. Mutates pos; returns the
// accumulated push {x,z} (zero when there was no contact). Boxes lower than
// lowY (curbs) or starting above topY are ignored.
const _wcand = [];
export function collideCarWorld(colliders, pos, heading, spec, y) {
  const fx = Math.sin(heading), fz = Math.cos(heading);
  const span = spec.halfLen - CAR_R;
  const lowY = y + 0.45, topY = y + 1.5;
  const reach = spec.halfLen + 1.5;
  colliders.query(pos.x - reach, pos.z - reach, pos.x + reach, pos.z + reach, _wcand);
  let pushX = 0, pushZ = 0;
  for (let iter = 0; iter < 2; iter++) {
    for (const off of [span, 0, -span]) {
      const cx = pos.x + fx * off, cz = pos.z + fz * off;
      for (const i of _wcand) {
        const b = colliders.boxes[i];
        if (b.maxY <= lowY || b.minY >= topY) continue;
        let qx, qz;
        if (b.rot) {
          // closest point on the rotated box, solved in its local frame
          const ddx = cx - b.cx, ddz = cz - b.cz;
          const lx = b.cos * ddx - b.sin * ddz;
          const lz = b.sin * ddx + b.cos * ddz;
          const qlx = Math.max(-b.ex, Math.min(lx, b.ex));
          const qlz = Math.max(-b.ez, Math.min(lz, b.ez));
          qx = b.cx + qlx * b.cos + qlz * b.sin;
          qz = b.cz - qlx * b.sin + qlz * b.cos;
        } else {
          qx = Math.max(b.minX, Math.min(cx, b.maxX));
          qz = Math.max(b.minZ, Math.min(cz, b.maxZ));
        }
        const dx = cx - qx, dz = cz - qz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= CAR_R * CAR_R) continue;
        let nx, nz, d = Math.sqrt(d2);
        if (d < 1e-4) { nx = -fx; nz = -fz; d = 0; }
        else { nx = dx / d; nz = dz / d; }
        const pen = CAR_R - d;
        pos.x += nx * pen; pos.z += nz * pen;
        pushX += nx * pen; pushZ += nz * pen;
      }
    }
  }
  return { x: pushX, z: pushZ };
}

// Visual lift for a pitched (tumbling/settling) car so its lower end rests
// on the ground corner instead of clipping through it.
export function pitchLift(c) {
  return c.pitch ? c.spec.halfLen * Math.abs(Math.sin(c.pitch)) * 0.8 : 0;
}

export class Traffic {
  constructor(scene, colliders = null) {
    this.cars = [];
    this.colliders = colliders;
    this.boxes = []; // dynamic collision AABBs, one per car, updated each frame
    let seed = 100;
    let gi = 0;
    for (const loop of LOOPS) {
      const pts = loop.reverse ? [...loop.pts].reverse() : loop.pts;
      const L = loopLength(pts);
      for (let i = 0; i < loop.cars; i++) {
        seed++;
        const carSeed = hash(seed, 7);
        let type = 'normal';
        if (SPORTS_AT.has(gi)) type = 'sports';
        else if (gi % 9 === 2) type = 'police';
        else if (hash(carSeed, 2) % 5 === 0) type = 'truck';
        this.addCar({
          scene, carSeed, type,
          mode: 'loop', pts, L, y: 0.06,
          dist: (L * i) / loop.cars + (hash(seed, 8) % 40),
          speed: (type === 'sports' ? 12 : 9) + (hash(seed, 9) % 6),
          gi,
        });
        gi++;
      }
    }
    // parked cars registered by the city builder (driveways, parking lots)
    let k = 0;
    for (const spot of PARKED) {
      k++;
      const type = spot.type || (hash(spot.seed, 4) % 7 === 0 ? 'truck' : 'normal');
      const c = this.addCar({
        scene, carSeed: spot.seed, type,
        mode: 'parked', pts: null, L: 0, y: spot.y, dist: 0, speed: 0,
        gi: 100000 + k,
      });
      c.mesh.position.set(spot.x, c.y, spot.z);
      c.mesh.rotation.y = spot.ry;
      this.updateBox(c);
    }
  }

  addCar({ scene, carSeed, type, mode, pts, L, y, dist, speed, gi = 0 }) {
    const spec = SPECS[type];
    const mesh = makeCar(carSeed, type);
    mesh.rotation.order = 'YXZ'; // yaw first, then tumble pitch in car frame
    // Parked cars don't cast until they move (see setCarShadow + update()).
    const castShadow = mode !== 'parked';
    if (!castShadow) setCarShadow(mesh, false);
    scene.add(mesh);
    const box = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
    this.boxes.push(box);
    const c = {
      mesh, box, type, spec, mode, pts, L, y, dist, speed, gi,
      castsShadow: castShadow, // tracks mesh cast state; reconciled in update()
      v: mode === 'loop' ? speed : 0, off: { x: 0, z: 0 },
      everDriven: false, pushVel: { x: 0, z: 0 }, _blocked: false,
      air: null, pitch: 0, flipped: false, boost: 1,
    };
    this.cars.push(c);
    return c;
  }

  // A falling car touched down. Normalizes the tumble pitch; landing more
  // than ~106 degrees over ends up on the roof — a permanent wreck.
  landCar(c) {
    let p = c.pitch || 0;
    while (p > Math.PI) p -= Math.PI * 2;
    while (p < -Math.PI) p += Math.PI * 2;
    c.air = null;
    if (Math.abs(p) > 1.85) {
      c.pitch = Math.PI;
      c.flipped = true;
      c.mode = 'parked';
      c.speed = 0;
      c.v = 0;
      c.pushVel.x = 0;
      c.pushVel.z = 0;
      c.everDriven = true;
      c.mesh.rotation.x = Math.PI;
      c.mesh.position.y = c.y + 1.45; // resting on the roof
      this.updateBox(c);
      return 'flipped';
    }
    c.pitch = p;
    return 'landed';
  }

  // Impulse from a collision: knocks the car off its route and shoves it.
  // Cars with a home loop drive back to it after the shove wears off.
  knock(c, ix, iz) {
    if (c.mode === 'loop' || c.mode === 'return') c.mode = 'free';
    c.everDriven = true; // loop traffic must brake for it from now on
    c.pushVel.x += ix;
    c.pushVel.z += iz;
  }

  // dynamic car box: conservative world AABB for the broad phase, plus the
  // exact oriented footprint so the player can walk/stand right at the body
  updateBox(c) {
    const pos = c.mesh.position;
    const ry = c.mesh.rotation.y;
    const s = Math.sin(ry), co = Math.cos(ry);
    const as = Math.abs(s), ac = Math.abs(co);
    const hx = as * c.spec.halfLen + ac * 1.05;
    const hz = ac * c.spec.halfLen + as * 1.05;
    c.box.minX = pos.x - hx; c.box.maxX = pos.x + hx;
    c.box.minZ = pos.z - hz; c.box.maxZ = pos.z + hz;
    c.box.minY = c.y; c.box.maxY = c.y + c.spec.hoodH;
    c.box.rot = true;
    c.box.cx = pos.x; c.box.cz = pos.z;
    c.box.cos = co; c.box.sin = s;
    c.box.ex = 1.05; c.box.ez = c.spec.halfLen;
  }

  update(dt, player = null) {
    for (const c of this.cars) {
      // A car casts a shadow only while it's actually moving; parked cars stay
      // off to keep the shadow pass cheap. Flip the mesh only on a real change.
      const wantsShadow = c.mode !== 'parked';
      if (wantsShadow !== c.castsShadow) {
        setCarShadow(c.mesh, wantsShadow);
        c.castsShadow = wantsShadow;
      }
      if (c.mode === 'driven') continue;
      c.boost = Math.min(1, c.boost + dt / 20); // idle cars regain boost
      // shoved cars (from collisions) slide with friction until they stop
      const pv = c.pushVel;
      if (c.air || (pv.x * pv.x + pv.z * pv.z) > 0.04) {
        const pos = c.mesh.position;
        pos.x += pv.x * dt;
        pos.z += pv.z * dt;
        const f = Math.max(0, 1 - 2.6 * dt);
        pv.x *= f; pv.z *= f;
        if (this.colliders) {
          const push = collideCarWorld(this.colliders, pos, c.mesh.rotation.y, c.spec, c.y);
          if (push.x || push.z) {
            // cancel slide into the obstacle
            const pl = Math.hypot(push.x, push.z);
            const nx = push.x / pl, nz = push.z / pl;
            const vn = pv.x * nx + pv.z * nz;
            if (vn < 0) { pv.x -= nx * vn; pv.z -= nz * vn; }
          }
        }
        const gy = groundHeight(pos.x, pos.z) + 0.06;
        if (c.air) {
          // knocked off an edge: ballistic fall with a tumble
          c.air.vy -= 24 * dt;
          c.y += c.air.vy * dt;
          c.pitch = (c.pitch || 0) + c.air.pitchV * dt;
          c.mesh.rotation.x = c.pitch;
          if (c.y <= gy) {
            c.y = gy;
            if (this.landCar(c) === 'flipped') continue; // parked roof-down
          }
        } else if (gy < c.y - 0.7) {
          c.air = { vy: 0, pitchV: -(0.4 + 0.1 * Math.hypot(pv.x, pv.z)) };
        } else if (gy < c.y - 0.01) {
          c.y += (gy - c.y) * Math.min(1, 6 * dt);
        } else if (gy - c.y > 0.55) {
          // shoved into the rocky scarp: it's a wall
          pos.x -= pv.x * dt;
          pos.z -= pv.z * dt;
          pv.x *= 0.5; pv.z *= 0.5;
        }
        if (!c.air && c.pitch) { // settle back onto the wheels
          c.pitch *= Math.max(0, 1 - 6 * dt);
          if (Math.abs(c.pitch) < 0.01) c.pitch = 0;
          c.mesh.rotation.x = c.pitch;
        }
        pos.y = c.y + (c.flipped ? 0 : pitchLift(c));
        if (!c.air && pv.x * pv.x + pv.z * pv.z < 0.09) {
          pv.x = 0; pv.z = 0;
          c.v = 0;
          if (c.mode === 'free') c.mode = c.pts ? 'return' : 'parked';
        }
        this.updateBox(c);
        continue;
      }
      if (c.mode === 'return') { this.updateReturn(c, dt); continue; }
      if (c.mode !== 'loop') continue;

      // Cruise-control braking: sample three points on the road ahead and
      // slow down in grades depending on how close the obstruction is —
      // smooth speed changes, no frame-to-frame stop/go stutter.
      const lookahead = 5 + c.v * 0.6;
      const s1 = pointAt(c.pts, (c.dist + lookahead) % c.L);
      const s2 = pointAt(c.pts, (c.dist + lookahead * 0.62) % c.L);
      const s3 = pointAt(c.pts, (c.dist + lookahead * 0.3) % c.L);
      let target = c.speed;
      for (const o of this.cars) {
        if (o === c) continue;
        const b = o.box;
        const hit = (p) =>
          p.x > b.minX - 1.2 && p.x < b.maxX + 1.2 &&
          p.z > b.minZ - 1.2 && p.z < b.maxZ + 1.2;
        const overlapNow =
          c.box.minX < b.maxX && c.box.maxX > b.minX &&
          c.box.minZ < b.maxZ && c.box.maxZ > b.minZ;
        let cand = c.speed;
        if (overlapNow || hit(s3)) cand = 0;
        else if (hit(s2)) cand = 3;
        else if (hit(s1)) cand = 7;
        if (cand >= target) continue;
        // deadlock breaker for CROSSING traffic (and spawn-overlap
        // unstacking): the lower global index has right of way. Never
        // applied to a same-direction leader — followers must queue.
        let hdiff = c.mesh.rotation.y - o.mesh.rotation.y;
        while (hdiff > Math.PI) hdiff -= Math.PI * 2;
        while (hdiff < -Math.PI) hdiff += Math.PI * 2;
        const sameDir = Math.abs(hdiff) < 0.6;
        if ((!sameDir || overlapNow) && o.mode === 'loop' && o._blocked && c.gi < o.gi) continue;
        target = cand;
      }
      c._blocked = target < 0.5;
      const rate = target < c.v ? 26 : Math.max(6, c.spec.accel * 0.45);
      c.v += Math.max(-rate * dt, Math.min(rate * dt, target - c.v));
      if (c.v < 0.02 && target === 0) c.v = 0;
      c.dist = (c.dist + c.v * dt) % c.L;

      // lateral offset from hard separation decays back to the lane
      const o = c.off;
      const ol = Math.hypot(o.x, o.z);
      if (ol > 0.001) {
        const dec = Math.min(ol, 1.4 * dt);
        o.x -= (o.x / ol) * dec;
        o.z -= (o.z / ol) * dec;
      }

      const p = pointAt(c.pts, c.dist);
      c.mesh.position.set(p.x + o.x, c.y, p.z + o.z);
      // smooth heading turn
      let diff = p.heading - c.mesh.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      c.mesh.rotation.y += diff * Math.min(1, 8 * dt);

      this.updateBox(c);
      if (player && !player.car) this.shovePlayer(c, player);
    }

    this.separateCars();
  }

  // ---- walking player shove -------------------------------------------------
  shovePlayer(c, player) {
    const pp = player.pos;
    const b = c.box;
    const onTop = pp.y >= b.maxY - 0.15;
    if (onTop || pp.y >= b.maxY) return;
    // exact oriented-footprint overlap, pushed out along the shallower local axis
    const dx = pp.x - b.cx, dz = pp.z - b.cz;
    const lx = b.cos * dx - b.sin * dz;
    const lz = b.sin * dx + b.cos * dz;
    const px = b.ex + 0.35 - Math.abs(lx);
    const pz = b.ez + 0.35 - Math.abs(lz);
    if (px <= 0 || pz <= 0) return;
    if (px < pz) {
      const m = px * (Math.sign(lx) || 1);
      pp.x += m * b.cos;
      pp.z += -m * b.sin;
    } else {
      const m = pz * (Math.sign(lz) || 1);
      pp.x += m * b.sin;
      pp.z += m * b.cos;
    }
  }

  // ---- knocked cars driving back to their loop -------------------------------
  updateReturn(c, dt) {
    const pos = c.mesh.position;
    // shoved off the plateau: no way back up, abandon the route
    if (groundHeight(pos.x, pos.z) < -1) {
      c.mode = 'parked';
      c.v = 0;
      return;
    }
    const t = closestOnLoop(c.pts, pos.x, pos.z);
    const dx = t.x - pos.x, dz = t.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.4) {
      c.mode = 'loop';
      c.dist = t.dist;
      c.off.x = pos.x - t.x; // absorb the snap; decays away smoothly
      c.off.z = pos.z - t.z;
      c.v = Math.min(c.v, 5);
      return;
    }
    const want = Math.atan2(dx, dz);
    let diff = want - c.mesh.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turn = c.spec.turn * 1.2 * dt;
    c.mesh.rotation.y += Math.max(-turn, Math.min(turn, diff));

    // creep while badly misaligned, cruise back otherwise; brake for traffic
    let target = Math.abs(diff) > 1.1 ? 2.5 : Math.min(c.speed, 7);
    const h = c.mesh.rotation.y;
    const fx = Math.sin(h), fz = Math.cos(h);
    const probe = 3.5 + c.v * 0.5;
    const qx = pos.x + fx * probe, qz = pos.z + fz * probe;
    for (const o of this.cars) {
      if (o === c) continue;
      const b = o.box;
      if (qx > b.minX - 1 && qx < b.maxX + 1 && qz > b.minZ - 1 && qz < b.maxZ + 1) {
        target = 0;
        break;
      }
    }
    c.v += Math.max(-24 * dt, Math.min(10 * dt, target - c.v));
    pos.x += fx * c.v * dt;
    pos.z += fz * c.v * dt;
    if (this.colliders) {
      const push = collideCarWorld(this.colliders, pos, h, c.spec, c.y);
      if (push.x || push.z) c.v *= Math.max(0, 1 - 4 * dt);
    }
    pos.y = c.y;
    this.updateBox(c);
  }

  // ---- hard anti-interpenetration pass ---------------------------------------
  // Sweep-and-prune over the car AABBs, then disc-vs-disc resolution so no
  // two AI cars ever visibly overlap (braking alone can miss corner merges).
  separateCars() {
    const cars = this.cars;
    let order = this._order;
    if (!order || order.length !== cars.length) {
      order = this._order = cars.map((_, i) => i);
    }
    for (let i = 1; i < order.length; i++) { // insertion sort: nearly sorted
      const oi = order[i];
      const key = cars[oi].box.minX;
      let j = i - 1;
      while (j >= 0 && cars[order[j]].box.minX > key) { order[j + 1] = order[j]; j--; }
      order[j + 1] = oi;
    }
    for (let i = 0; i < order.length; i++) {
      const a = cars[order[i]];
      for (let j = i + 1; j < order.length; j++) {
        const b = cars[order[j]];
        if (b.box.minX > a.box.maxX) break;
        if (a.box.minZ > b.box.maxZ || a.box.maxZ < b.box.minZ) continue;
        if (a.mode === 'driven' || b.mode === 'driven') continue; // player resolves
        const aMov = a.mode !== 'parked';
        const bMov = b.mode !== 'parked';
        if (!aMov && !bMov) continue;
        this.separatePair(a, b, aMov, bMov);
      }
    }
  }

  separatePair(a, b, aMov, bMov) {
    const pa = a.mesh.position, pb = b.mesh.position;
    const fax = Math.sin(a.mesh.rotation.y), faz = Math.cos(a.mesh.rotation.y);
    const fbx = Math.sin(b.mesh.rotation.y), fbz = Math.cos(b.mesh.rotation.y);
    const sa = a.spec.halfLen - CAR_R, sb = b.spec.halfLen - CAR_R;
    const minD = CAR_R * 2;
    const w = aMov && bMov ? 0.5 : 1;
    let touched = false;
    for (const oa of [sa, 0, -sa]) {
      const ax = pa.x + fax * oa, az = pa.z + faz * oa;
      for (const ob of [sb, 0, -sb]) {
        const bx = pb.x + fbx * ob, bz = pb.z + fbz * ob;
        let dx = ax - bx, dz = az - bz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= minD * minD) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-4) { dx = fax; dz = faz; d = 1; }
        const nx = dx / d, nz = dz / d;
        const pen = Math.min(minD - d, 0.35); // gentle: settles over a few frames
        if (aMov) this.nudge(a, nx * pen * w, nz * pen * w);
        if (bMov) this.nudge(b, -nx * pen * w, -nz * pen * w);
        touched = true;
      }
    }
    if (touched) { this.updateBox(a); this.updateBox(b); }
  }

  nudge(c, px, pz) {
    c.mesh.position.x += px;
    c.mesh.position.z += pz;
    if (c.mode === 'loop') {
      // remember the sideways shove so the car eases back into its lane
      const o = c.off;
      o.x += px; o.z += pz;
      const l = Math.hypot(o.x, o.z);
      if (l > 2.5) { o.x *= 2.5 / l; o.z *= 2.5 / l; }
    }
  }
}
