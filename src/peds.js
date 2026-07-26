// Deterministic pedestrians walking fixed sidewalk loops around blocks.
// Cars hit them: they get launched (distance scales with car speed), lie
// flat for a moment, get up, walk back to their loop and carry on.
import * as THREE from 'three';
import { makeHumanoid, animateWalk } from './character.js';
import { cellRect, GRID, REMOVED_CELLS } from './layout.js';
import { INSET } from './palette.js';
import { groundHeight } from './island.js';
import { hash, pick } from './util.js';

const SHIRTS = [0x4a90d9, 0xe04f43, 0xf4c542, 0x3aa7a3, 0xe07f9a, 0x8bc34a, 0xf2f4f5, 0xf39a3a];
const PANTS = [0x37474f, 0x5d4037, 0x455a64, 0x263238, 0x6d4c41];
const SKINS = [0xf0c8a0, 0xc68863, 0x8d5524, 0xffdbac];

// Blocks that get pedestrian loops (grid cell coords from layout.js). Each
// loop walks the sidewalk band around ONE ordinary built block, so every cell
// listed must be a real district cell with roads on all four sides — never a
// cell inside a superblock (central park 5,6..7,8 / plaza 8,6..10,8 /
// construction 12,11..14,13), whose interior has hills/courtyards and NO
// sidewalk. Loops are spread across the whole city so pedestrians aren't
// clustered in the centre.
const LOOP_CELLS = [
  // north — upper-class suburbs
  [2, 1, 3, 2], [5, 1, 6, 2], [3, 3, 4, 4], [7, 3, 8, 4],
  // west — apartments
  [1, 8, 2, 9], [3, 6, 4, 7], [2, 9, 3, 10],
  // commercial midrise ring
  [3, 4, 4, 5], [11, 4, 12, 5], [12, 5, 13, 6],
  // downtown core (around, never through, the central-park superblock)
  [5, 5, 6, 6], [9, 5, 10, 6], [7, 7, 8, 8], [10, 6, 11, 7],
  [8, 11, 9, 12], [9, 9, 10, 10],
  // east — lower-class suburbs
  [12, 6, 13, 7], [14, 8, 15, 9], [15, 10, 16, 11], [13, 10, 14, 11],
  // south — industrial
  [9, 13, 10, 14], [11, 13, 12, 14], [10, 14, 11, 15],
];
const PEDS_PER_LOOP = 6;

// A loop is only valid if every cell it spans is a built block; a loop over a
// removed cell would put pedestrians out on the water/void. Guards the list
// above against typos and any future coast-swallowed cell.
function loopOnLand(cells) {
  const [ix0, iz0, ix1, iz1] = cells;
  for (let i = ix0; i < ix1; i++)
    for (let j = iz0; j < iz1; j++) {
      if (i < 0 || j < 0 || i >= GRID.length - 1 || j >= GRID.length - 1
        || REMOVED_CELLS.has(i + ',' + j)) {
        console.warn(`peds: skipping loop [${cells}] — cell ${i},${j} is not a built block`);
        return false;
      }
    }
  return true;
}
const WALK_Y = 0.15; // sidewalk top

// The plaza courtyard. A crowd of "wanderers" roams freely inside it but
// never leaves (they don't use the gateways). Geometry mirrors buildPlaza in
// buildings.js: the 2x2 plaza block, its 18m building wings, the raised
// courtyard concrete, and the monument/fountain/garden obstacles.
const _plaza = cellRect(8, 6, 10, 8);
const COURT = {
  cx: (_plaza.x0 + _plaza.x1) / 2,
  cz: (_plaza.z0 + _plaza.z1) / 2,
  half: 74,          // walkable half-extent, just inside the colonnade
  y: WALK_Y + 0.2,   // the courtyard concrete is raised 0.2 over the sidewalk
  // keep-out discs, centre-relative: monument, four fountains, four gardens
  keep: [
    [0, 0, 20],
    [30, 30, 6], [30, -30, 6], [-30, 30, 6], [-30, -30, 6],
    [54, 54, 12], [54, -54, 12], [-54, 54, 12], [-54, -54, 12],
  ],
  valid(x, z) {
    const dx = x - this.cx, dz = z - this.cz;
    if (Math.abs(dx) > this.half || Math.abs(dz) > this.half) return false;
    for (const k of this.keep) if ((dx - k[0]) ** 2 + (dz - k[1]) ** 2 < k[2] * k[2]) return false;
    return true;
  },
  // nearest valid courtyard point — where a launched wanderer walks back to
  nearest(x, z) {
    let px = Math.max(this.cx - this.half, Math.min(this.cx + this.half, x));
    let pz = Math.max(this.cz - this.half, Math.min(this.cz + this.half, z));
    for (const k of this.keep) {
      const kx = this.cx + k[0], kz = this.cz + k[1];
      const dx = px - kx, dz = pz - kz, d = Math.hypot(dx, dz);
      if (d < k[2]) { const s = (k[2] + 0.5) / (d || 1); px = kx + dx * s; pz = kz + dz * s; }
    }
    return this.valid(px, pz) ? { x: px, z: pz } : { x: this.cx, z: this.cz + 40 };
  },
  spawn() {
    let x, z, t = 0;
    do { x = this.cx + (Math.random() - 0.5) * 2 * this.half; z = this.cz + (Math.random() - 0.5) * 2 * this.half; }
    while (!this.valid(x, z) && ++t < 60);
    return { x, z };
  },
};
const COURT_PEDS = 26; // >= 20, filling the big city-centre courtyard

// Old-town blocks: wanderers thread the cobblestone lanes / market square,
// confined to the block interior and steering around the buildings and props.
const OLDTOWN_CELLS = [[5, 9], [6, 9], [7, 9]];
const OLDTOWN_PEDS = 11;

// Traditional dress for the mosque courtyard crowd.
const THOBE = [0xf2f4f5, 0xeae3d2, 0xe6e6e6, 0xf0ead6];        // men's white/cream robes
const ABAYA = [0x2a2a35, 0x33302b, 0x24303a, 0x3a2f34];        // women's dark robes
const HIJAB = [0x2a2a35, 0x7a3b52, 0x2f5d6b, 0x4a3b2a, 0x55506a]; // head-covering colours
const KEFFIYEH = [0xf2f4f5, 0xf2f4f5, 0xd8d8d8, 0xcf3a3a];     // white/red headscarves

// Mirrors buildMosque (cell 9,12): a marble plinth (top 0.40) with the prayer
// hall filling the rear (+z) and arcades round a courtyard in front (−z) with a
// central ablution fountain. Robed wanderers roam the open courtyard.
const _mq = cellRect(9, 12, 10, 13);
const _mqx0 = _mq.x0 + INSET, _mqx1 = _mq.x1 - INSET, _mqz0 = _mq.z0 + INSET, _mqz1 = _mq.z1 - INSET;
const _mcx = (_mqx0 + _mqx1) / 2, _mcz = (_mqz0 + _mqz1) / 2;
const _PHX = (_mqx1 - _mqx0) / 2 - 6, _PHZ = (_mqz1 - _mqz0) / 2 - 6;
const _courtN = _mcz - _PHZ + 3, _hallFront = _mcz + _PHZ - 33, _fountZ = (_courtN + _hallFront) / 2;
const MOSQUE = {
  cx: _mcx, cz: _fountZ,
  x0: _mcx - _PHX + 8, x1: _mcx + _PHX - 8, z0: _courtN + 5, z1: _hallFront - 6,
  y: WALK_Y + 0.25, keepR: 6, keepZ: _fountZ,
  valid(x, z) {
    if (x < this.x0 || x > this.x1 || z < this.z0 || z > this.z1) return false;
    return (x - this.cx) ** 2 + (z - this.keepZ) ** 2 >= this.keepR ** 2;
  },
  nearest(x, z) {
    let px = Math.max(this.x0, Math.min(this.x1, x)), pz = Math.max(this.z0, Math.min(this.z1, z));
    const dx = px - this.cx, dz = pz - this.keepZ, d = Math.hypot(dx, dz);
    if (d < this.keepR) { const s = (this.keepR + 0.5) / (d || 1); px = this.cx + dx * s; pz = this.keepZ + dz * s; }
    return this.valid(px, pz) ? { x: px, z: pz } : { x: this.cx, z: this.z1 - 2 };
  },
  spawn() {
    let x, z, t = 0;
    do { x = this.x0 + Math.random() * (this.x1 - this.x0); z = this.z0 + Math.random() * (this.z1 - this.z0); }
    while (!this.valid(x, z) && ++t < 60);
    return { x, z };
  },
};
const MOSQUE_PEDS = 14;
// A few midrise blocks also get an interior crowd (they wander the courtyards,
// plazas and parking lots, steering around the slabs / cars).
const MIDRISE_CELLS = [[5, 4], [9, 4], [4, 7], [11, 8]];
const MIDRISE_PEDS = 6;
const _qc = [];
function makeBlockZone(ix, iz, colliders) {
  const rc = cellRect(ix, iz, ix + 1, iz + 1);
  const x0 = rc.x0 + INSET, x1 = rc.x1 - INSET, z0 = rc.z0 + INSET, z1 = rc.z1 - INSET;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, M = 0.6; // clearance from walls/props
  return {
    cx, cz, x0, x1, z0, z1, y: WALK_Y + 0.2,
    valid(x, z) {
      if (x < x0 || x > x1 || z < z0 || z > z1) return false;
      colliders.query(x - M, z - M, x + M, z + M, _qc);
      for (const i of _qc) {
        const b = colliders.boxes[i];
        if (b.maxY > 0.5 && x > b.minX - M && x < b.maxX + M && z > b.minZ - M && z < b.maxZ + M) return false;
      }
      return true;
    },
    nearest(x, z) {
      const px = Math.max(x0, Math.min(x1, x)), pz = Math.max(z0, Math.min(z1, z));
      if (this.valid(px, pz)) return { x: px, z: pz };
      for (let rr = 2; rr < 44; rr += 2)
        for (let a = 0; a < 8; a++) {
          const ax = cx + Math.cos(a / 8 * Math.PI * 2) * rr, az = cz + Math.sin(a / 8 * Math.PI * 2) * rr;
          if (this.valid(ax, az)) return { x: ax, z: az };
        }
      return { x: cx, z: cz };
    },
    spawn() {
      let x, z, t = 0;
      do { x = x0 + Math.random() * (x1 - x0); z = z0 + Math.random() * (z1 - z0); }
      while (!this.valid(x, z) && ++t < 100);
      return { x, z };
    },
  };
}

function sidewalkLoop(cells) {
  const r = cellRect(...cells);
  const o = 2.3; // walk the sidewalk band, clear of the corner lamps
  return [
    [r.x0 + o, r.z0 + o],
    [r.x1 - o, r.z0 + o],
    [r.x1 - o, r.z1 - o],
    [r.x0 + o, r.z1 - o],
  ];
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

// closest point on the loop to (x, z), returned as arc-length parameter
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

export class Pedestrians {
  constructor(scene, colliders = null) {
    this.peds = [];
    let seed = 500;
    for (const cells of LOOP_CELLS) {
      if (!loopOnLand(cells)) continue;
      const basePts = sidewalkLoop(cells);
      const L = loopLength(basePts);
      for (let i = 0; i < PEDS_PER_LOOP; i++) {
        seed++;
        const rev = hash(seed, 1) % 2 === 0;
        const pts = rev ? [...basePts].reverse() : basePts;
        const h = makeHumanoid({
          shirt: pick(SHIRTS, seed, 2),
          pants: pick(PANTS, seed, 3),
          skin: pick(SKINS, seed, 4),
          hair: pick([0x5d4037, 0x212121, 0x8d6e63, 0xbdb76b], seed, 5),
        });
        const scale = 0.9 + (hash(seed, 6) % 20) / 100;
        h.group.scale.setScalar(scale);
        scene.add(h.group);
        this.peds.push({
          h, pts, L,
          dist: (L * i) / PEDS_PER_LOOP + (hash(seed, 7) % 30),
          speed: 1.2 + (hash(seed, 8) % 8) / 10,
          phase: hash(seed, 9) % 6,
          state: 'walk', vx: 0, vy: 0, vz: 0, spin: 0, timer: 0, target: null,
          off: 0, // sideways offset used to walk around cars on the path
        });
      }
    }

    // free-roaming crowds confined to a zone: the plaza courtyard, and the
    // interiors of the old-town blocks (the latter need colliders to steer
    // around the buildings and market props)
    for (let i = 0; i < COURT_PEDS; i++) this.spawnWanderer(scene, COURT, ++seed);
    for (let i = 0; i < MOSQUE_PEDS; i++) this.spawnWanderer(scene, MOSQUE, ++seed, true);
    if (colliders) {
      for (const [ix, iz] of OLDTOWN_CELLS) {
        const zone = makeBlockZone(ix, iz, colliders);
        for (let i = 0; i < OLDTOWN_PEDS; i++) this.spawnWanderer(scene, zone, ++seed);
      }
      for (const [ix, iz] of MIDRISE_CELLS) {
        const zone = makeBlockZone(ix, iz, colliders);
        for (let i = 0; i < MIDRISE_PEDS; i++) this.spawnWanderer(scene, zone, ++seed);
      }
    }
  }

  spawnWanderer(scene, zone, seed, traditional = false) {
    let opts;
    if (traditional && hash(seed, 10) % 2 === 0) {        // woman: abaya + hijab
      opts = { skin: pick(SKINS, seed, 4), pants: 0x24303a, robe: pick(ABAYA, seed, 2), headwear: 'hijab', headColor: pick(HIJAB, seed, 3) };
    } else if (traditional) {                             // man: thobe + cap/keffiyeh
      opts = { skin: pick(SKINS, seed, 4), pants: pick(THOBE, seed, 6), robe: pick(THOBE, seed, 2), headwear: hash(seed, 11) % 2 ? 'keffiyeh' : 'cap', headColor: pick(KEFFIYEH, seed, 3) };
    } else {
      opts = { shirt: pick(SHIRTS, seed, 2), pants: pick(PANTS, seed, 3), skin: pick(SKINS, seed, 4), hair: pick([0x5d4037, 0x212121, 0x8d6e63, 0xbdb76b], seed, 5) };
    }
    const h = makeHumanoid(opts);
    h.group.scale.setScalar(0.9 + (hash(seed, 6) % 20) / 100);
    scene.add(h.group);
    const p0 = zone.spawn();
    h.group.position.set(p0.x, zone.y, p0.z);
    this.peds.push({
      h, mode: 'wander', state: 'wander', zone,
      hd: Math.random() * Math.PI * 2,
      speed: 1.0 + (hash(seed, 8) % 10) / 10,
      phase: hash(seed, 9) % 6,
    });
  }

  update(dt, traffic = null, player = null) {
    for (const p of this.peds) {
      // courtyard wanderers: free roam, but hit by a car they fly, fall, get
      // up and walk back into the courtyard — same reaction as loop peds.
      if (p.mode === 'wander') {
        const wg = p.h.group;
        if (p.state === 'fly') { this.updateFly(p, dt, traffic); continue; }
        if (p.state === 'down') {
          p.timer -= dt;
          if (p.timer <= 0) { wg.rotation.x = 0; p.target = p.zone.nearest(wg.position.x, wg.position.z); p.state = 'return'; }
          continue;
        }
        if (p.state === 'return') {
          const t = p.target;
          const dx = t.x - wg.position.x, dz = t.z - wg.position.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.6) { p.state = 'wander'; p.hd = Math.atan2(dx, dz); }
          else {
            const sp = p.speed * 1.2;
            wg.position.x += (dx / d) * sp * dt;
            wg.position.z += (dz / d) * sp * dt;
            wg.position.y = groundHeight(wg.position.x, wg.position.z) + WALK_Y;
            wg.rotation.y = Math.atan2(dx, dz);
            p.phase += sp * dt * 2.4;
            animateWalk(p.h, p.phase, 0.75);
          }
          continue;
        }
        this.updateWander(p, dt);
        if (traffic) this.checkHit(p, traffic, player);
        continue;
      }
      const g = p.h.group;

      if (p.state === 'fly') {
        this.updateFly(p, dt, traffic);
        continue;
      }
      if (p.state === 'down') {
        p.timer -= dt;
        if (p.timer <= 0) {
          g.rotation.x = 0;
          p.target = closestOnLoop(p.pts, g.position.x, g.position.z);
          p.state = 'return';
        }
        continue;
      }
      if (p.state === 'return') {
        const t = p.target;
        const dx = t.x - g.position.x, dz = t.z - g.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.4) {
          p.state = 'walk';
          p.dist = t.dist;
        } else {
          const sp = p.speed * 1.2;
          g.position.x += (dx / d) * sp * dt;
          g.position.z += (dz / d) * sp * dt;
          g.position.y = groundHeight(g.position.x, g.position.z) + WALK_Y;
          g.rotation.y = Math.atan2(dx, dz);
          p.phase += sp * dt * 2.4;
          animateWalk(p.h, p.phase, 0.75);
        }
      } else {
        // walk the loop, sidestepping around any car parked across the path
        p.dist = (p.dist + p.speed * dt) % p.L;
        const pt = pointAt(p.pts, p.dist);
        const rx = Math.cos(pt.heading), rz = -Math.sin(pt.heading); // right perp
        if (traffic) this.avoidCars(p, pt, rx, rz, dt, traffic);
        g.position.set(pt.x + rx * p.off, WALK_Y, pt.z + rz * p.off);
        g.rotation.y = pt.heading;
        p.phase += p.speed * dt * 2.4;
        animateWalk(p.h, p.phase, 0.75);
      }

      if (traffic) this.checkHit(p, traffic, player);
    }
  }

  // Free random walk confined to the ped's zone: gentle heading drift plus
  // steering (and a hard clamp) around the zone edge and its obstacles (plaza
  // keep-outs, or old-town buildings/props), so wanderers never leave or clip.
  updateWander(p, dt) {
    const g = p.h.group, zone = p.zone, look = 3.6;
    const clear = (hd) => zone.valid(g.position.x + Math.sin(hd) * look, g.position.z + Math.cos(hd) * look);
    p.hd += (Math.random() - 0.5) * 2.0 * dt; // wander
    if (!clear(p.hd)) {                        // blocked ahead: turn to a clear side
      let best = Math.PI;
      for (const dd of [0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.3, -2.3]) {
        if (clear(p.hd + dd)) { best = dd * 0.7; break; }
      }
      p.hd += best;
    }
    const nx = g.position.x + Math.sin(p.hd) * p.speed * dt;
    const nz = g.position.z + Math.cos(p.hd) * p.speed * dt;
    if (zone.valid(nx, nz)) { g.position.x = nx; g.position.z = nz; }
    else p.hd += 1.6 + Math.random(); // hard block: veer away, hold position
    g.position.y = zone.y;
    g.rotation.y = p.hd;
    p.phase += p.speed * dt * 2.4;
    animateWalk(p.h, p.phase, 0.75);
  }

  // Steer sideways around car boxes blocking the loop ahead, keeping the
  // offset as small as possible so the ped hugs its natural route.
  avoidCars(p, pt, rx, rz, dt, traffic) {
    const fx = Math.sin(pt.heading), fz = Math.cos(pt.heading);
    let desired = 0;
    for (const b of traffic.boxes) {
      if (
        pt.x < b.minX - 7 || pt.x > b.maxX + 7 ||
        pt.z < b.minZ - 7 || pt.z > b.maxZ + 7
      ) continue;
      // project the box corners onto the walk direction / its perpendicular
      let lonMin = Infinity, lonMax = -Infinity, latMin = Infinity, latMax = -Infinity;
      for (const [cx, cz] of [
        [b.minX, b.minZ], [b.maxX, b.minZ], [b.minX, b.maxZ], [b.maxX, b.maxZ],
      ]) {
        const lon = (cx - pt.x) * fx + (cz - pt.z) * fz;
        const lat = (cx - pt.x) * rx + (cz - pt.z) * rz;
        if (lon < lonMin) lonMin = lon;
        if (lon > lonMax) lonMax = lon;
        if (lat < latMin) latMin = lat;
        if (lat > latMax) latMax = lat;
      }
      if (lonMax < -0.4 || lonMin > 3.4) continue; // not in the walk window
      if (p.off + 0.45 < latMin - 0.35 || p.off - 0.45 > latMax + 0.35) continue; // clear
      const left = latMin - 0.95, right = latMax + 0.95;
      const cand = Math.abs(left) < Math.abs(right) ? left : right;
      if (Math.abs(cand) > Math.abs(desired)) desired = cand;
    }
    const rate = 3.2 * dt;
    p.off += Math.max(-rate, Math.min(rate, desired - p.off));
  }

  // launched if a moving car's box touches the pedestrian
  checkHit(p, traffic, player) {
    const g = p.h.group;
    const px = g.position.x, pz = g.position.z;
    for (const c of traffic.cars) {
      const b = c.box;
      if (
        px < b.minX - 0.35 || px > b.maxX + 0.35 ||
        pz < b.minZ - 0.35 || pz > b.maxZ + 0.35
      ) continue;
      let vx = 0, vz = 0;
      if (c.mode === 'driven' && player) {
        vx = Math.sin(player.driveHeading) * player.driveSpeed;
        vz = Math.cos(player.driveHeading) * player.driveSpeed;
      } else if (c.mode === 'loop' || c.mode === 'return') {
        vx = Math.sin(c.mesh.rotation.y) * c.v;
        vz = Math.cos(c.mesh.rotation.y) * c.v;
      } else {
        vx = c.pushVel.x;
        vz = c.pushVel.z;
      }
      const s = Math.hypot(vx, vz);
      if (s < 1) continue;
      // launch: flies in the car's direction, distance scales with speed
      const nx = vx / s, nz = vz / s;
      p.state = 'fly';
      p.vx = nx * (s + 2);
      p.vz = nz * (s + 2);
      p.vy = 3.5 + s * 0.28;
      p.spin = 5 + s * 0.25;
      g.rotation.y = Math.atan2(-nx, -nz); // face the car that hit them
      animateWalk(p.h, 0, 0);
      // the impact costs the driver a little speed
      if (c.mode === 'driven' && player) player.driveSpeed *= 0.96;
      return;
    }
  }

  updateFly(p, dt, traffic) {
    const g = p.h.group;
    p.vy -= 24 * dt;
    g.position.x += p.vx * dt;
    g.position.z += p.vz * dt;
    g.position.y += p.vy * dt;
    g.rotation.x -= p.spin * dt;

    // slam into walls: stop horizontal motion, drop straight down
    if (traffic && traffic.colliders) {
      const cand = this._cand || (this._cand = []);
      const y0 = g.position.y + 0.3, y1 = g.position.y + 1.2;
      traffic.colliders.query(
        g.position.x - 0.6, g.position.z - 0.6,
        g.position.x + 0.6, g.position.z + 0.6, cand
      );
      for (const i of cand) {
        const b = traffic.colliders.boxes[i];
        if (b.maxY <= y0 || b.minY >= y1) continue;
        const qx = Math.max(b.minX, Math.min(g.position.x, b.maxX));
        const qz = Math.max(b.minZ, Math.min(g.position.z, b.maxZ));
        const dx = g.position.x - qx, dz = g.position.z - qz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= 0.35 * 0.35) continue;
        const d = Math.sqrt(d2);
        if (d > 1e-4) {
          g.position.x = qx + (dx / d) * 0.36;
          g.position.z = qz + (dz / d) * 0.36;
        }
        p.vx = 0;
        p.vz = 0;
      }
    }

    const gy = groundHeight(g.position.x, g.position.z);
    if (p.vy < 0 && g.position.y <= gy + WALK_Y) {
      if (gy < -6.5) {
        // splashed into the water: quietly reappear on the loop (or, for a
        // courtyard wanderer with no loop, back in the courtyard)
        g.rotation.x = 0;
        if (p.pts) {
          const t = closestOnLoop(p.pts, g.position.x, g.position.z);
          p.dist = t.dist;
          p.state = 'walk';
          g.position.set(t.x, WALK_Y, t.z);
        } else {
          const t = p.zone.nearest(g.position.x, g.position.z);
          p.state = 'wander';
          p.hd = Math.random() * Math.PI * 2;
          g.position.set(t.x, p.zone.y, t.z);
        }
      } else {
        // land flat on the ground, stay down for a bit
        g.position.y = gy + 0.3;
        g.rotation.x = -Math.PI / 2;
        p.state = 'down';
        p.timer = 2.8;
      }
    }
  }
}
