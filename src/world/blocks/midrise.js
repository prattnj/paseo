// Midrise commercial blocks: big-box stores, shop strips, the odd apartment,
// and large parking lots, laid out in a rotated local frame.
import { PALETTE as P, SIDEWALK_H } from '../../core/palette.js';
import { hash, pick, frac } from '../../core/util.js';
import { apartment, shop } from './pieces.js';
import { parkedCar, tree, bench, planter, dumpster } from './props.js';
import { slabAndSidewalk, parkingLotAt, streetTrees, cornerLamps, concreteScoring } from './kit.js';

const STORE_COLORS = [0xc0504a, 0x4a7fb5, 0x4f9b5e, 0xd08a3a, 0x8a5aa8, 0x3a9aa0, 0xcaa93a];

// Midrise blocks: commercial only — big-box stores, smaller shop strips, the
// odd apartment building, and large parking lots. Four layouts, each rotated a
// random quarter-turn so orientation varies. Authored in a local (u, v) frame
// centred on the block: T() maps it to world and Dw/Dd swap box dimensions for
// 90/270 turns (axis-aligned boxes stay axis-aligned), so no per-building
// rotation is needed. gy = the raised block surface.

function buildMidrise(g, col, b, seed) {
  const r = slabAndSidewalk(g, col, b, P.concrete);
  // Finer scored-panel grid so the commercial pad reads as a clean plaza rather
  // than one flat sheet; stores and lots below cover it where they sit.
  concreteScoring(g, r, 9);
  const cx = r.cx, cz = r.cz, gy = SIDEWALK_H + 0.2;
  const rot = hash(seed, 7) % 4, q = rot * Math.PI / 2;
  const ca = [1, 0, -1, 0][rot], sa = [0, 1, 0, -1][rot];
  const T = (u, v) => [cx + u * ca - v * sa, cz + u * sa + v * ca];
  const Dw = (uw, vd) => (rot % 2 === 0 ? uw : vd);
  const Dd = (uw, vd) => (rot % 2 === 0 ? vd : uw);
  // local-frame helpers
  const slab = (u, v, uw, vd, fl, s) => { const [x, z] = T(u, v); apartment(g, col, x, z, Dw(uw, vd), Dd(uw, vd), fl, pick(P.bodies, s, 1), s, true); };
  const car = (u, v, ry, s) => { const [x, z] = T(u, v); parkedCar(g, col, x, z, ry + q, s, gy + 0.01); };
  const treeAt = (u, v, sc, k) => { const [x, z] = T(u, v); tree(g, col, x, z, sc, k); };
  const benchAt = (u, v, ry) => { const [x, z] = T(u, v); bench(g, col, x, z, ry + q); };
  const planterAt = (u, v) => { const [x, z] = T(u, v); planter(g, col, x, z); };
  const dumpAt = (u, v, ry, s) => { const [x, z] = T(u, v); dumpster(g, col, x, z, ry + q, s); };
  const pave = (u, v, uw, vd, hex, by) => { const [x, z] = T(u, v); g.boxB(x, by, z, Dw(uw, vd), 0.02, Dd(uw, vd), hex); };
  const shopAt = (u, v, uw, vd, s, faceV) => { const [x, z] = T(u, v); shop(g, col, x, z, Dw(uw, vd), Dd(uw, vd), s, q + (faceV < 0 ? Math.PI : 0)); };

  // A big-box store: a large box with a brand signage fascia, a glazed
  // storefront with pilasters and a central entrance/canopy, and rooftop
  // units. `faceV` is the side the storefront faces (toward the lot/street).
  const bigStore = (u, v, uw, vd, s, faceV = -1) => {
    const [x, z] = T(u, v), brand = pick(STORE_COLORS, s, 1), h = 8 + hash(s, 2) % 3;
    g.boxB(x, gy, z, Dw(uw, vd), h, Dd(uw, vd), P.offwhite);
    col.add(x, 0, z, Dw(uw, vd), h + 0.5, Dd(uw, vd));
    g.boxB(x, gy + h, z, Dw(uw + 0.4, vd + 0.4), 0.7, Dd(uw + 0.4, vd + 0.4), P.roofLight); // parapet
    for (let i = -1; i <= 1; i++) { const [rx, rz] = T(u + i * uw * 0.26, v + vd * 0.12); g.boxB(rx, gy + h + 0.7, rz, 3, 1.4, 3, P.concreteDark); }
    const front = v + faceV * vd / 2;
    // box on the front face: (uCenter, outward offset, wy, uLen, height, vThick)
    const fb = (uc, off, wy, uL, hh, vT, hex) => { const [fx, fz] = T(uc, front + faceV * off); g.box(fx, wy, fz, Dw(uL, vT), hh, Dd(uL, vT), hex); };
    fb(u, 0.16, gy + h - 1.9, uw - 1, 1.7, 0.5, brand);            // signage fascia
    fb(u, 0.08, gy + 1.5, uw - 3, 3.2, 0.3, P.glassDark);          // storefront glass (back embedded)
    const np = Math.max(2, Math.floor((uw - 3) / 8));
    for (let i = 0; i <= np; i++) fb(u - (uw - 3) / 2 + i * (uw - 3) / np, 0.18, gy + 1.5, 0.9, h - 2, 0.55, P.offwhite); // pilasters
    fb(u, 0.9, gy + 3.6, 12, 0.3, 1.9, brand);                     // entrance canopy
    fb(u, 0.14, gy + 1.5, 10, 3.6, 0.42, P.glassDark);             // entrance glazing
  };

  // Large multi-row asphalt lot (shared with school/hospital), placed in the
  // block's local frame and rotated with it.
  const parkingLot = (u0, v0, uw, vd, s) => { const [x, z] = T(u0, v0); parkingLotAt(g, col, x, z, uw, vd, gy, s, q); };
  // A run of smaller shops along u, storefronts facing `faceV`.
  const shopStrip = (u0, v0, uw, faceV, s) => {
    const n = Math.max(2, Math.round(uw / 11)), sw = uw / n;
    for (let i = 0; i < n; i++) shopAt(u0 - uw / 2 + sw * (i + 0.5), v0, sw - 1.4, 9, hash(s, i, 1), faceV);
  };
  // Two back-to-back shop rows: one facing the lot (-v), one the street (+v),
  // filling what would otherwise be dead space behind a single strip.
  const doubleShopRow = (u0, vLot, uw, s) => {
    shopStrip(u0, vLot, uw, -1, hash(s, 1));
    shopStrip(u0, vLot + 9, uw, 1, hash(s, 2));
  };

  const template = hash(seed, 8) % 4;
  if (template === 0) {            // ---- anchor big-box + big lot ----
    bigStore(0, 24, 88, 30, hash(seed, 1), -1);
    parkingLot(0, -18, 88, 40, hash(seed, 2));
    dumpAt(-40, 38, 0, hash(seed, 3)); dumpAt(40, 38, 0, hash(seed, 4));
    treeAt(-42, 6, 0.8, 1); treeAt(42, 6, 0.8, 0); planterAt(-20, 6); planterAt(20, 6);
  } else if (template === 1) {     // ---- strip mall: anchor + double shop row + lot ----
    bigStore(-26, 24, 34, 30, hash(seed, 1), -1);
    doubleShopRow(24, 30, 40, hash(seed, 2)); // lot-facing + street-facing
    parkingLot(0, -16, 88, 42, hash(seed, 3));
    dumpAt(-42, 40, 0, hash(seed, 4));
    treeAt(2, 10, 0.8, 0); planterAt(-6, 8); planterAt(10, 8);
  } else if (template === 2) {     // ---- mixed: store + double shop row + apartment ----
    bigStore(-24, 24, 40, 30, hash(seed, 1), -1);
    doubleShopRow(26, 30, 40, hash(seed, 2));
    slab(38, -18, 16, 40, 5 + hash(seed, 3) % 3, hash(seed, 4)); // apartment on the side
    parkingLot(-6, -18, 72, 40, hash(seed, 5));
    dumpAt(-42, 40, 0, hash(seed, 6));
    treeAt(2, 8, 0.8, 1); planterAt(-10, 8);
  } else {                          // ---- twin big-boxes + street-facing shops ----
    bigStore(-23, 14, 42, 42, hash(seed, 1), -1);
    bigStore(23, 14, 42, 42, hash(seed, 2), -1);
    shopStrip(0, 41, 84, 1, hash(seed, 5)); // fill the strip behind the boxes
    parkingLot(0, -28, 88, 30, hash(seed, 3));
    dumpAt(0, 36, 0, hash(seed, 4));
    treeAt(-43, -6, 0.8, 0); treeAt(43, -6, 0.8, 1); planterAt(0, -8);
  }
  streetTrees(g, col, b, seed);
  cornerLamps(g, col, b);
}

export { buildMidrise };
