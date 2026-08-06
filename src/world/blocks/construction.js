// A massive, cluttered construction site filling the 2x2 superblock centred at
// (555, 445) — the built dirt floor spans x[450,660] x z[340,550]. Everything
// here is authored on coordinate-seeded hashes (no Math.random), so the site is
// identical on every load.
//
// Layout, from the ground up:
//   * a raised sidewalk ring (like every block) carrying a wrought-iron site
//     fence just inside it, broken by a few walk-through gaps plus one wide
//     vehicle entrance on the south side (gate posts + a site sign);
//   * a churned DIRT floor, with darker MUD pits that slow anything crossing
//     them — see mudFactor()/MUD_PITS below, read by player.js to drag both
//     walking and driving down to ~72% inside a pit;
//   * tall, CLIMBABLE dirt spoil heaps (walkable height authored in island.js
//     as CONSTRUCTION_MOUNDS/moundHeight and folded into groundHeight; drawn
//     here as bare-dirt cones with no collider) plus scattered boulders;
//   * three unfinished concrete-skeleton buildings (column grids + poured floor
//     slabs, the top slab only half-done, rebar sprouting from the columns);
//   * a gravel parking area, a tower crane and parked construction vehicles
//     (bulldozer, excavator, dump truck, cement mixer) — none driveable;
//   * dense clutter (concrete beams, pipe bundles, rebar, pallets, jersey
//     barriers, cones, porta-potties, site containers) dropped into every open
//     pocket, plus loose brick/plank debris strewn across the dirt.
//
// Nothing rises through the perimeter fence line; the fence sits on the
// sidewalk band so the site reads as sealed except at its gaps.
import * as THREE from 'three';
import { PALETTE as P, SIDEWALK_H, INSET } from '../../core/palette.js';
import { hash, frac, pick } from '../../core/util.js';
import { CONSTRUCTION_MOUNDS, moundProf, moundHeight } from '../island.js';
import { slabAndSidewalk, cornerLamps, ironFence, parkingLotAt } from './kit.js';

const GY = SIDEWALK_H; // dirt/site surface height (top of the block slab)

// ---- mud slowdown -------------------------------------------------------
// Axis-aligned mud pits, in world coordinates inside the site's dirt floor.
// The visuals are drawn in buildConstruction(); these same rects answer the
// per-frame movement query below. Kept as module data (not derived inside the
// builder) so player.js can import the query without running the build first.
const MUD_SLOW = 0.72; // fraction of normal speed while over a pit (subtle drag)
export const MUD_PITS = [
  { x0: 540, z0: 452, x1: 576, z1: 484 }, // central, on the drive-in path
  { x0: 545, z0: 408, x1: 572, z1: 432 }, // just inside the vehicle entrance
  { x0: 600, z0: 350, x1: 632, z1: 378 }, // NE, beside the tall skeleton
  { x0: 460, z0: 446, x1: 494, z1: 480 }, // W, by the dump truck
  { x0: 508, z0: 360, x1: 536, z1: 386 }, // NW, under the first skeleton's yard
];

// Speed multiplier at (x, z): MUD_SLOW inside any mud pit, else 1. Cheap enough
// to call every frame (a handful of rectangle tests).
export function mudFactor(x, z) {
  for (const m of MUD_PITS) {
    if (x >= m.x0 && x <= m.x1 && z >= m.z0 && z <= m.z1) return MUD_SLOW;
  }
  return 1;
}

// ---- shared collider-occupancy test -------------------------------------
const _q = [];
function occupied(col, x, z, rad, limit) {
  col.query(x - rad, z - rad, x + rad, z + rad, _q);
  for (const idx of _q) {
    if (idx >= limit) continue;
    const b = col.boxes[idx];
    if (b.maxY < 0.5) continue; // ignore the block's ground slab / sidewalks
    if (x + rad > b.minX && x - rad < b.maxX && z + rad > b.minZ && z - rad < b.maxZ) return true;
  }
  return false;
}

// ---- site fence ---------------------------------------------------------
// One side of the perimeter fence, split around gap intervals. `along` = the
// axis the run travels ('x' → constant z=at; 'z' → constant x=at); `gaps` are
// [from, to] intervals (in the travelling axis) left open.
function fenceSide(g, col, along, at, lo, hi, gaps) {
  let segs = [[lo, hi]];
  for (const [ga, gb] of gaps) {
    const next = [];
    for (const [a, b] of segs) {
      if (gb <= a || ga >= b) { next.push([a, b]); continue; }
      if (ga > a) next.push([a, ga]);
      if (gb < b) next.push([gb, b]);
    }
    segs = next;
  }
  for (const [a, b] of segs) {
    if (along === 'x') ironFence(g, col, a, at, b, at, GY);
    else ironFence(g, col, at, a, at, b, GY);
  }
}

// ---- dirt terrain features ----------------------------------------------
// Climbable dirt spoil heaps. The WALKABLE height lives in island.js
// (CONSTRUCTION_MOUNDS + moundHeight, folded into groundHeight); here we only
// draw the matching bare-dirt surface. There is intentionally NO collider — the
// player climbs the raised terrain instead of being walled out. The mesh is
// built from the same moundProf() as the height query, so feet track the
// visible slope. Base rides at SIDEWALK_H so the rim meets the site floor.
const MOUND_DIRT = [P.dirt, P.dirtDark, P.dirtLight, P.gravel];

function buildMound(scene, m) {
  const SEG = 22;                                    // radial facets (low-poly)
  const ts = 0.06;                                   // summit-cap radius fraction
  const rings = [ts, 0.2, 0.36, 0.52, 0.68, 0.82, 0.92, 1];
  const seed = 6100 + Math.round(m.x) * 7 + Math.round(m.z);
  const pos = [], col = [];
  const c = new THREE.Color();
  const tri = (a, b, d, hex) => {
    c.set(hex);
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], d[0], d[1], d[2]);
    for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
  };
  const quad = (a, b, d, e, hex) => { tri(a, b, d, hex); tri(a, d, e, hex); };
  const pt = (s, t) => {
    const a = (2 * Math.PI * s) / SEG;
    return [m.x + Math.cos(a) * t * m.r, SIDEWALK_H + m.h * moundProf(t), m.z + Math.sin(a) * t * m.r];
  };
  const apex = [m.x, SIDEWALK_H + m.h, m.z];
  for (let s = 0; s < SEG; s++) {
    const s2 = s + 1;
    const shade = (k) => MOUND_DIRT[hash(seed + k, (s + k * 17)) % MOUND_DIRT.length];
    tri(apex, pt(s2, ts), pt(s, ts), shade(0));      // summit cap fan
    for (let k = 0; k < rings.length - 1; k++)
      quad(pt(s, rings[k]), pt(s2, rings[k]), pt(s2, rings[k + 1]), pt(s, rings[k + 1]), shade(k + 1));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
}

// True if (x,z) lies on (or just around) any climbable mound — used to keep the
// flat-ground scatter (mottle, debris, clutter, loose boulders) off the slopes.
function onMound(x, z, margin = 1.5) {
  for (const m of CONSTRUCTION_MOUNDS)
    if (Math.hypot(x - m.x, z - m.z) < m.r + margin) return true;
  return false;
}

// A big rough boulder (a couple of overlapping facets) with a collider. `base`
// is the ground height it sits on (GY on the flat floor, the mound surface for
// slope rocks).
function boulder(g, col, x, z, r, seed, base = GY) {
  g.ico(x, base + r * 0.75, z, r, P.rock);
  g.ico(x + r * 0.4, base + r * 0.55, z - r * 0.3, r * 0.6, P.rockDark);
  col.add(x, base, z, r * 1.7, r * 1.5, r * 1.7);
}

// ---- unfinished concrete building ---------------------------------------
// A skeleton: ground slab, a grid of concrete columns (some carrying rebar
// stubs), and poured floor slabs at each level. The topmost slab is only
// half-poured. No stairs — the upper slabs are just solid geometry overhead.
function unfinishedBuilding(g, col, cx, cz, w, d, floors, seed) {
  const fh = 3.4, colR = 0.42, slabT = 0.32;
  // ground slab
  g.boxB(cx, GY, cz, w, 0.28, d, P.concreteDark);
  col.add(cx, GY, cz, w, 0.28, d);
  // column grid
  const nx = Math.max(2, Math.round(w / 8)), nz = Math.max(2, Math.round(d / 8));
  const x0 = cx - w / 2 + colR, z0 = cz - d / 2 + colR;
  const dx = (w - 2 * colR) / (nx - 1), dz = (d - 2 * colR) / (nz - 1);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const px = x0 + i * dx, pz = z0 + j * dz;
    const grows = hash(seed, i, j) % 3 === 0; // a few columns already climb higher
    const h = floors * fh + (grows ? 0.6 + frac(seed, i, j) * fh * 0.8 : 0);
    g.boxB(px, GY + 0.28, pz, colR * 2, h, colR * 2, P.concrete);
    col.add(px, GY + 0.28, pz, colR * 2 + 0.15, h, colR * 2 + 0.15);
    if (grows) for (const [ox, oz] of [[-0.11, -0.11], [0.11, 0.11], [0.11, -0.11], [-0.11, 0.11]])
      g.box(px + ox, GY + 0.28 + h + 0.32, pz + oz, 0.045, 0.66, 0.045, P.rust); // rebar stubs
  }
  // poured floor slabs; the top one is only partly poured
  for (let f = 1; f <= floors; f++) {
    const y = GY + 0.28 + f * fh;
    if (f === floors) {
      const pw = w * (0.42 + frac(seed, f, 7) * 0.28);
      g.boxB(cx - w / 2 + pw / 2, y, cz, pw, slabT, d, P.concrete);
      col.add(cx - w / 2 + pw / 2, y, cz, pw, slabT, d);
      // exposed rebar mesh along the poured edge
      for (let k = 0; k < 6; k++)
        g.box(cx - w / 2 + pw + 0.3 + k * 0.35, y + slabT + 0.02, cz - d / 2 + 0.5 + k * (d - 1) / 6,
          0.9, 0.04, 0.04, P.rust);
    } else {
      g.boxB(cx, y, cz, w, slabT, d, P.concrete);
      col.add(cx, y, cz, w, slabT, d);
    }
  }
  // a partial poured core wall (lift shaft) rising the lower floors
  const coreH = Math.max(1, floors - 1) * fh;
  g.boxB(cx - w * 0.28, GY + 0.28, cz + d * 0.2, 0.35, coreH, d * 0.5, P.concreteDark);
  g.boxB(cx - w * 0.28 + 2.2, GY + 0.28, cz + d * 0.2 + d * 0.25 - 0.18, 4.4, coreH, 0.35, P.concreteDark);
  col.add(cx - w * 0.28, GY, cz + d * 0.2, 0.6, coreH, d * 0.5);
  // scaffolding down one long face (+x)
  scaffoldFace(g, col, cx + w / 2 + 0.7, cz, d, floors * fh, seed);
}

// A run of scaffolding: uprights, ledgers, and plank decks at each lift. Only
// the end uprights collide, so you can duck under it.
function scaffoldFace(g, col, x, cz, len, height, seed) {
  const STEEL = P.steel, PLANK = 0xb07a45;
  const bays = Math.max(2, Math.round(len / 3));
  const z0 = cz - len / 2, dz = len / bays;
  const lifts = Math.max(2, Math.round(height / 2));
  for (let i = 0; i <= bays; i++) {
    const pz = z0 + i * dz;
    for (const ox of [0, 1.0]) g.boxB(x + ox, GY, pz, 0.09, height + 0.4, 0.09, STEEL); // uprights
  }
  for (let l = 1; l <= lifts; l++) {
    const y = GY + l * (height / lifts);
    for (const ox of [0, 1.0]) g.box(x + ox, y, cz, 0.06, 0.06, len, STEEL); // ledgers
    g.box(x + 0.5, y + 0.06, cz, 1.0, 0.05, len, PLANK);                     // plank deck
    // a few diagonal-ish braces (yaw only) for texture
    if (l % 2 === 0) for (let i = 0; i < bays; i += 2)
      g.box(x + 0.5, y - (height / lifts) / 2, z0 + (i + 0.5) * dz, 0.05, 0.05, dz * 1.2, STEEL, 0.5);
  }
  col.add(x + 0.5, GY, z0, 1.4, height, 0.3);
  col.add(x + 0.5, GY, z0 + len, 1.4, height, 0.3);
}

// ---- vehicles (static, non-driveable) -----------------------------------
// Each takes a yaw `ry`; a small closure places base-anchored / centred boxes
// in the vehicle's local frame and one OBB collider for the hull.
function bulldozer(g, col, x, z, ry) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const bx = (dx, by, dz, sx, sy, sz, hex) => g.boxB(x + dx * c + dz * s, by, z - dx * s + dz * c, sx, sy, sz, hex, ry);
  const bc = (dx, cy, dz, sx, sy, sz, hex) => g.box(x + dx * c + dz * s, cy, z - dx * s + dz * c, sx, sy, sz, hex, ry);
  const Y = P.constrYellow, D = P.steel, T = 0x2a2a2c;
  bx(-1.1, GY, 0, 0.85, 0.9, 4.2, T); bx(1.1, GY, 0, 0.85, 0.9, 4.2, T);   // tracks
  bx(0, GY + 0.9, 0.1, 2.1, 1.05, 3.1, Y);                                 // hull
  bx(0, GY + 1.95, -0.7, 1.6, 1.25, 1.5, Y);                              // cab
  bc(0, GY + 2.15, -1.45, 1.25, 0.85, 0.1, P.glassDark);                  // windshield
  bx(0.62, GY + 1.95, 1.0, 0.16, 1.0, 0.16, D);                          // exhaust stack
  bx(0, GY + 0.15, 2.55, 2.8, 1.5, 0.32, D);                            // blade
  bc(-0.95, GY + 0.85, 1.9, 0.18, 0.18, 1.7, D); bc(0.95, GY + 0.85, 1.9, 0.18, 0.18, 1.7, D); // push arms
  col.add(x, 0, z, 3.0, GY + 2.6, 4.6, ry);
}

function excavator(g, col, x, z, ry) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const bx = (dx, by, dz, sx, sy, sz, hex) => g.boxB(x + dx * c + dz * s, by, z - dx * s + dz * c, sx, sy, sz, hex, ry);
  const bc = (dx, cy, dz, sx, sy, sz, hex) => g.box(x + dx * c + dz * s, cy, z - dx * s + dz * c, sx, sy, sz, hex, ry);
  const Y = P.constrYellow, D = P.steel, T = 0x2a2a2c;
  bx(-1.05, GY, 0, 0.8, 0.85, 3.8, T); bx(1.05, GY, 0, 0.8, 0.85, 3.8, T); // tracks
  bx(0, GY + 0.85, -0.3, 2.4, 1.0, 2.6, Y);                                // rotating house
  bx(-0.7, GY + 1.85, -0.7, 1.0, 1.3, 1.4, Y);                            // cab
  bc(-0.7, GY + 2.05, 0.05, 0.85, 0.9, 0.1, P.glassDark);                 // window
  bx(1.1, GY + 0.9, -1.0, 0.9, 0.9, 1.4, D);                            // counterweight
  // boom laid forward, then a dipper dropping to the bucket (right angles only)
  bc(0.5, GY + 1.5, 1.6, 0.5, 0.5, 3.4, Y);                             // boom (forward)
  bc(0.5, GY + 0.9, 3.4, 0.42, 1.7, 0.42, Y);                          // dipper (down)
  bx(0.5, GY, 3.85, 1.0, 0.7, 0.8, D);                                // bucket
  for (let i = 0; i < 4; i++) bc(0.5, GY + 0.15, 4.25, 0.7 - i * 0.12, 0.15, 0.12, D); // bucket teeth block
  col.add(x, 0, z, 3.0, GY + 2.6, 4.4, ry);
}

function dumpTruck(g, col, x, z, ry) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const bx = (dx, by, dz, sx, sy, sz, hex) => g.boxB(x + dx * c + dz * s, by, z - dx * s + dz * c, sx, sy, sz, hex, ry);
  const bc = (dx, cy, dz, sx, sy, sz, hex) => g.box(x + dx * c + dz * s, cy, z - dx * s + dz * c, sx, sy, sz, hex, ry);
  const Y = P.constrYellow, D = P.steel, T = 0x1f1f22;
  for (const dz of [-2.0, 0.9, 2.1]) { bc(-1.15, GY + 0.6, dz, 0.5, 1.1, 1.1, T); bc(1.15, GY + 0.6, dz, 0.5, 1.1, 1.1, T); } // wheels
  bx(0, GY + 1.0, 0.4, 2.4, 0.5, 5.2, D);                              // chassis
  bx(0, GY + 1.5, 2.7, 2.4, 1.7, 1.6, Y);                            // cab
  bc(0, GY + 2.15, 3.55, 2.0, 0.9, 0.1, P.glassDark);                // windshield
  bx(0, GY + 1.55, -0.5, 2.6, 1.7, 4.0, D);                        // dump bed
  bx(0, GY + 1.55, -2.5, 2.6, 2.0, 0.2, D);                       // tailgate
  col.add(x, 0, z, 2.7, GY + 3.4, 6.4, ry);
}

function cementMixer(g, col, x, z, ry) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const bx = (dx, by, dz, sx, sy, sz, hex) => g.boxB(x + dx * c + dz * s, by, z - dx * s + dz * c, sx, sy, sz, hex, ry);
  const bc = (dx, cy, dz, sx, sy, sz, hex) => g.box(x + dx * c + dz * s, cy, z - dx * s + dz * c, sx, sy, sz, hex, ry);
  const Y = P.constrOrange, D = P.steel, T = 0x1f1f22;
  for (const dz of [-2.2, 0.7, 2.0]) { bc(-1.15, GY + 0.6, dz, 0.5, 1.1, 1.1, T); bc(1.15, GY + 0.6, dz, 0.5, 1.1, 1.1, T); } // wheels
  bx(0, GY + 1.0, 0.0, 2.3, 0.5, 5.6, D);                            // chassis
  bx(0, GY + 1.5, 2.8, 2.3, 1.7, 1.6, Y);                          // cab
  bc(0, GY + 2.15, 3.65, 1.9, 0.9, 0.1, P.glassDark);              // windshield
  // drum: a fat faceted body (a couple of icos + a chute box) sitting on the bed
  g.ico(x + -1.4 * s, GY + 2.4, z + -1.4 * c, 1.5, P.concrete);
  g.ico(x + 0.2 * s, GY + 2.6, z + 0.2 * c, 1.7, P.concrete);
  bc(0, GY + 3.6, -2.6, 0.5, 1.6, 0.5, D);                        // chute
  col.add(x, 0, z, 2.6, GY + 4.0, 6.6, ry);
}

// Tower crane: a ballast base, a tall lattice-look mast, an operator cab, a jib
// (long, along -x here) with a counter-jib + counterweight, an A-frame apex,
// and a trolley + cable + hook block. Only base and mast collide.
function towerCrane(g, col, x, z) {
  const D = P.steel, Y = P.constrYellow, mastH = 30, mastW = 1.3;
  g.boxB(x, GY, z, 5, 1.1, 5, P.concreteDark); col.add(x, GY, z, 5, 1.1, 5);   // ballast base
  g.boxB(x, GY + 1.1, z, mastW, mastH, mastW, Y);                              // mast
  col.add(x, GY + 1.1, z, mastW + 0.4, mastH, mastW + 0.4);
  for (let k = 0; k < Math.floor(mastH / 3); k++) {                            // lattice bracing
    const y = GY + 1.1 + k * 3 + 1.5;
    g.box(x, y, z, mastW * 1.6, 0.1, 0.1, D, 0.6);
    g.box(x, y, z, 0.1, 0.1, mastW * 1.6, D, 0.6);
  }
  const topY = GY + 1.1 + mastH, jy = topY + 2.1;
  g.boxB(x + 1.3, topY, z, 2.2, 2.0, 2.4, Y);                                 // slewing / cab
  g.box(x - 13, jy, z, 26, 0.7, 1.0, Y);                                     // jib (along -x)
  g.box(x + 4.5, jy, z, 9, 0.6, 1.0, Y);                                    // counter-jib
  g.boxB(x + 9, jy - 1.5, z, 2.4, 1.6, 2.2, P.concreteDark);               // counterweight
  g.box(x, jy + 3.2, z, 0.3, 6.4, 0.3, D);                                // apex A-frame post
  const hx = x - 18;                                                       // trolley + hook
  g.box(hx, jy - 0.6, z, 0.9, 0.5, 1.0, D);
  g.box(hx, jy - 3.0, z, 0.06, 4.6, 0.06, 0x222222);                     // cable
  g.boxB(hx, jy - 6.0, z, 0.5, 0.7, 0.5, D);                            // hook block
}

// ---- small site props ---------------------------------------------------
// Shipping-container site office / store.
function siteContainer(g, col, x, z, ry, seed) {
  const body = pick([P.constrOrange, 0x3f6e50, 0x54606c, 0xb5893a], seed, 1);
  const c = Math.cos(ry), s = Math.sin(ry);
  g.boxB(x, GY, z, 6.0, 2.6, 2.5, body, ry);
  g.box(x, GY + 2.65, z, 6.1, 0.12, 2.6, P.roofDark, ry);            // roof cap
  g.box(x + 2.2 * s, GY + 1.2, z + 2.2 * c, 0.9, 1.9, 0.08, P.doorDark, ry); // door
  col.add(x, 0, z, 6.0, GY + 2.7, 2.5, ry);
}

// Porta-potty.
function portaPotty(g, col, x, z, ry, seed) {
  const body = pick([0x3f7e5a, 0x4a6b8a, 0xb5893a], seed, 2);
  const c = Math.cos(ry), s = Math.sin(ry);
  g.boxB(x, GY, z, 1.3, 2.3, 1.3, body, ry);
  g.box(x, GY + 2.35, z, 1.35, 0.1, 1.35, P.roofDark, ry);
  g.box(x + 0.66 * s, GY + 1.15, z + 0.66 * c, 0.85, 1.6, 0.06, P.doorDark, ry);
  col.add(x, 0, z, 1.3, GY + 2.4, 1.3, ry);
}

// A crossed stack of concrete/steel beams (girders).
function beamPile(g, col, x, z, ry, seed) {
  const hex = hash(seed, 1) % 3 === 0 ? P.rust : P.concrete;
  const c = Math.cos(ry), s = Math.sin(ry);
  const L = 6 + frac(seed, 2) * 3;
  for (let k = 0; k < 3; k++) {
    const y = GY + 0.18 + k * 0.34;
    const off = (k - 1) * 0.5;
    g.box(x + off * c, y, z - off * s, 0.32, 0.32, L, hex, ry);
  }
  g.box(x, GY + 0.18 + 3 * 0.34, z, 0.32, 0.32, L * 0.9, hex, ry + Math.PI / 2); // one crossed on top
  col.add(x, GY, z, Math.max(1.5, L * Math.abs(s) + 1), 1.5, Math.max(1.5, L * Math.abs(c) + 1), 0);
}

// A bundle of upright concrete pipe/culvert sections (stored on end).
function pipeBundle(g, col, x, z, seed) {
  let k = 0;
  for (const [ox, oz] of [[-1, -0.6], [1, -0.6], [0, 0.6], [-2, 0.5], [2, 0.5]]) {
    const h = 1.4 + frac(seed, k, 3) * 0.8;
    g.cyl(x + ox, GY, z + oz, 0.55, 0.6, h, P.concrete, 10);
    g.cyl(x + ox, GY + 0.02, z + oz, 0.36, 0.4, h - 0.04, P.concreteDark, 10); // bore
    col.add(x + ox, GY, z + oz, 1.2, h, 1.2);
    k++;
  }
}

// A tied bundle of rebar lying on the dirt.
function rebarBundle(g, col, x, z, ry) {
  const c = Math.cos(ry), s = Math.sin(ry);
  for (let i = 0; i < 6; i++) {
    const off = (i - 2.5) * 0.14;
    g.box(x + off * c, GY + 0.16, z - off * s, 0.06, 0.06, 5.2, P.rust, ry);
  }
  for (const tz of [-1.8, 1.8]) g.box(x, GY + 0.18, z + tz * c, 0.9, 0.09, 0.09, 0x222222, ry); // ties
  col.add(x, GY, z, 1.2, 0.4, 5.4, 0);
}

// A wooden pallet stacked with material (bricks / cement bags).
function pallet(g, col, x, z, ry, seed) {
  const c = Math.cos(ry), s = Math.sin(ry);
  g.boxB(x, GY, z, 2.2, 0.16, 1.6, 0x9c6b3f, ry);        // pallet deck
  const kind = hash(seed, 1) % 2;
  if (kind === 0) { // brick cube
    g.boxB(x, GY + 0.16, z, 1.9, 1.0, 1.3, P.constrOrange, ry);
    for (let r = 0; r < 4; r++) for (let cc = 0; cc < 5; cc++)   // face courses
      g.box(x + (cc - 2) * 0.36 * c, GY + 0.35 + r * 0.24, z - (cc - 2) * 0.36 * s + 0.66 * c, 0.3, 0.2, 0.06, 0xb5502f, ry);
  } else { // stacked bags
    for (let b = 0; b < 5; b++) {
      const by = GY + 0.16 + (b % 3) * 0.28;
      const ox = ((b % 2) - 0.5) * 0.6, oz = (b < 3 ? -0.3 : 0.3);
      g.boxB(x + ox * c + oz * s, by, z - ox * s + oz * c, 0.85, 0.26, 0.5, P.offwhite, ry);
    }
  }
  col.add(x, GY, z, 2.4, 1.3, 1.8, ry);
}

// A jersey barrier (tapered concrete, faked as a stepped box).
function jerseyBarrier(g, col, x, z, ry) {
  const c = Math.cos(ry), s = Math.sin(ry);
  g.boxB(x, GY, z, 0.6, 0.35, 3.0, P.concrete, ry);
  g.boxB(x, GY + 0.35, z, 0.36, 0.65, 3.0, P.concrete, ry);
  col.add(x, GY, z, Math.max(0.7, 3.0 * Math.abs(s) + 0.7), 1.0, Math.max(0.7, 3.0 * Math.abs(c) + 0.7), 0);
}

// A small cluster of traffic cones.
function coneCluster(g, col, x, z, seed) {
  let k = 0;
  for (const [ox, oz] of [[0, 0], [0.9, 0.4], [-0.7, 0.7], [0.3, -0.9]]) {
    if (hash(seed, k, 5) % 4 === 0) { k++; continue; }
    g.cone(x + ox, GY, z + oz, 0.32, 0.75, P.constrOrange, 7);
    g.box(x + ox, GY + 0.42, z + oz, 0.5, 0.12, 0.5, P.white); // reflective band
    k++;
  }
}

// A tall work-light (flood) tower.
function floodTower(g, col, x, z, ry) {
  const c = Math.cos(ry), s = Math.sin(ry);
  g.cyl(x, GY, z, 0.1, 0.14, 7.5, P.steel, 6);
  const hx = x + 0.6 * s, hz = z + 0.6 * c;
  for (const ox of [-0.5, 0.5]) g.box(hx + ox * c, GY + 7.4, hz - ox * s, 0.6, 0.4, 0.25, P.steel, ry);
  for (const ox of [-0.5, 0.5]) g.glowBox(hx + ox * c, GY + 7.4, hz - ox * s, 0.5, 0.32, 0.1, P.lampWarm, ry);
  col.add(x, GY, z, 0.4, 7.5, 0.4);
}

// ---- main entry ---------------------------------------------------------
function buildConstruction(g, col, b, seed, scene) {
  // Raised sidewalk ring + a churned dirt floor filling the interior.
  const r = slabAndSidewalk(g, col, b, P.dirt);

  // Mottle the dirt with broad lighter/darker patches for texture. Decals must
  // clear the 0.18 dirt top, so they ride at ~0.19 with staggered heights to
  // avoid coplanar z-fighting among themselves.
  for (let k = 0; k < 40; k++) {
    const px = r.x0 + 3 + frac(hash(seed, k, 11), 5) * (r.x1 - r.x0 - 6);
    const pz = r.z0 + 3 + frac(hash(seed, k, 12), 9) * (r.z1 - r.z0 - 6);
    if (onMound(px, pz)) continue;
    const shade = hash(seed, k, 13) % 2 ? P.dirtDark : P.dirtLight;
    g.boxB(px, GY, pz, 5 + frac(seed, k, 14) * 7, 0.035 + (k % 4) * 0.006, 5 + frac(seed, k, 15) * 7,
      shade, frac(seed, k, 16) * Math.PI);
  }

  // Mud pits: dark pools that slow crossing (see mudFactor). Layered decals
  // above the dirt top — pit / rim / sheen at slightly increasing heights.
  for (const m of MUD_PITS) {
    const mx = (m.x0 + m.x1) / 2, mz = (m.z0 + m.z1) / 2;
    const mw = m.x1 - m.x0, md = m.z1 - m.z0;
    g.boxB(mx, GY, mz - md / 2, mw + 1.4, 0.052, 1.4, P.dirtDark); // churned rims
    g.boxB(mx, GY, mz + md / 2, mw + 1.4, 0.052, 1.4, P.dirtDark);
    g.boxB(mx, GY, mz, mw, 0.056, md, P.mud);                     // pit
    g.boxB(mx, GY, mz, mw - 2.2, 0.06, md - 2.2, 0x5a4630);       // wet sheen centre
  }

  // Tall, climbable dirt spoil heaps: the walkable height lives in island.js
  // (moundHeight, folded into groundHeight); here we just draw the matching
  // bare-dirt surface, then dot a few boulders onto each flank for texture
  // (seated on the mound surface via moundHeight, so they don't float).
  for (const m of CONSTRUCTION_MOUNDS) {
    buildMound(scene, m);
    for (let k = 0; k < 3; k++) {
      const a = frac(hash(seed, Math.round(m.x), k), 5) * Math.PI * 2;
      const q = 0.42 + frac(hash(seed, Math.round(m.z), k), 9) * 0.28; // mid-flank
      const bx = m.x + Math.cos(a) * q * m.r, bz = m.z + Math.sin(a) * q * m.r;
      boulder(g, col, bx, bz, 0.8 + frac(seed, k, 23) * 0.7, hash(seed, k, 24), moundHeight(bx, bz));
    }
  }

  // Loose boulders strewn across the flat floor (kept off the mounds/structures).
  for (let k = 0; k < 12; k++) {
    const px = r.x0 + 6 + frac(hash(seed, k, 21), 5) * (r.x1 - r.x0 - 12);
    const pz = r.z0 + 6 + frac(hash(seed, k, 22), 9) * (r.z1 - r.z0 - 12);
    if (onMound(px, pz) || occupied(col, px, pz, 3, col.boxes.length)) continue;
    boulder(g, col, px, pz, 1.0 + frac(seed, k, 23) * 1.4, hash(seed, k, 24));
  }

  // Gravel parking area (worker cars) in the SE corner.
  parkingLotAt(g, col, 620, 505, 48, 40, GY, hash(seed, 7), 0, null, 6, P.gravel, P.dirtDark);

  // Three unfinished concrete skeletons.
  unfinishedBuilding(g, col, 497, 392, 34, 26, 3, hash(seed, 31));
  unfinishedBuilding(g, col, 600, 398, 30, 30, 4, hash(seed, 32));
  unfinishedBuilding(g, col, 512, 505, 30, 22, 2, hash(seed, 33));

  // Tower crane reaching over the tall skeleton (jib points -x, into the site).
  towerCrane(g, col, 641, 415);

  // Parked construction vehicles.
  bulldozer(g, col, 520, 430, -0.6);
  excavator(g, col, 583, 468, 2.3);
  dumpTruck(g, col, 472, 500, 1.2);
  cementMixer(g, col, 486, 352, -0.4);

  // Site containers, porta-potties, flood lights.
  siteContainer(g, col, 632, 470, Math.PI / 2, hash(seed, 41));
  siteContainer(g, col, 468, 470, -Math.PI / 2, hash(seed, 42));
  portaPotty(g, col, 645, 490, Math.PI, hash(seed, 43));
  portaPotty(g, col, 646.4, 490, Math.PI, hash(seed, 44));
  floodTower(g, col, 534, 452, 0); // moved off the N-central spoil heap
  floodTower(g, col, 470, 525, 0);
  floodTower(g, col, 640, 360, 0);

  // Clutter scatter: drop a random small item into every open pocket.
  let ck = 0;
  for (let gx = r.x0 + 9; gx < r.x1 - 9; gx += 12.5) {
    for (let gz = r.z0 + 9; gz < r.z1 - 9; gz += 12.5) {
      const px = gx + (frac(seed, ck, 51) - 0.5) * 9;
      const pz = gz + (frac(seed, ck, 52) - 0.5) * 9;
      ck++;
      if (px < r.x0 + 5 || px > r.x1 - 5 || pz < r.z0 + 5 || pz > r.z1 - 5) continue;
      if (px > 543 && px < 567 && pz > 430) continue; // keep the vehicle entrance drive-in clear
      if (onMound(px, pz) || occupied(col, px, pz, 3.5, col.boxes.length)) continue;
      const ry = frac(seed, ck, 53) * Math.PI;
      const kind = hash(seed, ck, 54) % 8;
      const s2 = hash(seed, ck, 55);
      if (kind === 0 || kind === 1) beamPile(g, col, px, pz, ry, s2);
      else if (kind === 2) pipeBundle(g, col, px, pz, s2);
      else if (kind === 3) rebarBundle(g, col, px, pz, ry);
      else if (kind === 4) pallet(g, col, px, pz, ry, s2);
      else if (kind === 5) jerseyBarrier(g, col, px, pz, ry);
      else if (kind === 6) coneCluster(g, col, px, pz, s2);
      else portaPotty(g, col, px, pz, ry, s2);
    }
  }

  // Loose debris: bricks, planks and rubble strewn flat over the dirt.
  const DEBRIS = [P.constrOrange, 0xb5502f, P.concrete, P.concreteDark, 0x9c6b3f, P.rust, P.gravel];
  for (let k = 0; k < 150; k++) {
    const px = r.x0 + 2 + frac(hash(seed, k, 61), 5) * (r.x1 - r.x0 - 4);
    const pz = r.z0 + 2 + frac(hash(seed, k, 62), 9) * (r.z1 - r.z0 - 4);
    if (onMound(px, pz)) continue;
    g.boxB(px, GY + 0.02, pz, 0.3 + frac(seed, k, 63) * 0.5, 0.09 + (k % 3) * 0.03, 0.2 + frac(seed, k, 64) * 0.35,
      DEBRIS[hash(seed, k, 65) % DEBRIS.length], frac(seed, k, 66) * Math.PI);
  }

  // Wrought-iron site fence on the sidewalk band, with walk gaps + one wide
  // vehicle entrance (south side, aligned with the central drive-in).
  fenceSide(g, col, 'x', r.z1, r.x0, r.x1, [[549, 561], [600, 603]]); // south (vehicle gap)
  fenceSide(g, col, 'x', r.z0, r.x0, r.x1, [[490, 493], [610, 613]]); // north
  fenceSide(g, col, 'z', r.x0, r.z0, r.z1, [[400, 403], [500, 503]]); // west
  fenceSide(g, col, 'z', r.x1, r.z0, r.z1, [[380, 383], [470, 473]]); // east

  // Gate posts flanking the vehicle entrance.
  for (const gx of [548, 562]) {
    g.boxB(gx, GY, r.z1, 0.6, 2.4, 0.6, P.concreteDark);
    col.add(gx, GY, r.z1, 0.6, 2.4, 0.6);
  }

  cornerLamps(g, col, b);
}

export { buildConstruction };
