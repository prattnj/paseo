// The Nosh Munitions Works: a war-worn WW2-era European manufacturing plant
// sprawling across the empty grass cape on the island's southern tip, south of
// the street grid and comfortably inside the coastal parkway. Like arena.js /
// dragstrip.js / lighthouse.js it is a hand-placed WORLD-COORDINATE feature,
// not a CITY grid entry — the cape spills outside the developed grid.
//
// Layout (world metres, +z is south): a single long brick assembly hall runs
// dead east-west across the cape (the "very long in x" mass), its roof a
// serrated row of gable monitors. A taller brick boiler house caps the east
// end, and a cluster of four tapering brick smokestacks rises behind it — the
// only animated part of the plant, each belching a rising column of dark sooty
// smoke (the Smoke class, constructed & updated in main.js alongside the
// Lighthouse). The south yard is a cracked concrete apron carrying a rail
// siding with rolling stock, a portal gantry crane, riveted storage tanks and
// a lattice-legged water tower, all ringed by a battered brick perimeter wall
// with a north gate facing the city. It has taken bomb damage: a couple of
// roof bays are caved in, wall sections are blown out, and rubble is strewn
// through the yard.
//
// Everything static is drawn into the shared city GeoBatch + Colliders and is
// solid scenery (the player walks the yard, not the halls). All "variety" —
// window damage, brick shading, rubble, crowds of rivets — is coordinate- or
// index-seeded via hash/frac; there is no Math.random anywhere.
import * as THREE from 'three';
import { hash, frac } from '../../core/util.js';
import { PALETTE as P } from '../../core/palette.js';
import { TOP_Y } from '../island.js';

const GY = TOP_Y;                 // plateau surface the whole plant sits on

// ---- overall placement --------------------------------------------------
// The whole plant is authored in a LOCAL frame (constants below sit around
// x∈[254,562], z∈[778,852]) and then translated west by OX at build time. The
// grass cape is a diagonal wedge — its plateau edge cuts from x≈560 at the
// north (z=778) down to x≈330 at the south (z=852) — so the originally-authored
// eastern third hung out over the beach/sea. Shifting the whole complex ~238m
// west drops it fully onto the plateau, clearing the coastal parkway too, while
// keeping every internal dimension intact. Tune OX/OZ to reposition; everything
// (geometry + colliders + smoke) rides the same offset.
const OX = -265, OZ = 6;

// The main hall is the long central mass; the boiler house + stacks sit at its
// east end; the open south strip is the rail/crane/tank yard.
const HALL_X0 = 262, HALL_X1 = 498;      // hall footprint (x): 236m long
const HALL_Z0 = 786, HALL_Z1 = 826;      // hall footprint (z): 40m deep
const HALL_ZC = (HALL_Z0 + HALL_Z1) / 2; // 806
const WALL_H = 16;                        // eaves height (brick wall top)
const WALL_TOP = GY + WALL_H;
const PLINTH_H = 1.6;                     // dark base course
const GABLE_H = 4.4;                      // serrated roof-monitor rise
const BAYS = 16;                          // roof gable bays along x
const BAY_W = (HALL_X1 - HALL_X0) / BAYS; // 14.75m
const COLLAPSED = new Set([5, 11]);       // bomb-caved roof bays

const BOIL_X0 = 498, BOIL_X1 = 544;       // boiler house (east end), taller
const BOIL_Z0 = 790, BOIL_Z1 = 824;
const BOIL_H = 22;

// The four smokestacks — [x, z, height, baseRadius]. Exported so the animated
// Smoke system can emit from each mouth. Clustered on/behind the boiler house.
export const STACKS = [
  { x: 512, z: 797, h: 44, r: 3.3 },
  { x: 510, z: 817, h: 47, r: 3.5 },
  { x: 531, z: 806, h: 37, r: 2.9 },
  { x: 540, z: 795, h: 32, r: 2.6 },
];

// ============================================================================
//  STATIC BUILD
// ============================================================================

// ---- yard groundwork: cracked concrete apron ----------------------------
// A single flat concrete pad under the whole complex (no collider, like the
// grid roads — the player just walks across it), broken up with seeded darker
// patches, oil stains and a couple of shallow bomb craters so it reads as a
// hard-used, shelled works yard rather than a clean slab.
const YARD_X0 = 254, YARD_X1 = 563, YARD_Z0 = 777, YARD_Z1 = 852;
function apron(g) {
  const w = YARD_X1 - YARD_X0, d = YARD_Z1 - YARD_Z0;
  g.boxB((YARD_X0 + YARD_X1) / 2, GY - 0.02, (YARD_Z0 + YARD_Z1) / 2, w, 0.08, d, P.concrete);
  // seeded grime / cracked-slab patches
  for (let i = 0; i < 90; i++) {
    const x = YARD_X0 + frac(i, 1, 7) * w;
    const z = YARD_Z0 + frac(i, 2, 3) * d;
    const s = hash(i, 5) % 6;
    const sx = 2 + frac(i, 3, 9) * 6, sz = 2 + frac(i, 4, 11) * 6;
    const hex = s < 2 ? P.concreteDark : s < 3 ? P.dirt : P.gravel;
    g.boxB(x, GY - 0.015, z, sx, 0.05, sz, hex);
  }
  // shallow shell craters: a scorched dark disc rimmed with a low rubble ring
  for (const [cx, cz, cr] of [[330, 842, 6], [470, 838, 5]]) {
    g.boxB(cx, GY - 0.01, cz, cr * 2, 0.06, cr * 2, P.sootBlack);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const rr = cr + 0.5 + frac(cx + i, cz, 3) * 1.2;
      const bx = cx + Math.cos(a) * rr, bz = cz + Math.sin(a) * rr;
      g.ico(bx, GY + 0.25, bz, 0.5 + frac(i, cx, 2) * 0.4, i % 2 ? P.brickDark : P.rockDark);
    }
  }
}

// ---- brick wall helpers -------------------------------------------------
// A soot-graded brick shade for a given spot: courses read darker low down and
// (near the stacks) toward the east, lighter where the sun catches — all from
// a coordinate hash so it's stable and faceted, never noisy.
function brickShade(x, y, z) {
  const s = hash(Math.round(x), Math.round(y * 2), Math.round(z)) % 8;
  if (y < GY + PLINTH_H) return P.brickDark;         // plinth course
  if (x > 480 && s < 4) return P.brickSoot;          // soot plume off the stacks
  return s < 2 ? P.brickDark : s < 3 ? P.brickLight : P.brick;
}

// One long brick wall face (a flat panel plus a dark plinth and a proud corbel
// band under the eaves), tinted per-spot. Runs along x (horiz=true) or z.
function brickWall(g, cx, cz, len, top, hex, horiz) {
  const sx = horiz ? len : 1.2, sz = horiz ? 1.2 : len;
  g.boxB(cx, GY, cz, sx, top - GY, sz, hex);                       // main panel
  g.boxB(cx, GY, cz, sx + 0.3, PLINTH_H, sz + 0.3, P.brickDark);   // plinth
  g.boxB(cx, top - 0.9, cz, sx + 0.35, 0.9, sz + 0.35, P.brickLight); // corbel band
}

// A row of tall factory windows set into a wall face, with brick pilaster
// buttresses between them. `n` windows evenly spaced from a0..a1 along the wall
// axis (x if horiz else z), at fixed offset `off` on the other axis, facing
// `face` (+1/-1). War damage: a seeded fraction are blown out to dark voids and
// a few panes are cracked/boarded.
function windowRow(g, horiz, a0, a1, off, face, seed, sillH = 3.2, winH = 8.5, winW = 2.6) {
  const n = Math.max(1, Math.round((a1 - a0) / 5.2));
  const step = (a1 - a0) / n;
  for (let i = 0; i < n; i++) {
    const a = a0 + step * (i + 0.5);
    const x = horiz ? a : off, z = horiz ? off : a;
    const s = hash(seed, i * 17 + 3);
    const blown = s % 5 === 0;                          // ~20% shelled out
    const wx = horiz ? winW : 0.5, wz = horiz ? 0.5 : winW;
    const fx = horiz ? 0 : face * 0.35, fz = horiz ? face * 0.35 : 0;
    if (blown) {
      // ragged dark void with a bit of twisted frame left in it
      g.boxB(x + fx, GY + sillH, z + fz, wx, winH, wz, P.sootBlack);
      g.box(x + fx, GY + sillH + winH * (0.3 + frac(s, 2) * 0.4), z + fz,
        wx * 0.9, 0.18, wz * 0.9, P.steel);
    } else {
      const dim = s % 3 === 0;                          // some panes dark/boarded
      g.boxB(x + fx, GY + sillH, z + fz, wx, winH, wz, dim ? P.brickSoot : P.factoryGlass);
      // muntins: a couple of thin light bars breaking the pane into lights
      for (let k = 1; k <= 2; k++)
        g.boxB(x + fx * 1.05, GY + sillH + (winH * k) / 3, z + fz * 1.05,
          wx * 1.02, 0.16, wz * 1.02, P.brickLight);
    }
    // pilaster buttress to the right of each window (proud brick strip)
    const px = horiz ? a + step / 2 : off, pz = horiz ? off : a + step / 2;
    g.boxB(px, GY, pz, horiz ? 1.1 : 1.7, WALL_H, horiz ? 1.7 : 1.1,
      brickShade(px, GY + 6, pz));
  }
}

// ---- the assembly hall --------------------------------------------------
function hall(g, col) {
  // four brick wall faces
  brickWall(g, (HALL_X0 + HALL_X1) / 2, HALL_Z0, HALL_X1 - HALL_X0, WALL_TOP, P.brick, true);
  brickWall(g, (HALL_X0 + HALL_X1) / 2, HALL_Z1, HALL_X1 - HALL_X0, WALL_TOP, P.brick, true);
  brickWall(g, HALL_X0, HALL_ZC, HALL_Z1 - HALL_Z0, WALL_TOP, P.brick, false);
  brickWall(g, HALL_X1, HALL_ZC, HALL_Z1 - HALL_Z0, WALL_TOP, P.brick, false);

  // window bands down both long walls, and a shorter band on the west gable end
  windowRow(g, true, HALL_X0 + 4, HALL_X1 - 4, HALL_Z0 - 0.2, -1, hash(9001, 1));
  windowRow(g, true, HALL_X0 + 4, HALL_X1 - 4, HALL_Z1 + 0.2, 1, hash(9001, 2));
  windowRow(g, false, HALL_Z0 + 4, HALL_Z1 - 4, HALL_X0 - 0.2, -1, hash(9001, 3), 3.2, 7.5, 2.4);

  // a big blown-out cargo doorway on the west end (dark recess, buckled lintel)
  g.boxB(HALL_X0 - 0.3, GY, HALL_ZC, 1.4, 9, 9, P.sootBlack);
  g.boxB(HALL_X0 + 0.1, GY + 9, HALL_ZC, 1.8, 1.1, 10, P.brickDark);

  // dark interior ceiling closing the hall from below (so caved bays and the
  // gaps between monitors never show open sky-through)
  g.boxB((HALL_X0 + HALL_X1) / 2, WALL_TOP - 0.3, HALL_ZC,
    HALL_X1 - HALL_X0 - 0.5, 0.3, HALL_Z1 - HALL_Z0 - 0.5, P.sootBlack);

  // serrated roof: one gable monitor per bay (ridge running across z), butted
  // along x so they roof the hall. Bombed bays are skipped and left as caved-in
  // wreckage instead.
  const depth = HALL_Z1 - HALL_Z0;
  for (let i = 0; i < BAYS; i++) {
    const cx = HALL_X0 + BAY_W * (i + 0.5);
    if (COLLAPSED.has(i)) { collapsedBay(g, cx); continue; }
    const hex = i % 2 ? P.roofDark : P.roofLight;
    g.prism(cx, WALL_TOP, HALL_ZC, depth, GABLE_H, BAY_W, hex, Math.PI / 2);
    // north-facing glazed clerestory strip in the ridge (the "north light")
    g.boxB(cx - BAY_W * 0.18, WALL_TOP + 0.3, HALL_ZC, BAY_W * 0.28, GABLE_H * 0.7, depth * 0.96,
      P.factoryGlass);
  }

  // solid collision. The brick walls, pilaster buttresses and window reveals
  // all stand PROUD of the footprint edge (by up to ~0.9m), so a footprint-sized
  // collider lets the player clip into that outer skin. Grow it a metre on every
  // side to meet the outer wall face. Two axis-aligned halves span the length.
  const EXP = 1.0;
  const cz = (HALL_Z1 - HALL_Z0) + 2 * EXP;
  const x0 = HALL_X0 - EXP, x1 = HALL_X1 + EXP, mid = (x0 + x1) / 2;
  col.add((x0 + mid) / 2, GY, HALL_ZC, mid - x0, WALL_H, cz);
  col.add((mid + x1) / 2, GY, HALL_ZC, x1 - mid, WALL_H, cz);
}

// A caved-in roof bay: no monitor, a scorched gap edged with a broken brick
// parapet, crossed by a few charred roof trusses fallen at angles, with rubble
// heaped on the ceiling below.
function collapsedBay(g, cx) {
  const depth = HALL_Z1 - HALL_Z0;
  // jagged remnant parapet along the two long edges of the gap
  for (const dz of [HALL_Z0 + 0.6, HALL_Z1 - 0.6]) {
    for (let k = 0; k < 5; k++) {
      const bx = cx - BAY_W / 2 + BAY_W * ((k + 0.5) / 5);
      const h = 0.6 + frac(bx, dz, k) * 1.4;
      g.boxB(bx, WALL_TOP, dz, BAY_W / 5, h, 1.0, P.brickDark);
    }
  }
  // charred fallen trusses slumped across the hole
  for (let k = 0; k < 4; k++) {
    const bx = cx - BAY_W / 3 + (k / 3) * BAY_W * 0.66;
    g.box(bx, WALL_TOP + 0.4, HALL_ZC + (frac(bx, k, 2) - 0.5) * depth * 0.5,
      0.35, 0.35, depth * (0.7 + frac(k, bx, 5) * 0.3), P.sootBlack,
      (frac(bx, k, 7) - 0.5) * 0.5);
  }
  // rubble heaped on the ceiling at the bottom of the hole
  for (let k = 0; k < 7; k++)
    g.ico(cx + (frac(k, 1) - 0.5) * BAY_W, WALL_TOP - 0.1 + frac(k, 2) * 0.6,
      HALL_ZC + (frac(k, 3) - 0.5) * depth * 0.7, 0.5 + frac(k, 4) * 0.6,
      k % 2 ? P.brick : P.brickDark);
}

// ---- boiler house + smokestacks -----------------------------------------
function boilerHouse(g, col) {
  const cx = (BOIL_X0 + BOIL_X1) / 2, cz = (BOIL_Z0 + BOIL_Z1) / 2;
  const w = BOIL_X1 - BOIL_X0, d = BOIL_Z1 - BOIL_Z0;
  // tall soot-blackened brick block
  g.boxB(cx, GY, cz, w, BOIL_H, d, P.brickSoot);
  g.boxB(cx, GY, cz, w + 0.3, PLINTH_H, d + 0.3, P.brickDark);
  g.boxB(cx, GY + BOIL_H - 1.0, cz, w + 0.35, 1.0, d + 0.35, P.brickDark); // cornice
  // a few grimy windows on its north face
  windowRow(g, true, BOIL_X0 + 3, BOIL_X1 - 3, BOIL_Z0 - 0.2, -1, hash(9007, 1), 4, 6, 2.2);
  // low-pitch roof (ridge along the long x-axis; ry=0 so it doesn't overhang
  // the z faces — the earlier PI/2 rotated the 46m ridge onto the 34m axis)
  g.prism(cx, GY + BOIL_H, cz, w, 2.5, d, P.roofDark);
  col.add(cx, GY, cz, w + 0.8, BOIL_H, d + 0.8);

  // the four tapering brick chimneys
  for (const s of STACKS) smokestack(g, col, s);
}

function smokestack(g, col, { x, z, h, r }) {
  // tapered soot-blackened brick shaft with a wider footing and a couple of
  // lighter string-course bands, capped by a pale rim at the mouth
  const rTop = r * 0.72;
  g.cyl(x, GY, z, r * 1.25, r * 1.35, 1.5, P.brickDark);      // splayed footing
  g.cyl(x, GY + 1.5, z, rTop, r, h - 1.5, P.brickSoot);       // shaft
  for (const f of [0.4, 0.7])
    g.cyl(x, GY + h * f, z, r * (1 - f * 0.28) + 0.15, r * (1 - f * 0.28) + 0.15, 0.7, P.brick);
  g.cyl(x, GY + h - 1.2, z, rTop + 0.3, rTop + 0.3, 1.2, P.brickLight); // pale mouth rim
  // octagon collider (flats + 45° pair) like the lighthouse's round tiers
  col.add(x, GY, z, r * 2, h, r * 2, 0);
  col.add(x, GY, z, r * 2, h, r * 2, Math.PI / 4);
}

// ---- riveted storage tanks (SW corner of the yard) ----------------------
function tanks(g, col) {
  const spots = [[288, 838, 6.2, 13], [310, 846, 5.2, 11], [335, 840, 6.8, 15]];
  for (let i = 0; i < spots.length; i++) {
    const [x, z, r, h] = spots[i];
    const body = i === 1 ? P.rust : P.steel;
    g.cyl(x, GY, z, r + 0.2, r + 0.4, 0.6, P.concreteDark);   // pad
    g.cyl(x, GY + 0.6, z, r, r, h, body);                     // tank body
    // riveted hoop bands
    for (let k = 1; k <= 3; k++)
      g.cyl(x, GY + 0.6 + (h * k) / 4, z, r + 0.12, r + 0.12, 0.35, P.rust);
    g.cyl(x, GY + 0.6 + h, z, r * 0.9, r, 1.3, P.roofDark);   // shallow conical-ish top
    g.ico(x, GY + 0.6 + h + 1.4, z, 0.5, P.steel);            // vent cap
    col.add(x, GY, z, r * 2, h, r * 2, 0);
    col.add(x, GY, z, r * 2, h, r * 2, Math.PI / 4);
  }
}

// ---- lattice-legged water tower (NW corner) -----------------------------
function waterTower(g, col) {
  const x = 296, z = 792, legTop = 17, tankR = 5, tankH = 8;
  const spread = 4.6;
  const legs = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  // vertical lattice legs (GeoBatch boxes only yaw, never tilt, so the legs
  // stand straight rather than splaying — the low-poly read is fine)
  for (const [sx, sz] of legs) {
    const bx = x + sx * spread, bz = z + sz * spread;
    g.box(bx, GY + legTop / 2, bz, 0.5, legTop, 0.5, P.steel);
    col.add(bx, GY, bz, 0.9, legTop, 0.9);
  }
  // cross bracing between the legs at two heights (X-braces read as lattice)
  for (const hy of [legTop * 0.42, legTop * 0.78]) {
    g.box(x, GY + hy, z + spread, spread * 2, 0.22, 0.22, P.steel); // north tie
    g.box(x, GY + hy, z - spread, spread * 2, 0.22, 0.22, P.steel); // south tie
    g.box(x + spread, GY + hy, z, 0.22, 0.22, spread * 2, P.steel); // east tie
    g.box(x - spread, GY + hy, z, 0.22, 0.22, spread * 2, P.steel); // west tie
  }
  // riveted tank + conical roof + finial
  g.cyl(x, GY + legTop, z, tankR, tankR, tankH, P.rust);
  for (let k = 1; k <= 2; k++)
    g.cyl(x, GY + legTop + (tankH * k) / 3, z, tankR + 0.12, tankR + 0.12, 0.35, P.steel);
  g.cone(x, GY + legTop + tankH, z, tankR + 0.5, 3.2, P.roofDark);
  g.ico(x, GY + legTop + tankH + 3.4, z, 0.5, P.steel);
  // downpipe
  g.cyl(x + tankR - 0.4, GY, z, 0.3, 0.3, legTop + tankH, P.steel);
  col.add(x, GY, z, tankR * 2, legTop + tankH, tankR * 2, 0);
}

// ---- rail siding + rolling stock (south yard) ---------------------------
const RAIL_Z = 848, RAIL_X0 = 268, RAIL_X1 = 520, GAUGE = 2.2;
function railSiding(g, col) {
  // sleepers, then two steel rails running the length
  for (let x = RAIL_X0; x <= RAIL_X1; x += 2.4)
    g.boxB(x, GY, RAIL_Z, 0.6, 0.12, GAUGE + 1.2, P.dirtDark);
  for (const dz of [-GAUGE / 2, GAUGE / 2])
    g.boxB((RAIL_X0 + RAIL_X1) / 2, GY + 0.12, RAIL_Z + dz, RAIL_X1 - RAIL_X0, 0.14, 0.16, P.steel);

  // rolling stock: a small saddle-tank loco + three freight wagons, nose east
  locomotive(g, col, 300, RAIL_Z);
  const wagonCols = [P.rust, P.roofDark, P.brickDark];
  for (let i = 0; i < 3; i++) boxcar(g, col, 356 + i * 40, RAIL_Z, wagonCols[i]);
}

// dark underframe + wheels shared by loco/wagons (wheels are small dark boxes —
// low-poly, and GeoBatch cyls can't stand as vertical discs anyway)
function underframe(g, x, z, len) {
  g.boxB(x, GY + 0.12, z, len, 0.6, 2.4, P.sootBlack);
  for (const dx of [-len / 2 + 1.4, -len / 2 + 3.0, len / 2 - 3.0, len / 2 - 1.4])
    for (const dz of [-GAUGE / 2, GAUGE / 2])
      g.box(x + dx, GY + 0.4, z + dz, 0.5, 0.8, 0.34, P.steel);
}

function boxcar(g, col, x, z, hex) {
  const len = 11, h = 4;
  underframe(g, x, z, len);
  g.boxB(x, GY + 0.72, z, len, h, 3.2, hex);                 // body
  g.prism(x, GY + 0.72 + h, z, len, 0.9, 3.2, P.roofDark);   // arced-ish roof (ridge along x)
  // plank line + a sliding door band on the near side
  g.boxB(x, GY + 0.72 + h * 0.5, z + 1.62, len, 0.12, 0.06, P.sootBlack);
  g.boxB(x, GY + 0.72, z + 1.65, 3.2, h * 0.85, 0.1, P.dirtDark);
  col.add(x, GY, z, len, h + 0.9, 3.4);
}

function locomotive(g, col, x, z) {
  const len = 9;
  underframe(g, x, z, len);
  g.boxB(x + 0.4, GY + 0.72, z, len - 1.8, 3.0, 2.6, P.rockDark);    // boiler/saddle block
  g.boxB(x - len / 2 + 1.8, GY + 3.7, z, 4.2, 2.6, 2.8, P.roofDark); // cab
  g.cyl(x + len / 2 - 1.6, GY + 3.72, z, 0.55, 0.7, 1.8, P.sootBlack); // chimney
  g.cyl(x + 0.6, GY + 3.72, z, 0.5, 0.5, 1.0, P.brickLight);          // steam dome
  g.box(x + len / 2 + 0.2, GY + 1.4, z, 0.4, 1.6, 3.0, P.sootBlack);  // buffer beam
  col.add(x, GY, z, len + 0.6, 4.6, 2.9);
}

// ---- portal gantry crane (straddling the siding) ------------------------
function gantryCrane(g, col) {
  const x = 440, zN = 834, zS = 850;      // straddles the siding, inside the yard
  const legTop = 13, span = zS - zN;
  // two portal legs (each a pair of uprights with a cross tie) at the x-ends of
  // a short bridge; the whole frame straddles the track across z
  for (const px of [x - 8, x + 8]) {
    for (const pz of [zN, zS]) {
      g.box(px, GY + legTop / 2, pz, 0.7, legTop, 0.7, P.constrYellow);
      col.add(px, GY, pz, 1.0, legTop, 1.0);
    }
    // leg cross tie
    g.box(px, GY + legTop - 1.5, (zN + zS) / 2, 0.4, 0.4, span, P.steel);
    g.box(px, GY + legTop * 0.45, (zN + zS) / 2, 0.35, 0.35, span, P.steel, 0);
  }
  // top bridge girders spanning z on each side, + a rolling trolley + hook
  for (const px of [x - 8, x + 8])
    g.box(px, GY + legTop + 0.4, (zN + zS) / 2, 0.9, 0.9, span + 1.5, P.constrOrange);
  g.box(x, GY + legTop + 0.4, (zN + zS) / 2 + 3, 17, 0.5, 2.0, P.steel);   // cross beam / trolley rail
  g.box(x, GY + legTop + 0.2, (zN + zS) / 2 + 3, 2.4, 1.4, 2.4, P.constrYellow); // trolley
  g.cyl(x, GY + 6, (zN + zS) / 2 + 3, 0.12, 0.12, legTop - 5.5, P.sootBlack);    // hoist cable
  g.box(x, GY + 5.4, (zN + zS) / 2 + 3, 0.9, 1.0, 0.5, P.steel);                 // hook block
}

// ---- battered brick perimeter wall --------------------------------------
// Runs the yard boundary as brick panels between piers, with a wide gate on the
// north side (facing the city grid). Seeded sections are blown out to rubble.
const PW = { x0: 254, x1: 562, z0: 778, z1: 852 };
function perimeter(g, col) {
  const H = 3.2, PIER = 1.4, PANEL_H = 2.6;
  // one straight run of piers+panels from (ax,az) to (bx,bz); `gate` is a
  // [t0,t1] fraction range left open for an entrance.
  const run = (ax, az, bx, bz, seed, gate) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.round(len / 8);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      if (gate && t > gate[0] && t < gate[1]) continue;       // entrance gap
      const cx = ax + (bx - ax) * t, cz = az + (bz - az) * t;
      const horiz = Math.abs(bx - ax) > Math.abs(bz - az);
      const s = hash(seed, i * 13);
      const blown = s % 7 === 0;                              // shelled gap
      if (blown) {
        // low broken stub + a little rubble heap — still a solid low barrier,
        // so give it a collider matching the remnant (a stub taller than the
        // 0.45m step-up blocks the player; the gap was walk-through before)
        const stubH = PANEL_H * (0.2 + frac(s, 2) * 0.3);
        g.boxB(cx, GY, cz, horiz ? len / n : PIER, stubH, horiz ? PIER : len / n, P.brickDark);
        col.add(cx, GY, cz, horiz ? len / n : PIER + 1.4, Math.max(stubH, 0.6),
          horiz ? PIER + 1.4 : len / n);
        for (let k = 0; k < 3; k++)
          g.ico(cx + (frac(s, k, 1) - 0.5) * 2.5, GY + 0.3, cz + (frac(s, k, 2) - 0.5) * 2.5,
            0.4 + frac(s, k, 3) * 0.4, k % 2 ? P.brick : P.brickDark);
        continue;
      }
      // panel
      g.boxB(cx, GY, cz, horiz ? len / n : PIER, PANEL_H, horiz ? PIER : len / n,
        brickShade(cx, GY + 1, cz));
      g.boxB(cx, GY + PANEL_H, cz, horiz ? len / n : PIER + 0.2, 0.3,
        horiz ? PIER + 0.2 : len / n, P.brickLight);          // capping
      col.add(cx, GY, cz, horiz ? len / n : PIER, H, horiz ? PIER : len / n);
    }
    // piers at both ends of the run
    for (const [ex, ez] of [[ax, az], [bx, bz]]) {
      g.boxB(ex, GY, ez, PIER + 0.5, H, PIER + 0.5, P.brickDark);
      col.add(ex, GY, ez, PIER + 0.5, H, PIER + 0.5);
    }
  };
  run(PW.x0, PW.z0, PW.x1, PW.z0, hash(9101, 1), [0.42, 0.56]); // north (with gate)
  run(PW.x0, PW.z1, PW.x1, PW.z1, hash(9101, 2));               // south
  run(PW.x0, PW.z0, PW.x0, PW.z1, hash(9101, 3));               // west
  run(PW.x1, PW.z0, PW.x1, PW.z1, hash(9101, 4));               // east
  // gate piers flanking the north entrance
  const gateX = PW.x0 + (PW.x1 - PW.x0) * 0.49;
  for (const dx of [-9, 9]) {
    g.boxB(gateX + dx, GY, PW.z0, 2.2, 5.5, 2.2, P.brickSoot);
    g.boxB(gateX + dx, GY + 5.5, PW.z0, 2.6, 0.5, 2.6, P.brickDark);
    col.add(gateX + dx, GY, PW.z0, 2.2, 5.5, 2.2);
  }
  // signboard beam across the gate
  g.boxB(gateX, GY + 5.6, PW.z0, 20, 1.6, 0.5, P.rust);
}

// ---- industrial clutter -------------------------------------------------
// Fills the open apron between the hall and the perimeter with a deterministic
// scatter of war-remnant junk — oil drums, crates, pipe stacks, scrap heaps,
// sandbag emplacements, cable reels and broken machinery. Positions and types
// are seeded from a jittered grid (no Math.random); bulky pieces get colliders.
function drum(g, col, x, z, hex) {
  g.cyl(x, GY, z, 0.5, 0.5, 1.3, hex);
  g.cyl(x, GY + 0.35, z, 0.53, 0.53, 0.12, P.rust);  // rolling hoops
  g.cyl(x, GY + 0.9, z, 0.53, 0.53, 0.12, P.rust);
  col.add(x, GY, z, 1.15, 1.3, 1.15);
}
function drumCluster(g, col, x, z, s) {
  const cols = [P.rust, P.steel, P.constrOrange, P.dirtDark];
  const n = 2 + hash(s, 3) % 3;
  for (let i = 0; i < n; i++) {
    const dx = (frac(s, i + 1) - 0.5) * 2.4, dz = (frac(s, i + 20) - 0.5) * 2.4;
    if (i === 0 && hash(s, 7) % 2) {                 // one tipped on its side
      g.box(x + dx, GY + 0.5, z + dz, 1.3, 1.0, 1.0, cols[i % cols.length], frac(s, 9) * Math.PI);
      col.add(x + dx, GY, z + dz, 1.5, 1.0, 1.5);
    } else drum(g, col, x + dx, z + dz, cols[i % cols.length]);
  }
}
function crateStack(g, col, x, z, s) {
  const n = 2 + hash(s, 2) % 3;
  let yy = GY;
  for (let i = 0; i < n; i++) {
    const w = 1.1 + frac(s, i + 1) * 0.7, h = 1.0 + frac(s, i + 5) * 0.5;
    const dx = (frac(s, i + 9) - 0.5) * 0.6, dz = (frac(s, i + 13) - 0.5) * 0.6;
    g.boxB(x + dx, yy, z + dz, w, h, w, frac(s, i) < 0.5 ? P.dirt : P.dirtDark);
    g.boxB(x + dx, yy + h * 0.5, z + dz + w * 0.5, w, 0.1, 0.05, P.dirtDark); // plank line
    yy += h;
  }
  col.add(x, GY, z, 2.5, yy - GY, 2.5);
}
function pipeStack(g, col, x, z, s) {
  const along = hash(s, 4) % 2, L = 3.4 + frac(s, 1) * 1.8, R = 0.32;
  const cols = [P.steel, P.rust];
  let yy = GY + R;
  [3, 2, 1].forEach((cnt, r) => {
    for (let i = 0; i < cnt; i++) {
      const off = (i - (cnt - 1) / 2) * (R * 2.1);
      const px = along ? x : x + off, pz = along ? z + off : z;
      g.box(px, yy, pz, along ? L : R * 2, R * 2, along ? R * 2 : L, cols[(r + i) % 2]);
    }
    yy += R * 1.9;
  });
  col.add(x, GY, z, along ? L : 2.2, yy - GY, along ? 2.2 : L);
}
function scrapHeap(g, col, x, z, s) {
  const n = 4 + hash(s, 2) % 4;
  for (let i = 0; i < n; i++) {
    const dx = (frac(s, i + 1) - 0.5) * 3, dz = (frac(s, i + 11) - 0.5) * 3;
    const c = [P.steel, P.rust, P.sootBlack, P.rockDark][hash(s, i) % 4];
    if (i % 2) g.ico(x + dx, GY + 0.3 + frac(s, i) * 0.5, z + dz, 0.4 + frac(s, i + 3) * 0.5, c);
    else g.box(x + dx, GY + 0.25, z + dz, 0.6 + frac(s, i + 2) * 1.2, 0.3, 0.5, c, frac(s, i + 7) * Math.PI);
  }
  col.add(x, GY, z, 3.0, 0.8, 3.0);
}
function sandbags(g, col, x, z, s) {
  const along = hash(s, 3) % 2, len = 4 + hash(s, 5) % 3, bags = Math.round(len / 0.8);
  for (let r = 0; r < 2; r++)
    for (let i = 0; i < bags - r; i++) {
      const t = (i + (r ? 0.5 : 0)) * 0.8 - len / 2;
      const bx = along ? x + t : x, bz = along ? z : z + t;
      g.boxB(bx, GY + r * 0.42, bz, along ? 0.8 : 1.0, 0.42, along ? 1.0 : 0.8,
        r % 2 ? P.dirt : P.dirtLight);
    }
  col.add(x, GY, z, along ? len : 1.4, 0.9, along ? 1.4 : len);
}
function cableReel(g, col, x, z) {
  const R = 1.3, W = 1.6;
  g.cyl(x, GY, z, R, R, 0.25, P.dirtDark);            // lower flange
  g.cyl(x, GY + W - 0.25, z, R, R, 0.25, P.dirtDark); // upper flange
  g.cyl(x, GY + 0.25, z, R * 0.55, R * 0.55, W - 0.5, P.sootBlack); // wound cable core
  col.add(x, GY, z, R * 2, W, R * 2);
}
function machineHulk(g, col, x, z, s) {
  const ry = (hash(s, 2) % 4) * (Math.PI / 2);
  g.boxB(x, GY, z, 3.2, 2.0, 2.2, P.steel, ry);          // body
  g.boxB(x, GY + 2.0, z, 2.0, 0.8, 1.6, P.rust, ry);     // housing
  g.cyl(x + 1.2, GY + 0.6, z, 0.7, 0.7, 1.2, P.rockDark); // drum/roller
  g.box(x - 1.2, GY + 1.2, z, 0.3, 0.3, 3.0, P.sootBlack, ry); // sheared pipe arm
  col.add(x, GY, z, 3.6, 2.8, 3.0, ry);
}

const PROPS = [drumCluster, crateStack, pipeStack, scrapHeap, sandbags,
  cableReel, machineHulk, drumCluster, crateStack, scrapHeap];
function clutter(g, col) {
  // keep-outs: the halls, boiler, tanks, water tower, crane, the rail line and
  // a margin off the perimeter wall — clutter fills only the open apron between.
  const inHall = (x, z) => x > 256 && x < 502 && z > 783 && z < 829;
  const inBoiler = (x, z) => x > 493 && x < 549 && z > 785 && z < 827;
  const nearTower = (x, z) => Math.hypot(x - 296, z - 792) < 10;
  const nearTank = (x, z) => [[288, 838], [310, 846], [335, 840]].some(([tx, tz]) => Math.hypot(x - tx, z - tz) < 10);
  const nearGantry = (x, z) => x > 424 && x < 456 && z > 830 && z < 854;
  const onRail = (x, z) => z > 842 && z < 854 && x > 262 && x < 524;
  const nearWall = (x, z) => x < 260 || x > 556 || z < 784 || z > 848;
  const blocked = (x, z) => inHall(x, z) || inBoiler(x, z) || nearTower(x, z) ||
    nearTank(x, z) || nearGantry(x, z) || onRail(x, z) || nearWall(x, z);
  let idx = 0;
  for (let gx = 262; gx <= 556; gx += 11)
    for (let gz = 784; gz <= 848; gz += 11) {
      const s = hash(7700 + idx, Math.round(gx) * 7 + Math.round(gz)); idx++;
      const x = gx + (frac(s, 1) - 0.5) * 7, z = gz + (frac(s, 2) - 0.5) * 7;
      if (blocked(x, z) || hash(s, 9) % 10 < 3) continue;  // leave gaps to breathe
      PROPS[hash(s, 5) % PROPS.length](g, col, x, z, s);
    }
}

// ---- entry --------------------------------------------------------------
// Every primitive/collider has its centre x at arg0 and z at arg2, so a thin
// proxy that adds (OX, OZ) to those two args translates the entire plant with
// no change to the authored local coordinates.
function offsetBatch(g) {
  const wrap = (fn) => (...a) => { a[0] += OX; a[2] += OZ; return fn.apply(g, a); };
  return {
    box: wrap(g.box), boxB: wrap(g.boxB), prism: wrap(g.prism),
    cyl: wrap(g.cyl), cone: wrap(g.cone), ico: wrap(g.ico),
  };
}
function offsetColliders(col) {
  return { add: (...a) => { a[0] += OX; a[2] += OZ; return col.add(...a); } };
}

export function buildFactory(g, col) {
  const gg = offsetBatch(g), cc = offsetColliders(col);
  apron(gg);
  hall(gg, cc);
  boilerHouse(gg, cc);
  tanks(gg, cc);
  waterTower(gg, cc);
  railSiding(gg, cc);
  gantryCrane(gg, cc);
  perimeter(gg, cc);
  clutter(gg, cc);
}

// ============================================================================
//  ANIMATED SMOKE
// ============================================================================
// Each smokestack belches a rising column of dark sooty puffs. Constructed &
// updated in main.js alongside the Lighthouse (it can't be baked into the
// static batch because it moves).
//
// Determinism / no-Math.random: every puff is a pure function of a continuous,
// per-puff looping phase. Puff i has a fixed phase offset frac(seed,i); its age
// a ∈ [0,1) is (elapsed*rate + offset) mod 1. Position (rise + wind drift),
// scale (grows) and opacity (fades in then out) are all read straight from `a`,
// so the column loops seamlessly forever with no random recycling.
const PUFFS_PER_STACK = 14;
const RISE = 30;                 // how far a puff climbs before recycling (m)
const WIND = new THREE.Vector2(0.55, 0.18); // lateral drift per unit age (x,z), *RISE

export class Smoke {
  constructor(scene) {
    this.puffs = [];
    const geo = new THREE.IcosahedronGeometry(1, 0);
    for (let si = 0; si < STACKS.length; si++) {
      const s = STACKS[si];
      const seed = hash(9301, si);
      for (let i = 0; i < PUFFS_PER_STACK; i++) {
        // dark soot, each puff its own material so opacity can fade per-frame
        const mat = new THREE.MeshLambertMaterial({
          color: 0x2b2a2c, transparent: true, opacity: 0, flatShading: true, depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = false;
        scene.add(mesh);
        this.puffs.push({
          mesh, mat,
          x: s.x + OX, z: s.z + OZ, y0: GY + s.h + 0.5, r0: s.r * 0.8,
          off: frac(seed, i + 1),                 // phase offset in the loop
          sway: (frac(seed, i + 40) - 0.5) * 6,   // per-puff lateral wander (m)
          swz: (frac(seed, i + 80) - 0.5) * 6,
          spin: frac(seed, i + 120) * Math.PI,    // fixed facet orientation
        });
      }
    }
    this.t = 0;
  }

  update(dt) {
    this.t += dt * 0.09;                          // plume climb rate (loops/sec)
    for (const p of this.puffs) {
      const a = (this.t + p.off) % 1;             // age 0..1 up the column
      const y = p.y0 + a * RISE;
      // drift downwind, widening with age; a little per-puff wander
      const x = p.x + WIND.x * a * RISE * 0.5 + p.sway * a;
      const z = p.z + WIND.y * a * RISE * 0.5 + p.swz * a;
      const scale = p.r0 * (1 + a * 3.2);         // billows outward as it rises
      // fade in over the first 12%, then ease out to nothing by the top
      const op = a < 0.12 ? (a / 0.12) * 0.6 : 0.6 * (1 - (a - 0.12) / 0.88);
      p.mesh.position.set(x, y, z);
      p.mesh.scale.setScalar(scale);
      p.mesh.rotation.set(p.spin, p.spin * 1.7, p.spin * 0.5);
      p.mat.opacity = Math.max(0, op);
    }
  }
}
