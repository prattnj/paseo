// Industrial district and its machinery: shipping containers, silos, tanks,
// smokestacks, crate piles, and the varied loading-dock sheds.
import { PALETTE as P, SIDEWALK_H } from '../../core/palette.js';
import { hash, pick } from '../../core/util.js';
import { dumpster, parkedCar } from './props.js';
import { slabAndSidewalk, parkingLotAt, cornerLamps, concreteScoring, concreteBorder } from './kit.js';

const IND_BODIES = [P.concreteDark, P.offwhite, 0x8a8f94, 0xb7b2a4, 0x777c82, 0xa89a86];

// Darken a hex colour toward black by fraction f (0..1).
function darken(hex, f) {
  const r = (hex >> 16) & 255, gg = (hex >> 8) & 255, bb = hex & 255;
  const m = (v) => Math.max(0, Math.round(v * (1 - f)));
  return (m(r) << 16) | (m(gg) << 8) | m(bb);
}

// One shipping container: coloured body framed by dark top/bottom rails, with
// recessed cargo doors + locking bars on the +local-x end when `door`.
function container(g, x, y, z, ry, hex, L, W, H, door) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const at = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];
  const RAIL = 0x24262b;
  g.boxB(x, y, z, L, H, W, hex, ry);
  g.boxB(x, y, z, L + 0.14, 0.2, W + 0.14, RAIL, ry);            // bottom rail
  g.boxB(x, y + H - 0.2, z, L + 0.14, 0.2, W + 0.14, RAIL, ry);  // top rail
  if (door) {
    const [ex, ez] = at(L / 2, 0);
    g.box(ex, y + H / 2, ez, 0.12, H - 0.55, W - 0.4, darken(hex, 0.2), ry); // door panel
    for (const off of [-W * 0.22, W * 0.22]) {
      const [bx, bz] = at(L / 2, off);
      g.box(bx, y + H / 2, bz, 0.18, H - 0.75, 0.12, RAIL, ry);  // locking bar
    }
  }
}

// A stack of shipping containers: nx (end-to-end) × nz (side-by-side) columns,
// each stacked to a varied height (1..maxHigh). Doors face the +x end column.
function containerStack(g, col, x, z, ry, seed, nx, nz, maxHigh) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const L = 6, W = 2.5, H = 2.6, gx = 0.5, gz = 0.25, lift = H + 0.03;
  const COLORS = [0xb5432f, 0x2f5c8a, 0x2e7d5b, 0xc47a2a, 0x9a9ea3, 0x8a3f4d, 0x3a7d8a, 0xb0a04a];
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const u = (i - (nx - 1) / 2) * (L + gx), v = (j - (nz - 1) / 2) * (W + gz);
    const wx = x + u * c + v * s, wz = z - u * s + v * c;
    const high = 1 + hash(seed, i * 31 + j, 1) % maxHigh;
    for (let k = 0; k < high; k++) {
      const hex = COLORS[hash(seed, i * 31 + j, k + 2) % COLORS.length];
      container(g, wx, SIDEWALK_H + k * lift, wz, ry, hex, L, W, H, i === nx - 1);
    }
    col.add(wx, 0, wz, L, high * lift, W, ry);
  }
}

// Tall smokestack with red/white hazard bands near the top.
function smokestack(g, col, x, z, seed) {
  const h = 24 + hash(seed, 1) % 14;
  g.cyl(x, SIDEWALK_H, z, 1.5, 2.1, h, P.concreteDark, 12);
  for (let k = 0; k < 3; k++)
    g.cyl(x, SIDEWALK_H + h - 7 + k * 2.2, z, 1.62, 1.62, 1.2, k % 2 ? 0xdadada : 0xb5432f, 12);
  g.cyl(x, SIDEWALK_H + h, z, 1.85, 1.85, 1.0, P.concreteDark, 12);
  col.add(x, 0, z, 4.2, h + 1, 4.2);
}

// A neat pile of stacked crates (varied woods/paints, a few gaps and doubles).
function cratePile(g, col, x, z, seed, ry = 0) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const at = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];
  const CR = [P.trunk, 0x8a6a45, P.roofRed, 0x4a6b8a, P.concreteDark, 0x6f7378];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    if (hash(seed, i * 3 + j, 1) % 4 === 0) continue;
    const [px, pz] = at((i - 1) * 2.35, (j - 1) * 2.35);
    const high = 1 + hash(seed, i * 3 + j, 2) % 2;
    for (let k = 0; k < high; k++)
      g.boxB(px, SIDEWALK_H + k * 2.05, pz, 2.0, 2.0, 2.0, pick(CR, seed, i * 3 + j + k * 5), ry);
    col.add(px, 0, pz, 2.0, high * 2.05, 2.0, ry);
  }
}

// A varied industrial building: box body with pilaster ribs, one of four roof
// styles (gable / parapet+units / multi-ridge / monitor), and loading docks.
function industrialBuilding(g, col, x, z, w, d, seed, ry) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const at = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];
  const body = pick(IND_BODIES, seed, 1);
  const style = hash(seed, 2) % 4;
  const y = SIDEWALK_H, h = 6 + hash(seed, 3) % 6;
  g.boxB(x, y, z, w, h, d, body, ry);
  // pilaster ribs up the long (±local-z) walls
  const nR = Math.max(2, Math.round(w / 8));
  for (let i = 0; i <= nR; i++) {
    const off = -w / 2 + (w * i) / nR;
    for (const sgn of [-1, 1]) { const [rx, rz] = at(off, sgn * d / 2); g.box(rx, y + h / 2, rz, 0.5, h, 0.28, darken(body, 0.14), ry); }
  }
  if (style === 0) {
    g.prism(x, y + h, z, w + 0.6, 2.2, d + 0.6, P.roofDark, ry);
  } else if (style === 1) {
    g.boxB(x, y + h - 0.1, z, w + 0.5, 0.6, d + 0.5, P.roofDark, ry);
    for (const [ux, uz] of [[w * 0.2, d * 0.15], [-w * 0.18, -d * 0.2]]) { const [ax, az] = at(ux, uz); g.boxB(ax, y + h + 0.4, az, 3, 1.5, 3, 0x8a8f94, ry); }
  } else if (style === 2) {
    const nr = Math.max(3, Math.round(d / 6)), seg = d / nr;
    for (let i = 0; i < nr; i++) { const [ax, az] = at(0, -d / 2 + seg * (i + 0.5)); g.prism(ax, y + h, az, w + 0.5, 1.6, seg, P.roofDark, ry); }
  } else {
    g.prism(x, y + h, z, w + 0.6, 1.3, d + 0.6, P.roofDark, ry);
    g.boxB(x, y + h + 0.1, z, w * 0.5, 1.5, d * 0.6, body, ry);
    g.box(x, y + h + 0.95, z, w * 0.5 + 0.06, 0.8, d * 0.6 + 0.06, P.glassDark, ry);
  }
  // loading-dock roller doors along one long wall
  const nd = Math.max(2, Math.floor(w / 9));
  for (let i = 0; i < nd; i++) {
    const off = (i - (nd - 1) / 2) * (w / nd);
    const [dx, dz] = at(off, d / 2);
    g.box(dx, y + 1.6, dz, Math.min(4.2, w / nd - 1.4), 3.2, 0.25, hash(seed, i, 6) % 2 ? 0x6f7176 : P.doorDark, ry);
  }
  col.add(x, 0, z, w, h + 2.4, d, ry);
}

function silo(g, col, x, z, seed) {
  const h = 18 + (hash(seed, 1) % 12);   // 18..29 — much taller
  const rad = 2.4;
  g.cyl(x, SIDEWALK_H, z, rad, rad, h, P.offwhite, 12);
  for (let k = 1; k <= 2; k++) g.cyl(x, SIDEWALK_H + (h * k) / 3, z, rad + 0.06, rad + 0.06, 0.3, P.concreteDark, 12); // hoop bands
  g.cone(x, SIDEWALK_H + h, z, rad + 0.1, 2.8, P.roofDark, 12);   // conical cap
  col.add(x, 0, z, rad * 2 + 0.4, h + 2.8, rad * 2 + 0.4);
}

// Industrial horizontal storage tank on saddles.
function tank(g, col, x, z, ry, seed) {
  const s = Math.sin(ry), c = Math.cos(ry);
  const at = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];
  for (const off of [-1.6, 1.6]) {
    const [px, pz] = at(off, 0);
    g.boxB(px, SIDEWALK_H, pz, 0.6, 0.9, 2.0, P.concreteDark, ry);
  }
  // lying cylinder approximated with stacked boxes (keeps batching simple)
  g.box(x, SIDEWALK_H + 1.7, z, 5.2, 1.7, 1.7, pick([P.white, P.roofRed, 0x4a6b8a], seed, 1), ry);
  g.box(x, SIDEWALK_H + 1.15, z, 4.6, 0.6, 2.0, pick([P.white, P.roofRed, 0x4a6b8a], seed, 1), ry);
  g.box(x, SIDEWALK_H + 2.55, z, 4.6, 0.6, 1.2, pick([P.white, P.roofRed, 0x4a6b8a], seed, 1), ry);
  col.add(x, 0, z, 5.4, 3.2, 2.2, ry);
}

function buildIndustrial(g, col, b, seed) {
  const r = slabAndSidewalk(g, col, b, P.concrete);
  // Utilitarian yard finish: a coarse scored-joint grid and a yellow painted
  // safety boundary. Buildings and lots drawn below cover it where they sit.
  concreteScoring(g, r, 14);
  concreteBorder(g, r);
  const cx = r.cx, cz = r.cz, w = r.x1 - r.x0, d = r.z1 - r.z0;

  // per-block orientation (mixes the rotation up) + local frame
  const rot = hash(seed, 7) % 4, ry = rot * Math.PI / 2;
  const c = Math.cos(ry), s = Math.sin(ry);
  const T = (u, v) => [cx + u * c + v * s, cz - u * s + v * c];
  const Lu = rot % 2 === 0 ? w : d, Lv = rot % 2 === 0 ? d : w;

  const bSign = hash(seed, 2) % 2 ? 1 : -1;   // which half holds the buildings
  const hasLot = hash(seed, 1) % 2 === 0;     // ~half the blocks get a parking lot
  const bv = bSign * Lv * 0.24;

  // --- building half: one big shed, or two side-by-side ---
  if (hash(seed, 3) % 2 === 0) {
    for (const su of [-1, 1]) {
      const [bx, bz] = T(su * Lu * 0.23, bv);
      industrialBuilding(g, col, bx, bz, Lu * 0.4, Lv * 0.42, hash(seed, 10 + su), ry);
    }
  } else {
    const [bx, bz] = T(0, bv);
    industrialBuilding(g, col, bx, bz, Lu * 0.86, Lv * 0.42, hash(seed, 10), ry);
  }
  // loading apron in the open lane between the building and the yard — the
  // building's near edge is at v = bSign*Lv*0.03, so keep these on the yard
  // side of centre so nothing ends up half inside the building
  const [dx0, dz0] = T(-Lu * 0.32, -bSign * Lv * 0.01);
  dumpster(g, col, dx0, dz0, ry, hash(seed, 60));
  const [tx0, tz0] = T(Lu * 0.30, -bSign * Lv * 0.01);
  parkedCar(g, col, tx0, tz0, ry, hash(seed, 61), SIDEWALK_H + 0.01, 'truck');

  // --- yard half: a parking lot, or a grid of industrial features ---
  const yv = -bSign * Lv * 0.26;
  if (hasLot) {
    const [lx, lz] = T(0, yv);
    parkingLotAt(g, col, lx, lz, Lu * 0.86, Lv * 0.42, SIDEWALK_H, hash(seed, 20), ry, 'truck', 28);
  } else {
    const gu = 3, gv = 2, uSpan = Lu * 0.86, vSpan = Lv * 0.42;
    for (let i = 0; i < gu; i++) for (let j = 0; j < gv; j++) {
      const u = -uSpan / 2 + (uSpan * (i + 0.5)) / gu;
      const v = yv - vSpan / 2 + (vSpan * (j + 0.5)) / gv;
      const [fx, fz] = T(u, v);
      const fs = hash(seed, i * 7 + j, 51);
      const kind = hash(seed, i * 7 + j, 50) % 6;
      if (kind === 0 || kind === 1) containerStack(g, col, fx, fz, ry + (kind === 1 ? Math.PI / 2 : 0), fs, 2, 2, 4);
      else if (kind === 2) { for (let k = 0; k < 3; k++) { const [sx, sz] = T(u - 6 + k * 5.2, v); silo(g, col, sx, sz, hash(fs, k)); } }
      else if (kind === 3) tank(g, col, fx, fz, ry, fs);
      else if (kind === 4) cratePile(g, col, fx, fz, fs, ry);
      else if (hash(fs, 2) % 2) smokestack(g, col, fx, fz, fs);
      else containerStack(g, col, fx, fz, ry, fs, 3, 1, 3);
    }
  }
  cornerLamps(g, col, b);
}

export { buildIndustrial };
