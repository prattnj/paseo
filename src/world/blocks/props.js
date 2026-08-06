// Placeable props and street/yard furniture shared across block builders and
// the parkway/paths/arena: trees, benches, lamps, playground pieces, parked
// cars, planters, kiosks — the reusable catalog of small world objects.
import { PALETTE as P, SIDEWALK_H } from '../../core/palette.js';
import { hash, pick, frac } from '../../core/util.js';

function tree(g, col, x, z, s = 1, kind = 0) {
  g.cyl(x, 0, z, 0.22 * s, 0.3 * s, 1.7 * s, P.trunk, 6);
  if (kind === 0) {
    g.ico(x, 2.9 * s, z, 1.7 * s, P.leaf1, 0);
  } else if (kind === 1) {
    g.cone(x, 1.3 * s, z, 1.5 * s, 3.6 * s, P.leaf2, 7);
  } else {
    g.ico(x, 2.5 * s, z, 1.4 * s, P.leaf3, 0);
    g.ico(x + 0.5 * s, 3.5 * s, z - 0.3 * s, 1.0 * s, P.leaf1, 0);
  }
  col.add(x, 0, z, 0.7, 2.2 * s, 0.7);
}

// Is (x,z) within `rad` of any collider box with index < `limit`? The limit
// lets the tree scatter avoid the buildings/sheds present before it ran while
// ignoring the trees it adds itself — so trees can pack into a dense forest.
const _tq = [];
function occupied(col, x, z, rad, limit) {
  col.query(x - rad, z - rad, x + rad, z + rad, _tq);
  for (const idx of _tq) {
    if (idx >= limit) continue; // ignore trees placed during this scatter
    const b = col.boxes[idx];
    if (b.maxY < 0.6) continue; // ignore ground slabs (block-wide sidewalk etc.)
    if (x + rad > b.minX && x - rad < b.maxX && z + rad > b.minZ && z - rad < b.maxZ) return true;
  }
  return false;
}

// Blanket the open lawn of block interior `r` with a jittered grid of trees
// (and the occasional low bush) at near-forest density, keeping clear of the
// buildings and an optional keep-out fn. `step` sets density (smaller =
// denser). Trees ignore each other, so they overlap into a canopy.
function scatterTrees(g, col, r, seed, step, sMin, sMax, keepOut = null) {
  const solid = col.boxes.length; // only pre-existing colliders (buildings) block trees
  let k = 0;
  const jit = step * 0.42;
  for (let gx = r.x0 + step * 0.5; gx < r.x1; gx += step) {
    for (let gz = r.z0 + step * 0.5; gz < r.z1; gz += step) {
      const px = gx + (frac(seed, k, 1) - 0.5) * 2 * jit;
      const pz = gz + (frac(seed, k, 2) - 0.5) * 2 * jit;
      k++;
      if (px < r.x0 + 1.2 || px > r.x1 - 1.2 || pz < r.z0 + 1.2 || pz > r.z1 - 1.2) continue;
      if (keepOut && keepOut(px, pz)) continue;
      if (occupied(col, px, pz, 1.0, solid)) continue;
      if (hash(seed, k, 5) % 6 === 0) { // low bush
        g.ico(px, SIDEWALK_H + 0.5, pz, 0.6 + frac(seed, k, 6) * 0.4, pick([P.leaf1, P.leaf2, P.leaf3], seed, k, 7));
        col.add(px, 0, pz, 1.0, 1.1, 1.0);
      } else {
        tree(g, col, px, pz, sMin + frac(seed, k, 3) * (sMax - sMin), hash(seed, k, 4) % 3);
      }
    }
  }
}

// Fill an axis-aligned rectangle (opposite corners x1..x2 / z1..z2, given in
// any order) with `count` trees at deterministic, non-overlapping positions —
// a count-based companion to scatterTrees (which is density/step based). Made
// for hand-filling leftover green-belt gaps around the map edge: pass the gap's
// corners and how many trees you want. Trees keep clear of any pre-existing
// colliders (buildings, the lighthouse, …) and space themselves out; if the
// rectangle is too cramped to seat all `count`, it plants as many as fit and
// returns that number. `seed` makes two adjacent fills differ.
function treeFill(g, col, x1, x2, z1, z2, count, seed = 0) {
  const x0 = Math.min(x1, x2), xe = Math.max(x1, x2);
  const z0 = Math.min(z1, z2), ze = Math.max(z1, z2);
  const solid = col.boxes.length;  // trees planted here don't block later ones
  const m = 1.2;                    // keep trunks off the exact edge
  const spanX = Math.max(0, xe - x0 - 2 * m), spanZ = Math.max(0, ze - z0 - 2 * m);
  const placed = [];
  for (let i = 0; i < count; i++) {
    // try a few decorrelated candidate spots for tree i; take the first that
    // clears the buildings and the trees already placed this fill
    for (let t = 0; t < 12; t++) {
      const hk = hash(seed, i, t);
      // decorrelated 2D scatter (nested hash — see util.js frac caveat)
      const px = x0 + m + frac(hash(hk, 1), 5) * spanX;
      const pz = z0 + m + frac(hash(hk, 2), 9) * spanZ;
      if (occupied(col, px, pz, 1.2, solid)) continue;
      if (placed.some((q) => Math.hypot(px - q.x, pz - q.z) < 2.6)) continue;
      tree(g, col, px, pz, 0.85 + frac(hk, 4, 9) * 0.5, hash(hk, 5) % 3);
      placed.push({ x: px, z: pz });
      break;
    }
  }
  return placed.length;
}

function bench(g, col, x, z, ry = 0) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const at = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];
  // legs lift the seat off the ground; the back pair carry on up to hold the
  // backrest. (Their lower part is buried when the ground sits above y=0.)
  for (const dx of [-0.75, 0.75]) {
    const [fx, fz] = at(dx, 0.18);
    g.box(fx, 0.34, fz, 0.14, 0.68, 0.14, P.roofDark, ry);   // front leg
    const [rx, rz] = at(dx, -0.22);
    g.box(rx, 0.73, rz, 0.14, 1.46, 0.14, P.roofDark, ry);   // back leg + post
  }
  g.box(x, 0.76, z, 1.8, 0.16, 0.55, P.trunk, ry);           // seat slab (thicker)
  const [bx, bz] = at(0, -0.25);
  g.box(bx, 1.18, bz, 1.8, 0.58, 0.12, P.trunk, ry);         // backrest (thicker)
  col.add(x, 0, z, 1.8, 1.5, 0.6, ry);
}

function lamp(g, col, x, z) {
  g.cyl(x, 0, z, 0.09, 0.13, 5, P.roofDark, 6);
  g.box(x, 5.1, z, 0.55, 0.28, 0.28, P.window);
  col.add(x, 0, z, 0.35, 5, 0.35);
}

function fountain(g, col, x, z, dry = false) {
  const wet = dry ? 0x6b6455 : P.water; // dry -> grimy stain in the empty basins
  g.cyl(x, 0, z, 3.6, 3.9, 0.7, P.concrete, 10);
  g.cyl(x, 0.5, z, 3.2, 3.2, 0.35, wet, 10);
  g.cyl(x, 0.8, z, 0.5, 0.7, 1.6, P.concrete, 8);
  g.cyl(x, 2.3, z, 1.4, 1.5, 0.3, P.concrete, 8);
  g.cyl(x, 2.5, z, 1.1, 1.1, 0.25, wet, 8);
  if (!dry) g.ico(x, 3.1, z, 0.45, P.water, 0); // no spray plume when dry
  col.add(x, 0, z, 7.8, 1.2, 7.8);
}

function hedge(g, col, x, z, sx, sz) {
  g.boxB(x, SIDEWALK_H, z, sx, 0.9, sz, P.leaf2);
  col.add(x, 0, z, sx, 1.05, sz);
}

// White picket-style fence (solid low-poly rails).
function fenceRun(g, col, x0, z0, x1, z1) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const sx = Math.max(Math.abs(x1 - x0), 0.12);
  const sz = Math.max(Math.abs(z1 - z0), 0.12);
  g.boxB(cx, SIDEWALK_H, cz, sx === 0.12 ? 0.12 : sx, 0.85, sz === 0.12 ? 0.12 : sz, P.white);
  col.add(cx, 0, cz, sx, 1.0, sz);
}

// A grimy trash mound with a few strewn bits of litter (extracted from the
// dirty park). `s` scales the whole cluster.
const _TRASH = [0x6b5b3e, 0x4a4440, 0x8a8f94];
const _LITTER = [0xe04f43, 0xf4c542, 0x4a90d9, 0xf2f4f5];
function trashCluster(g, col, x, z, seed, s = 1) {
  g.ico(x, SIDEWALK_H + 0.2 * s, z, 0.5 * s, _TRASH[hash(seed, 24) % 3]);
  col.add(x, 0, z, 1.3 * s, 0.6, 1.3 * s);
  for (let j = 0; j < 3; j++) {
    const ox = (frac(seed, 25, j) - 0.5) * 2.0 * s;
    const oz = (frac(seed, 26, j) - 0.5) * 2.0 * s;
    g.boxB(x + ox, SIDEWALK_H + 0.08, z + oz, 0.4 * s, 0.16, 0.28 * s,
      _LITTER[hash(seed, 31 + j) % _LITTER.length], frac(seed, 30, j) * Math.PI);
  }
}

// Parked car spots — registered here, spawned as real drivable cars by traffic.
export const PARKED = [];
function parkedCar(g, col, x, z, ry, seed, y = SIDEWALK_H + 0.01, type = null) {
  PARKED.push({ x, z, ry, seed, y, type });
}

// Low concrete planter with a bush.
function planter(g, col, x, z) {
  g.boxB(x, SIDEWALK_H, z, 2.2, 0.55, 2.2, P.concreteDark);
  g.ico(x, SIDEWALK_H + 0.55, z, 1.0, P.leaf2);
  col.add(x, 0, z, 2.2, 1.3, 2.2);
}

// Dumpster with lid.
function dumpster(g, col, x, z, ry, seed) {
  const body = pick([0x3f6e50, 0x54606c, 0x7a4a3c], seed, 1);
  g.boxB(x, SIDEWALK_H, z, 2.6, 1.25, 1.5, body, ry);
  g.box(x, SIDEWALK_H + 1.32, z, 2.7, 0.14, 1.6, P.roofDark, ry);
  col.add(x, 0, z, 2.6, 1.6, 1.6, ry);
}

// Backyard pool: light deck + water.
function pool(g, col, x, z) {
  g.boxB(x, SIDEWALK_H + 0.02, z, 5.4, 0.14, 4.2, P.roofLight);
  g.boxB(x, SIDEWALK_H + 0.14, z, 4.4, 0.06, 3.2, P.water);
}

// Playground swing set: two end frames (paired uprights) carry a top beam; each
// of two swings hangs on a pair of chains from a flat seat. Only the end frames
// collide, so the player can walk through the swing bay and duck under the beam.
function swingSet(g, col, x, z, ry) {
  const s = Math.sin(ry), c = Math.cos(ry);
  const box = (dx, cy, dz, sx, sy, sz, hex) => { const X = x + dx * c + dz * s, Z = z - dx * s + dz * c; g.box(X, cy, Z, sx, sy, sz, hex, ry); };
  const y = SIDEWALK_H, beamH = 2.3, frame = 0x4a6b8a, chainH = 0x9aa6b2;
  for (const ex of [-1.95, 1.95]) {
    for (const dz of [-0.55, 0.55]) box(ex, y + beamH / 2, dz, 0.13, beamH, 0.13, frame); // paired uprights
    box(ex, y + beamH, 0, 0.15, 0.16, 1.3, frame);                                        // end cap
    const wx = x + ex * c, wz = z - ex * s;
    col.add(wx, 0, wz, 0.5, beamH, 1.3, ry);
  }
  box(0, y + beamH, 0, 4.5, 0.17, 0.17, frame);                                           // top beam
  for (const cx of [-1.0, 1.0]) {                                                          // two swings
    const seatY = y + 0.55;
    for (const off of [-0.22, 0.22]) box(cx + off, (y + beamH + seatY) / 2, 0, 0.05, beamH - 0.55, 0.05, chainH); // chains
    box(cx, seatY, 0, 0.52, 0.08, 0.3, 0xf4c542);                                          // seat
  }
}

// Flower bed: dirt patch with colored blobs.
function flowerBed(g, col, x, z, seed) {
  const y = SIDEWALK_H, w = 2.8, d = 1.8, rimH = 0.5, t = 0.18;
  // stone edging (a frame) around dark soil, raised so it clears the ground
  g.boxB(x, y, z - d / 2 + t / 2, w, rimH, t, P.concrete);
  g.boxB(x, y, z + d / 2 - t / 2, w, rimH, t, P.concrete);
  g.boxB(x - w / 2 + t / 2, y, z, t, rimH, d - 2 * t, P.concrete);
  g.boxB(x + w / 2 - t / 2, y, z, t, rimH, d - 2 * t, P.concrete);
  g.boxB(x, y, z, w - 2 * t + 0.1, rimH - 0.06, d - 2 * t + 0.1, 0x4a3a2c); // soil
  col.add(x, 0, z, w, y + rimH, d);
  // packed flowers: low foliage mounds topped with colored blossoms
  const soilTop = y + rimH - 0.06;
  const blossom = [0xe0574a, 0xf4c542, 0xe884c9, 0xf2f4f5, 0x9a6fc0, 0xf39a3a];
  const leaf = [P.leaf1, P.leaf2, P.leaf3];
  let k = 0;
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
    const px = x - 0.85 + (1.7 * i) / 4 + (frac(seed, k, 1) - 0.5) * 0.15;
    const pz = z - 0.5 + (1.0 * j) / 2 + (frac(seed, k, 2) - 0.5) * 0.15;
    g.ico(px, soilTop + 0.14, pz, 0.22 + frac(seed, k, 3) * 0.07, leaf[hash(seed, k, 4) % 3]);
    g.ico(px, soilTop + 0.3, pz, 0.1 + frac(seed, k, 5) * 0.05, blossom[hash(seed, k, 6) % 6]);
    k++;
  }
}

// Playground slide, built as a bright wedge (mound): wooden treads climb the
// local -z slope, a smooth chute drops down the +z slope, a small deck caps the
// ridge. Colliders are per-step so the player can actually walk up the stairs,
// stand on top, and walk/slide down — no single blocking box.
function slide(g, col, x, z, ry, seed) {
  const s = Math.sin(ry), c = Math.cos(ry);
  const box = (dx, cy, dz, sx, sy, sz, hex) => { const X = x + dx * c + dz * s, Z = z - dx * s + dz * c; g.box(X, cy, Z, sx, sy, sz, hex, ry); };
  const bxB = (dx, by, dz, sx, sy, sz, hex) => { const X = x + dx * c + dz * s, Z = z - dx * s + dz * c; g.boxB(X, by, Z, sx, sy, sz, hex, ry); };
  const cB = (dx, by, dz, sx, sy, sz) => { const X = x + dx * c + dz * s, Z = z - dx * s + dz * c; col.add(X, by, Z, sx, sy, sz, ry); };
  const y = SIDEWALK_H, W = 1.35, deckH = 1.5, L = 2.6;
  const chute = pick([0xe0574a, 0x4a90d9, 0xf4c542, 0x3aa7a3], seed, 1);
  const wood = 0xb07a45, MET = 0x9aa6b2;
  const surf = (dz) => deckH * (1 - Math.abs(dz) / L); // wedge surface height at local dz
  g.prism(x, y, z, W, deckH, 2 * L, chute, ry);        // the bright mound
  bxB(0, y, 0, W + 0.12, deckH + 0.02, 0.9, MET);      // deck cap (visual)
  cB(0, 0, 0, W, deckH + 0.02, 0.9);                   // deck (standable)
  const nStep = 4, d = (L - 0.45) / nStep;
  for (let i = 0; i < nStep; i++) {
    // stairs up the -z slope: a wood tread sitting on each standable step
    const sz = -(0.45 + (i + 0.5) * d), htNear = surf(0.45 + i * d);
    bxB(0, htNear - 0.12, sz, W + 0.1, 0.12, d + 0.02, wood);
    cB(0, 0, sz, W, htNear, d + 0.02);
    // chute down the +z slope: step colliders set to the far (lower) edge so
    // they tuck just under the smooth slide face, plus low side kerbs
    const cz = 0.45 + (i + 0.5) * d, htFar = surf(0.45 + (i + 1) * d), htMid = surf(cz);
    cB(0, 0, cz, W, Math.max(0.06, htFar), d + 0.02);
    for (const sx of [-1, 1]) box(sx * (W / 2 + 0.06), y + htMid + 0.2, cz, 0.1, 0.5, d + 0.04, MET);
  }
  box(0, y + 0.13, L - 0.12, W, 0.26, 0.32, chute); // foot lip
}

// Timber-framed sandbox filled with sand. Only the four rails collide, so the
// player can step over them into the sand.
function sandbox(g, col, x, z, s = 1) {
  const y = SIDEWALK_H, w = 4.2 * s, t = 0.32, rim = 0.4, wood = 0x9c6b3f;
  const rail = (cx, cz, sx, sz) => { g.boxB(cx, y, cz, sx, rim, sz, wood); col.add(cx, 0, cz, sx, rim, sz); };
  rail(x, z - w / 2 + t / 2, w, t);
  rail(x, z + w / 2 - t / 2, w, t);
  rail(x - w / 2 + t / 2, z, t, w - 2 * t);
  rail(x + w / 2 - t / 2, z, t, w - 2 * t);
  g.boxB(x, y, z, w - 2 * t, 0.14, w - 2 * t, P.path); // sand
}

// Round garden pavilion: a stone plinth, a ring of posts, a conical roof. Only
// the plinth (standable) and the posts collide, so the player steps up and walks
// inside between the posts.
function gazebo(g, col, x, z, seed) {
  const y = SIDEWALK_H, R = 2.6, postH = 2.5, N = 6;
  const roof = pick([P.roofRed, 0x4a6b8a, 0x6b8a4a, P.roofDark], seed, 1);
  g.cyl(x, y, z, R + 1.25, R + 1.35, 0.22, P.concreteDark);       // plinth (two tiers)
  g.cyl(x, y + 0.2, z, R + 0.85, R + 0.95, 0.2, P.concrete);
  col.add(x, 0, z, 2 * R, 0.4, 2 * R);                           // step up onto the floor
  const floorTop = y + 0.4;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const px = x + Math.cos(a) * R, pz = z + Math.sin(a) * R;
    g.cyl(px, floorTop, pz, 0.12, 0.14, postH, P.white);
    col.add(px, 0, pz, 0.42, postH + 0.4, 0.42);
  }
  const eaveY = floorTop + postH;
  g.cyl(x, eaveY, z, R + 0.95, R + 0.95, 0.22, P.offwhite);        // round eave
  g.cone(x, eaveY + 0.22, z, R + 1.15, 2.0, roof, 7);              // conical roof
  g.cyl(x, eaveY + 2.22, z, 0.14, 0.14, 0.5, roof);               // finial
}

// Parallel parking along the wide avenues (on the asphalt next to the curb).
// Skips spots inside cross-street intersections.
const CROSS = [-445, -335, -225, -115, 115, 225, 335, 445];
const nearCross = (v) => CROSS.some((c) => Math.abs(v - c) < 10);
function curbsideParking() {
  // x = 0 avenue (20 wide): east & west curb lanes hugging the curb at x = ±8.5
  for (const [zA, zB] of [[-405, -145], [145, 405]]) {
    for (let z = zA, k = 0; z <= zB; z += 26, k++) {
      if (hash(3, k, Math.round(zA)) % 3 === 0) continue; // leave gaps
      if (!nearCross(z)) parkedCar(null, null, 8.5, z, 0, hash(41, k, Math.round(zA)), 0.06);
      if (hash(4, k, Math.round(zA)) % 2 === 0 && !nearCross(z + 11))
        parkedCar(null, null, -8.5, z + 11, Math.PI, hash(42, k, Math.round(zA)), 0.06);
    }
  }
  // z = 0 avenue: north & south curb lanes at z = ±8.5
  for (const [xA, xB] of [[-405, -145], [145, 405]]) {
    for (let x = xA, k = 0; x <= xB; x += 26, k++) {
      if (hash(5, k, Math.round(xA)) % 3 === 0) continue;
      if (!nearCross(x)) parkedCar(null, null, x, -8.5, Math.PI / 2, hash(43, k, Math.round(xA)), 0.06);
      if (hash(6, k, Math.round(xA)) % 2 === 0 && !nearCross(x + 11))
        parkedCar(null, null, x + 11, 8.5, -Math.PI / 2, hash(44, k, Math.round(xA)), 0.06);
    }
  }
}

// Small plaza/market kiosk with a striped awning roof.
function kiosk(g, col, x, z, seed, ry = 0) {
  const a = pick(P.awnings, seed, 1);
  g.boxB(x, SIDEWALK_H, z, 2.6, 2.3, 2.6, P.offwhite, ry);
  g.prism(x, SIDEWALK_H + 2.3, z, 3.4, 1.1, 3.4, a, ry);
  const c = Math.cos(ry), s = Math.sin(ry);
  g.box(x + s * 1.35, SIDEWALK_H + 1.35, z + c * 1.35, 1.9, 1.1, 0.15, P.doorDark, ry);
  col.add(x, 0, z, 2.8, 3.4, 2.8, ry);
}

export { tree, scatterTrees, treeFill, bench, lamp, fountain, hedge, fenceRun,
  parkedCar, curbsideParking, planter, dumpster, pool, swingSet, flowerBed,
  slide, sandbox, gazebo, kiosk, trashCluster };
