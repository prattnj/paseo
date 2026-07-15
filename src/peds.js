// Deterministic pedestrians walking fixed sidewalk loops around blocks.
// Cars hit them: they get launched (distance scales with car speed), lie
// flat for a moment, get up, walk back to their loop and carry on.
import * as THREE from 'three';
import { makeHumanoid, animateWalk } from './character.js';
import { cellRect } from './layout.js';
import { groundHeight } from './island.js';
import { hash, pick } from './util.js';

const SHIRTS = [0x4a90d9, 0xe04f43, 0xf4c542, 0x3aa7a3, 0xe07f9a, 0x8bc34a, 0xf2f4f5, 0xf39a3a];
const PANTS = [0x37474f, 0x5d4037, 0x455a64, 0x263238, 0x6d4c41];
const SKINS = [0xf0c8a0, 0xc68863, 0x8d5524, 0xffdbac];

// Blocks that get pedestrian loops (grid cell coords from layout.js).
const LOOP_CELLS = [
  [5, 4, 6, 5],  // plaza
  [2, 3, 4, 5],  // central park perimeter
  [6, 4, 7, 5],  // city hall
  [4, 5, 5, 6],  // fire station block
  [5, 5, 6, 6],  // downtown SE of center
  [4, 3, 5, 4],  // downtown NW
  [1, 4, 2, 5],  // old town
  [1, 5, 2, 6],  // church
  [4, 2, 5, 3],  // apartments north
  [6, 5, 7, 6],  // downtown east
  [7, 2, 8, 3],  // NE pocket park
  // outskirts — suburbs, industrial, apartments, old town
  [1, 6, 2, 7],  // suburbs W (pocket park)
  [5, 7, 6, 8],  // south blocks
  [6, 8, 7, 9],  // far south
  [7, 7, 8, 8],  // SE corner
  [6, 6, 7, 7],  // SE midrise
  [6, 7, 7, 8],  // SE blocks
  [7, 6, 8, 7],  // industrial edge
  [3, 1, 4, 2],  // apartments NW
  [5, 1, 6, 2],  // apartments N
  [7, 4, 8, 5],  // east midrise
  [1, 3, 2, 4],  // old town W
];
const PEDS_PER_LOOP = 9;
const WALK_Y = 0.15; // sidewalk top

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
  constructor(scene) {
    this.peds = [];
    let seed = 500;
    for (const cells of LOOP_CELLS) {
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
  }

  update(dt, traffic = null, player = null) {
    for (const p of this.peds) {
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
        // splashed into the water: quietly reappear back on their loop
        const t = closestOnLoop(p.pts, g.position.x, g.position.z);
        p.dist = t.dist;
        p.state = 'walk';
        g.rotation.x = 0;
        g.position.set(t.x, WALK_Y, t.z);
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
