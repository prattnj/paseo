// Ancient Roman ruins occupying the open south-west triangle of the otherwise
// empty grid cell (6,1) — the north-plateau pocket bounded by the x=-225 and
// z=-665 streets, west of the northern neighbourhoods. Like arena.js /
// prison.js / baseball.js this is a hand-placed WORLD-COORDINATE feature drawn
// straight into the shared city GeoBatch + Colliders; cell (6,1) is a removed
// (unbuilt) cell, so nothing in layout.js/city.js owns it.
//
// The cell's buildable square is x[-220,-120], z[-770,-670]. The coastal
// parkway clips its NE half, so only the SOUTH-WEST triangle is open ground:
// the right angle sits at the SW corner (-220,-670) with legs along the west
// street (x=-220) and the south street (z=-670) and the hypotenuse running
// NW(-220,-770) -> SE(-120,-670), i.e. the diagonal z = x - 550. Everything is
// kept south of that diagonal (with margin) and culled to onLand.
//
// The ruin is a FREESTANDING COLONNADE FIELD: a jittered grid of fluted marble
// columns snapped off at wildly varying heights (a few whole with capitals,
// most broken mid-shaft, down to bare stumps and empty plinths), with drum
// seams showing the joints. Around them: strewn marble rubble, a couple of
// whole columns toppled into rows of drums, a fallen pediment fragment with
// spilled cornice blocks, and cypress + grass overgrowth reclaiming the site.
//
// Standing columns and the larger fallen pieces are SOLID colliders, so you can
// weave through the ruins. The plateau here is dead flat (~TOP_Y), so every
// piece bases on TOP_Y; onLand only guards the scatter against the coast edge.
// Everything is deterministic (coordinate-seeded hashes) — no Math.random.
import { PALETTE as P } from '../../core/palette.js';
import { TOP_Y, onLand } from '../island.js';
import { hash, frac, pick } from '../../core/util.js';
import { tree } from '../blocks/index.js';

// ---- placement ----------------------------------------------------------
const GY = TOP_Y;                       // flat plateau surface

// Cell (6,1) buildable square, and the SW-triangle test (with a margin off the
// hypotenuse so nothing crowds the parkway that swallowed the NE half).
const RX0 = -220, RX1 = -120, RZ0 = -770, RZ1 = -670;
const DIAG_MARGIN = 1;                 // metres clear of the z = x-550 diagonal
function inTriangle(x, z) {
  return x > RX0 + 6 && x < RX1 - 6 && z > RZ0 + 6 && z < RZ1 - 6
    && z > (x - 550) + DIAG_MARGIN      // south of the NW->SE hypotenuse
    && onLand(x, z);
}

// Column proportions. Shaft tapers from rBot at the base to rTop at the FULL
// standing height; broken shafts read the correct taper for their height.
const R_BOT = 0.56, R_TOP = 0.44, FULL_H = 7.0;
const BASE_H = 0.7;                     // plinth + torus base height
const DRUM_H = 1.15;                    // one drum segment
const rAt = (h) => R_BOT + (R_TOP - R_BOT) * Math.min(1, Math.max(0, h / FULL_H));

// ---- one column ---------------------------------------------------------
// Square plinth + round base, then stacked fluted drums (the 10-gon `cyl`
// template reads as fluting) up to a hashed broken height, with thin darker
// seam rings at the drum joints. Whole columns (rare) get a Doric capital;
// broken ones get a jagged shard-strewn top. One box collider spans the piece.
function column(g, col, x, z, seed) {
  // plinth + torus base (always present, even for a "gone" column)
  g.boxB(x, GY, z, 1.5, 0.35, 1.5, P.marbleShade);
  g.cyl(x, GY + 0.35, z, R_BOT + 0.08, R_BOT + 0.16, 0.35, P.marble);

  // hashed ruin state -> shaft height above the base, and whether it survived
  // whole (capital) at all.
  const s = frac(seed, 7);
  let shaftH, capital = false, broken = true;
  if (s < 0.14) { shaftH = FULL_H - BASE_H - 0.75 + frac(seed, 11) * 0.3; capital = true; broken = false; }
  else if (s < 0.42) { shaftH = 4.4 + frac(seed, 12) * 1.7; }   // tall snap
  else if (s < 0.70) { shaftH = 2.3 + frac(seed, 13) * 1.7; }   // mid snap
  else if (s < 0.90) { shaftH = 0.7 + frac(seed, 14) * 0.9; }   // stump
  else { shaftH = 0; broken = false; }                          // sheared to the base

  const shaftBot = GY + BASE_H;
  if (shaftH > 0.2) {
    const n = Math.max(1, Math.round(shaftH / DRUM_H));
    const dh = shaftH / n;
    for (let i = 0; i < n; i++) {
      const y = shaftBot + i * dh;
      const r = rAt(BASE_H + i * dh + dh / 2);
      g.cyl(x, y, z, r, r, dh, i % 2 ? P.marble : P.marbleLight);   // drum
      if (i > 0) g.cyl(x, y - 0.03, z, r + 0.035, r + 0.035, 0.06, P.marbleShade); // seam ring
    }
  }

  const topY = shaftBot + shaftH;
  if (capital) {
    const rt = rAt(shaftH + BASE_H);
    g.cyl(x, topY - 0.02, z, rt + 0.03, rt, 0.16, P.marbleLight);   // necking
    g.cyl(x, topY + 0.14, z, 0.74, rt + 0.03, 0.34, P.marble);      // echinus flare
    g.boxB(x, topY + 0.46, z, 1.4, 0.3, 1.4, P.marbleLight);        // abacus slab
  } else if (broken) {
    // jagged fracture: a couple of shards perched on the snapped rim + one
    // chip that has slid down beside the base.
    const rt = rAt(shaftH + BASE_H);
    for (let k = 0; k < 3; k++) {
      const a = frac(seed, k, 20) * Math.PI * 2;
      g.ico(x + Math.cos(a) * rt * 0.6, topY + 0.06, z + Math.sin(a) * rt * 0.6,
        0.14 + frac(seed, k, 21) * 0.12, P.marbleShade);
    }
  }

  // a fallen drum that rolled off some broken shafts
  if (broken && shaftH > 1.2 && hash(seed, 30) % 3 === 0) {
    const a = frac(seed, 31) * Math.PI * 2;
    const fx = x + Math.cos(a) * 1.6, fz = z + Math.sin(a) * 1.6;
    if (inTriangle(fx, fz)) {
      g.wheel(fx, GY + 0.5, fz, 0.5, 1.0, P.marbleShade, frac(seed, 32) * Math.PI);
      col.add(fx, GY, fz, 1.4, 1.0, 1.4);
    }
  }

  // one collider for the standing stone (base plinth if sheared to nothing)
  const h = Math.max(0.4, (topY + (capital ? 0.6 : 0)) - GY);
  col.add(x, GY, z, 1.3, h, 1.3);
}

// ---- a whole column toppled into a row of drums -------------------------
// Drums lying end-to-end along one axis (the `wheel` template is a cylinder
// with its axle baked along local X, so ry orients the roll direction). One
// long thin collider spans the fallen shaft.
function toppledColumn(g, col, x, z, dir, seed) {
  const R = 0.5, w = 1.15, n = 8;               // ~9 m of shaft in 8 drums
  const cy = GY + R;
  for (let i = 0; i < n; i++) {
    const t = i * w;
    const px = dir === 'x' ? x + t : x;
    const pz = dir === 'z' ? z + t : z;
    const shade = pick([P.marble, P.marbleLight, P.marbleShade], seed, i);
    g.wheel(px, cy, pz, R, w * 0.94, shade, dir === 'x' ? 0 : Math.PI / 2);
    g.cyl(px + (dir === 'x' ? w * 0.47 : 0), GY + 0.02, pz + (dir === 'z' ? w * 0.47 : 0),
      R + 0.03, R + 0.03, 0.05, P.marbleShade); // seam disc (laid flat, just a hint)
  }
  const span = n * w, mid = (n - 1) * w / 2;
  if (dir === 'x') col.add(x + mid, GY, z, span, 2 * R, 2 * R);
  else col.add(x, GY, z + mid, 2 * R, 2 * R, span);
}

// ---- a fallen pediment fragment + spilled cornice blocks ----------------
function pedimentFragment(g, col, x, z, seed) {
  const w = 4.6, h = 1.5, d = 1.5, ry = 0.18;
  g.boxB(x, GY, z, w + 0.9, 0.36, d + 0.5, P.marbleShade, ry);  // raking-cornice base slab
  g.prism(x, GY + 0.36, z, w, h, d, P.marbleLight, ry);          // the broken gable itself
  col.add(x, GY, z, w, h + 0.36, d, ry);
  for (let i = 0; i < 4; i++) {                                  // scattered cornice blocks
    const a = frac(seed, i, 1) * Math.PI * 2;
    const rr = 2.6 + frac(seed, i, 2) * 2.4;
    const bx = x + Math.cos(a) * rr, bz = z + Math.sin(a) * rr;
    if (!inTriangle(bx, bz)) continue;
    const bry = frac(seed, i, 3) * Math.PI;
    const bl = 2.0 + frac(seed, i, 4) * 1.6;
    g.box(bx, GY + 0.26, bz, bl, 0.52, 0.9, pick([P.marble, P.marbleShade], seed, i), bry);
    col.add(bx, GY, bz, bl, 0.52, 0.9, bry);
  }
}

// ---- strewn marble rubble ------------------------------------------------
function chunk(g, col, x, z, seed) {
  const sz = 0.35 + frac(seed, 1) * 0.95;
  const shade = pick([P.marble, P.marbleLight, P.marbleShade, P.marbleMoss], seed, 2);
  if (hash(seed, 3) % 2) {
    g.ico(x, GY + sz * 0.4, z, sz * 0.5, shade);                 // rounded lump
  } else {
    g.box(x, GY + sz * 0.25, z, sz, sz * 0.5, sz * 0.8, shade, frac(seed, 4) * 1.4); // masonry shard
  }
  if (sz > 0.85) col.add(x, GY, z, sz, sz * 0.5, sz * 0.85);     // only the big ones block
}

// ---- grass / weed tuft reclaiming the stone -----------------------------
function grassTuft(g, x, z, seed) {
  const n = 3 + hash(seed, 3) % 3;
  for (let i = 0; i < n; i++) {
    const a = frac(seed, i, 1) * Math.PI * 2, r = 0.16 * frac(seed, i, 2);
    const c = hash(seed, i, 4) % 4 === 0 ? P.dirtLight : (hash(seed, i) % 2 ? P.leaf2 : P.leaf3);
    g.cone(x + Math.cos(a) * r, GY, z + Math.sin(a) * r,
      0.06 + 0.03 * frac(seed, i, 5), 0.32 + frac(seed, i, 3) * 0.45, c, 4);
  }
}

// ---- entry --------------------------------------------------------------
export function buildRomanRuins(g, col, scene) {
  const SEED = 6103;   // stable base seed for this feature (cell 6,1)

  // 1) the colonnade: a jittered grid of columns, culled to the SW triangle.
  const xs = [], zs = [];
  for (let x = RX0 + 8; x <= RX1 - 8; x += 8.5) xs.push(x);
  for (let z = RZ0 + 8; z <= RZ1 - 8; z += 8.5) zs.push(z);
  for (let ix = 0; ix < xs.length; ix++)
    for (let iz = 0; iz < zs.length; iz++) {
      const seed = hash(SEED, ix * 31 + 7, iz * 17 + 3);
      const px = xs[ix] + (frac(hash(seed, 1), 5) - 0.5) * 2.0;   // decorrelated jitter
      const pz = zs[iz] + (frac(hash(seed, 2), 9) - 0.5) * 2.0;
      if (!inTriangle(px, pz)) continue;
      column(g, col, px, pz, seed);
      if (hash(seed, 40) % 3 === 0) grassTuft(g, px + 1.4, pz + 0.9, hash(seed, 41)); // weeds at some bases
    }

  // 2) two whole columns toppled into drum rows, near the open SW corner.
  toppledColumn(g, col, -207, -706, 'z', hash(SEED, 101));   // lying north-south along the west leg
  toppledColumn(g, col, -196, -682, 'x', hash(SEED, 102));   // lying east-west along the south leg

  // 3) a fallen pediment with spilled cornice, tucked into the SW corner.
  pedimentFragment(g, col, -201, -697, hash(SEED, 200));

  // 4) marble rubble scattered across the triangle (candidate points, culled).
  for (let i = 0; i < 90; i++) {
    const seed = hash(SEED, 300, i);
    const x = RX0 + 6 + frac(hash(seed, 1), 5) * (RX1 - RX0 - 12);
    const z = RZ0 + 6 + frac(hash(seed, 2), 9) * (RZ1 - RZ0 - 12);
    if (!inTriangle(x, z)) continue;
    chunk(g, col, x, z, seed);
  }

  // 5) a looser scatter of grass tufts over the whole site.
  for (let i = 0; i < 70; i++) {
    const seed = hash(SEED, 400, i);
    const x = RX0 + 6 + frac(hash(seed, 1), 5) * (RX1 - RX0 - 12);
    const z = RZ0 + 6 + frac(hash(seed, 2), 9) * (RZ1 - RZ0 - 12);
    if (!inTriangle(x, z)) continue;
    grassTuft(g, x, z, seed);
  }

  // 6) cypress + a couple of scrubby trees reclaiming the ruins (kind 1 =
  //    conifer/cypress reads Mediterranean). Hand-placed in the gaps.
  const TREES = [
    [-213, -755, 0.75, 1], [-214, -700, 0.7, 1], [-212, -678, 0.6, 2],
    [-150, -680, 0.7, 1], [-176, -676, 0.55, 2],
  ];
  for (const [tx, tz, ts, tk] of TREES)
    if (inTriangle(tx, tz)) tree(g, col, tx, tz, ts, tk);
}
