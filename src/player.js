// Player: WASD + SHIFT sprint + SPACE jump, mouse look, close third-person
// camera just behind/above the head. Press E near any car to drive it:
// arcade handling (A/D steer, W/S accelerate & brake/reverse, momentum),
// solid collisions against the world and other cars.
import * as THREE from 'three';
import { makeHumanoid, animateWalk } from './character.js';
import { movePlayer } from './collision.js';
import { collideCarWorld, CAR_R, pitchLift } from './traffic.js';
import { groundHeight, nearestBeach, WATER_Y } from './island.js';

const WALK = 5.5;
const SPRINT = 11.5;
const JUMP = 8.5;
const GRAVITY = 24;
const CAM_DIST = 2.6;
const CAM_UP = 0.4;
const EYE = 1.62;
const DRIVE_CAM_DIST = 7.5;
const DRIVE_EYE = 2.1;
const ENTER_RANGE = 4;

export class Player {
  constructor(scene, camera, colliders, traffic = null) {
    this.camera = camera;
    this.colliders = colliders;
    this.traffic = traffic;
    this.char = makeHumanoid({ shirt: 0xe04f43, pants: 0x37474f });
    scene.add(this.char.group);

    this.pos = new THREE.Vector3(-205, 0.2, -140); // Central Park spawn (east lawn, below the hill)
    this.vel = new THREE.Vector3();
    this.yaw = -Math.PI / 2;      // face east, toward downtown
    this.pitch = 0.12;            // slight down-look
    this.heading = -Math.PI / 2;  // character facing
    this.grounded = true;
    this.phase = 0;
    this.keys = new Set();

    this.car = null;         // car currently being driven
    this.nearCar = null;     // nearest enterable car while walking (for UI hint)
    this.driveSpeed = 0;
    this.driveHeading = 0;
    this._eToggle = false;
    this._moveCtx = null;            // last movePlayer result (support tracking)
    this._groundAnchor = this.pos.y; // last grounded height (anti-cliff-hop)
    this._drownT = 0;                // fade-out countdown after going under
    this._fadeEl = null;
    this._headY = this.pos.y;        // vertically smoothed camera follow
    this._camLen = CAM_DIST;         // smoothed camera boom length
    this._dyOff = 0;                 // drive-cam corner-slide yaw offset

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') e.preventDefault();
      if (e.code === 'KeyE' && !e.repeat) this._eToggle = true;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  onMouseMove(dx, dy) {
    // Chrome's pointer lock occasionally reports one absurd movement delta
    // (after a frame hitch / focus change) — swallow those so the camera
    // never leaps to a different angle on its own
    if (Math.abs(dx) > 250 || Math.abs(dy) > 250) return;
    this.yaw -= dx * 0.0024;
    this.pitch += dy * 0.0022;
    this.pitch = Math.max(-0.9, Math.min(1.2, this.pitch));
  }

  update(dt) {
    if (this._eToggle) {
      this._eToggle = false;
      if (this.car) this.exitCar();
      else this.tryEnterCar();
    }
    if (this.car) this.updateDrive(dt);
    else this.updateWalk(dt);

    // boost FOV kick: slight zoom-out while boosting, eased both ways
    const wantFov = 72 + (this._boostFx ? 9 : 0);
    if (Math.abs(this.camera.fov - wantFov) > 0.02) {
      this.camera.fov += (wantFov - this.camera.fov) * Math.min(1, 5 * dt);
      this.camera.updateProjectionMatrix();
    }

    // in too deep (head under water): quick fade to black, respawn on the
    // nearest dry beach, fade back in
    if (this._drownT > 0) {
      this._drownT -= dt;
      if (this._drownT <= 0) {
        this.respawn();
        const f = this._fade();
        if (f) f.style.opacity = '0';
      }
    } else if (this.pos.y < WATER_Y - 1.35) {
      this._drownT = 0.5;
      const f = this._fade();
      if (f) f.style.opacity = '1';
    }
  }

  _fade() {
    return this._fadeEl || (this._fadeEl = document.getElementById('fade'));
  }

  respawn() {
    if (this.car) {
      // the car sinks to the sea floor where it went in
      const c = this.car;
      c.mode = 'parked';
      c.speed = 0;
      c.everDriven = true;
      c.air = null;
      c.pitch = 0;
      c.mesh.rotation.x = 0;
      c.y = groundHeight(c.mesh.position.x, c.mesh.position.z) + 0.06;
      c.mesh.position.y = c.y;
      this.traffic.updateBox(c);
      this.car = null;
      this._boostFx = false;
      this._boostLock = false;
      if (c.flameFx) c.flameFx.visible = false;
      this.char.group.visible = true;
    }
    const b = nearestBeach(this.pos.x, this.pos.z);
    this.pos.set(b.x, b.y + 0.1, b.z);
    this.vel.set(0, 0, 0);
    this.driveSpeed = 0;
    this._moveCtx = null;
    this._groundAnchor = this.pos.y;
    this.char.group.position.copy(this.pos);
  }

  // ---- walking ------------------------------------------------------------
  updateWalk(dt) {
    const k = this.keys;
    let ix = 0, iz = 0;
    if (k.has('KeyW')) iz += 1;
    if (k.has('KeyS')) iz -= 1;
    if (k.has('KeyA')) ix -= 1;
    if (k.has('KeyD')) ix += 1;

    const sprinting = k.has('ShiftLeft') || k.has('ShiftRight');
    const speed = sprinting ? SPRINT : WALK;

    // camera-relative movement
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let mx = 0, mz = 0;
    if (ix || iz) {
      const fx = -sin, fz = -cos;   // forward on ground plane
      const rx = cos, rz = -sin;    // strafe right (forward x up)
      mx = fx * iz + rx * ix;
      mz = fz * iz + rz * ix;
      const len = Math.hypot(mx, mz);
      mx /= len; mz /= len;
    }

    // smooth horizontal velocity
    const accel = this.grounded ? 40 : 12;
    this.vel.x += (mx * speed - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (mz * speed - this.vel.z) * Math.min(1, accel * dt);

    if (k.has('Space') && this.grounded) {
      this.vel.y = JUMP;
      this.grounded = false;
    }
    this.vel.y -= GRAVITY * dt;

    const res = movePlayer(
      this.colliders, this.pos, this.vel, dt,
      this.traffic ? this.traffic.boxes : null, groundHeight,
      { support: this._moveCtx, anchor: this._groundAnchor }
    );
    this.grounded = res.grounded;
    this._moveCtx = res.support;
    if (res.grounded) this._groundAnchor = this.pos.y;

    // face movement direction
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (hSpeed > 0.5) {
      const target = Math.atan2(this.vel.x, this.vel.z);
      let diff = target - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.heading += diff * Math.min(1, 14 * dt);
    }

    // pose the character
    const g = this.char.group;
    g.position.copy(this.pos);
    g.rotation.y = this.heading;
    this.phase += hSpeed * dt * (this.grounded ? 1.6 : 0.4);
    const amp = Math.min(1, hSpeed / WALK);
    animateWalk(this.char, this.phase, this.grounded ? amp : 0.25);

    this.nearCar = this.findNearestCar();

    this.updateCamera(CAM_DIST, EYE, dt);
  }

  // ---- driving ------------------------------------------------------------
  findNearestCar() {
    if (!this.traffic) return null;
    let best = null, bd = ENTER_RANGE * ENTER_RANGE;
    for (const c of this.traffic.cars) {
      if (c.flipped) continue; // can't drive an upside-down wreck
      const dx = c.mesh.position.x - this.pos.x;
      const dz = c.mesh.position.z - this.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bd) { bd = d2; best = c; }
    }
    return best;
  }

  tryEnterCar() {
    const best = this.findNearestCar();
    if (!best) return;
    this.car = best;
    this.nearCar = null;
    best.mode = 'driven';
    best.everDriven = true;
    best.pushVel.x = 0; best.pushVel.z = 0;
    this._boostLock = false;
    this._dyOff = 0;
    this.driveSpeed = best.v || 0; // inherit the car's actual rolling speed
    this.driveHeading = best.mesh.rotation.y;
    this.yaw = this.driveHeading + Math.PI; // start looking down the road
    this.char.group.visible = false;
  }

  exitCar() {
    const c = this.car;
    c.mode = 'parked'; // keeps c.speed — if struck later, it rejoins its loop
    c.v = 0;
    this._boostFx = false;
    this._boostLock = false;
    if (c.flameFx) c.flameFx.visible = false;
    const h = this.driveHeading;
    const fx = Math.sin(h), fz = Math.cos(h);
    const rx = Math.cos(h), rz = -Math.sin(h);
    const side = c.spec.halfLen + 1.6;
    const spots = [
      [rx * 2.3, rz * 2.3], [-rx * 2.3, -rz * 2.3],
      [-fx * side, -fz * side], [fx * side, fz * side],
    ];
    let px = c.mesh.position.x + spots[0][0];
    let pz = c.mesh.position.z + spots[0][1];
    const cand = [];
    for (const [dx, dz] of spots) {
      const sx = c.mesh.position.x + dx, sz = c.mesh.position.z + dz;
      this.colliders.query(sx - 0.5, sz - 0.5, sx + 0.5, sz + 0.5, cand);
      let free = true;
      for (const i of cand) {
        const b = this.colliders.boxes[i];
        if (b.maxY <= c.y + 0.45) continue; // curbs are fine
        if (sx + 0.35 > b.minX && sx - 0.35 < b.maxX && sz + 0.35 > b.minZ && sz - 0.35 < b.maxZ) {
          free = false;
          break;
        }
      }
      if (free) { px = sx; pz = sz; break; }
    }
    this.pos.set(px, c.y, pz);
    this.vel.set(0, 0, 0);
    this.char.group.visible = true;
    this.char.group.position.copy(this.pos);
    this.heading = h;
    this.car = null;
  }

  // orange exhaust flames while boosting — lazily attached to each car,
  // flicker deterministically off an accumulated timer
  updateFlames(c, boosting, dt) {
    if (!c.flameFx) {
      if (!boosting) return;
      const grp = new THREE.Group();
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const matO = new THREE.MeshBasicMaterial({ color: 0xffb347 });
      const matY = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });
      for (const sx of [-0.5, 0.5]) {
        const f = new THREE.Mesh(geo, matO);
        f.position.set(sx, 0.5, -(c.spec.halfLen + 0.55));
        grp.add(f);
        const core = new THREE.Mesh(geo, matY);
        core.position.set(sx, 0.5, -(c.spec.halfLen + 0.45));
        grp.add(core);
      }
      c.mesh.add(grp);
      c.flameFx = grp;
    }
    c.flameFx.visible = boosting;
    if (!boosting) return;
    this._fxT = (this._fxT || 0) + dt;
    const t = this._fxT;
    c.flameFx.children.forEach((f, i) => {
      const core = i % 2 === 1;
      const w = core ? 0.13 : 0.24;
      const l = (core ? 0.55 : 1.0) * (1 + 0.35 * Math.sin(t * 31 + i * 2.1));
      f.scale.set(w, core ? 0.11 : 0.2, l);
      f.position.z = -(c.spec.halfLen + 0.15 + l / 2);
    });
  }

  updateDrive(dt) {
    const k = this.keys;
    const c = this.car;
    const spec = c.spec;

    let throttle = 0;
    if (k.has('KeyW')) throttle += 1;
    if (k.has('KeyS')) throttle -= 1;
    let steer = 0;
    if (k.has('KeyA')) steer += 1;  // left
    if (k.has('KeyD')) steer -= 1;  // right

    let v = this.driveSpeed;
    // SHIFT boost: drains in ~10s, recharges in ~20s; the charge lives on the
    // CAR (fresh cars have full boost, re-entered ones kept regenerating);
    // extra speed scales with the car's own top speed (+50%)
    // once the tank hits empty, boost stays locked out until SHIFT is
    // released — otherwise the regen in the else-branch would re-arm it
    // next frame and flames/FOV/speed-limit would flicker every frame
    const shiftHeld = k.has('ShiftLeft') || k.has('ShiftRight');
    if (!shiftHeld) this._boostLock = false;
    const boosting = shiftHeld && throttle > 0 && c.boost > 0 && !this._boostLock;
    if (boosting) {
      c.boost = Math.max(0, c.boost - dt / 10);
      if (c.boost === 0) this._boostLock = true;
    } else {
      c.boost = Math.min(1, c.boost + dt / 20);
    }
    this._boostFx = boosting;
    this.updateFlames(c, boosting, dt);
    const limit = spec.maxSpeed * (boosting ? 1.5 : 1);
    if (throttle > 0) v += spec.accel * (boosting ? 1.6 : 1) * dt;
    else if (throttle < 0) v -= spec.accel * (v > 0 ? 1.8 : 0.7) * dt; // brake > reverse
    else v -= v * 1.1 * dt; // coast drag
    // ease back down when the boost runs out instead of snapping
    if (v > limit) v = Math.max(limit, v - spec.accel * 1.2 * dt);
    v = Math.max(-spec.maxSpeed * 0.35, Math.min(limit, v));
    if (throttle === 0 && Math.abs(v) < 0.05) v = 0;

    // turning circle: barely steers when crawling, full rate at speed
    const grip = Math.min(1, Math.abs(v) / 7);
    if (!c.air) this.driveHeading += steer * spec.turn * grip * dt * (v < 0 ? -1 : 1);
    // the chase cam stays where the mouse put it: steering doesn't move it,
    // and it never snaps back on its own — full 360 look-around

    const pos = c.mesh.position;
    const fx = Math.sin(this.driveHeading), fz = Math.cos(this.driveHeading);
    const lowY = c.y + 0.45;   // anything below this is drivable (curbs)
    const startX = pos.x, startZ = pos.z;

    pos.x += fx * v * dt;
    pos.z += fz * v * dt;

    // steep rocky scarp ahead reads as a wall — cars can't drive up it.
    // Probe at the front (or rear) bumper, center and both corners, so the
    // nose never visibly buries itself in the rock face first.
    if (!c.air && v) {
      const sgn = Math.sign(v);
      const look = spec.halfLen + 0.4;
      const gH = groundHeight(pos.x, pos.z);
      const bx = pos.x + fx * sgn * look, bz = pos.z + fz * sgn * look;
      const rx = fz * 0.9, rz = -fx * 0.9;
      const gF = Math.max(
        groundHeight(bx, bz),
        groundHeight(bx + rx, bz + rz),
        groundHeight(bx - rx, bz - rz)
      );
      if (gF - gH > 0.9 && gF > c.y - 0.5) {
        pos.x -= fx * v * dt;
        pos.z -= fz * v * dt;
        v *= -0.12;
      }
    }

    // --- static world: three-disc capsule, exact push-out (no phantom hits) ---
    const push = collideCarWorld(this.colliders, pos, this.driveHeading, spec, c.y);
    if (push.x || push.z) {
      const pl = Math.hypot(push.x, push.z);
      const nx = push.x / pl, nz = push.z / pl;
      // head-on into a wall: crunch + tiny bounce; glancing: scrape and slow
      const along = nx * fx * Math.sign(v || 1) + nz * fz * Math.sign(v || 1);
      if (along < -0.5) v *= -0.12;
      else v *= Math.max(0, 1 - 3 * dt);
    }

    // --- other cars: disc-vs-disc with momentum transfer ---
    const span = spec.halfLen - CAR_R;
    for (const o of this.traffic.cars) {
      if (o === c) continue;
      const op = o.mesh.position;
      const ddx = op.x - pos.x, ddz = op.z - pos.z;
      const rr = spec.halfLen + o.spec.halfLen + 0.5;
      if (ddx * ddx + ddz * ddz > rr * rr) continue;
      const oh = o.mesh.rotation.y;
      const ofx = Math.sin(oh), ofz = Math.cos(oh);
      const ospan = o.spec.halfLen - CAR_R;
      for (const a of [span, 0, -span]) {
        const ax = pos.x + fx * a, az = pos.z + fz * a;
        for (const b of [ospan, 0, -ospan]) {
          const bx = op.x + ofx * b, bz = op.z + ofz * b;
          let dx = ax - bx, dz = az - bz;
          const d2 = dx * dx + dz * dz, minD = CAR_R * 2;
          if (d2 >= minD * minD) continue;
          let d = Math.sqrt(d2);
          if (d < 1e-4) { dx = fx; dz = fz; d = 1; }
          const nx = dx / d, nz = dz / d; // from them toward me
          const pen = minD - d;
          // separate: I take most of it, they get shoved the rest
          pos.x += nx * pen * 0.6; pos.z += nz * pen * 0.6;
          op.x -= nx * pen * 0.4; op.z -= nz * pen * 0.4;
          // impulse: how fast I'm moving into them along the contact normal
          const vn = -(fx * v * nx + fz * v * nz);
          if (vn > 0.5) {
            this.traffic.knock(o, -nx * vn * 0.75, -nz * vn * 0.75);
            v *= Math.max(0.25, 1 - 0.09 * vn); // I lose speed in the hit
          }
          this.traffic.updateBox(o);
        }
      }
    }
    // hard guard: whatever pushed us this frame (walls, other cars), a car
    // can never end up over terrain rising above its floor — the rock scarp
    // is solid from every direction
    if (!c.air && groundHeight(pos.x, pos.z) > c.y + 0.6) {
      pos.x = startX;
      pos.z = startZ;
      v *= 0.2;
    }
    // ride on top of curbs/sidewalks: snap to highest low surface underneath,
    // starting from the island terrain (so cars drive off ledges)
    let groundY = groundHeight(pos.x, pos.z) + 0.06;
    const cand = [];
    this.colliders.query(pos.x - 0.5, pos.z - 0.5, pos.x + 0.5, pos.z + 0.5, cand);
    for (const i of cand) {
      const b = this.colliders.boxes[i];
      if (b.maxY > lowY) continue;
      let inside = pos.x > b.minX && pos.x < b.maxX && pos.z > b.minZ && pos.z < b.maxZ;
      if (inside && b.rot) {
        const lx = b.cos * (pos.x - b.cx) - b.sin * (pos.z - b.cz);
        const lz = b.sin * (pos.x - b.cx) + b.cos * (pos.z - b.cz);
        inside = Math.abs(lx) < b.ex && Math.abs(lz) < b.ez;
      }
      if (inside) groundY = Math.max(groundY, b.maxY + 0.01);
    }
    if (c.air) {
      // ballistic fall with a forward tumble; landing may flip the car
      c.air.vy -= 24 * dt;
      c.y += c.air.vy * dt;
      c.pitch = (c.pitch || 0) + c.air.pitchV * dt;
      if (c.y <= groundY) {
        c.y = groundY;
        v *= 0.5;
        if (this.traffic.landCar(c) === 'flipped') {
          // landed on the roof: the drive is over, climb out beside it
          this.driveSpeed = 0;
          this.exitCar();
          return;
        }
      }
    } else if (groundY < c.y - 0.7) {
      // drove off an edge: go airborne, tumble faster the faster we were going
      c.air = { vy: 0, pitchV: -(0.5 + 0.06 * Math.abs(v)) };
    } else {
      c.y += (groundY - c.y) * Math.min(1, 12 * dt);
      if (c.pitch) { // settle back onto the wheels after a landing
        c.pitch *= Math.max(0, 1 - 6 * dt);
        if (Math.abs(c.pitch) < 0.01) c.pitch = 0;
      }
    }
    this.driveSpeed = v;
    pos.y = c.y + pitchLift(c);
    c.mesh.rotation.y = this.driveHeading;
    c.mesh.rotation.x = c.pitch || 0;
    this.traffic.updateBox(c);

    this.pos.set(pos.x, c.y, pos.z);
    this.updateCamera(DRIVE_CAM_DIST, DRIVE_EYE, dt);
  }

  // ---- camera ---------------------------------------------------------------
  updateCamera(dist, eye, dt) {
    // vertically smoothed follow: running up stairs raises the player in
    // 0.4m pops — the camera glides instead of popping with each step
    if (Math.abs(this.pos.y - this._headY) > 8) this._headY = this.pos.y; // teleport
    else {
      const rate = this.car ? 12 : this.grounded ? 10 : 25;
      this._headY += (this.pos.y - this._headY) * Math.min(1, rate * dt);
    }
    const head = new THREE.Vector3(this.pos.x, this._headY + eye, this.pos.z);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    // a blocked boom first tries a SMALL slide around the obstruction
    // (visual yaw offset) — shallow grazes while passing a building keep
    // the full camera distance; only a real side-turn into the building
    // falls through to the zoom-in below
    const yaw = this.yaw + this._yawSlide(head, dist, cp, sp, dt);
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    const back = new THREE.Vector3(sin * cp, sp, cos * cp); // away from look dir
    const camPos = head.clone().addScaledVector(back, dist);
    camPos.y += CAM_UP;
    const camFloor = groundHeight(camPos.x, camPos.z) + 0.35;
    if (camPos.y < camFloor) camPos.y = camFloor;
    this.clampCamera(head, camPos);
    // smooth the boom length: snap in when something is in the way, ease
    // back out — no per-step in/out flicker on stairs or near walls
    const off = camPos.clone().sub(head);
    const len = off.length();
    if (len > 1e-4) {
      if (len < this._camLen) this._camLen = len;
      else this._camLen = Math.min(len, this._camLen + (len - this._camLen) * Math.min(1, 5 * dt));
      camPos.copy(head).addScaledVector(off, this._camLen / len);
    }
    // final guarantee: keep the lens above the terrain
    if (camPos.y < camFloor) camPos.y = camFloor;
    // hide the character when the boom is pulled in so close (hugging a
    // wall) that the lens would sit inside the head; small hysteresis so
    // it doesn't flicker right at the boundary
    if (!this.car) {
      this.char.group.visible = this.char.group.visible
        ? this._camLen > 0.95
        : this._camLen > 1.15;
    }
    this.camera.position.copy(camPos);
    const lookTarget = head.clone().addScaledVector(back, -6);
    this.camera.lookAt(lookTarget);
  }

  // Pull the camera in front of any world geometry between the head and the
  // desired camera spot, so it never ends up inside (or grazing) a building.
  // Boxes are expanded by the lens clearance so a boom passing just beside a
  // wall can't poke the near plane through it; the clamp only ever slides
  // the camera along the boom — never sideways — so it can't flip angles.
  // The near plane is 0.15 (corner reach ~0.27), so any clearance >= 0.3
  // guarantees no wall clipping at any view angle.
  clampCamera(head, camPos) {
    const dx = camPos.x - head.x, dy = camPos.y - head.y, dz = camPos.z - head.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return;
    const tHit = this._boomHit(head, camPos);
    if (tHit < 1) {
      const t = Math.max(0.04, tHit - 0.05 / len);
      camPos.set(head.x + dx * t, head.y + dy * t, head.z + dz * t);
    }
  }

  // Search for the smallest visual yaw offset (capped at ~24°) whose
  // full-length boom is clear of buildings; ease toward it (and back to 0
  // when the straight-back boom clears again). Small offsets absorb the
  // shallow grazes of walking or driving PAST a building — the camera keeps
  // its distance instead of zooming in. If no capped offset clears (the
  // player deliberately turned the view so a building sits square behind
  // the head), the offset eases home and clampCamera does the usual
  // zoom-in. Never mutates this.yaw — mouse look stays authoritative.
  _yawSlide(head, dist, cp, sp, dt) {
    const cur = this._dyOff || 0;
    const probe = this._dyProbe || (this._dyProbe = new THREE.Vector3());
    const clear = (yaw) => {
      probe.set(
        head.x + Math.sin(yaw) * cp * dist,
        head.y + sp * dist + CAM_UP,
        head.z + Math.cos(yaw) * cp * dist
      );
      return this._boomHit(head, probe) >= 0.985;
    };
    let target = 0; // nothing clear within the cap -> zoom instead
    const pref = cur >= 0 ? 1 : -1; // tie-break toward the current side
    search: for (let k = 0; k <= 6; k++) {
      for (const s of k === 0 ? [1] : [pref, -pref]) {
        const o = s * k * 0.07;
        if (clear(this.yaw + o)) { target = o; break search; }
      }
    }
    const rate = Math.min(1, 10 * dt);
    this._dyOff = cur + (target - cur) * rate;
    if (Math.abs(this._dyOff) < 1e-3 && target === 0) this._dyOff = 0;
    return this._dyOff;
  }

  // Entry fraction (0..1) of the head->camPos boom against world geometry;
  // 1 means the full boom is clear.
  _boomHit(head, camPos) {
    const R = 0.4;    // horizontal lens clearance
    const RY = 0.12;  // smaller vertically: grazing stair-step tops while
                      // climbing shouldn't yank the boom in and out
    const dx = camPos.x - head.x, dy = camPos.y - head.y, dz = camPos.z - head.z;
    if (Math.hypot(dx, dy, dz) < 1e-4) return 1;
    const cand = this._camCand || (this._camCand = []);
    this.colliders.query(
      Math.min(head.x, camPos.x) - 1, Math.min(head.z, camPos.z) - 1,
      Math.max(head.x, camPos.x) + 1, Math.max(head.z, camPos.z) + 1, cand
    );
    let tHit = 1;
    const slab = (b, ex, ey) => {
      // entry time of the segment into box b expanded by (ex, ey, ex)
      let t0 = 0, t1 = 1;
      for (const [p0, d, mn, mx] of [
        [head.x, dx, b.minX - ex, b.maxX + ex],
        [head.y, dy, b.minY - ey, b.maxY + ey],
        [head.z, dz, b.minZ - ex, b.maxZ + ex],
      ]) {
        if (Math.abs(d) < 1e-9) {
          if (p0 < mn || p0 > mx) return null;
          continue;
        }
        let ta = (mn - p0) / d, tb = (mx - p0) / d;
        if (ta > tb) { const t = ta; ta = tb; tb = t; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) return null;
      }
      return t0;
    };
    for (const i of cand) {
      const b = this.colliders.boxes[i];
      // The camera may never get closer to a box than the head itself is:
      // when the player hugs a wall (head ~0.35 out, kept there by the
      // capsule), shrink that box's expansion just below the head's own
      // clearance instead of collapsing the boom. Shrinks continuously as
      // the head approaches, so the clamp can't pop.
      const hdx = Math.max(b.minX - head.x, 0, head.x - b.maxX);
      const hdz = Math.max(b.minZ - head.z, 0, head.z - b.maxZ);
      const hd = Math.hypot(hdx, hdz);
      const vd = Math.max(b.minY - head.y, 0, head.y - b.maxY);
      let ex, ey;
      if (hd > vd) { ex = Math.min(R, hd - 0.01); ey = RY; }
      else { ex = R; ey = Math.min(RY, vd - 0.01); }
      const t = slab(b, Math.max(0, ex), Math.max(0, ey));
      if (t !== null && t < tHit) tHit = t;
    }
    return tHit;
  }
}
