// A Beaux-Arts, Flatiron-STYLE triangular office block filling the open
// south-west triangle of the otherwise-empty grid cell (8,3) — the north-
// plateau pocket bounded by the x=0 central avenue (west), the z=-450 street
// (south) and the coastal parkway, which shaves the cell's north-east corner
// off. Like arena.js / prison.js / roman-ruins.js this is a hand-placed
// WORLD-COORDINATE feature drawn straight into the shared city GeoBatch +
// Colliders; cell (8,3) is a removed (unbuilt) cell, so nothing in
// layout.js/city.js owns it.
//
// FOOTPRINT is a right triangle (right angle at the SW corner) — not the razor
// prow of the real Flatiron, just its ARCHITECTURE at right-triangle scale:
//   A  (SW, right angle)  ~ (14, -453)   legs meet here
//   B  (SE, acute)        ~ (104,-453)   south leg runs A->B along the street
//   C  (NW, acute)        ~ (14, -558)   west leg runs A->C along the avenue
//   hypotenuse B->C faces NE, set back a few metres inside the parkway.
// The building fills this triangle with a sidewalk margin off all three sides.
//
// The solid mass is built as a staircase of axis-aligned full-height body
// slabs marching north along z (each inscribed just inside the hypotenuse);
// the stepped NE edge is then hidden behind ONE clean ROTATED limestone
// facade wall laid along the hypotenuse. The two leg walls (west, south) are
// axis-aligned. All three faces carry the same Beaux-Arts treatment: a
// rusticated ground-floor base with shopfronts, five upper storeys of framed
// windows separated by horizontal string-courses, and a heavy projecting
// cornice. A rooftop water tank, stair bulkhead and a flag at the SE prow
// finish it. Collision is the same staircase of axis-aligned boxes.
//
// Everything is deterministic (coordinate-seeded hashes) — no Math.random.
import { PALETTE as P } from '../../core/palette.js';
import { TOP_Y } from '../island.js';
import { hash, pick } from '../../core/util.js';
import { tree, bench } from '../blocks/index.js';

const GY = TOP_Y;                       // flat plateau surface

// ---- footprint (already inset a sidewalk margin off the three edges) -----
const A = [14, -453];                   // SW right-angle corner
const B = [104, -453];                  // SE acute corner (end of south leg)
const C = [14, -558];                   // NW acute corner (end of west leg)
const WX = A[0];                        // west leg plane (x), building extends +x (east)
const SZ = A[1];                        // south leg plane (z), building extends -z (north)
const SLEN = B[0] - WX;                 // south leg length (+x)
const WLEN = SZ - C[1];                 // west  leg length (+ toward -z, i.e. |Δz|)
const WMID = (SZ + C[1]) / 2;           // z-centre of the west wall
const SMID = (WX + B[0]) / 2;           // x-centre of the south wall

// Hypotenuse B->C, and the yaw that aligns a box's local +x with it (so its
// local +z is the outward NE normal, where windows/mouldings sit proud).
const HDX = C[0] - B[0], HDZ = C[1] - B[1];
const HYP = Math.hypot(HDX, HDZ);
const HRY = Math.atan2(-HDZ, HDX);
const HC = Math.cos(HRY), HS = Math.sin(HRY);
// East extent of the triangle at a given z (the hypotenuse x for that z).
const hypX = (z) => B[0] + (z - B[1]) * (C[0] - B[0]) / (C[1] - B[1]);
// World point from origin B, offset dx along the hypotenuse and dz outward.
const hp = (dx, dz) => [B[0] + dx * HC + dz * HS, B[1] - dx * HS + dz * HC];

// ---- heights ------------------------------------------------------------
const GROUND_H = 4.8;                   // tall rusticated retail storey
const FLOOR_H = 3.9;                    // each of the 5 upper storeys
const UPPER = 5;                        // 5 upper storeys (6 total incl. ground)
const H = GROUND_H + UPPER * FLOOR_H;   // wall height (below the cornice)
const CORN_H = 1.2;                     // projecting cornice
// y-centre of each upper storey's window band.
const winRows = [];
for (let f = 0; f < UPPER; f++) winRows.push(GY + GROUND_H + f * FLOOR_H + FLOOR_H * 0.5);

// ---- one window (glazing pane + sill + lintel), proud of a face -----------
// `place(dAlong, out, wy, sAlong, sy, sOut, hex)` draws a box `out` proud of
// the wall plane with the right axis/rotation, so the same body serves all
// three faces. The three pieces are stacked with NO vertical overlap (lintel
// above the pane, sill below it), so no two faces sit near-coplanar — this is
// what keeps the facade free of z-fighting.
function framedWindow(g, place, wy, seed) {
  const tint = pick(P.windowTints, seed, 1);
  place(0, 0.06, wy, 1.4, 2.0, 0.12, tint);                     // glazing pane
  place(0, 0.10, wy + 1.15, 1.6, 0.26, 0.16, P.limestoneLt);    // lintel (above the pane)
  place(0, 0.10, wy - 1.15, 1.7, 0.22, 0.14, P.limestoneShade); // sill  (below the pane)
}

// A shopfront bay for the ground floor: dark glass, awning and a sign band —
// again stacked with no vertical overlap between the stone pieces.
function shopBay(g, place, seed) {
  const y = GY;
  place(0, 0.06, y + 0.60, 2.6, 1.2, 0.14, P.limestoneDark);        // bulkhead / stall riser
  place(0, 0.06, y + 2.55, 2.4, 2.3, 0.14, P.glassDark);            // shop glazing (y 1.4..3.7)
  place(0, 0.34, y + 3.95, 2.9, 0.18, 1.1, pick(P.awnings, seed, 2)); // awning (clearly proud)
  place(0, 0.10, y + 4.45, 2.7, 0.40, 0.16, P.limestoneShade);      // transom / sign band
}

// Tile a straight face between along∈[lo,hi] with base shops + upper windows.
// `at(cAlong)` returns a `place(dAlong, out, wy, sAlong, sy, sOut, hex)`
// closure bound to that centre — one per face, hiding the axis/rotation.
function tileFace(g, lo, hi, at, seed) {
  const len = hi - lo;
  const bays = Math.max(1, Math.round(len / 6.5));
  const bw = len / bays;
  for (let i = 0; i < bays; i++) {
    const c = lo + bw * (i + 0.5);
    const place = at(c);
    const s = hash(seed, i, 3);
    shopBay(g, (d, o, wy, sa, sy, so, hex) => place(d, o, wy, sa, sy, so, hex), s);
    for (let r = 0; r < winRows.length; r++) {
      framedWindow(g, (d, o, wy, sa, sy, so, hex) => place(d, o, wy, sa, sy, so, hex), winRows[r], hash(s, r, 7));
    }
  }
}

export function buildFlatiron(g, col, scene) {
  const SEED = 8303;                    // stable base seed (cell 8,3)

  // 1) SIDEWALK skirt on the three street sides (thin concrete, just off GY).
  g.boxB(SMID, GY, SZ + 1.6, SLEN + 6, 0.16, 3.2, P.sidewalk);                      // south
  g.boxB(WX - 1.6, GY, WMID, 3.2, 0.16, WLEN + 6, P.sidewalk);                       // west
  { const [sx, sz] = hp(HYP / 2, 2.0);                                              // hypotenuse
    g.boxB(sx, GY, sz, HYP - 4, 0.16, 3.4, P.sidewalk, HRY); }

  // 2) SOLID MASS: a staircase of axis-aligned full-height limestone slabs
  //    marching north (−z). Each slab runs east to the hypotenuse at its
  //    SOUTH edge (`hypX(z)`), so the mass fills the triangle right up to the
  //    acute corners with no void behind the prow. The thin sawtooth this
  //    leaves on the NE (≤ STEP·slope, ~0.65 m) tucks under the diagonal
  //    cladding wall (thickness 1.1) added in step 5, so it never shows.
  const STEP = 1.0;
  for (let z = SZ; z > C[1] + 0.1; z -= STEP) {
    const zN = Math.max(z - STEP, C[1]);          // north edge of this slab
    const xe = hypX(z);                            // east extent = hypotenuse at the SOUTH edge
    if (xe <= WX + 0.3) continue;
    const cx = (WX + xe) / 2, cz = (z + zN) / 2;
    const sx = xe - WX, sz = z - zN;
    // Uniform body tone: the slabs' side faces are visible edge-on along the
    // west wall, so any per-slab shade variation would read as vertical stripes.
    g.boxB(cx, GY, cz, sx, H, sz, P.limestone);
    col.add(cx, GY, cz, sx, H + CORN_H, sz);
  }

  // 3) FACE TREATMENT on the two axis-aligned leg walls.
  //    South wall: plane z=SZ, faces +z (south); position runs along +x.
  tileFace(g, WX + 2.5, B[0] - 3.5,
    (c) => (d, o, wy, sa, sy, so, hex) => g.box(c + d, wy, SZ + o + so / 2, sa, sy, so, hex),
    hash(SEED, 11));
  //    West wall: plane x=WX, faces -x (west); position runs along z.
  tileFace(g, C[1] + 3.5, SZ - 2.5,
    (c) => (d, o, wy, sa, sy, so, hex) => g.box(WX - o - so / 2, wy, c + d, so, sy, sa, hex),
    hash(SEED, 12));

  // 4) horizontal storey string-courses on the two leg walls — thin proud
  //    bands at the ground-floor top + each upper floor line, INSET from the
  //    corners so they never overlap the perpendicular wall's courses (the
  //    corner is finished by a quoin in step 6).
  const courseY = [0, 1, 2, 3, 4].map((f) => GY + GROUND_H + f * FLOOR_H);
  for (const cy of courseY) {
    // Body-toned courses: the proud reveal reads as a subtle shadow line
    // rather than a hard dark stripe (keeps the facade from looking banded).
    g.box(SMID, cy, SZ + 0.15, SLEN - 1.4, 0.30, 0.14, P.limestone);  // south
    g.box(WX - 0.15, cy, WMID, 0.14, 0.30, WLEN - 1.4, P.limestone);  // west
  }

  // 5) HYPOTENUSE facade wall (rotated): clean diagonal cladding over the
  //    staircase, then the same shopfront/window/course treatment.
  const [mx, mz] = hp(HYP / 2, 0.35);
  g.boxB(mx, GY, mz, HYP, H, 1.1, P.limestone, HRY);                 // cladding slab (outer face ≈ dz 0.9)
  for (const cy of courseY) {
    const [cx2, cz2] = hp(HYP / 2, 0.97);                            // proud of the cladding face
    g.box(cx2, cy, cz2, HYP - 1.4, 0.30, 0.14, P.limestone, HRY);
  }
  //    windows + shops along the hypotenuse, sitting on the cladding's outer
  //    face (local +z ≈ 0.9, NE side) — `o` is the back-gap like the leg walls.
  tileFace(g, 6, HYP - 6,
    (c) => (d, o, wy, sa, sy, so, hex) => {
      const [wx, wz] = hp(c + d, 0.9 + o + so / 2);
      g.box(wx, wy, wz, sa, sy, so, hex, HRY);
    },
    hash(SEED, 13));

  // 6) CORNER QUOINS + CORNICE. Rusticated quoin columns rise to the cornice
  //    base at each corner (A, B, C); the crown then wraps the whole top.
  const top = GY + H;
  for (const [qx, qz] of [A, B, C]) g.boxB(qx, GY, qz, 1.0, top - GY, 1.0, P.limestoneShade);
  //    projecting crown on the three faces, inset ~1 m from the corners…
  g.boxB(SMID, top, SZ + 0.35, SLEN - 2.0, CORN_H, 1.3, P.limestoneLt);                          // south
  g.boxB(WX - 0.35, top, WMID, 1.3, CORN_H, WLEN - 2.0, P.limestoneLt);                          // west
  { const [cx2, cz2] = hp(HYP / 2, 1.0); g.boxB(cx2, top, cz2, HYP - 3.2, CORN_H, 1.3, P.limestoneLt, HRY); } // hyp
  //    …plus an overhanging cornice CAP at each corner so the crown wraps the
  //    corners like the sides. Each cap projects ~1 m past its corner and
  //    ABUTS the inset runs (shared faces, no coplanar overlap → no z-fight).
  for (const [qx, qz] of [A, B, C]) g.boxB(qx, top, qz, 2.0, CORN_H, 2.0, P.limestoneLt);
  // low parapet sitting back on the roof slab, INSET clear of the corner
  // quoins and the hypotenuse cornice so no faces meet coplanar.
  for (let z = SZ - 1.4; z > C[1] + 1.4; z -= STEP) {
    const zN = Math.max(z - STEP, C[1] + 1.4);
    const xe = hypX(zN) - 1.6;
    if (xe <= WX + 1.6) continue;
    g.boxB((WX + 1.4 + xe) / 2, top + CORN_H, (z + zN) / 2, xe - WX - 1.4, 0.6, z - zN, P.limestoneShade);
  }

  // 7) ROOFTOP: stair bulkhead near the wide SW back, and the classic NYC
  //    wooden water tank on a steel frame; a flagpole at the SE prow.
  const roofY = top + CORN_H + 0.6;
  g.boxB(WX + 14, roofY, SZ - 12, 6, 3.2, 6, P.limestoneShade);          // stair/lift bulkhead
  const tkx = WX + 10, tkz = SZ - 26;
  for (const sx of [-1.4, 1.4]) for (const sz of [-1.4, 1.4])
    g.box(tkx + sx, roofY + 2.4, tkz + sz, 0.22, 4.8, 0.22, P.roofDark);  // tank legs
  g.cyl(tkx, roofY + 4.8, tkz, 2.0, 2.0, 3.6, 0x7a6a52);                  // wooden tank body
  g.cone(tkx, roofY + 8.4, tkz, 2.2, 1.2, P.roofDark, 8);                 // conical tank lid
  // flagpole standing on the roof just in from the SE prow (corner B), flag
  // flying near its top.
  const fpx = B[0] - 3, fpz = SZ - 3;
  g.boxB(fpx, top + CORN_H, fpz, 0.18, 7, 0.18, P.roofDark);                       // pole
  g.box(fpx + 0.95, top + CORN_H + 6.0, fpz, 1.7, 0.9, 0.06, pick(P.bodies, SEED, 5)); // flag

  // 8) a couple of street trees + a bench in the NE plaza left between the
  //    hypotenuse and the parkway (the "sidewalk margin" breathing room).
  const PLAZA = [[hp(HYP * 0.32, 4.2), 0.7], [hp(HYP * 0.62, 4.6), 0.65], [hp(HYP * 0.85, 4.0), 0.6]];
  for (const [[px, pz], ps] of PLAZA) tree(g, col, px, pz, ps, 0);
  { const [bx, bz] = hp(HYP * 0.5, 3.4); bench(g, col, bx, bz, HRY + Math.PI / 2); }
}
