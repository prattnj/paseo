// Dense medieval old town: jittered terraced rows with narrow cobblestone
// lanes, ground-floor shopfronts, and a small market square with a covered well.
import { PALETTE as P, SIDEWALK_H } from '../palette.js';
import { hash, pick, frac } from '../util.js';
import { bench, tree, lamp, kiosk } from './props.js';
import { slabAndSidewalk, cornerLamps } from './kit.js';

// Dense medieval old town: jittered terraced rows packed into the block with
// narrow cobblestone lanes running between them (open to the streets at both
// ends), ground-floor shops facing the lanes AND the outer streets, and a
// small market square with a covered well. `A` = the direction rows run,
// `perp` = the direction strips/lanes are stacked; chosen per block for variety.
const COBBLE = 0x8f8577, WOOD = 0x5d4433;

// Paints a varied ground-floor shopfront onto a face. `fb`/`fbB` place a box
// in (u = width along the face, v = outward depth) space: (uCenter, vOffset,
// wy, uLen, height, vThick, hex); fbB is base-anchored. `H` is the shop
// height. Four styles (deterministic per seed) so a street mixes plain glass
// with door+window fronts, split panes, and shuttered workshops.
function paintShopfront(fb, fbB, uC, uW, y, s, H = 3.2) {
  const style = hash(s, 20) % 4;
  const awn = pick(P.awnings, s, 21);
  const doorW = Math.min(1.4, uW * 0.3), doorH = H * 0.72;
  const gmid = y + H * 0.52, gh = H * 0.6;
  // door reaching the ground extends 0.25 below it so its base is never
  // coplanar with the sidewalk (grazing z-fight on street-facing shops)
  const doorHt = doorH + 0.25, doorCy = y + doorH / 2 - 0.125;
  // timber frame: side posts (sunk below ground) + top lintel — backs embedded
  for (const so of [-1, 1]) fbB(uC + so * (uW / 2 - 0.2), 0.1, y - 0.25, 0.42, H + 0.35, 0.36, WOOD);
  fbB(uC, 0.1, y + H - 0.35, uW, 0.42, 0.42, WOOD);
  if (style === 0) {                 // plain glass storefront + awning
    fb(uC, 0.1, gmid, uW - 1.0, gh, 0.3, P.glassDark);
    fb(uC, 0.5, y + H - 0.12, uW + 0.2, 0.18, 1.1, awn);
  } else if (style === 1) {          // door + window + projecting sign
    fb(uC - uW * 0.22, 0.1, doorCy, doorW, doorHt, 0.3, P.doorDark);
    fb(uC + uW * 0.16, 0.1, y + H * 0.56, uW * 0.4, H * 0.46, 0.28, P.window);
    fb(uC, 0.55, y + H * 0.82, 1.3, 0.7, 0.12, awn); // hanging sign
  } else if (style === 2) {          // twin panes split by a central door
    fb(uC - uW * 0.27, 0.1, gmid, uW * 0.34, gh, 0.28, P.glassDark);
    fb(uC + uW * 0.27, 0.1, gmid, uW * 0.34, gh, 0.28, P.glassDark);
    fb(uC, 0.1, doorCy, doorW, doorHt, 0.3, P.doorDark);
    fb(uC, 0.5, y + H - 0.12, uW + 0.2, 0.18, 1.1, awn);
  } else {                            // shuttered windows + door (quiet workshop)
    const sh = pick([0x4a6b8a, 0x6b8a4a, 0x8a5a3a, 0x55585e], s, 23);
    for (const uo of [-uW * 0.22, uW * 0.22]) {
      fb(uC + uo, 0.1, y + H * 0.55, uW * 0.22, H * 0.44, 0.26, P.window);
      for (const so of [-1, 1]) fb(uC + uo + so * uW * 0.16, 0.06, y + H * 0.55, uW * 0.05, H * 0.44, 0.16, sh);
    }
    fb(uC, 0.1, doorCy, doorW, doorHt, 0.3, P.doorDark);
  }
}

function buildOldtown(g, col, b, seed) {
  const r = slabAndSidewalk(g, col, b, COBBLE);
  const y = SIDEWALK_H, gy = y + 0.2; // wall base / cobble surface
  const alongX = hash(seed, 0) % 2 === 0;
  const [aLo, aHi] = alongX ? [r.x0, r.x1] : [r.z0, r.z1];
  const [pLo, pHi] = alongX ? [r.z0, r.z1] : [r.x0, r.x1];
  const XZ = (a, p) => (alongX ? [a, p] : [p, a]);
  // boxes addressed in (along, perp): pbox = wall thin along perp, abox = thin along A
  const pbox = (a, p, wy, aL, hh, pT, hex) => alongX ? g.box(a, wy, p, aL, hh, pT, hex) : g.box(p, wy, a, pT, hh, aL, hex);
  const pboxB = (a, p, yy, aL, hh, pT, hex) => alongX ? g.boxB(a, yy, p, aL, hh, pT, hex) : g.boxB(p, yy, a, pT, hh, aL, hex);
  const abox = (a, p, wy, aT, hh, pL, hex) => alongX ? g.box(a, wy, p, aT, hh, pL, hex) : g.box(p, wy, a, pL, hh, aT, hex);
  const aboxB = (a, p, yy, aT, hh, pL, hex) => alongX ? g.boxB(a, yy, p, aT, hh, pL, hex) : g.boxB(p, yy, a, pL, hh, aT, hex);

  // market square (in along/perp coords) — a clear cobbled gap in the rows
  const sqA = aLo + (aHi - aLo) * (0.38 + frac(seed, 1) * 0.24);
  const sqP = pLo + (pHi - pLo) * 0.5;
  const sqR = 13;
  const inSquare = (a, p) => Math.abs(a - sqA) < sqR && Math.abs(p - sqP) < sqR;

  // a single terraced building with shopfronts on both lane-facing (perp) sides
  const building = (aC, pC, wA, dP, floors, s) => {
    const h = floors * 3.2;
    pboxB(aC, pC, y, wA, h, dP, pick(P.houseBodies, s, 4));
    const [cx, cz] = XZ(aC, pC);
    g.prism(cx, y + h, cz, wA + 0.3, 2.0, dP + 0.3, pick(P.houseRoofs, s, 5), alongX ? 0 : Math.PI / 2);
    col.add(cx, 0, cz, alongX ? wA : dP, h + 0.5, alongX ? dP : wA);
    for (const pSign of [-1, 1]) {
      const pFace = pC + pSign * dP / 2;
      const fb = (uCc, vOff, wy, uL, hh, vT, hex) => pbox(uCc, pFace + pSign * vOff, wy, uL, hh, vT, hex);
      const fbB = (uCc, vOff, yy, uL, hh, vT, hex) => pboxB(uCc, pFace + pSign * vOff, yy, uL, hh, vT, hex);
      paintShopfront(fb, fbB, aC, wA, y, hash(s, pSign + 30));
      for (let f = 1; f < floors; f++)
        for (const ao of [-wA * 0.24, wA * 0.24])
          pbox(aC + ao, pFace + pSign * 0.06, y + f * 3.2 + 1.6, 1.1, 1.4, 0.15, P.window);
    }
  };
  // shopfront on a terrace end (A face) that fronts one of the cross streets
  const endShop = (aFace, pC, aSign, dP, s) => {
    const fb = (uCc, vOff, wy, uL, hh, vT, hex) => abox(aFace + aSign * vOff, uCc, wy, vT, hh, uL, hex);
    const fbB = (uCc, vOff, yy, uL, hh, vT, hex) => aboxB(aFace + aSign * vOff, uCc, yy, vT, hh, uL, hex);
    paintShopfront(fb, fbB, pC, dP, y, hash(s, 40));
  };

  // pack strips of buildings, separated by lanes, across the perp axis
  let p = pLo, strip = 0;
  while (p < pHi - 7) {
    const p1 = Math.min(p + 10 + frac(seed, strip, 2) * 3.5, pHi);
    const dP = p1 - p, pC = (p + p1) / 2;
    if (dP < 7) break;
    const builds = [];
    let a = aLo + 0.4, bk = 0;
    while (a < aHi - 5) {
      const wA = 7 + frac(seed, strip * 13 + bk, 3) * 4.5;
      if (a + wA > aHi - 0.4) break;
      const aC = a + wA / 2, s = hash(seed, strip * 17 + bk, 9);
      if (!inSquare(aC, pC)) {
        building(aC, pC, wA - 0.5, dP - 0.7, 2 + hash(s, 1) % 3, s);
        builds.push({ aC, wA: wA - 0.5, s });
      }
      a += wA + 0.25 + frac(seed, strip, bk + 50) * 0.5;
      bk++;
    }
    if (builds.length) {
      const f0 = builds[0], fn = builds[builds.length - 1];
      if (f0.aC - f0.wA / 2 < aLo + 6) endShop(f0.aC - f0.wA / 2, pC, -1, dP - 0.7, f0.s);
      if (fn.aC + fn.wA / 2 > aHi - 6) endShop(fn.aC + fn.wA / 2, pC, 1, dP - 0.7, fn.s);
    }
    p = p1 + 5 + frac(seed, strip, 4) * 2.5;
    strip++;
  }

  // market square: covered well, kiosks, benches, a tree and lamps
  const [scx, scz] = XZ(sqA, sqP);
  g.cyl(scx, gy, scz, 2.4, 2.6, 1.0, P.concreteDark);
  g.cyl(scx, gy + 0.2, scz, 1.9, 1.9, 0.2, P.water);
  col.add(scx, 0, scz, 5.2, 1.2, 5.2);
  for (const [ox, oz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) g.cyl(scx + ox, gy, scz + oz, 0.14, 0.16, 3.0, WOOD);
  g.prism(scx, gy + 3.0, scz, 6.2, 1.4, 6.2, P.roofRed, 0);
  kiosk(g, col, scx + 8, scz - 7, hash(seed, 31), 0);
  kiosk(g, col, scx - 8, scz + 7, hash(seed, 32), Math.PI);
  bench(g, col, scx + 7, scz + 6, 0);
  bench(g, col, scx - 7, scz - 6, Math.PI);
  tree(g, col, scx - 9, scz + 2, 0.9, 1);
  lamp(g, col, scx + 6, scz - 4);
  lamp(g, col, scx - 6, scz + 4);
  cornerLamps(g, col, b);
}

export { buildOldtown };
