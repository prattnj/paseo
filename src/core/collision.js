// Box collision world with a spatial hash, plus a capsule-ish player
// resolver with step-up for curbs. Boxes may be axis-aligned (fast path)
// or arbitrarily yaw-rotated (OBB: exact local-frame tests, so rotated
// buildings/cars don't get oversized phantom hitboxes).
const CELL = 16;

export class Colliders {
  constructor() {
    this.boxes = [];
    this.grid = new Map();
  }

  // Add a collider box centered at (cx, cz), base at y, size (sx, sy, sz),
  // yaw ry. Near-quarter turns collapse to an exact axis-aligned box;
  // anything else is stored as an OBB (min/max stay as the conservative
  // world AABB used only for the spatial hash / broad phase).
  add(cx, y, cz, sx, sy, sz, ry = 0) {
    const q = Math.round(ry / (Math.PI / 2));
    let box;
    if (Math.abs(ry - q * (Math.PI / 2)) < 1e-3) {
      if (q & 1) [sx, sz] = [sz, sx];
      box = {
        minX: cx - sx / 2, maxX: cx + sx / 2,
        minY: y, maxY: y + sy,
        minZ: cz - sz / 2, maxZ: cz + sz / 2,
      };
    } else {
      const c = Math.cos(ry), s = Math.sin(ry);
      const hx = (sx / 2) * Math.abs(c) + (sz / 2) * Math.abs(s);
      const hz = (sx / 2) * Math.abs(s) + (sz / 2) * Math.abs(c);
      box = {
        minX: cx - hx, maxX: cx + hx,
        minY: y, maxY: y + sy,
        minZ: cz - hz, maxZ: cz + hz,
        rot: true, cx, cz, cos: c, sin: s, ex: sx / 2, ez: sz / 2,
      };
    }
    const idx = this.boxes.length;
    this.boxes.push(box);
    const c0x = Math.floor(box.minX / CELL), c1x = Math.floor(box.maxX / CELL);
    const c0z = Math.floor(box.minZ / CELL), c1z = Math.floor(box.maxZ / CELL);
    for (let i = c0x; i <= c1x; i++) {
      for (let j = c0z; j <= c1z; j++) {
        const key = i + ',' + j;
        let cell = this.grid.get(key);
        if (!cell) { cell = []; this.grid.set(key, cell); }
        cell.push(idx);
      }
    }
  }

  query(minX, minZ, maxX, maxZ, out) {
    out.length = 0;
    const c0x = Math.floor(minX / CELL), c1x = Math.floor(maxX / CELL);
    const c0z = Math.floor(minZ / CELL), c1z = Math.floor(maxZ / CELL);
    for (let i = c0x; i <= c1x; i++) {
      for (let j = c0z; j <= c1z; j++) {
        const cell = this.grid.get(i + ',' + j);
        if (cell) for (const idx of cell) if (!out.includes(idx)) out.push(idx);
      }
    }
    return out;
  }
}

const HX = 0.35;      // player half-width
const HEIGHT = 1.7;   // player height
const STEP = 0.45;    // max auto step-up (curbs, low ledges)
const _cand = [];
const _active = [];

// Horizontal-only overlap (exact for OBBs; the world AABB is broad phase).
function horizOverlap(b, x, z) {
  if (x - HX >= b.maxX || x + HX <= b.minX || z - HX >= b.maxZ || z + HX <= b.minZ) return false;
  if (!b.rot) return true;
  const dx = x - b.cx, dz = z - b.cz;
  const lx = b.cos * dx - b.sin * dz;
  const lz = b.sin * dx + b.cos * dz;
  return Math.abs(lx) < b.ex + HX && Math.abs(lz) < b.ez + HX;
}

function overlaps(b, x, y, z) {
  return y < b.maxY && y + HEIGHT > b.minY && horizOverlap(b, x, z);
}

// Push the player out of a rotated box along its least-penetrated local axis.
function resolveOBB(b, pos) {
  const dx = pos.x - b.cx, dz = pos.z - b.cz;
  const lx = b.cos * dx - b.sin * dz;
  const lz = b.sin * dx + b.cos * dz;
  const px = b.ex + HX + 0.001 - Math.abs(lx);
  const pz = b.ez + HX + 0.001 - Math.abs(lz);
  if (px <= 0 || pz <= 0) return;
  if (px < pz) {
    const m = px * (Math.sign(lx) || 1); // local +x is world (cos, -sin)
    pos.x += m * b.cos;
    pos.z += -m * b.sin;
  } else {
    const m = pz * (Math.sign(lz) || 1); // local +z is world (sin, cos)
    pos.x += m * b.sin;
    pos.z += m * b.cos;
  }
}

// Moves the player position (feet) by vel*dt, resolving against the static
// world plus optional dynamic boxes (cars). groundAt(x, z) supplies terrain
// height (island plateau / scarp / beach / sea floor). ctx carries state from
// the previous frame: { support: 'box'|'terrain'|null, anchor: lastGroundY }.
// Mutates pos; returns state (including support for the next call).
export function movePlayer(world, pos, vel, dt, dynamic = null, groundAt = null, ctx = null) {
  const result = { grounded: false, hitHead: false, support: null };

  const reach = Math.abs(vel.x * dt) + Math.abs(vel.z * dt) + HX + 1;
  world.query(pos.x - reach, pos.z - reach, pos.x + reach, pos.z + reach, _cand);
  _active.length = 0;
  for (const i of _cand) _active.push(world.boxes[i]);
  if (dynamic) {
    for (const b of dynamic) {
      if (
        b.minX < pos.x + reach + 4 && b.maxX > pos.x - reach - 4 &&
        b.minZ < pos.z + reach + 4 && b.maxZ > pos.z - reach - 4
      ) {
        _active.push(b);
      }
    }
  }
  const boxes = _active;

  // Steep rocky terrain (island scarp risers): rising moves are refused so
  // the rock faces can't be climbed or bunny-hopped — stairs (boxes) are the
  // only way up. Standing on a structure exempts the check entirely.
  let blockClimb = false;
  const anchor = ctx && ctx.anchor !== undefined ? ctx.anchor : pos.y;
  const wasGrounded = !!(ctx && ctx.support);
  if (groundAt && (!ctx || ctx.support !== 'box')) {
    const gx1 = groundAt(pos.x + 0.5, pos.z), gx0 = groundAt(pos.x - 0.5, pos.z);
    const gz1 = groundAt(pos.x, pos.z + 0.5), gz0 = groundAt(pos.x, pos.z - 0.5);
    if (Math.hypot(gx1 - gx0, gz1 - gz0) > 1.05) blockClimb = true;
  }
  const climbBlocked = (gOld, gNew) => {
    if (!blockClimb || gNew <= gOld + 1e-3) return false;
    // grounded: any uphill move on steep rock is refused; airborne: only
    // moves that would end up over rock above the takeoff point
    return wasGrounded ? true : gNew > anchor + 0.05;
  };

  // --- horizontal X ---
  const prevX = pos.x;
  const gOldX = groundAt ? groundAt(pos.x, pos.z) : 0;
  pos.x += vel.x * dt;
  for (const b of boxes) {
    if (b.rot || !overlaps(b, pos.x, pos.y, pos.z)) continue;
    // try step-up onto low obstacles while grounded-ish
    const stepY = b.maxY;
    if (stepY - pos.y <= STEP && vel.y <= 0.01 && canStand(boxes, pos.x, stepY, pos.z)) {
      pos.y = stepY;
      continue;
    }
    if (vel.x > 0) pos.x = b.minX - HX - 0.001;
    else if (vel.x < 0) pos.x = b.maxX + HX + 0.001;
  }
  // terrain rising more than a step blocks the move (cliff faces)
  if (groundAt) {
    const gNew = groundAt(pos.x, pos.z);
    if (gNew - pos.y > STEP || climbBlocked(gOldX, gNew)) pos.x = prevX;
  }

  // --- horizontal Z ---
  const prevZ = pos.z;
  const gOldZ = groundAt ? groundAt(pos.x, pos.z) : 0;
  pos.z += vel.z * dt;
  for (const b of boxes) {
    if (b.rot || !overlaps(b, pos.x, pos.y, pos.z)) continue;
    const stepY = b.maxY;
    if (stepY - pos.y <= STEP && vel.y <= 0.01 && canStand(boxes, pos.x, stepY, pos.z)) {
      pos.y = stepY;
      continue;
    }
    if (vel.z > 0) pos.z = b.minZ - HX - 0.001;
    else if (vel.z < 0) pos.z = b.maxZ + HX + 0.001;
  }
  if (groundAt) {
    const gNew = groundAt(pos.x, pos.z);
    if (gNew - pos.y > STEP || climbBlocked(gOldZ, gNew)) pos.z = prevZ;
  }

  // --- rotated boxes (exact OBB, resolved after both axis passes) ---
  for (const b of boxes) {
    if (!b.rot || !overlaps(b, pos.x, pos.y, pos.z)) continue;
    const stepY = b.maxY;
    if (stepY - pos.y <= STEP && vel.y <= 0.01 && canStand(boxes, pos.x, stepY, pos.z)) {
      pos.y = stepY;
      continue;
    }
    resolveOBB(b, pos);
  }

  // --- vertical ---
  pos.y += vel.y * dt;
  for (const b of boxes) {
    if (!overlaps(b, pos.x, pos.y, pos.z)) continue;
    if (vel.y <= 0 && pos.y < b.maxY && pos.y > b.maxY - 1.2) {
      pos.y = b.maxY;
      vel.y = 0;
      result.grounded = true;
      result.support = 'box';
    } else if (vel.y > 0) {
      pos.y = b.minY - HEIGHT - 0.001;
      vel.y = 0;
      result.hitHead = true;
    }
  }

  // terrain
  const gy = groundAt ? groundAt(pos.x, pos.z) : 0;
  if (pos.y <= gy) {
    pos.y = gy;
    if (vel.y < 0) vel.y = 0;
    result.grounded = true;
    if (result.support === null) result.support = 'terrain';
  }

  // Ground-stick: walking down slopes and small step-downs (wading slope,
  // stairs, curbs) hugs the surface instead of flickering airborne every
  // frame — smooth movement and camera. Real drops (> 0.5) still fall.
  if (!result.grounded && wasGrounded && vel.y <= 0.01) {
    let top = -Infinity, support = null;
    if (pos.y > gy && pos.y - gy <= 0.5) { top = gy; support = 'terrain'; }
    for (const b of boxes) {
      if (b.maxY > pos.y || pos.y - b.maxY > 0.5 || b.maxY <= top) continue;
      if (horizOverlap(b, pos.x, pos.z)) {
        top = b.maxY;
        support = 'box';
      }
    }
    if (support) {
      pos.y = top;
      vel.y = 0;
      result.grounded = true;
      result.support = support;
    }
  }
  return result;
}

function canStand(boxes, x, y, z) {
  for (const b of boxes) {
    if (b.maxY <= y + 0.001) continue;
    if (overlaps(b, x, y + 0.002, z)) return false;
  }
  return true;
}

export const PLAYER_HX = HX;
export const PLAYER_HEIGHT = HEIGHT;
