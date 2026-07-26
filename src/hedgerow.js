// Long, tall clipped hedge rows — dense green walls cutting straight across the
// world between two authored endpoints. Like arena.js / manor.js each is a
// hand-placed WORLD-COORDINATE feature drawn straight into the shared city
// GeoBatch + Colliders, not a CITY grid entry.
//
// A row can be long and run diagonally over the island's rolling plateau, so a
// single straight box would float over dips and sink into rises. Instead each
// row is stepped into many short segments, every one based on the local
// groundHeight and yawed to the line direction (a thin OBB, resolved exactly by
// movePlayer). Segments butt end-to-end (overlapping them coplanar-z-fights);
// the base is sunk by EMBED so no gap opens under the wall on slopes. Everything
// is deterministic — the small per-segment colour/height jitter is coordinate-
// seeded via frac(), no Math.random.
//
// To add a hedgerow, drop a row into HEDGEROWS below: { a:[x,z], b:[x,z] } for
// the default 1m×3m wall, plus optional { thick, tall } to override the
// profile.
import { groundHeight } from './island.js';
import { frac } from './util.js';
import { PALETTE as P } from './palette.js';

// ---- authored hedgerows -------------------------------------------------
// a / b are world [x, z] endpoints. thick (depth) & tall (height) are optional.
export const HEDGEROWS = [
  { a: [-214, -765], b: [-105, -675] },
  { a: [-105, -675], b: [14, -565] },
  { a: [14, -565], b: [104, -456] },
  { a: [891, -14], b: [891, -53] },
];

// ---- profile defaults & stepping ----------------------------------------
const THICK = 2.0;   // hedge depth (perpendicular to the run)
const TALL = 5.0;    // hedge height above the ground it stands on
const STEP = 4.0;    // segment spacing along the run
const EMBED = 0.3;   // sink the base this far so no gap opens on slopes

const GREENS = [P.leaf1, P.leaf2, P.leaf3];

// One hedgerow: step short, ground-following, yawed segments from a to b.
function buildRow(g, col, { a, b, thick = THICK, tall = TALL }) {
  const [ax, az] = a, [bx, bz] = b;
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  const ry = Math.atan2(dx, dz);   // yaw so the box's local +z axis runs a→b
  const n = Math.ceil(len / STEP);
  const segLen = len / n; // butt segments end-to-end (overlap → coplanar z-fight)

  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;                 // segment centre along the line
    const cx = ax + dx * t, cz = az + dz * t;
    const gy = groundHeight(cx, cz);
    // slight coordinate-seeded variety so the wall reads as clipped foliage,
    // not a flat slab: tiny per-segment height wobble + leaf-shade pick.
    const h = tall + (frac(cx, cz, 7) - 0.5) * 0.3;
    const c = GREENS[(frac(cx, cz, 11) * 3) | 0];
    g.boxB(cx, gy - EMBED, cz, thick, h + EMBED, segLen, c, ry);
    col.add(cx, gy, cz, thick, tall, segLen, ry);
  }
}

export function buildHedgerows(g, col) {
  for (const row of HEDGEROWS) buildRow(g, col, row);
}
