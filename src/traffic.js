// Deterministic traffic: low-poly cars driving fixed rectangular loops on
// the road network, plus parked cars registered by the city builder.
// Every car (moving or parked) can be hijacked and driven by the player.
import * as THREE from 'three';
import { mat } from './character.js';
import { PALETTE as P, PARKED } from './city.js';
import { groundHeight } from './island.js';
import { parkwayLanePts } from './parkway.js';
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

// The coastal parkway loop follows the island's edge (parkway.js) as one
// uncut closed ring.
const RING_LOOP = parkwayLanePts();
const NORTH_LOOP = rectLoop(-500, -500, 140, -380);

const LOOPS = [
  { pts: RING_LOOP, cars: 12 },                       // coastal parkway ring
  { pts: rectLoop(-140, -140, 140, 140), cars: 16 },  // downtown
  { pts: rectLoop(-140, -140, 140, 140, -2.6), cars: 12, reverse: true },
  { pts: rectLoop(-380, -260, -140, 0), cars: 12 },   // around Central Park
  { pts: rectLoop(0, -380, 380, 380), cars: 20 },     // east avenue loop
  { pts: rectLoop(-500, -500, 0, -260, -2.6), cars: 12, reverse: true },
  { pts: rectLoop(-140, 0, 140, 260), cars: 16 },     // south of downtown
  { pts: rectLoop(260, -380, 500, 140, -2.6), cars: 12, reverse: true },
  { pts: NORTH_LOOP, cars: 16 },                      // north side
  // outskirts loops — suburbs, industrial, midrise, apartments
  { pts: rectLoop(-380, 0, -140, 140), cars: 10 },    // SW suburbs
  { pts: rectLoop(-500, -260, -380, 140, -2.6), cars: 8, reverse: true }, // old town W
  { pts: rectLoop(140, 140, 380, 500), cars: 10 },    // SE industrial
  { pts: rectLoop(380, -260, 500, 140, -2.6), cars: 8, reverse: true },  // east midrise
  { pts: rectLoop(-260, -500, 140, -260, -2.6), cars: 8, reverse: true }, // apartments N
];

// Driving characteristics per car type.
export const SPECS = {
  normal: { maxSpeed: 16, accel: 14, turn: 2.05, halfLen: 2.3, hoodH: 1.15 },
  truck:  { maxSpeed: 12, accel: 9, turn: 1.55, halfLen: 2.9, hoodH: 1.15 },
  police: { maxSpeed: 24, accel: 18, turn: 2.15, halfLen: 2.3, hoodH: 1.15 },
  sports: { maxSpeed: 32, accel: 24, turn: 2.3, halfLen: 2.35, hoodH: 0.95 },
};

// Collision footprint: three discs along the car's long axis.
export const CAR_R = 1.05;

const SPORTS_COLORS = [0xe0342b, 0xf4c518, 0xf3701d, 0x2fbf71];

// shared geometry cache — parked cars would otherwise allocate hundreds of boxes
const _geo = new Map();
function boxGeo(w, h, d) {
  const k = w + 'x' + h + 'x' + d;
  if (!_geo.has(k)) _geo.set(k, new THREE.BoxGeometry(w, h, d));
  return _geo.get(k);
}
function part(g, w, h, d, hex, x, y, z, shadow = true) {
  const m = new THREE.Mesh(boxGeo(w, h, d), mat(hex));
  m.position.set(x, y, z);
  m.castShadow = shadow;
  g.add(m);
  return m;
}

function wheels(g, zOff = 1.3) {
  for (const [wx, wz] of [[-0.85, zOff], [0.85, zOff], [-0.85, -zOff], [0.85, -zOff]]) {
    part(g, 0.28, 0.55, 0.55, 0x24262b, wx, 0.3, wz, false);
  }
}

function makeCar(seed, type) {
  const g = new THREE.Group();
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
  } else {
    const body = pick(P.carBodies, seed, 1);
    part(g, 1.9, 0.7, 4.1, body, 0, 0.75, 0);
    part(g, 1.7, 0.62, 2.0, hash(seed, 3) % 3 === 0 ? body : P.glassDark, 0, 1.35, -0.2);
    wheels(g);
  }
  return g;
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
    scene.add(mesh);
    const box = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
    this.boxes.push(box);
    const c = {
      mesh, box, type, spec, mode, pts, L, y, dist, speed, gi,
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
