// Large pushable soccer balls. Kinematic, not part of the static collider
// world: the player (on foot) and any car shove them around by contact, they
// roll with friction, and they bounce off tall world colliders (goal posts,
// lamps, trees, benches) while passing under overhead ones (the crossbar).
import * as THREE from 'three';
import { key } from '../core/keycap.js';

// Spawn registry filled by the city builder (buildPark pushes {x, z}); read by
// main.js after the world is built.
export const BALL_SPAWNS = [];

// Ball-target zones for achievements: axis-aligned {x0,x1,z0,z1} rectangles a
// ball can be shoved into. Filled by the world builders (goals by buildPark, the
// football field by buildArena) and read by the achievement engine, which scans
// every live ball against them each frame. Each entry is tagged:
//   { type:'goal', field:'i,j', ... }  — a soccer goal mouth, grouped by pitch
//   { type:'field', tag:'football', ... } — the arena gridiron
export const BALL_ZONES = [];

const BALL_R = 0.5;                 // ~1 m diameter
const FIELD_TOP = 0.20;            // raised park-block surface height
const MAX_SPEED = 128;              // clamp so a boosted car can't launch it absurdly
const FRICTION = 1.9;              // rolling decay rate (1/s)

// "Summon ball": standing inside a pitch's centre circle (radius 4.5 m, see
// park.js soccerField) offers an E action that teleports that pitch's ball back
// to just in front of the player — far enough out that the player capsule
// (0.55) and the ball never overlap, so it doesn't get shoved on arrival.
const SUMMON_R = 4.5;              // centre-circle radius = trigger zone
const SUMMON_MIN_D = 4;            // ball already this close → no prompt
const SUMMON_AHEAD = 2.2;          // drop distance in front of the player

// The 12 normalised icosahedron-vertex directions — the centres of a soccer
// ball's black pentagons.
const PHI = (1 + Math.sqrt(5)) / 2;
const PENTA_DIRS = [
  [0, 1, PHI], [0, 1, -PHI], [0, -1, PHI], [0, -1, -PHI],
  [1, PHI, 0], [1, -PHI, 0], [-1, PHI, 0], [-1, -PHI, 0],
  [PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, 1], [-PHI, 0, -1],
].map((v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; });
const PENTA_COS = 0.96; // patch half-angle (~16°) -> pentagon-sized black caps

function makeBallMesh(r) {
  // Truncated-icosahedron look: a subdivided sphere whose faces are painted
  // black where they point at an icosahedron vertex (a pentagon) and white
  // everywhere else (the hexagons) — a proper soccer ball, still flat-shaded.
  const geo = new THREE.IcosahedronGeometry(r, 3).toNonIndexed();
  const pos = geo.attributes.position;
  const nFace = pos.count / 3;
  const colors = new Float32Array(pos.count * 3);
  for (let f = 0; f < nFace; f++) {
    const o = f * 9;
    // face centroid direction
    let cx = 0, cy = 0, cz = 0;
    for (let v = 0; v < 3; v++) { cx += pos.array[o + v * 3]; cy += pos.array[o + v * 3 + 1]; cz += pos.array[o + v * 3 + 2]; }
    const l = Math.hypot(cx, cy, cz) || 1;
    cx /= l; cy /= l; cz /= l;
    let best = -1;
    for (const [dx, dy, dz] of PENTA_DIRS) best = Math.max(best, cx * dx + cy * dy + cz * dz);
    const c = best > PENTA_COS ? 0.05 : 0.95;
    for (let v = 0; v < 3; v++) { const q = o + v * 3; colors[q] = colors[q + 1] = colors[q + 2] = c; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export class Balls {
  constructor(scene, colliders) {
    this.colliders = colliders;
    this.balls = [];
    this._last = new WeakMap(); // car -> last {x,z} for velocity estimation
    this._cand = [];
    this._axis = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this.scene = scene;
    this._summon = null;  // ball the player can currently summon (or null)
    this._ePrev = false;  // KeyE edge detection
  }

  // HUD hint for the summon action ('' when not offered) — read by main.js.
  summonHint() { return this._summon ? `${key('E')} summon ball` : ''; }

  // Offer + perform the summon. Only on foot, with no car/buy prompt competing
  // for E, inside a pitch's centre circle while its ball has wandered off.
  _updateSummon(player) {
    const eDown = player.keys.has('KeyE');
    const eEdge = eDown && !this._ePrev;
    this._ePrev = eDown;
    this._summon = null;
    if (player.car || player.pending || player.carHint()) return;
    const px = player.pos.x, pz = player.pos.z;
    for (const ball of this.balls) {
      if (Math.hypot(px - ball.homeX, pz - ball.homeZ) > SUMMON_R) continue;
      if (Math.hypot(ball.x - px, ball.z - pz) < SUMMON_MIN_D) return;
      this._summon = ball;
      break;
    }
    if (!this._summon || !eEdge) return;
    const ball = this._summon, h = player.heading;
    ball.x = px + Math.sin(h) * SUMMON_AHEAD;
    ball.z = pz + Math.cos(h) * SUMMON_AHEAD;
    ball.vx = 0; ball.vz = 0;
    ball.mesh.position.set(ball.x, ball.y, ball.z);
    this._summon = null;
  }

  add(x, z, r = BALL_R) {
    const mesh = makeBallMesh(r);
    const y = FIELD_TOP + r;
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.balls.push({ mesh, x, z, y, r, vx: 0, vz: 0, homeX: x, homeZ: z });
  }

  // Shove `ball` away from a pusher at (px,pz) moving at (pvx,pvz); `pr` is the
  // pusher's contact radius. The ball leaves at (at least) the pusher's closing
  // speed plus a small base nudge, so contact always rolls it.
  _push(ball, px, pz, pvx, pvz, pr) {
    let dx = ball.x - px, dz = ball.z - pz;
    let d = Math.hypot(dx, dz);
    const rad = ball.r + pr;
    if (d >= rad) return;
    if (d < 1e-4) { dx = 1; dz = 0; d = 1e-4; }
    const nx = dx / d, nz = dz / d;
    ball.x += nx * (rad - d);
    ball.z += nz * (rad - d);
    const closing = pvx * nx + pvz * nz;      // pusher speed toward the ball
    const target = Math.max(closing, 0) + 1.6;
    const cur = ball.vx * nx + ball.vz * nz;
    if (target > cur) { ball.vx += nx * (target - cur); ball.vz += nz * (target - cur); }
  }

  // Bounce the ball out of any tall collider it overlaps (posts, lamps, trees).
  _worldCollide(ball) {
    const c = this.colliders;
    if (!c) return;
    c.query(ball.x - ball.r - 0.2, ball.z - ball.r - 0.2, ball.x + ball.r + 0.2, ball.z + ball.r + 0.2, this._cand);
    for (const i of this._cand) {
      const b = c.boxes[i];
      if (b.maxY < 0.25) continue;              // flat ground slab
      if (b.minY > ball.y + ball.r) continue;   // overhead (crossbar) — pass under
      const qx = Math.max(b.minX, Math.min(ball.x, b.maxX));
      const qz = Math.max(b.minZ, Math.min(ball.z, b.maxZ));
      let dx = ball.x - qx, dz = ball.z - qz;
      let d = Math.hypot(dx, dz);
      if (d >= ball.r) continue;
      if (d < 1e-4) { // centre inside the box — eject along the nearest face
        const toL = ball.x - b.minX, toR = b.maxX - ball.x;
        const toD = ball.z - b.minZ, toU = b.maxZ - ball.z;
        const m = Math.min(toL, toR, toD, toU);
        dx = m === toL ? -1 : m === toR ? 1 : 0;
        dz = m === toD ? -1 : m === toU ? 1 : 0;
        d = 1e-4;
      }
      const nx = dx / d, nz = dz / d;
      ball.x += nx * (ball.r - d);
      ball.z += nz * (ball.r - d);
      const vn = ball.vx * nx + ball.vz * nz;
      if (vn < 0) { ball.vx -= 1.6 * vn * nx; ball.vz -= 1.6 * vn * nz; } // reflect + restitution
    }
  }

  update(dt, player, traffic) {
    if (player) this._updateSummon(player);
    for (const ball of this.balls) {
      // integrate + rolling friction
      ball.x += ball.vx * dt;
      ball.z += ball.vz * dt;
      const fr = Math.exp(-FRICTION * dt);
      ball.vx *= fr; ball.vz *= fr;
      if (Math.hypot(ball.vx, ball.vz) < 0.04) { ball.vx = 0; ball.vz = 0; }

      // player on foot
      if (player && !player.car) this._push(ball, player.pos.x, player.pos.z, player.vel.x, player.vel.z, 0.55);

      // cars (velocity from frame-to-frame motion, so it works for every type)
      if (traffic) {
        for (const car of traffic.cars) {
          const p = car.mesh.position;
          const last = this._last.get(car);
          let cvx = 0, cvz = 0;
          if (last) { cvx = (p.x - last.x) / Math.max(dt, 1e-3); cvz = (p.z - last.z) / Math.max(dt, 1e-3); }
          const pr = (car.spec ? car.spec.halfLen : 2) * 0.55 + 0.7;
          this._push(ball, p.x, p.z, cvx, cvz, pr);
        }
      }

      this._worldCollide(ball);

      // clamp speed
      const sp = Math.hypot(ball.vx, ball.vz);
      if (sp > MAX_SPEED) { ball.vx *= MAX_SPEED / sp; ball.vz *= MAX_SPEED / sp; }

      // place + roll (spin axis perpendicular to travel, angle = dist/r)
      ball.mesh.position.set(ball.x, ball.y, ball.z);
      if (sp > 1e-3) {
        this._axis.set(ball.vz, 0, -ball.vx).normalize();
        this._q.setFromAxisAngle(this._axis, (sp * dt) / ball.r);
        ball.mesh.quaternion.premultiply(this._q);
      }
    }

    // cache car positions for next frame's velocity estimate
    if (traffic) {
      for (const car of traffic.cars) {
        let l = this._last.get(car);
        if (!l) { l = { x: 0, z: 0 }; this._last.set(car, l); }
        l.x = car.mesh.position.x; l.z = car.mesh.position.z;
      }
    }
  }
}
