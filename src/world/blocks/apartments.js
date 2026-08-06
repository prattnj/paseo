// Perimeter-block apartments: slabs on all four frontages around a reachable
// interior (a tunnel-fed parking lot on one half, a small park on the other).
import { PALETTE as P, SIDEWALK_H } from '../../core/palette.js';
import { hash, pick, frac } from '../../core/util.js';
import { apartment, facade } from './pieces.js';
import { dumpster, gazebo, bench, flowerBed, lamp, slide, sandbox, swingSet, scatterTrees } from './props.js';
import { slabAndSidewalk, parkingLotAt, streetTrees, cornerLamps, LOT_DECK, LOT_CONCRETE, LOT_LINE_Y, TUN_FLOOR } from './kit.js';

// A perimeter apartment slab (spanning `w` along x, `d` along z) bored through
// by a square drive-through tunnel. `boreAxis` is the direction the tunnel
// passes (through the slab's 15 m depth): 'z' for an N/S slab, 'x' for an E/W
// one. Two full-height side blocks flank a central opening `2*tunHalf` wide and
// `tunH` tall, with the building carried over the gap on a lintel whose collider
// base sits at `tunH` so the player/cars pass under into the block interior. The
// bore floor extends `apron` past each mouth to meet the sidewalk on the street
// side and the parking pad on the interior side. Reuses `apartment`'s facade
// styling so the tunnelled slab matches its neighbours.
function apartmentTunnel(g, col, x, z, w, d, floors, bodyHex, seed, tunHalf, tunH, boreAxis = 'z', apron = 3.5) {
  const floorH = 3, h = floors * floorH, y = SIDEWALK_H;
  const style = hash(seed, 30) % 4;
  const trim = pick(P.trims, seed, 31);
  const winHex = pick(P.windowTints, seed, 32);
  const boreZ = boreAxis === 'z';
  const Dp = boreZ ? d : w;         // depth the bore passes through (~15 m)
  const Ls = boreZ ? w : d;         // long axis the two flanking blocks split along
  const segW = Ls / 2 - tunHalf;
  const inW = 2 * tunHalf;
  // Box/collider placement in (s = offset along the split/long axis, p = offset
  // along the bore axis); sizes given as (along-split, y, along-bore).
  const bx = (s, p, cy, sS, sy, sB, hex) => boreZ
    ? g.box(x + s, cy, z + p, sS, sy, sB, hex) : g.box(x + p, cy, z + s, sB, sy, sS, hex);
  const bxG = (s, p, cy, sS, sy, sB, hex) => boreZ
    ? g.glowBox(x + s, cy, z + p, sS, sy, sB, hex) : g.glowBox(x + p, cy, z + s, sB, sy, sS, hex);
  const bxB = (s, p, by, sS, sy, sB, hex) => boreZ
    ? g.boxB(x + s, by, z + p, sS, sy, sB, hex) : g.boxB(x + p, by, z + s, sB, sy, sS, hex);
  const cAdd = (s, by, sS, sy, sB) => boreZ
    ? col.add(x + s, by, z, sS, sy, sB) : col.add(x, by, z + s, sB, sy, sS);
  const face = (s, y0, fl, len, wallOff, st) => {
    const [fx, fz] = boreZ ? [x + s, z] : [x, z + s];
    facade(g, fx, fz, y0, fl, floorH, len, boreAxis, wallOff, st, trim, winHex);
  };

  for (const sgn of [-1, 1]) {              // flanking blocks
    const s = sgn * (tunHalf + segW / 2);
    bxB(s, 0, y, segW, h, Dp, bodyHex);
    cAdd(s, 0, segW, h + 1, Dp);
    face(s, y, floors, segW, Dp / 2, style);
    face(s, y, floors, segW, -(Dp / 2), style);
  }
  // lintel: solid building above the clear opening (raised collider → passable)
  bxB(0, 0, y + tunH, inW, h - tunH, Dp, bodyHex);
  cAdd(0, y + tunH, inW, h - tunH, Dp);
  const lintelFloors = Math.max(1, floors - Math.ceil(tunH / floorH));
  face(0, y + tunH, lintelFloors, inW, Dp / 2, 0);
  face(0, y + tunH, lintelFloors, inW, -(Dp / 2), 0);
  // parapet + a stair bulkhead
  g.boxB(x, y + h, z, w + 0.5, 0.5, d + 0.5, hash(seed, 33) % 2 ? trim : P.roofLight);
  const [buX, buZ] = boreZ ? [x - w / 4, z] : [x, z - d / 4];
  g.boxB(buX, y + h + 0.5, buZ, 2.2, 1.4, 2.2, P.roofLight);
  // ---- tunnel bore lining ----
  bxB(0, 0, y + tunH - 0.25, inW, 0.25, Dp, P.concreteDark);              // ceiling
  for (const sgn of [-1, 1]) bx(sgn * (tunHalf - 0.06), 0, y + tunH / 2, 0.12, tunH, Dp, P.concrete); // jambs
  bxB(0, 0, TUN_FLOOR, inW - 0.2, 0.03, Dp + 2 * apron, LOT_CONCRETE);    // floor, aproned both mouths
  for (const sgn of [-1, 1]) bx(0, sgn * (Dp / 2 + 0.05), y + tunH + 0.1, inW + 0.7, 0.6, 0.3, trim); // header band
  // wall lights: a row down each jamb just under the ceiling — a dark bracket
  // against the wall and a self-lit warm lens that glows in the shadowed bore.
  const nL = 3;
  for (const sgn of [-1, 1]) for (let k = 0; k < nL; k++) {
    const p = -Dp / 2 + Dp * (k + 0.5) / nL;
    bx(sgn * (tunHalf - 0.12), p, y + tunH - 0.6, 0.12, 0.5, 0.72, P.roofDark);   // bracket
    bxG(sgn * (tunHalf - 0.32), p, y + tunH - 0.6, 0.14, 0.34, 0.5, P.lampWarm);  // glowing lens
  }
}

// Perimeter-block apartments: apartment slabs on all four street frontages
// around a reachable interior — one half a concrete parking lot fed by a
// drive-through tunnel bored through one slab, the other half a small park. The
// tunnelled slab (and thus which half is the lot) rotates through N/S/E/W per
// block so the district doesn't read as one repeated orientation.
function buildApartments(g, col, b, seed) {
  const r = slabAndSidewalk(g, col, b, P.grass);
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  const t = 15; // building depth
  const m = 0.5; // inset from the block edge
  const tunHalf = 4.5, tunH = 4.2;
  const nsW = w - 2 * m;              // N/S run the full width
  const ewD = d - 2 * m - 2 * t;      // E/W butt against the N/S inner faces
  const side = hash(seed, 5) % 4;     // 0 N · 1 S · 2 E · 3 W — which slab is bored
  const ns = side < 2;
  // N & S slabs bore along z; E & W bore along x. Only the chosen `side` slab is
  // tunnelled — the rest are solid.
  const nsSlab = (cz, fl, s1, s2, bored) => bored
    ? apartmentTunnel(g, col, r.cx, cz, nsW, t, fl, pick(P.bodies, seed, s1), hash(seed, s2), tunHalf, tunH, 'z')
    : apartment(g, col, r.cx, cz, nsW, t, fl, pick(P.bodies, seed, s1), hash(seed, s2), true);
  const ewSlab = (cx, fl, s1, s2, bored) => bored
    ? apartmentTunnel(g, col, cx, r.cz, t, ewD, fl, pick(P.bodies, seed, s1), hash(seed, s2), tunHalf, tunH, 'x')
    : apartment(g, col, cx, r.cz, t, ewD, fl, pick(P.bodies, seed, s1), hash(seed, s2));
  nsSlab(r.z0 + m + t / 2, 3 + (hash(seed, 1) % 4), 11, 12, side === 0);
  nsSlab(r.z1 - m - t / 2, 3 + (hash(seed, 2) % 4), 13, 14, side === 1);
  ewSlab(r.x0 + m + t / 2, 3 + (hash(seed, 3) % 4), 15, 16, side === 3);
  ewSlab(r.x1 - m - t / 2, 3 + (hash(seed, 4) % 4), 17, 18, side === 2);

  // ---- reachable interior: parking-lot half + park half ----
  const ix0 = r.x0 + m + t, ix1 = r.x1 - m - t;
  const iz0 = r.z0 + m + t, iz1 = r.z1 - m - t;
  const ixm = (ix0 + ix1) / 2, izm = (iz0 + iz1) / 2;
  // the lot takes the interior half against the tunnelled slab; the park the other
  let lot, park;
  if (side === 0) { lot = { x0: ix0, x1: ix1, z0: iz0, z1: izm }; park = { x0: ix0, x1: ix1, z0: izm, z1: iz1 }; }
  else if (side === 1) { lot = { x0: ix0, x1: ix1, z0: izm, z1: iz1 }; park = { x0: ix0, x1: ix1, z0: iz0, z1: izm }; }
  else if (side === 2) { lot = { x0: ixm, x1: ix1, z0: iz0, z1: iz1 }; park = { x0: ix0, x1: ixm, z0: iz0, z1: iz1 }; }
  else { lot = { x0: ix0, x1: ixm, z0: iz0, z1: iz1 }; park = { x0: ixm, x1: ix1, z0: iz0, z1: iz1 }; }

  // parking lot: painted bays + parked cars on a poured-concrete pad reaching the
  // tunnel mouth (the bore floor is the same concrete). Aisles run along the bore
  // axis (ry chosen to match) so a car drives straight in off the tunnel.
  const lotCx = (lot.x0 + lot.x1) / 2, lotCz = (lot.z0 + lot.z1) / 2;
  const lotW = lot.x1 - lot.x0, lotD = lot.z1 - lot.z0;
  const [pw, pd] = ns ? [lotD, lotW] : [lotW, lotD];
  parkingLotAt(g, col, lotCx, lotCz, pw - 1, pd - 1, LOT_DECK, hash(seed, 60), ns ? Math.PI / 2 : 0, null, 24, LOT_CONCRETE, LOT_LINE_Y);
  dumpster(g, col, lotCx - lotW * 0.4, lotCz - lotD * 0.4, ns ? 0 : Math.PI / 2, hash(seed, 53));

  // small park in the other half: a pavilion centrepiece with benches and flower
  // beds at one end, a proper playground (slide, sandbox, swings) at the other,
  // trees around the edges and a path lamp. All placed as fractions of the half's
  // own extents so it fits whichever orientation it landed in.
  const pcx = (park.x0 + park.x1) / 2, pcz = (park.z0 + park.z1) / 2;
  const PW = park.x1 - park.x0, PD = park.z1 - park.z0;
  const gzx = pcx + PW * 0.24, gzz = pcz;
  gazebo(g, col, gzx, gzz, hash(seed, 40));
  bench(g, col, gzx, pcz + PD * 0.2, 0);
  bench(g, col, gzx, pcz - PD * 0.2, Math.PI);
  flowerBed(g, col, pcx + PW * 0.42, pcz + PD * 0.13, hash(seed, 51));
  flowerBed(g, col, pcx + PW * 0.42, pcz - PD * 0.13, hash(seed, 52));
  lamp(g, col, pcx, pcz + PD * 0.02);
  const slx = pcx - PW * 0.26, slz = pcz - PD * 0.16;
  const sbx = pcx - PW * 0.24, sbz = pcz + PD * 0.2;
  const swx = pcx - PW * 0.38, swz = pcz + PD * 0.02;
  slide(g, col, slx, slz, 0, hash(seed, 41));
  sandbox(g, col, sbx, sbz, 1);
  swingSet(g, col, swx, swz, Math.PI / 2);
  // Fill the lawn with a scattered grove — many more trees than before, but well
  // short of forest density — keeping clear of the pavilion and the playground.
  const keepOut = (px, pz) =>
    Math.hypot(px - gzx, pz - gzz) < 5.5 ||
    Math.hypot(px - slx, pz - slz) < 4.5 ||
    Math.hypot(px - sbx, pz - sbz) < 4.5 ||
    Math.hypot(px - swx, pz - swz) < 4.5;
  const pr = { x0: park.x0 + 2.5, z0: park.z0 + 2.5, x1: park.x1 - 2.5, z1: park.z1 - 2.5 };
  scatterTrees(g, col, pr, hash(seed, 70), 7.5, 0.7, 1.05, keepOut);
  streetTrees(g, col, b, seed);
  cornerLamps(g, col, b);
}

export { buildApartments };
