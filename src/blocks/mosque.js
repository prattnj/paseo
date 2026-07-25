// Grand mosque: a marble plinth carrying a domed prayer hall, an arcaded
// courtyard with a central ablution fountain, corner minarets and gardens.
import { PALETTE as P, SIDEWALK_H } from '../palette.js';
import { hash } from '../util.js';
import { column, archHeader, windowsWall } from './pieces.js';
import { flowerBed } from './props.js';
import { slabAndSidewalk, groundStripe, cornerLamps } from './kit.js';

const M_MARBLE = 0xece5d5, M_MARBLE_D = 0xcabfa6, M_TURQ = 0x1f9bb0, M_GOLD = 0xd9b45a, M_TILE = 0x2f6fb0;

// A tall slim cypress (formal-garden tree).
function cypress(g, col, x, z, s = 1) {
  g.cyl(x, SIDEWALK_H, z, 0.28 * s, 0.42 * s, 1.2 * s, P.trunk, 6);
  g.cone(x, SIDEWALK_H + 0.9 * s, z, 1.1 * s, 7 * s, 0x2f5d3a, 8);
  col.add(x, 0, z, 1.7 * s, 8 * s, 1.7 * s);
}

// Small turquoise tiled dome on a short drum, with a gilded finial.
function miniDome(g, x, z, baseY, rad, drumH = 2.5) {
  g.cyl(x, baseY, z, rad, rad, drumH, M_MARBLE, 12);
  g.cyl(x, baseY + drumH - 0.35, z, rad + 0.2, rad + 0.2, 0.45, M_GOLD, 12);
  g.ico2(x, baseY + drumH + rad * 0.14, z, rad, M_TURQ);
  g.cyl(x, baseY + drumH, z, rad + 0.05, rad + 0.05, 0.4, M_GOLD, 12);
  const ty = baseY + drumH + rad * 1.14;
  g.cyl(x, ty, z, 0.09, 0.17, 1.2, M_GOLD, 6);
  g.ico(x, ty + 1.15, z, 0.38, M_GOLD);
}

// The great dome: big drum with alternating gold/marble pilasters, gold
// cornice, turquoise dome and a tall gilded finial.
function greatDome(g, x, z, baseY, rad, drumH) {
  g.cyl(x, baseY, z, rad, rad, drumH, M_MARBLE, 20);
  for (let i = 0; i < 20; i++) {
    const a = i / 20 * Math.PI * 2;
    g.box(x + Math.cos(a) * (rad + 0.05), baseY + drumH / 2, z + Math.sin(a) * (rad + 0.05), 0.3, drumH - 1, 0.3, i % 2 ? M_GOLD : M_MARBLE_D);
  }
  g.cyl(x, baseY + drumH - 0.5, z, rad + 0.5, rad + 0.5, 0.9, M_GOLD, 20);
  g.ico2(x, baseY + drumH + rad * 0.16, z, rad, M_TURQ);
  g.cyl(x, baseY + drumH, z, rad + 0.07, rad + 0.07, 0.6, M_GOLD, 20);
  const ty = baseY + drumH + rad * 1.16;
  g.cyl(x, ty, z, 0.24, 0.42, 3, M_GOLD, 8);
  g.ico(x, ty + 3.3, z, 0.95, M_GOLD);
  g.cyl(x, ty + 4.1, z, 0.07, 0.15, 2, M_GOLD, 6);
}

// A tall slender minaret: stepped base, tapering shaft with two balconies
// (şerefe), a turquoise conical cap and a gilded finial.
function minaret(g, col, x, z, baseY, seed) {
  const h = 40 + hash(seed, 1) % 8;
  g.boxB(x, baseY, z, 5, 3, 5, M_MARBLE_D);
  g.boxB(x, baseY + 3, z, 4.2, 0.6, 4.2, M_GOLD);
  const s0 = baseY + 3.6;
  g.cyl(x, s0, z, 1.7, 2.1, h * 0.52, M_MARBLE, 12);
  const b1 = s0 + h * 0.52;
  g.cyl(x, b1 - 0.4, z, 2.6, 2.6, 0.55, M_GOLD, 12);
  g.cyl(x, b1, z, 1.45, 1.65, h * 0.28, M_MARBLE, 12);
  const b2 = b1 + h * 0.28;
  g.cyl(x, b2 - 0.35, z, 2.15, 2.15, 0.45, M_GOLD, 12);
  g.cyl(x, b2, z, 1.15, 1.35, h * 0.1, M_MARBLE, 12);
  const top = b2 + h * 0.1;
  g.cone(x, top, z, 1.55, 5.5, M_TURQ, 12);
  g.cyl(x, top + 5.5, z, 0.1, 0.2, 1.5, M_GOLD, 6);
  g.ico(x, top + 6.2, z, 0.5, M_GOLD);
  col.add(x, 0, z, 5, top + 6, 5);
}

// One side of the courtyard arcade (riwaq): a back wall, a front colonnade of
// round arches, a roof and a row of small domes. axis 'x'|'z' = run direction;
// faceSign = which way the open arches face.
function arcadeSide(g, col, cxr, czr, half, axis, faceSign, baseY) {
  const H = 9, depth = 4.5, alongX = axis === 'x';
  const n = Math.max(3, Math.round((half * 2) / 6.5)), step = (half * 2) / n;
  const P = (t, o) => alongX ? [cxr + t, czr + faceSign * o] : [cxr + faceSign * o, czr + t];
  const [wx, wz] = P(0, -depth / 2 + 0.4);
  g.boxB(wx, baseY, wz, alongX ? half * 2 : 0.8, H, alongX ? 0.8 : half * 2, M_MARBLE_D);
  col.add(wx, 0, wz, alongX ? half * 2 : 0.8, baseY + H, alongX ? 0.8 : half * 2);
  const springY = baseY + H * 0.52;
  for (let i = 0; i <= n; i++) { const [px, pz] = P(-half + i * step, depth / 2); column(g, px, pz, baseY, H - 0.8, 0.6); col.add(px, 0, pz, 1.4, baseY + H - 0.8, 1.4); }
  for (let i = 0; i < n; i++) { const [ax, az] = P(-half + (i + 0.5) * step, depth / 2); archHeader(g, ax, az, axis, step - 1.5, 0.9, springY, baseY + H, M_MARBLE); }
  const [rx, rz] = P(0, 0);
  g.boxB(rx, baseY + H, rz, alongX ? half * 2 : depth, 0.7, alongX ? depth : half * 2, M_MARBLE_D);
  for (let i = 0; i < n; i++) { const [dx, dz] = P(-half + (i + 0.5) * step, 0); miniDome(g, dx, dz, baseY + H + 0.7, 2.2, 2.2); }
}

// The grand entrance portal (piştak): a tall projecting frame with a turquoise
// tiled pointed-arch recess, gilded framing, merlons and flanking turrets.
function pishtaq(g, col, x, zWall, baseY, faceSign, wallH) {
  const W = 15, H = wallH + 6, D = 3, openW = 8.5, pierW = (W - openW) / 2;
  const front = zWall + faceSign * D;
  const inner = openW / 2 - 0.4; // pier inner face — arch overlaps it (buries the seam)
  for (const sx of [-1, 1]) { g.boxB(x + sx * (inner + pierW / 2), baseY, zWall + faceSign * D / 2, pierW, H, D, M_MARBLE); col.add(x + sx * (inner + pierW / 2), 0, zWall + faceSign * D / 2, pierW, baseY + H, D); }
  g.boxB(x, baseY, zWall + faceSign * 0.4, openW, H - 3.5, 0.7, 0x241d18);            // dark recess
  archHeader(g, x, front, 'x', openW, 0.6, baseY + 9, baseY + H - 2, M_TILE);          // tiled arched tympanum
  g.box(x, baseY + 4.6, zWall + faceSign * (D + 0.06), openW - 1.2, 8.8, 0.3, 0x241d18); // doorway
  g.boxB(x, baseY + H - 1.7, zWall + faceSign * D / 2, W + 0.6, 1.7, D + 0.4, M_GOLD);  // top gold band
  const nm = 7;
  for (let i = 0; i < nm; i++) g.boxB(x - W / 2 + (i + 0.5) * (W / nm), baseY + H, zWall + faceSign * D / 2, (W / nm) * 0.6, 1.3, D * 0.8, M_MARBLE_D);
  for (const sx of [-1, 1]) {
    const tx = x + sx * (W / 2 + 0.8);
    g.cyl(tx, baseY, front, 1.0, 1.15, H + 1.5, M_MARBLE, 10);
    g.cone(tx, baseY + H + 1.5, front, 1.2, 3, M_TURQ, 10);
    g.ico(tx, baseY + H + 4.6, front, 0.3, M_GOLD);
    col.add(tx, 0, front, 2, baseY + H, 2);
  }
}

// Domed ablution-fountain kiosk (şadırvan) in the courtyard centre.
function sadirvan(g, col, x, z, baseY) {
  const R = 3.6;
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; column(g, x + Math.cos(a) * R, z + Math.sin(a) * R, baseY, 5, 0.4); }
  g.cyl(x, baseY + 5, z, R + 0.9, R + 0.9, 0.6, M_GOLD, 12);
  miniDome(g, x, z, baseY + 5.6, R - 0.2, 2);
  g.cyl(x, baseY, z, 2.6, 2.9, 0.6, M_MARBLE, 12);        // basin
  g.cyl(x, baseY + 0.45, z, 2.3, 2.3, 0.3, P.water, 12);
  g.cyl(x, baseY + 0.6, z, 0.4, 0.5, 1.5, M_MARBLE, 8);   // central spout pillar
  g.ico(x, baseY + 2.2, z, 0.35, P.water);
  col.add(x, 0, z, 5.8, baseY + 2, 5.8);
}

// Monumental walk-through entrance gateway on the north side of the courtyard:
// two solid piers (colliders) flanking a clear passage, a tall tiled arch on
// both faces, gold band, merlons and turquoise-capped turrets. Nothing blocks
// the opening, so the player walks straight through into the courtyard.
function gateway(g, col, x, z, baseY) {
  const openW = 12, H = 18, arcD = 5, Dp = 6.4, pierW = 3.2; // piers DEEPER than the arch
  const inner = openW / 2 - 0.4;           // pier inner face — the arch overlaps it
  const outer = inner + pierW, span = outer * 2;
  // piers fully wall the passage (deeper than the arch, so no see-through slivers
  // at the tunnel ends) and their inner faces overlap the arch edges (no z-fight)
  for (const sx of [-1, 1]) {
    const px = x + sx * (inner + pierW / 2);
    g.boxB(px, baseY, z, pierW, H, Dp, M_MARBLE);
    col.add(px, 0, z, pierW, baseY + H, Dp);
  }
  archHeader(g, x, z, 'x', openW, arcD, baseY + 9, baseY + H - 2, M_TILE);
  g.boxB(x, baseY + H - 1.7, z, span + 0.4, 1.7, Dp + 0.4, M_GOLD);
  const nm = 9;
  for (let i = 0; i < nm; i++) g.boxB(x - span / 2 + (i + 0.5) * (span / nm), baseY + H, z, (span / nm) * 0.6, 1.3, Dp * 0.8, M_MARBLE_D);
  for (const sx of [-1, 1]) {
    const tx = x + sx * (outer + 0.4);
    g.cyl(tx, baseY, z, 1.0, 1.15, H + 1.5, M_MARBLE, 10);
    g.cone(tx, baseY + H + 1.5, z, 1.2, 3, M_TURQ, 10);
    g.ico(tx, baseY + H + 4.6, z, 0.35, M_GOLD);
    col.add(tx, 0, z, 2, baseY + H, 2);
  }
}

function buildMosque(g, col, b) {
  const r = slabAndSidewalk(g, col, b, P.concrete);
  const cx = r.cx, cz = r.cz;
  const PLINTH = 0.25, gy = SIDEWALK_H + PLINTH;
  const PHX = (r.x1 - r.x0) / 2 - 6, PHZ = (r.z1 - r.z0) / 2 - 6;

  // raised marble plinth the whole complex sits on
  g.boxB(cx, SIDEWALK_H, cz, PHX * 2, PLINTH, PHZ * 2, M_MARBLE);
  col.add(cx, 0, cz, PHX * 2, gy, PHZ * 2);
  g.boxB(cx, SIDEWALK_H + PLINTH - 0.04, cz, PHX * 2 + 0.5, 0.1, PHZ * 2 + 0.5, M_GOLD); // gilded plinth edge

  // ---- prayer hall (rear +z) ----
  const hallHD = 16, hallHW = PHX - 3;
  const hcz = cz + PHZ - hallHD - 1, H = 14;
  g.boxB(cx, gy, hcz, hallHW * 2, H, hallHD * 2, M_MARBLE);
  col.add(cx, 0, hcz, hallHW * 2, gy + H, hallHD * 2);
  g.boxB(cx, gy + H * 0.6, hcz, hallHW * 2 + 0.3, 1.3, hallHD * 2 + 0.3, M_TILE);   // tile band
  g.boxB(cx, gy + H, hcz, hallHW * 2 + 0.7, 0.9, hallHD * 2 + 0.7, M_GOLD);         // gold cornice
  for (const sgn of [-1, 1]) {
    windowsWall(g, cx, hcz, gy, 2, H * 0.42, hallHW * 2, 'z', sgn * hallHD, 6, P.glassDark);
    windowsWall(g, cx, hcz, gy, 2, H * 0.42, hallHD * 2, 'x', sgn * hallHW, 6, P.glassDark);
  }
  greatDome(g, cx, hcz, gy + H, 13, 9);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) miniDome(g, cx + sx * (hallHW - 7), hcz + sz * (hallHD - 6), gy + H, 4.2, 4.5);
  pishtaq(g, col, cx, hcz - hallHD, gy, -1, H);

  // ---- courtyard (front -z) with arcades on three sides ----
  const courtN = cz - PHZ + 3;
  const courtCz = (courtN + (hcz - hallHD)) / 2, courtHalfZ = ((hcz - hallHD) - courtN) / 2;
  // north side: two arcade runs flanking the central entrance gateway
  const gateHalf = 6, nSeg = (hallHW - gateHalf) / 2;
  arcadeSide(g, col, cx - (hallHW + gateHalf) / 2, courtN, nSeg, 'x', 1, gy);
  arcadeSide(g, col, cx + (hallHW + gateHalf) / 2, courtN, nSeg, 'x', 1, gy);
  gateway(g, col, cx, courtN, gy);
  arcadeSide(g, col, cx - PHX + 3, courtCz, courtHalfZ, 'z', 1, gy);   // west
  arcadeSide(g, col, cx + PHX - 3, courtCz, courtHalfZ, 'z', -1, gy);  // east
  sadirvan(g, col, cx, courtCz, gy);

  // ---- minarets at the four plinth corners ----
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) minaret(g, col, cx + sx * (PHX - 1), cz + sz * (PHZ - 1), gy, hash(sx * 7 + sz, 3));

  // ---- grounds: entrance path + corner gardens ----
  groundStripe(g, cx, (r.z0 + (cz - PHZ)) / 2, 9, (cz - PHZ) - r.z0, P.path);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const gx2 = cx + sx * (PHX + 2.5), gz2 = cz + sz * (PHZ + 2.5);
    cypress(g, col, gx2, gz2, 1);
    cypress(g, col, gx2 - sx * 3, gz2 - sz * 3, 0.85);
    flowerBed(g, col, gx2 - sx * 1.6, gz2 - sz * 5.5, hash(sx, sz, 5));
  }
  cornerLamps(g, col, b);
}

export { buildMosque };
