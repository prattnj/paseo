// Community garden filling the empty wedge in grid cell (7,2), on the north
// coast at world ~(-60, -610). Like arena.js / prison.js / trailerpark.js this
// is a hand-placed WORLD-COORDINATE feature, not a CITY grid entry: (7,2) is a
// REMOVED_CELLS gap, so nothing in layout.js / city.js owns it.
//
// The cell is a 100x100 square whose NE corner is sliced off by the coastal
// parkway (parkway.js) curving past — the road+sidewalk cut a clean diagonal
// from the north edge (x~-63) down to the east edge (z~-598), leaving a
// pentagonal plot: full west & south edges along the grid streets, and a
// tapering diagonal against the parkway. We keep an 11m setback from the
// parkway centerline so nothing crowds the road.
//
// Layout (north = -z): a white picket fence rings the whole plot with a gate on
// the south edge (facing the city) where a dirt path runs north up the middle.
// Rows of uniform raised planter beds fill both sides of the path; the beds are
// all the same box, but each is seeded to grow one of three crop types —
// flowers, short vegetables, or tall vegetables (corn / sunflowers / staked
// tomatoes). A tool shed with a rain barrel and a small greenhouse sit along
// the west edge, out of the planting rows, with a bench by the gate and a
// couple of fruit trees in the open corners. Beds near the NE are clipped to
// the parkway diagonal, so the rows shorten toward the road and the plot reads
// as the triangular wedge it is.
//
// Everything is deterministic (no Math.random) — placement and per-bed variety
// come from coordinate-seeded hashes in util.js.
import { PALETTE as P } from '../../core/palette.js';
import { hash, frac } from '../../core/util.js';
import { tree, bench } from '../blocks/props.js';

// ---- plot geometry ------------------------------------------------------
// Fence line (inside the cell, clear of the flanking streets & the parkway).
const XW = -105, XE = -15;   // west / east fence x
const ZN = -656, ZS = -564;  // north / south fence z
// The parkway diagonal: from the north edge at x = DNX to the east edge at
// z = DEZ. beds/fence on the NE follow this line.
const DNX = -90, DEZ = -585;
const DSLOPE = (XE - DNX) / (DEZ - ZN); // dx per dz along the diagonal (~0.83)
// Max plant/fence x allowed at depth z (the parkway-side limit).
const diagX = (z) => (z >= DEZ ? XE : DNX + DSLOPE * (z - ZN));

// Central path & gate (aligned) sit west of centre so the diagonal never
// reaches the path corridor.
const PATH_X = -70, PATH_W = 3;
const GATE_HALF = 2.5;       // half-width of the gate gap in the south fence

// Structures live along the west edge, clear of the rows.
const SHED = { x: -97, z: -574, w: 4.2, d: 3.2 };
const GH = { x: -97, z: -620, w: 4.6, d: 9 };   // greenhouse (long axis N-S)

// ---- fence --------------------------------------------------------------
// A white picket run between two points: low boards, a top rail, and posts.
// Handles any angle (the diagonal edge), rotating around the run direction.
function fenceRun(g, col, x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
  if (len < 0.05) return;
  const ry = Math.atan2(dx, dz), ux = dx / len, uz = dz / len;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  g.boxB(cx, 0, cz, 0.1, 0.55, len, P.white, ry);      // lower boards
  g.boxB(cx, 0.68, cz, 0.1, 0.12, len, P.white, ry);   // top rail
  col.add(cx, 0, cz, 0.22, 0.95, len, ry);
  const nP = Math.max(1, Math.round(len / 2.4));
  for (let i = 0; i <= nP; i++) {
    const t = (i / nP) * len;
    g.boxB(x0 + ux * t, 0, z0 + uz * t, 0.17, 0.95, 0.17, P.white); // posts
  }
}

// ---- one raised planter bed ---------------------------------------------
const BW = 3.4, BD = 1.6;          // bed box: length (x) x depth (z)
const WOOD = 0x9c6b3f, SOIL = 0x4a3a2c;
const BLOSSOM = [0xe0574a, 0xf4c542, 0xe884c9, 0xf2f4f5, 0x9a6fc0, 0xf39a3a];
const LEAF = [P.leaf1, P.leaf2, P.leaf3];
const VEG = [0x6db24a, 0x9ccc4e, 0x3e7d3a];      // cabbage / lettuce / kale
const STALK = 0x4e8b3a;

function bed(g, col, x, z, seed) {
  g.boxB(x, 0, z, BW, 0.4, BD, WOOD);                          // timber frame
  g.boxB(x, 0.4, z, BW - 0.25, 0.09, BD - 0.25, SOIL);        // soil cap
  col.add(x, 0, z, BW, 0.9, BD);
  const soilTop = 0.49;
  const cat = hash(seed, 1) % 3;
  // tall veg is spaced sparser (fewer, bigger plants) than flowers/short veg.
  const cols = cat === 2 ? 3 : 4, rows = cat === 2 ? 1 : 2;
  let k = 0;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const px = x - BW / 2 + (BW * (i + 0.5)) / cols + (frac(seed, k, 1) - 0.5) * 0.35;
    const pz = z - BD / 2 + (BD * (j + 0.5)) / rows + (frac(seed, k, 2) - 0.5) * 0.3;
    if (cat === 0) {                                            // flowers
      g.ico(px, soilTop + 0.12, pz, 0.15 + frac(seed, k, 3) * 0.05, LEAF[hash(seed, k, 4) % 3]);
      g.ico(px, soilTop + 0.28, pz, 0.08 + frac(seed, k, 5) * 0.04, BLOSSOM[hash(seed, k, 6) % 6]);
    } else if (cat === 1) {                                     // short vegetables
      g.ico(px, soilTop + 0.1, pz, 0.19 + frac(seed, k, 3) * 0.05, VEG[hash(seed, k, 4) % 3]);
      if (hash(seed, k, 7) % 3 === 0)                           // an occasional ripe fruit
        g.ico(px + 0.1, soilTop + 0.22, pz, 0.07, 0xe0574a);
    } else {                                                    // tall vegetables
      const h = 1.0 + frac(seed, k, 3) * 0.5;
      const kind = hash(seed, k, 4) % 3;
      g.cyl(px, soilTop, pz, 0.045, 0.06, h, STALK);
      if (kind === 0) {                                         // corn
        g.ico(px, soilTop + h, pz, 0.16, P.leaf1);
        g.ico(px + 0.08, soilTop + h * 0.7, pz, 0.08, 0xe9d24a);
      } else if (kind === 1) {                                  // sunflower
        g.ico(px, soilTop + h + 0.08, pz, 0.2, 0xf4c542);
        g.ico(px, soilTop + h + 0.08, pz, 0.09, 0x6b4a2a);
      } else {                                                  // staked tomatoes
        g.cyl(px + 0.12, soilTop, pz, 0.02, 0.02, h + 0.2, 0x8d6e63);
        g.ico(px, soilTop + h * 0.6, pz, 0.18, P.leaf2);
        g.ico(px + 0.1, soilTop + h * 0.55, pz, 0.06, 0xe0574a);
        g.ico(px - 0.08, soilTop + h * 0.75, pz, 0.06, 0xe0574a);
      }
    }
    k++;
  }
}

// ---- structures ---------------------------------------------------------
function shed(g, col, x, z) {
  const w = SHED.w, d = SHED.d, wallH = 2.3;
  g.boxB(x, 0, z, w, wallH, d, 0xb07a45);                       // body
  g.prism(x, wallH, z, d + 0.5, 0.9, w + 0.4, P.roofDark, Math.PI / 2); // gable (ridge along z)
  g.box(x + w / 2 + 0.01, 1.05, z, 0.1, 1.8, 1.0, P.doorDark);  // door (east face)
  g.box(x - w / 2 - 0.01, 1.5, z - 0.6, 0.1, 0.8, 0.8, P.window);
  col.add(x, 0, z, w, wallH + 0.8, d);
  // rain barrel tucked against the south wall
  const bx = x + w / 2 - 0.6, bz = z + d / 2 + 0.7;
  g.cyl(bx, 0, bz, 0.55, 0.6, 1.4, 0x3f6e6a);
  g.cyl(bx, 1.4, bz, 0.5, 0.55, 0.1, P.concreteDark);
  col.add(bx, 0, bz, 1.2, 1.5, 1.2);
}

function greenhouse(g, col, x, z) {
  const w = GH.w, d = GH.d, wallH = 2.4;
  const glass = 0xd7ebe8, frame = P.white;
  g.boxB(x, 0, z, w, wallH, d, glass);                          // glazed walls
  g.prism(x, wallH, z, d, 1.1, w, glass, Math.PI / 2);          // glazed gable roof (ridge along z)
  // corner posts + a ridge beam so it reads as a framed greenhouse
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    g.boxB(x + sx * (w / 2), 0, z + sz * (d / 2), 0.14, wallH, 0.14, frame);
  g.box(x, wallH + 1.1, z, 0.12, 0.12, d, frame);              // ridge
  g.box(x, wallH * 0.55, z, w + 0.02, 0.1, d, frame);          // mid rail band
  g.box(x + w / 2 + 0.01, 1.1, z + d / 2 - 1.0, 0.08, 1.9, 1.1, P.doorDark); // door (south end, east face)
  col.add(x, 0, z, w, wallH + 1.1, d);
}

// ---- entry --------------------------------------------------------------
export function buildGarden(g, col, scene) {
  // --- perimeter picket fence (W, N, diagonal, E, S-with-gate) ---
  fenceRun(g, col, XW, ZS, XW, ZN);        // west
  fenceRun(g, col, XW, ZN, DNX, ZN);       // north (up to the diagonal)
  fenceRun(g, col, DNX, ZN, XE, DEZ);      // diagonal (parkway side)
  fenceRun(g, col, XE, DEZ, XE, ZS);       // east (below the diagonal)
  fenceRun(g, col, XW, ZS, PATH_X - GATE_HALF, ZS);  // south, west of gate
  fenceRun(g, col, PATH_X + GATE_HALF, ZS, XE, ZS);  // south, east of gate
  // gate posts (a touch taller) flanking the opening
  for (const gx of [PATH_X - GATE_HALF, PATH_X + GATE_HALF])
    g.boxB(gx, 0, ZS, 0.24, 1.35, 0.24, P.white);

  // --- dirt path from the gate north up the middle ---
  const pz0 = -562, pz1 = -630;   // south end -> north end
  g.boxB(PATH_X, 0, (pz0 + pz1) / 2, PATH_W, 0.06, pz0 - pz1, P.path);

  // --- structures along the west edge ---
  shed(g, col, SHED.x, SHED.z);
  greenhouse(g, col, GH.x, GH.z);

  // keep-outs so beds dodge the path, structures and gate approach
  const nearShed = (x, z) => Math.abs(x - SHED.x) < SHED.w / 2 + 2 && Math.abs(z - SHED.z) < SHED.d / 2 + 2;
  const nearGH = (x, z) => Math.abs(x - GH.x) < GH.w / 2 + 2 && Math.abs(z - GH.z) < GH.d / 2 + 2;
  // path corridor only clears beds along its actual length; beds fill the
  // column north of the path's end (z < pz1).
  const onPath = (x, z) => Math.abs(x - PATH_X) < PATH_W / 2 + BW / 2 + 0.8
    && z > pz1 - BD / 2 - 0.6;

  // --- rows of raised beds filling the plot ---
  const COL = 4.6, ROW = 4.9;
  for (let z = ZN + 6; z <= ZS - 5; z += ROW)
    for (let x = XW + 4; x <= XE - 3; x += COL) {
      if (onPath(x, z)) continue;
      if (x > diagX(z) - BW / 2 - 2) continue;         // clip to the parkway diagonal
      if (nearShed(x, z) || nearGH(x, z)) continue;
      bed(g, col, x, z, hash(9270 + Math.round(x), Math.round(z)));
    }

  // --- finishing touches ---
  bench(g, col, PATH_X + 4.5, ZS - 4, Math.PI);        // bench just inside the gate
  tree(g, col, XE - 5, ZS - 6, 0.9, 0);                // fruit trees in the open corners
  tree(g, col, XW + 6, ZN + 6, 0.9, 1);
}
