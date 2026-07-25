// Gothic cathedral: gray stone cruciform plan, twin front towers, stained
// glass and a churchyard forest.
import { PALETTE as P, SIDEWALK_H } from '../palette.js';
import { hash, frac } from '../util.js';
import { flowerBed, bench, tree } from './props.js';
import { slabAndSidewalk, cornerLamps } from './kit.js';

// Gothic cathedral: gray stone, cruciform plan (nave + transept + apse), twin
// front towers, a slate roof, an arched wooden door, and stained glass — set
// in a churchyard with cobblestone paths, trees and flowers.
function buildChurch(g, col, b, seed) {
  const r = slabAndSidewalk(g, col, b, P.grass);
  const y = SIDEWALK_H, gy = SIDEWALK_H + 0.2, cx = r.cx, cz = r.cz;
  const STONE = 0x9c9a94, STONE_D = 0x83817b, SLATE = 0x393b41, WOOD = 0x5a3f28, DIRT = 0x6e5a3c;
  const GLASS = [0x2f5fb0, 0xc0392b, 0xe0a92e, 0x3f9b52, 0x7d4fa0, 0x2a9d9a];
  const zFront = cz + 24, zApse = cz - 28, zCross = cz - 2, naveW = 16, naveH = 17;

  // a stone-framed stained-glass lancet on an ±x or ±z wall face
  const lancet = (px, pz, axis, sign, w, h, s) => {
    const fb = (uc, wy, wa, hh, prd, hex) =>
      axis === 'x' ? g.box(px + sign * prd, wy, pz + uc, 0.3, hh, wa, hex)
                   : g.box(px + uc, wy, pz + sign * prd, wa, hh, 0.3, hex);
    const yb = y + 3;
    fb(0, yb + h / 2, w + 0.6, h + 0.7, 0.02, STONE_D);          // surround
    for (let i = 0; i < 3; i++) fb((i - 1) * (w / 3), yb + h / 2, w / 3 - 0.12, h - 0.3, 0.14, GLASS[hash(s, i, 1) % GLASS.length]);
    for (const m of [-1, 1]) fb(m * (w / 6), yb + h / 2, 0.12, h, 0.22, STONE_D); // mullions
    fb(0, yb - 0.1, w + 0.6, 0.35, 0.1, STONE_D);                // sill
  };
  // large grid west window (facing +z)
  const westWindow = (px, py, pz, w, h, s) => {
    g.box(px, py + h / 2, pz + 0.06, w + 0.8, h + 0.8, 0.3, STONE_D);
    const nX = 3, nY = 4, pw = w / nX, ph = h / nY;
    for (let i = 0; i < nX; i++) for (let j = 0; j < nY; j++)
      g.box(px - w / 2 + pw * (i + 0.5), py + ph * (j + 0.5), pz + 0.16, pw - 0.22, ph - 0.22, 0.2, GLASS[hash(s, i * 7 + j, 2) % GLASS.length]);
    for (let i = 1; i < nX; i++) g.box(px - w / 2 + pw * i, py + h / 2, pz + 0.24, 0.15, h, 0.3, STONE_D);
    for (let j = 1; j < nY; j++) g.box(px, py + ph * j, pz + 0.24, w, 0.15, 0.3, STONE_D);
  };
  // arched wooden double door with a stone voussoir arch (facing +z)
  const archDoor = (px, pz, w, h, s) => {
    const rad = w / 2, springY = y + h;
    for (const sx of [-1, 1]) {
      g.box(px + sx * w / 4, y + h / 2, pz + 0.12, w / 2 - 0.08, h, 0.3, WOOD);
      for (const by of [0.28, 0.62]) g.box(px + sx * w / 4, y + h * by, pz + 0.29, w / 2 - 0.12, 0.12, 0.12, 0x2a2018);
    }
    for (let i = 0; i <= 14; i++) { const a = Math.PI * i / 14; g.box(px + Math.cos(a) * rad, springY + Math.sin(a) * rad, pz + 0.1, 0.62, 0.62, 0.36, STONE_D); }
    g.box(px, springY + rad * 0.42, pz + 0.16, w * 0.55, rad * 0.62, 0.18, GLASS[hash(s, 1) % 6]); // tympanum glass
    for (const sx of [-1, 1]) g.box(px + sx * (w / 2 + 0.35), y + (h + rad) / 2, pz + 0.06, 0.6, h + rad, 0.42, STONE_D); // jambs
  };
  // stepped stone buttress against a nave wall
  const buttress = (px, pz, sign) => {
    const bx = px + sign * 1.0;
    g.boxB(bx, y, pz, 2.0, naveH - 1.5, 2.6, STONE); col.add(bx, 0, pz, 2.0, naveH - 1.5, 2.6);
    g.prism(bx, y + naveH - 1.5, pz, 2.6, 1.6, 2.0, SLATE, Math.PI / 2);
  };

  // ---- structure (gray stone, slate roofs) ----
  g.boxB(cx, y, cz - 2, naveW, naveH, zFront - zApse, STONE); col.add(cx, 0, cz - 2, naveW, naveH, zFront - zApse); // nave
  g.prism(cx, y + naveH, cz - 2, zFront - zApse + 1, 6, naveW + 1, SLATE, Math.PI / 2);
  g.boxB(cx, y, zCross, 54, naveH - 1, 14, STONE); col.add(cx, 0, zCross, 54, naveH - 1, 14);              // transept
  g.prism(cx, y + naveH - 1, zCross, 55, 5.5, 15, SLATE, 0);
  g.cyl(cx, y, zApse, 8, 8, naveH, STONE, 8); col.add(cx, 0, zApse, 16, naveH, 16);                        // apse
  g.cone(cx, y + naveH, zApse, 8.6, 6, SLATE, 8);
  // facade wall + gable between the towers
  g.boxB(cx, y, zFront, naveW, 22, 2.4, STONE); col.add(cx, 0, zFront, naveW, 22, 2.4);
  g.prism(cx, y + 22, zFront, 3, 5, naveW + 1, SLATE, Math.PI / 2);
  // twin front towers with spires
  for (const sx of [-1, 1]) {
    const tx = cx + sx * 12;
    g.boxB(tx, y, zFront, 9, 30, 9, STONE); col.add(tx, 0, zFront, 9, 30, 9);
    g.boxB(tx, y + 30, zFront, 9.8, 1.4, 9.8, STONE_D);                         // cornice
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.box(tx + nx * 4.55, y + 24, zFront + nz * 4.55, nx ? 0.2 : 3.4, 5, nz ? 0.2 : 3.4, STONE_D); // belfry louvers
    g.cone(tx, y + 31.4, zFront, 6, 11, SLATE, 4);                              // spire
    g.box(tx, y + 42.4, zFront, 0.3, 1.8, 0.3, STONE_D);                        // finial
  }
  // west front: door + great window
  archDoor(cx, zFront + 1.2, 6, 5.5, seed);
  westWindow(cx, y + 11, zFront + 1.2, 9, 7, hash(seed, 5));
  // stained glass down the nave/choir + buttresses between them
  for (let i = 0; i < 5; i++) {
    const zz = zApse + 6 + i * 8.5;
    if (Math.abs(zz - zCross) < 8) continue; // skip the transept crossing
    for (const sx of [-1, 1]) { lancet(cx + sx * 8, zz, 'x', sx, 3, 8, hash(seed, i * 3 + (sx + 1))); buttress(cx + sx * 8, zz + 4, sx); }
  }
  // stained glass on the transept ends + apse
  for (const sx of [-1, 1]) lancet(cx + sx * 27, zCross, 'x', sx, 5, 10, hash(seed, 20 + sx));
  lancet(cx, zApse - 8, 'z', -1, 4, 9, hash(seed, 30));

  // ---- churchyard: a dense forest wrapping the cathedral, with only a bare
  // dirt clearing directly in front of the door ----
  g.boxB(cx, gy + 0.02, (cz + 18 + r.z1) / 2, 16, 0.02, r.z1 - (cz + 18), DIRT); // dirt approach to the door
  const treeOK = (tx, tz) => {
    const ax = Math.abs(tx - cx);
    if (ax < 8 && tz > cz + 17) return false;                                 // dirt clearing (door)
    if (ax < 9 && tz > cz - 30 && tz < cz + 26) return false;                 // nave + facade
    if (ax < 28 && tz > cz - 11 && tz < cz + 6) return false;                 // transept
    if (Math.hypot(tx - cx, tz - (cz - 28)) < 10.5) return false;            // apse
    for (const sx of [-1, 1]) if (Math.abs(tx - (cx + sx * 12)) < 6 && Math.abs(tz - (cz + 24)) < 6) return false; // towers
    return true;
  };
  // forest: a jittered grid so it reads as dense woodland
  for (let ix = r.x0 + 2; ix < r.x1 - 2; ix += 4.3)
    for (let iz = r.z0 + 2; iz < r.z1 - 2; iz += 4.3) {
      const s = hash(Math.round(ix) + 131, Math.round(iz) + 617);
      const tx = ix + (frac(s, 1) - 0.5) * 3.4, tz = iz + (frac(s, 2) - 0.5) * 3.4;
      if (!treeOK(tx, tz)) continue;
      tree(g, col, tx, tz, 0.75 + frac(s, 3) * 0.6, hash(s, 4) % 3);
    }
  flowerBed(g, col, cx - 6, cz + 32, hash(seed, 1)); flowerBed(g, col, cx + 6, cz + 32, hash(seed, 2));
  bench(g, col, cx - 6, cz + 40, 0); bench(g, col, cx + 6, cz + 40, 0);
  cornerLamps(g, col, b);
}

export { buildChurch };
