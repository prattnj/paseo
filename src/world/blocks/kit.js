// Block scaffolding and site work shared by every builder: the raised slab +
// sidewalk + lawn, grass mottling, ground decals, corner lamps, street trees,
// asphalt parking lots, lot grids, monument signs, and wrought-iron fences.
import * as THREE from 'three';
import { PALETTE as P, SIDEWALK_H, INSET } from '../../core/palette.js';
import { hash, frac } from '../../core/util.js';
import { lamp, tree, parkedCar } from './props.js';

// Slightly varied lawn greens so the grass isn't one flat shade everywhere
// (works with the faceted island-ground patches in island.js).
const GRASS_SHADES = [0x7ec850, 0x76c04a, 0x85cf58, 0x7bc44f];
// Subtle low-poly mottling: a few broad, slightly-rotated patches in nearby
// green shades so large lawns aren't one flat color. Visual only.
function grassMottle(g, cx, cz, w, d, baseHex, hole = null, circle = null) {
  if (w < 12 || d < 12) return;
  const seed = hash(Math.round(cx) + 31, Math.round(cz) + 77);
  const area = w * d;
  const n = Math.min(60, Math.max(3, Math.round(area / 180)));
  const size = 1 + Math.min(1.6, area / 9000); // bigger lawns, broader patches
  const placed = [];
  for (let k = 0; k < n; k++) {
    const hk = hash(seed, k);
    const sw = (3.5 + frac(hk, 3, 13) * 5.5) * size;
    const sd = (3.5 + frac(hk, 4, 14) * 5.5) * size;
    const ry = (frac(hk, 6, 15) - 0.5) * 1.2;
    // world-axis half extents of the rotated patch — keep it fully on the lawn
    const hx = (sw * Math.abs(Math.cos(ry)) + sd * Math.abs(Math.sin(ry))) / 2;
    const hz = (sw * Math.abs(Math.sin(ry)) + sd * Math.abs(Math.cos(ry))) / 2;
    const rx = w / 2 - hx - 0.3, rz = d / 2 - hz - 0.3;
    if (rx <= 0 || rz <= 0) continue;
    const px = cx + (frac(hk, 1, 11) - 0.5) * 2 * rx;
    const pz = cz + (frac(hk, 2, 12) - 0.5) * 2 * rz;
    if (hole && px + hx > hole.x0 && px - hx < hole.x1 && pz + hz > hole.z0 && pz - hz < hole.z1) continue;
    if (circle && Math.hypot(px - circle.x, pz - circle.z) < circle.r + Math.max(hx, hz) + 1) continue;
    // patches never overlap each other, so one shared height can't z-fight
    if (placed.some((q) => Math.abs(px - q.px) < hx + q.hx + 0.25 && Math.abs(pz - q.pz) < hz + q.hz + 0.25)) continue;
    placed.push({ px, pz, hx, hz });
    let shade = GRASS_SHADES[hash(hk, 5) % GRASS_SHADES.length];
    if (shade === baseHex) shade = GRASS_SHADES[(hash(hk, 5) + 1) % GRASS_SHADES.length];
    g.boxB(px, SIDEWALK_H + 0.021, pz, sw, 0.003, sd, shade, ry);
  }
}

function slabAndSidewalk(g, col, b, groundHex, hole = null, circle = null) {
  const w = b.x1 - b.x0, d = b.z1 - b.z0;
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  const grassy = groundHex === P.grass;
  if (grassy) {
    groundHex = GRASS_SHADES[hash(Math.round(cx), Math.round(cz)) % GRASS_SHADES.length];
  }
  if (hole) {
    // slab + lawn split into 4 bands around a rectangular hole (pond bowl)
    const bands = [
      [b.x0, b.z0, b.x1, hole.z0],
      [b.x0, hole.z1, b.x1, b.z1],
      [b.x0, hole.z0, hole.x0, hole.z1],
      [hole.x1, hole.z0, b.x1, hole.z1],
    ];
    for (const [x0, z0, x1, z1] of bands) {
      const bw = x1 - x0, bd = z1 - z0;
      if (bw <= 0 || bd <= 0) continue;
      const bcx = (x0 + x1) / 2, bcz = (z0 + z1) / 2;
      g.boxB(bcx, 0, bcz, bw, SIDEWALK_H, bd, P.sidewalk);
      col.add(bcx, 0, bcz, bw, SIDEWALK_H, bd);
      // lawn top, clipped to the inset rect
      const lx0 = Math.max(x0, b.x0 + INSET), lx1 = Math.min(x1, b.x1 - INSET);
      const lz0 = Math.max(z0, b.z0 + INSET), lz1 = Math.min(z1, b.z1 - INSET);
      if (lx1 > lx0 && lz1 > lz0) {
        g.boxB((lx0 + lx1) / 2, SIDEWALK_H, (lz0 + lz1) / 2, lx1 - lx0, 0.02, lz1 - lz0, groundHex);
      }
    }
  } else {
    g.boxB(cx, 0, cz, w, SIDEWALK_H, d, P.sidewalk);
    col.add(cx, 0, cz, w, SIDEWALK_H, d);
    g.boxB(cx, SIDEWALK_H, cz, w - INSET * 2, 0.03, d - INSET * 2, groundHex);
  }
  if (grassy) grassMottle(g, cx, cz, w - INSET * 2, d - INSET * 2, groundHex, hole, circle);
  return { x0: b.x0 + INSET, z0: b.z0 + INSET, x1: b.x1 - INSET, z1: b.z1 - INSET, cx, cz };
}

// Ground decal (driveway / dirt / path). Base at SIDEWALK_H, top ~0.20 — above
// the lawn top (0.18) yet with no horizontal face coplanar with it, so no
// z-fighting. Keep overlapping decals apart to avoid decal-on-decal fights.
function groundStripe(g, cx, cz, sx, sz, hex, ry = 0, h = 0.05) {
  g.boxB(cx, SIDEWALK_H, cz, sx, h, sz, hex, ry);
}

// Scored-concrete decals on a poured slab so large open pours (industrial yards,
// commercial pads) don't read as one flat grey. Everything here is a thin,
// non-casting ground decal sitting a hair above the concrete top (SIDEWALK_H +
// 0.03) — wherever a building or parking lot later sits on top, it simply covers
// the decal, so drawing a full grid across the block is safe. `r` is the interior
// rect returned by slabAndSidewalk (its edges align with the concrete edges).
const SCORE_Y = SIDEWALK_H + 0.031; // just above concrete top (0.03), below lots

// An expansion-joint grid: darker lines every ~`spacing` m in both axes, so the
// slab reads as scored panels rather than one sheet. `y` defaults to just above
// the block's concrete top, but a raised floor (e.g. the mosque plinth) can pass
// its own surface height.
function concreteScoring(g, r, spacing = 12, hex = P.concreteDark, lineW = 0.16, y = SCORE_Y) {
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  const mx = (r.x0 + r.x1) / 2, mz = (r.z0 + r.z1) / 2;
  const nx = Math.max(1, Math.round(w / spacing));
  for (let i = 1; i < nx; i++) g.boxB(r.x0 + (w * i) / nx, y, mz, lineW, 0.006, d, hex, 0, false);
  const nz = Math.max(1, Math.round(d / spacing));
  for (let j = 1; j < nz; j++) g.boxB(mx, y, r.z0 + (d * j) / nz, w, 0.006, lineW, hex, 0, false);
}

// Faint horizontal "coursing" lines up a vertical wall face — a lighter texture
// than the floor grid (horizontal only, no cross-hatch) so a wall reads as
// coursed stone/masonry without matching the pavement. Give the face-centre
// (fx,fz) at the wall base `baseY`, the wall's run axis ('x'|'z') and run length,
// the wall height H, and the outward face-normal sign (±1) along the
// perpendicular axis. Lines are thin non-casting decals pushed `proud` clear of
// the face so they never z-fight the wall.
function wallScoring(g, fx, baseY, fz, runAxis, runLen, H, faceSign, opts = {}) {
  const { rows = 4, hex = P.concreteDark, lineW = 0.1, margin = 0.8, proud = 0.05 } = opts;
  const L = runLen - margin * 2;
  if (L <= 0) return;
  for (let i = 1; i <= rows; i++) {
    const wy = baseY + (H * i) / (rows + 1);
    if (runAxis === 'x') g.box(fx, wy, fz + faceSign * proud, L, lineW, 0.04, hex, 0, false);
    else g.box(fx + faceSign * proud, wy, fz, 0.04, lineW, L, hex, 0, false);
  }
}

// A painted safety-boundary line: a hollow rectangle inset `inset` m from the
// slab edge, `lineW` wide. Reads as the yellow perimeter paint of an industrial
// yard. Drawn as four thin bars so the interior stays open concrete.
function concreteBorder(g, r, hex = LOT_LINE_Y, inset = 1.6, lineW = 0.22) {
  const x0 = r.x0 + inset, x1 = r.x1 - inset, z0 = r.z0 + inset, z1 = r.z1 - inset;
  if (x1 <= x0 || z1 <= z0) return;
  const w = x1 - x0, d = z1 - z0, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  g.boxB(mx, SCORE_Y, z0, w, 0.006, lineW, hex, 0, false);
  g.boxB(mx, SCORE_Y, z1, w, 0.006, lineW, hex, 0, false);
  g.boxB(x0, SCORE_Y, mz, lineW, 0.006, d, hex, 0, false);
  g.boxB(x1, SCORE_Y, mz, lineW, 0.006, d, hex, 0, false);
}

function cornerLamps(g, col, b) {
  const o = 1.4;
  lamp(g, col, b.x0 + o, b.z0 + o);
  lamp(g, col, b.x1 - o, b.z0 + o);
  lamp(g, col, b.x0 + o, b.z1 - o);
  lamp(g, col, b.x1 - o, b.z1 - o);
}

// Small street trees along the sidewalk band.
function streetTrees(g, col, b, seed) {
  const o = 1.5;
  const w = b.x1 - b.x0, d = b.z1 - b.z0;
  let k = 0;
  for (const t of [0.32, 0.68]) {
    tree(g, col, b.x0 + w * t, b.z0 + o, 0.62 + frac(seed, k, 71) * 0.18, 2); k++;
    tree(g, col, b.x0 + w * (1 - t), b.z1 - o, 0.62 + frac(seed, k, 72) * 0.18, 2); k++;
    tree(g, col, b.x0 + o, b.z0 + d * t, 0.62 + frac(seed, k, 73) * 0.18, 2); k++;
    tree(g, col, b.x1 - o, b.z0 + d * (1 - t), 0.62 + frac(seed, k, 74) * 0.18, 2); k++;
  }
}

const ASPHALT = 0x2b2b30, LOT_LINE = 0xdfe2e5;
// Poured-concrete lot/tunnel surface: a darker, dirtier grey than the sidewalk
// but still well clear of the road's near-black, with yellow bay lines that
// stay legible against it.
const LOT_CONCRETE = 0x7e8186, LOT_LINE_Y = 0xd9b84a;
// Two stacked deck heights, both proud of the block's grass top (SIDEWALK_H +
// 0.03): the parking pad rides slightly higher than the tunnel/apron floor so
// where the two poured slabs overlap the pad simply wins — no z-fighting.
const LOT_DECK = SIDEWALK_H + 0.06;   // parking-pad surface
const TUN_FLOOR = SIDEWALK_H + 0.04;  // tunnel floor + the apron aprons it extends

// A large asphalt parking lot centred at world (cx, cz), size uw x vd in the
// lot's own frame (rotated by ry). Several rows of painted spaces stacked with
// drive aisles, plus a capped number of parked cars. `gy` = the block surface.
function parkingLotAt(g, col, cx, cz, uw, vd, gy, s, ry = 0, carType = null, maxCars = 30, surface = ASPHALT, lineHex = LOT_LINE, skip = null) {
  const c = Math.cos(ry), sn = Math.sin(ry);
  const box = (u, v, w2, d2, by, hex) => g.boxB(cx + u * c - v * sn, by, cz + u * sn + v * c, w2, 0.02, d2, hex, ry);
  box(0, 0, uw, vd, gy + 0.02, surface);
  const spaceW = 2.7, rowD = 5, mod = rowD + 6;
  const nRows = Math.max(1, Math.floor((vd - rowD) / mod) + 1);
  const nsp = Math.max(3, Math.floor((uw - 1) / spaceW));
  const u1 = -(nsp * spaceW) / 2, v1 = -vd / 2 + rowD / 2 + 0.5;
  let cars = 0;
  for (let ri = 0; ri < nRows; ri++) {
    const vr = v1 + ri * mod;
    for (let k = 0; k <= nsp; k++) box(u1 + k * spaceW, vr, 0.16, rowD, gy + 0.05, lineHex);
    for (let k = 0; k < nsp; k++) {
      if (cars >= maxCars || hash(s, ri * 37 + k, 5) % 3 === 0) continue;
      const u = u1 + (k + 0.5) * spaceW;
      const px = cx + u * c - vr * sn, pz = cz + u * sn + vr * c;
      if (skip && skip(px, pz)) continue;   // leave chosen spots empty (e.g. by the door)
      parkedCar(g, col, px, pz, ry + (ri % 2 ? Math.PI : 0), hash(s, ri * 37 + k, 9), gy + 0.01, carType);
      cars++;
    }
  }
}

// Iterate a rows×cols lot grid over block interior `r`, calling place(ctx) per
// lot. rows=2 → both rows face their outer street; rows=4 → the outer rows face
// the street and the inner rows face a shared central lane. Alternating
// ry=(j even?π:0) yields exactly that: back-to-back yards at the 0/1 & 2/3
// seams and houses facing across the lane at the 1/2 seam. Rotations stay
// axis-aligned (ry∈{0,π}) so callers can lay driveways with simple offsets.
function lotGrid(r, rows, cols, place) {
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  const cw = w / cols, cd = d / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const lx = r.x0 + cw * (i + 0.5);
      const lz = r.z0 + cd * (j + 0.5);
      const ry = j % 2 === 0 ? Math.PI : 0;
      const frontZ = ry === Math.PI ? -1 : 1;   // world +z sign the front faces
      const laneSide = rows === 4 && (j === 1 || j === 2);
      place({ i, j, lx, lz, cw, cd, ry, frontZ, laneSide, streetZ: lz + frontZ * cd / 2 });
    }
  }
}

// A canvas texture of sign text at a CONSTANT physical letter size. The text
// wraps to the given panel text-width `pwMeters` (rendered at SIGN_PPM px/m),
// so a narrow sign breaks into more lines (taller) and a wide sign fits on
// fewer lines (shorter) — the font never changes. Returns the physical text
// height so the panel can size itself to match.
const SIGN_FS = 72, SIGN_PPM = 85; // fixed font -> ~0.85 m letters everywhere
function makeTextTexture(text, pwMeters, bg = '#87898b', fg = '#2d2d2e', fontScale = 1) {
  const fs = SIGN_FS * fontScale; // fontScale < 1 -> smaller letters (and more fit per line)
  const font = `bold ${fs}px Georgia, "Times New Roman", serif`;
  const pad = 28, canvasW = Math.max(180, Math.round(pwMeters * SIGN_PPM)), maxW = canvasW - 2 * pad;
  const m = document.createElement('canvas').getContext('2d');
  m.font = font;
  try { m.letterSpacing = '5px'; } catch (e) { /* older browsers */ }
  const lines = []; let line = '';
  for (const wd of text.split(' ')) {
    const t = line ? line + ' ' + wd : wd;
    if (line && m.measureText(t).width > maxW) { lines.push(line); line = wd; } else line = t;
  }
  if (line) lines.push(line);
  const lh = Math.round(fs * 1.32);
  const c = document.createElement('canvas');
  c.width = canvasW; c.height = lines.length * lh + Math.round(lh * 0.55);
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = fg; x.font = font;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  try { x.letterSpacing = '5px'; } catch (e) { /* older browsers */ }
  const total = lines.length * lh;
  lines.forEach((l, i) => x.fillText(l, c.width / 2, c.height / 2 - total / 2 + lh * (i + 0.5)));
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  return { tex, physH: c.height / SIGN_PPM };
}

// A concrete monument sign of the given width `w`. Letters are always the same
// size; the width controls how the text wraps, and the height follows from it.
function wallSign(g, col, scene, x, gy, z, w, text, faceZ = 1, ry = 0, fontScale = 1) {
  const pw = w - 1.2;
  const { tex, physH } = makeTextTexture(text, pw, undefined, undefined, fontScale);
  const ph = physH, h = ph + 0.8;
  g.boxB(x, gy, z, w + 1.8, 0.6, 2.6, P.concreteDark, ry);            // plinth
  g.boxB(x, gy + 0.6, z, w, h, 0.8, P.concrete, ry);                 // panel
  g.boxB(x, gy + 0.6 + h, z, w + 0.6, 0.4, 1.1, P.concreteDark, ry); // cornice
  col.add(x, 0, z, w + 0.6, gy + 1.0 + h, 2.6, ry);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ map: tex }));
  plane.rotation.y = ry + (faceZ < 0 ? Math.PI : 0);
  plane.position.set(x + Math.sin(ry) * faceZ * 0.43, gy + 0.6 + h / 2, z + Math.cos(ry) * faceZ * 0.43);
  scene.add(plane);
}

// Black wrought-iron railing between two points (axis-aligned): two thin rails
// carried on posts every ~2.4 m. One AABB collider for the whole run.
function ironFence(g, col, x0, z0, x1, z1, baseY = SIDEWALK_H, scale = 1) {
  const IRON = 0x2a2d33;
  const horiz = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  const len = Math.abs(horiz ? x1 - x0 : z1 - z0);
  if (len < 0.5) return;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const railW = horiz ? len : 0.06, railD = horiz ? 0.06 : len;
  const postH = 1.45 * scale; // tall fences (scale>1) get an extra rail
  for (const rf of (scale >= 1.5 ? [0.28, 0.52, 0.76] : [0.31, 0.72])) g.box(cx, baseY + rf * postH, cz, railW, 0.07, railD, IRON);
  const n = Math.max(1, Math.round(len / 2.4));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    g.boxB(x0 + (x1 - x0) * t, baseY, z0 + (z1 - z0) * t, 0.12, postH, 0.12, IRON);
  }
  col.add(cx, baseY, cz, horiz ? len : 0.35, 1.3 * scale, horiz ? 0.35 : len);
}

export { slabAndSidewalk, groundStripe, grassMottle, cornerLamps, streetTrees,
  parkingLotAt, lotGrid, wallSign, makeTextTexture, ironFence,
  concreteScoring, concreteBorder, wallScoring,
  LOT_DECK, LOT_CONCRETE, LOT_LINE_Y, TUN_FLOOR };
