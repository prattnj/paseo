// Neo-classical civic plaza: four connected wings with arched gateways, corner
// pavilions, a domed gateway, a formal courtyard and a central obelisk.
import { PALETTE as P, SIDEWALK_H } from '../palette.js';
import { hash } from '../util.js';
import { column, archHeader, STONE, STONE_LT, STONE_MD } from './pieces.js';
import { fountain, tree, hedge, bench, flowerBed, planter, lamp } from './props.js';
import { slabAndSidewalk, cornerLamps } from './kit.js';

const DOME_HEX = 0x8fb4a8;  // verdigris copper dome
const GOLD = 0xd9b45a;      // gilded finials

// Taller projecting block at a corner of the square, with engaged columns.
function cornerPavilion(g, col, cx, cz, s, y, H) {
  g.boxB(cx, y, cz, s, H, s, STONE);
  col.add(cx, 0, cz, s, H + 1, s);
  g.boxB(cx, y + H, cz, s + 1.8, 2.0, s + 1.8, STONE_MD);        // cornice
  g.boxB(cx, y + H + 2.0, cz, s + 0.8, 0.9, s + 0.8, STONE_LT);  // roof cap
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    g.cyl(cx + sx * (s / 2 - 1.1), y, cz + sz * (s / 2 - 1.1), 0.85, 1.1, H - 0.6, STONE_LT);
  for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]])
    for (const along of [-s * 0.22, s * 0.22])
      for (const wy of [y + H * 0.34, y + H * 0.64]) {
        const wx = cx + nx * (s / 2 + 0.05) + (nz !== 0 ? along : 0);
        const wz = cz + nz * (s / 2 + 0.05) + (nx !== 0 ? along : 0);
        if (nz !== 0) { g.box(wx, wy, wz, 2.8, 3.4, 0.12, STONE_MD); g.box(wx, wy, wz + nz * 0.12, 2.1, 2.7, 0.2, P.glassDark); }
        else { g.box(wx, wy, wz, 0.12, 3.4, 2.8, STONE_MD); g.box(wx + nx * 0.12, wy, wz, 0.2, 2.7, 2.1, P.glassDark); }
      }
}

// One side (wing) of the square: two solid wall blocks flanking a central
// arched gateway, a deep courtyard colonnade (a covered walkway you pass
// through), entablature, and windowed facades on both faces. runAxis 'x'
// spans along x; 'z' along z. `nearP` = outer (street) face, `farP` = courtyard.
function plazaWing(g, col, runAxis, lo, hi, nearP, farP, gateC, y, H, seed) {
  const t = Math.abs(farP - nearP), midP = (nearP + farP) / 2;
  const inSign = Math.sign(farP - nearP);        // toward the courtyard
  const gateW = 12;
  const P0 = lo, P1 = gateC - gateW / 2, P2 = gateC + gateW / 2, P3 = hi;
  const place = (a, p) => runAxis === 'x' ? [a, p] : [p, a];
  // boxes addressed in (along-run, perpendicular) space
  const faceBox = (al, perp, wy, runLen, hh, thick, hex) =>
    runAxis === 'x' ? g.box(al, wy, perp, runLen, hh, thick, hex) : g.box(perp, wy, al, thick, hh, runLen, hex);
  const faceBoxB = (al, perp, yy, runLen, hh, thick, hex) =>
    runAxis === 'x' ? g.boxB(al, yy, perp, runLen, hh, thick, hex) : g.boxB(perp, yy, al, thick, hh, runLen, hex);

  const wallBlock = (a, bnd) => {
    const len = bnd - a;
    faceBoxB((a + bnd) / 2, midP, y, len, H, t, STONE);
    const [wx, wz] = place((a + bnd) / 2, midP);
    if (runAxis === 'x') col.add(wx, 0, wz, len, H + 1, t); else col.add(wx, 0, wz, t, H + 1, len);
    const n = Math.max(2, Math.round(len / 6.5));
    for (let i = 0; i < n; i++) {
      const al = a + len * ((i + 0.5) / n);
      faceBoxB(al, nearP - inSign * 0.35, y, 1.4, H - 1.4, 0.7, STONE_LT); // street pilaster
      // windows (moulded surround + glass), two rows, on both faces
      for (const [fp, fs] of [[nearP, -inSign], [farP, inSign]])
        for (const wy of [y + H * 0.36, y + H * 0.64]) {
          faceBox(al, fp + fs * 0.05, wy, 2.8, 3.4, 0.12, STONE_MD);
          faceBox(al, fp + fs * 0.16, wy, 2.1, 2.7, 0.2, P.glassDark);
        }
    }
  };
  wallBlock(P0, P1);
  wallBlock(P2, P3);

  // arched gateway
  const [gcx, gcz] = place(gateC, midP);
  archHeader(g, gcx, gcz, runAxis, gateW, t, y + 9, y + H, STONE);

  // continuous cornice band + parapet over the whole span
  const span = P3 - P0;
  faceBoxB((P0 + P3) / 2, midP, y + H, span, 1.8, t + 1.4, STONE_MD);
  faceBoxB((P0 + P3) / 2, midP, y + H + 1.8, span, 0.7, t + 0.4, STONE_LT);

  // courtyard colonnade set well in front of the far face: a walkable,
  // roofed portico. Columns are solid (with generous gaps to pass between).
  const colH = H - 2, colOff = 4.5, colPerp = farP + inSign * colOff;
  const runColon = (a, bnd) => {
    const len = bnd - a, n = Math.max(2, Math.round(len / 6));
    for (let i = 0; i <= n; i++) {
      const [cxx, czz] = place(a + len * (i / n), colPerp);
      column(g, cxx, czz, y, colH, 1.0);
      col.add(cxx, 0, czz, 2.0, colH, 2.0);
    }
    // architrave beam over the columns
    faceBoxB((a + bnd) / 2, colPerp, y + colH, len, 1.4, 2.6, STONE_MD);
    // portico ceiling: spans wall -> beam, abutting (never overlapping) the
    // beam's footprint so their undersides don't share a plane and z-fight
    const ceilInner = colPerp - inSign * 1.3;
    faceBoxB((a + bnd) / 2, (farP + ceilInner) / 2, y + colH, len, 0.5, Math.abs(ceilInner - farP), STONE);
  };
  runColon(P0, P1);
  runColon(P2, P3);
  // taller columns flanking the gateway
  for (const gp of [P1 - 1.5, P2 + 1.5]) {
    const [cxx, czz] = place(gp, colPerp);
    column(g, cxx, czz, y, H - 0.5, 1.2);
    col.add(cxx, 0, czz, 2.2, H - 0.5, 2.2);
  }
}

// Drum + hemispherical dome + lantern, crowning a gateway (the "capitol").
function plazaDome(g, x, z, baseY) {
  const r = 9, drumH = 8;
  g.cyl(x, baseY, z, r, r, drumH, STONE);                            // drum
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    g.cyl(x + Math.cos(a) * (r + 0.9), baseY, z + Math.sin(a) * (r + 0.9), 0.55, 0.7, drumH, STONE_LT);
  }
  g.cyl(x, baseY + drumH - 0.6, z, r + 1.4, r + 1.4, 0.9, STONE_MD); // cornice ring
  g.ico2(x, baseY + drumH + 0.2, z, r, DOME_HEX);                    // dome
  g.cyl(x, baseY + drumH + r * 0.85, z, 1.7, 2.0, 3, STONE_LT);      // lantern
  g.cone(x, baseY + drumH + r * 0.85 + 3, z, 2.0, 3, GOLD, 8);       // gilded finial
}

// Central obelisk on a stepped plinth — the city-center monument.
function obelisk(g, col, x, z, y) {
  g.boxB(x, y, z, 10, 1.2, 10, STONE_MD);     // stepped base
  g.boxB(x, y + 1.2, z, 7.5, 1.2, 7.5, STONE);
  g.boxB(x, y + 2.4, z, 5, 1.4, 5, STONE_LT);
  g.boxB(x, y + 3.8, z, 4, 4, 4, STONE);      // pedestal
  let sy = y + 7.8, sw = 3.0;
  for (let i = 0; i < 6; i++) { g.boxB(x, sy, z, sw, 3.2, sw, STONE_LT); sy += 3.2; sw *= 0.86; }
  g.cone(x, sy, z, sw * 0.75, sw * 1.5, GOLD, 4); // gilded pyramidion
  col.add(x, 0, z, 10, 3, 10);
}

function buildPlaza(g, col, b, seed) {
  const r = slabAndSidewalk(g, col, b, P.concreteDark);
  const y = SIDEWALK_H;
  const t = 18, cp = 18, H = 20, Hp = 27;
  const cx = r.cx, cz = r.cz;
  // corner pavilions
  cornerPavilion(g, col, r.x0 + cp / 2, r.z0 + cp / 2, cp, y, Hp);
  cornerPavilion(g, col, r.x1 - cp / 2, r.z0 + cp / 2, cp, y, Hp);
  cornerPavilion(g, col, r.x0 + cp / 2, r.z1 - cp / 2, cp, y, Hp);
  cornerPavilion(g, col, r.x1 - cp / 2, r.z1 - cp / 2, cp, y, Hp);
  // four connected wings, each with a central arched gateway
  plazaWing(g, col, 'x', r.x0 + cp, r.x1 - cp, r.z0, r.z0 + t, cx, y, H, hash(seed, 1)); // N
  plazaWing(g, col, 'x', r.x0 + cp, r.x1 - cp, r.z1, r.z1 - t, cx, y, H, hash(seed, 2)); // S
  plazaWing(g, col, 'z', r.z0 + cp, r.z1 - cp, r.x0, r.x0 + t, cz, y, H, hash(seed, 3)); // W
  plazaWing(g, col, 'z', r.z0 + cp, r.z1 - cp, r.x1, r.x1 - t, cz, y, H, hash(seed, 4)); // E
  // dome over the south gateway (the face toward the downtown avenue)
  plazaDome(g, cx, r.z1 - t / 2, y + H);

  // ---- formal paved courtyard paths ----
  // The courtyard concrete slab is raised 0.2 above the sidewalk, so paths
  // must sit on top of it. All P.path pieces share one height so overlapping
  // pieces never z-fight; the two-tone central discs are staggered by tone.
  const gy = y + 0.2; // top of the courtyard concrete
  // radial arms out to the four gateways
  for (const [gx, gz] of [[cx, r.z0 + t], [cx, r.z1 - t], [r.x0 + t, cz], [r.x1 - t, cz]]) {
    const lenx = Math.abs(gx - cx), lenz = Math.abs(gz - cz);
    g.boxB((gx + cx) / 2, gy + 0.02, (gz + cz) / 2, lenx < 1 ? 9 : lenx, 0.03, lenz < 1 ? 9 : lenz, P.path);
  }
  // square promenade ring linking the quadrants
  const PR = 46;
  for (const s of [-1, 1]) {
    g.boxB(cx, gy + 0.02, cz + s * PR, PR * 2 + 7, 0.03, 7, P.path);
    g.boxB(cx + s * PR, gy + 0.02, cz, 7, 0.03, PR * 2 + 7, P.path);
  }
  // central plaza: two concentric discs, staggered so the tones don't z-fight
  g.cyl(cx, gy + 0.03, cz, 18, 18, 0.04, P.sidewalk);
  g.cyl(cx, gy + 0.05, cz, 12, 12, 0.04, P.path);

  // ---- courtyard landscaping (formal, symmetric) ----
  // planters lining the four paths
  for (const dd of [24, 46, 68]) for (const s of [-1, 1]) {
    planter(g, col, cx + s * 5.5, cz - dd);
    planter(g, col, cx + s * 5.5, cz + dd);
    planter(g, col, cx - dd, cz + s * 5.5);
    planter(g, col, cx + dd, cz + s * 5.5);
  }
  // four quadrant gardens: a fountain, trees, hedge, bushes
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const s2 = hash(seed, (sx + 2) * 5 + (sz + 2));
    fountain(g, col, cx + sx * 30, cz + sz * 30);
    const gx = cx + sx * 54, gz = cz + sz * 54;
    tree(g, col, gx, gz, 1.2, hash(s2, 1) % 3);
    tree(g, col, gx - sx * 8, gz - sz * 3, 1.0, hash(s2, 4) % 3);
    hedge(g, col, gx + sx * 2, gz + sz * 8, 14, 1.3);
    g.ico(cx + sx * 42, gy + 0.5, cz + sz * 42, 1.3, P.leaf2);
    g.ico(cx + sx * 36, gy + 0.5, cz + sz * 48, 1.0, P.leaf3);
    g.ico(gx - sx * 9, gy + 0.45, gz, 0.9, P.leaf1);
    g.ico(gx, gy + 0.45, gz - sz * 9, 0.9, P.leaf3);
    bench(g, col, cx + sx * 30, cz + sz * 22, sz > 0 ? 0 : Math.PI);
    flowerBed(g, col, cx + sx * 47, cz + sz * 33, hash(s2, 7));
    flowerBed(g, col, cx + sx * 33, cz + sz * 47, hash(s2, 8));
    flowerBed(g, col, cx + sx * 20, cz + sz * 20, hash(s2, 9)); // flanking the central plaza
  }
  // lamps ringing the plaza, benches facing the monument
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; lamp(g, col, cx + Math.cos(a) * 21, cz + Math.sin(a) * 21); }
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + Math.PI / 4;
    const bx = cx + Math.cos(a) * 13, bz = cz + Math.sin(a) * 13;
    bench(g, col, bx, bz, Math.atan2(cx - bx, cz - bz)); // face the monument
  }

  obelisk(g, col, cx, cz, y);
  cornerLamps(g, col, b);
}

export { buildPlaza };
