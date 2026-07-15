// Builds the entire static city into one merged vertex-colored mesh.
// All placement/variety comes from coordinate hashes — fully deterministic.
import { GeoBatch } from './geo.js';
import * as THREE from 'three';
import { buildRoads, buildBlocks, GRID, roadWidth, REMOVED_CELLS } from './layout.js';
import { buildParkway, streetExtensions, parkwayCenterR, extSidewalkEnd, extStripCross } from './parkway.js';
import { HILL, POND } from './island.js';
import { hash, pick, frac, range } from './util.js';

// ---- palette ------------------------------------------------------------
const P = {
  grass: 0x7ec850,
  grassDark: 0x6db24a,
  road: 0x62666e,
  dash: 0xe8eaec,
  sidewalk: 0xb9bec4,
  concrete: 0xcdd2d7,
  concreteDark: 0x9aa0a5,
  path: 0xd9cfb4,
  water: 0x4fb7e8,
  trunk: 0x8d6e63,
  leaf1: 0x4e9b47,
  leaf2: 0x3e7d3a,
  leaf3: 0x67ab3f,
  white: 0xf2f4f5,
  offwhite: 0xe4e1d6,
  window: 0xe8f1f6,
  glass: 0x3f6d9e,
  glassDark: 0x2c4f77,
  doorDark: 0x4a4440,
  roofLight: 0xd8dbde,
  roofDark: 0x55585e,
  roofRed: 0xc0564a,
  bodies: [0xe04f43, 0x9ccc4e, 0xf4c542, 0xf39a3a, 0x4a90d9, 0x3aa7a3, 0xe07f9a, 0x8bc34a],
  houseBodies: [0xf2f4f5, 0xf5e9d0, 0xa3c9e8, 0xf4c542, 0xcfe3cf, 0xe8b6a8],
  houseRoofs: [0xc0564a, 0x55585e, 0x8d6e63, 0x4a6b8a],
  awnings: [0xe04f43, 0x4a90d9, 0xf4c542, 0x3aa7a3, 0xe07f9a],
  towerBodies: [0xf2f4f5, 0xdde3e8, 0xc9d6d4, 0xe9e4d2],
  carBodies: [0xe04f43, 0x4a90d9, 0xf4c542, 0xf2f4f5, 0x3aa7a3, 0xf39a3a, 0x55585e],
};
export { P as PALETTE };

const SIDEWALK_H = 0.15;
const INSET = 3; // sidewalk band width

// ---- small props --------------------------------------------------------
function tree(g, col, x, z, s = 1, kind = 0) {
  g.cyl(x, 0, z, 0.22 * s, 0.3 * s, 1.7 * s, P.trunk, 6);
  if (kind === 0) {
    g.ico(x, 2.9 * s, z, 1.7 * s, P.leaf1, 0);
  } else if (kind === 1) {
    g.cone(x, 1.3 * s, z, 1.5 * s, 3.6 * s, P.leaf2, 7);
  } else {
    g.ico(x, 2.5 * s, z, 1.4 * s, P.leaf3, 0);
    g.ico(x + 0.5 * s, 3.5 * s, z - 0.3 * s, 1.0 * s, P.leaf1, 0);
  }
  col.add(x, 0, z, 0.7, 2.2 * s, 0.7);
}

function bench(g, col, x, z, ry = 0) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const at = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];
  g.box(x, 0.4, z, 1.8, 0.1, 0.5, P.trunk, ry);
  const [bx, bz] = at(0, -0.22);
  g.box(bx, 0.7, bz, 1.8, 0.55, 0.08, P.trunk, ry);
  for (const dx of [-0.7, 0.7]) {
    const [lx, lz] = at(dx, 0);
    g.box(lx, 0.18, lz, 0.1, 0.36, 0.45, P.roofDark, ry);
  }
  col.add(x, 0, z, 1.8, 1.0, 0.6, ry);
}

function lamp(g, col, x, z) {
  g.cyl(x, 0, z, 0.09, 0.13, 5, P.roofDark, 6);
  g.box(x, 5.1, z, 0.55, 0.28, 0.28, P.window);
  col.add(x, 0, z, 0.35, 5, 0.35);
}

function fountain(g, col, x, z) {
  g.cyl(x, 0, z, 3.6, 3.9, 0.7, P.concrete, 10);
  g.cyl(x, 0.5, z, 3.2, 3.2, 0.35, P.water, 10);
  g.cyl(x, 0.8, z, 0.5, 0.7, 1.6, P.concrete, 8);
  g.cyl(x, 2.3, z, 1.4, 1.5, 0.3, P.concrete, 8);
  g.cyl(x, 2.5, z, 1.1, 1.1, 0.25, P.water, 8);
  g.ico(x, 3.1, z, 0.45, P.water, 0);
  col.add(x, 0, z, 7.8, 1.2, 7.8);
}

function hedge(g, col, x, z, sx, sz) {
  g.boxB(x, SIDEWALK_H, z, sx, 0.9, sz, P.leaf2);
  col.add(x, 0, z, sx, 1.05, sz);
}

// White picket-style fence (solid low-poly rails).
function fenceRun(g, col, x0, z0, x1, z1) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const sx = Math.max(Math.abs(x1 - x0), 0.12);
  const sz = Math.max(Math.abs(z1 - z0), 0.12);
  g.boxB(cx, SIDEWALK_H, cz, sx === 0.12 ? 0.12 : sx, 0.85, sz === 0.12 ? 0.12 : sz, P.white);
  col.add(cx, 0, cz, sx, 1.0, sz);
}

// ---- building pieces ----------------------------------------------------
function windowsWall(g, x, z, y0, floors, floorH, len, axis, wallOff, spacing = 4, hex = P.window) {
  // axis 'x': wall faces ±x, plane at x+wallOff, windows spread along z.
  // axis 'z': wall faces ±z, plane at z+wallOff, windows spread along x.
  const sign = Math.sign(wallOff) || 1;
  const n = Math.floor((len - 3) / spacing);
  if (n < 1) return;
  const start = -((n - 1) * spacing) / 2;
  for (let f = 0; f < floors; f++) {
    const wy = y0 + f * floorH + floorH * 0.55;
    for (let i = 0; i < n; i++) {
      const off = start + i * spacing;
      if (axis === 'x') g.box(x + wallOff + sign * 0.1, wy, z + off, 0.2, 1.6, 1.4, hex);
      else g.box(x + off, wy, z + wallOff + sign * 0.1, 1.4, 1.6, 0.2, hex);
    }
  }
}

// Colorful mid-rise apartment slab (the reference-image look).
// Windows/doors go on the two walls of the longer dimension.
function apartment(g, col, x, z, w, d, floors, bodyHex, seed) {
  const floorH = 3;
  const h = floors * floorH;
  const y = SIDEWALK_H;
  g.boxB(x, y, z, w, h, d, bodyHex);
  // parapet + roof slab
  g.boxB(x, y + h, z, w + 0.5, 0.5, d + 0.5, P.roofLight);
  // roof clutter
  g.boxB(x - w / 4, y + h + 0.5, z, 2.2, 1.4, 2.2, P.roofLight);
  if (hash(seed, 7) % 2) g.boxB(x + w / 4, y + h + 0.5, z + d / 5, 1.6, 1.0, 1.6, P.concreteDark);
  const doorSign = hash(seed, 3) % 2 ? 1 : -1;
  if (w >= d) {
    windowsWall(g, x, z, y, floors, floorH, w, 'z', d / 2);
    windowsWall(g, x, z, y, floors, floorH, w, 'z', -(d / 2));
    g.box(x, y + 1.25, z + doorSign * d / 2, 2.2, 2.5, 0.25, P.doorDark);
    g.box(x, y + 2.7, z + doorSign * (d / 2 + 0.6), 3.2, 0.18, 1.4, pick(P.awnings, seed, 9));
  } else {
    windowsWall(g, x, z, y, floors, floorH, d, 'x', w / 2);
    windowsWall(g, x, z, y, floors, floorH, d, 'x', -(w / 2));
    g.box(x + doorSign * w / 2, y + 1.25, z, 0.25, 2.5, 2.2, P.doorDark);
    g.box(x + doorSign * (w / 2 + 0.6), y + 2.7, z, 1.4, 0.18, 3.2, pick(P.awnings, seed, 9));
  }
  col.add(x, 0, z, w, h + 1, d);
}

// Downtown office tower with vertical glass strips.
function tower(g, col, x, z, w, d, floors, seed) {
  const h = floors * 3.2;
  const y = SIDEWALK_H;
  const body = pick(P.towerBodies, seed, 1);
  const glass = hash(seed, 2) % 2 ? P.glass : P.glassDark;
  const style = hash(seed, 7) % 3;

  if (style === 2) {
    // tiered setback tower: stacked shrinking slabs with ledges
    const tiers = floors >= 12 ? 3 : 2;
    let ty = y, tw = w, td = d;
    const tierH = h / tiers;
    for (let t = 0; t < tiers; t++) {
      g.boxB(x, ty, z, tw, tierH, td, body);
      // ribbon windows on each tier
      const rows = Math.floor(tierH / 3.2);
      for (let r = 0; r < rows; r++) {
        const wy = ty + r * 3.2 + 1.7;
        g.box(x, wy, z + td / 2, tw - 1.6, 1.3, 0.2, glass);
        g.box(x, wy, z - td / 2, tw - 1.6, 1.3, 0.2, glass);
        g.box(x + tw / 2, wy, z, 0.2, 1.3, td - 1.6, glass);
        g.box(x - tw / 2, wy, z, 0.2, 1.3, td - 1.6, glass);
      }
      g.boxB(x, ty + tierH, z, tw + 0.5, 0.4, td + 0.5, P.roofDark);
      ty += tierH + 0.4;
      tw -= 3.2; td -= 3.2;
    }
  } else {
    g.boxB(x, y, z, w, h, d, body);
    if (style === 0) {
      // vertical glass strips on all 4 walls
      for (const [axis, len] of [['x', d], ['z', w]]) {
        const n = Math.floor((len - 3) / 3.4);
        const start = -((n - 1) * 3.4) / 2;
        for (let i = 0; i < n; i++) {
          const off = start + i * 3.4;
          for (const side of [1, -1]) {
            if (axis === 'x') g.box(x + side * w / 2, y + h / 2 + 0.5, z + off, 0.2, h - 3, 1.9, glass);
            else g.box(x + off, y + h / 2 + 0.5, z + side * d / 2, 1.9, h - 3, 0.2, glass);
          }
        }
      }
    } else {
      // horizontal ribbon bands wrapping every floor
      for (let f = 1; f < floors; f++) {
        const wy = y + f * 3.2 + 0.9;
        g.box(x, wy, z + d / 2, w - 1.2, 1.4, 0.2, glass);
        g.box(x, wy, z - d / 2, w - 1.2, 1.4, 0.2, glass);
        g.box(x + w / 2, wy, z, 0.2, 1.4, d - 1.2, glass);
        g.box(x - w / 2, wy, z, 0.2, 1.4, d - 1.2, glass);
      }
    }
    g.boxB(x, y + h, z, w + 0.4, 0.5, d + 0.4, P.roofDark);
  }

  // roof furniture: helipad, AC block, antenna
  const roofY = style === 2 ? y + h + (floors >= 12 ? 3 : 2) * 0.4 - 0.4 : y + h + 0.5;
  const topW = style === 2 ? w - (floors >= 12 ? 3 : 2) * 3.2 + 3.2 : w;
  if (hash(seed, 8) % 4 === 0 && topW > 10) {
    g.cyl(x, roofY, z, 3.4, 3.4, 0.3, P.roofLight, 12);
    g.boxB(x, roofY + 0.3, z, 2.6, 0.06, 0.5, P.white);
    g.boxB(x, roofY + 0.3, z, 0.5, 0.06, 2.6, P.white);
  } else {
    g.boxB(x - topW / 6, roofY, z + topW / 8, 3, 2, 3, P.roofDark);
  }
  if (hash(seed, 5) % 3 === 0) g.cyl(x + topW / 5, roofY, z - topW / 6, 0.12, 0.12, 6, P.roofDark, 5);
  // lobby
  g.box(x, y + 1.6, z + d / 2, Math.min(6, w - 2), 3.2, 0.3, P.glassDark);
  col.add(x, 0, z, w, h + 1, d);
}

// Small 1-2 story shop with colored awning, facing +z or given rotation.
function shop(g, col, x, z, w, d, seed, ry = 0) {
  const floors = 1 + (hash(seed, 1) % 2);
  const h = floors * 3.4;
  const y = SIDEWALK_H;
  const body = pick(P.bodies, seed, 2);
  g.boxB(x, y, z, w, h, d, body, ry);
  g.boxB(x, y + h, z, w + 0.4, 0.4, d + 0.4, P.roofLight, ry);
  // storefront glass + awning on front (local +z)
  const a = pick(P.awnings, seed, 3);
  const fw = w - 2;
  const s = Math.sin(ry), c = Math.cos(ry);
  const fx = x + s * (d / 2), fz = z + c * (d / 2);
  g.box(fx, y + 1.5, fz, fw, 2.6, 0.25, P.glassDark, ry);
  const ax = x + s * (d / 2 + 0.8), az = z + c * (d / 2 + 0.8);
  g.box(ax, y + 3.1, az, fw + 0.4, 0.16, 1.7, a, ry);
  if (floors === 2) {
    if (Math.abs(c) > 0.5) windowsWall(g, x, z, y + 3.4, 1, 3.4, w, 'z', c > 0 ? d / 2 : -d / 2);
    else windowsWall(g, x, z, y + 3.4, 1, 3.4, w, 'x', s > 0 ? d / 2 : -d / 2);
  }
  col.add(x, 0, z, w, h + 0.6, d, ry);
}

// Suburban house with pitched roof, in a fenced yard.
function house(g, col, x, z, seed, ry = 0) {
  const body = pick(P.houseBodies, seed, 1);
  const roof = pick(P.houseRoofs, seed, 2);
  const w = 8 + (hash(seed, 3) % 3);
  const d = 6 + (hash(seed, 4) % 2);
  const h = 3.1;
  const y = SIDEWALK_H;
  g.boxB(x, y, z, w, h, d, body, ry);
  g.prism(x, y + h, z, w + 0.8, 2.4, d + 0.8, roof, ry);
  // chimney
  g.boxB(x + w / 4, y + h + 1, z, 0.8, 2, 0.8, P.concreteDark, ry);
  // door + windows on front (local +z)
  const s = Math.sin(ry), c = Math.cos(ry);
  const at = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];
  const [dxp, dzp] = at(-w / 6, d / 2);
  g.box(dxp, y + 1.05, dzp, 1.1, 2.1, 0.2, P.doorDark, ry);
  for (const off of [w / 5, w / 2.8]) {
    const [wx, wz] = at(off, d / 2);
    g.box(wx, y + 1.7, wz, 1.2, 1.2, 0.24, P.window, ry);
  }
  col.add(x, 0, z, w, h + 2.4, d, ry);
}

// Industrial warehouse with shallow gable roof + big door.
function warehouse(g, col, x, z, w, d, seed, ry = 0) {
  const body = hash(seed, 1) % 2 ? P.concreteDark : P.offwhite;
  const h = 7;
  const y = SIDEWALK_H;
  g.boxB(x, y, z, w, h, d, body, ry);
  g.prism(x, y + h, z, w + 0.6, 2.2, d + 0.6, P.roofDark, ry);
  const s = Math.sin(ry), c = Math.cos(ry);
  const at = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];
  const [fx, fz] = at(0, d / 2);
  g.box(fx, y + 2.4, fz, 6, 4.8, 0.3, P.roofDark, ry);
  const [sx2, sz2] = at(w / 3, d / 2);
  g.box(sx2, y + 1.2, sz2, 1.2, 2.4, 0.25, P.doorDark, ry);
  col.add(x, 0, z, w, h + 2.2, d, ry);
}

function silo(g, col, x, z, seed) {
  const h = 10 + (hash(seed, 1) % 5);
  g.cyl(x, SIDEWALK_H, z, 2.2, 2.2, h, P.offwhite, 10);
  g.cone(x, SIDEWALK_H + h, z, 2.3, 2, P.roofDark, 10);
  col.add(x, 0, z, 4.4, h + 2, 4.4);
}

// Narrow attached European-style rowhouse (old town).
function rowhouse(g, col, x, z, w, floors, seed, ry = 0) {
  const d = 10;
  const body = pick(P.bodies, seed, 4);
  const h = floors * 3;
  const y = SIDEWALK_H;
  g.boxB(x, y, z, w, h, d, body, ry);
  g.boxB(x, y + h, z, w + 0.4, 0.45, d + 0.4, pick([P.roofRed, P.roofDark, P.roofLight], seed, 5), ry);
  const s = Math.sin(ry), c = Math.cos(ry);
  const at = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];
  // front windows + door
  for (let f = 0; f < floors; f++) {
    const wy = y + f * 3 + 1.8;
    for (const off of [-w / 4, w / 4]) {
      if (f === 0 && off > 0) continue; // door replaces one ground window
      const [wx, wz] = at(off, d / 2);
      g.box(wx, wy, wz, 1.2, 1.5, 0.2, P.window, ry);
    }
  }
  const [dxp, dzp] = at(w / 4, d / 2);
  g.box(dxp, y + 1.15, dzp, 1.1, 2.3, 0.22, P.doorDark, ry);
  // back windows
  for (let f = 0; f < floors; f++) {
    const wy = y + f * 3 + 1.8;
    for (const off of [-w / 4, w / 4]) {
      const [wx, wz] = at(off, -d / 2);
      g.box(wx, wy, wz, 1.2, 1.5, 0.2, P.window, ry);
    }
  }
  col.add(x, 0, z, w, h + 0.5, d, ry);
}

// ---- block builders -----------------------------------------------------
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
    g.boxB(cx, SIDEWALK_H, cz, w - INSET * 2, 0.02, d - INSET * 2, groundHex);
  }
  if (grassy) grassMottle(g, cx, cz, w - INSET * 2, d - INSET * 2, groundHex, hole, circle);
  return { x0: b.x0 + INSET, z0: b.z0 + INSET, x1: b.x1 - INSET, z1: b.z1 - INSET, cx, cz };
}

// Interval of `axis` coordinate cut out of a straight path strip by a circle
// (hill base), or null if the strip misses it. `at` is the strip's fixed
// coordinate on the other axis.
function chordGap(c, at, fixedAxis) {
  const dPerp = Math.abs(at - (fixedAxis === 'z' ? c.z : c.x));
  const rr = c.r + 1.5; // half path width margin
  if (dPerp >= rr) return null;
  const half = Math.sqrt(rr * rr - dPerp * dPerp);
  const mid = fixedAxis === 'z' ? c.x : c.z;
  return [mid - half, mid + half];
}

// [lo, hi] minus optional gap interval -> list of remaining spans
function splitSpan(lo, hi, gap) {
  if (!gap || gap[1] <= lo || gap[0] >= hi) return [[lo, hi]];
  const out = [];
  if (gap[0] > lo + 1) out.push([lo, gap[0]]);
  if (gap[1] < hi - 1) out.push([gap[1], hi]);
  return out;
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

// Parked car spots — registered here, spawned as real drivable cars by traffic.
export const PARKED = [];
function parkedCar(g, col, x, z, ry, seed, y = SIDEWALK_H + 0.01, type = null) {
  PARKED.push({ x, z, ry, seed, y, type });
}

// Low concrete planter with a bush.
function planter(g, col, x, z) {
  g.boxB(x, SIDEWALK_H, z, 2.2, 0.55, 2.2, P.concreteDark);
  g.ico(x, SIDEWALK_H + 0.55, z, 1.0, P.leaf2);
  col.add(x, 0, z, 2.2, 1.3, 2.2);
}

// Dumpster with lid.
function dumpster(g, col, x, z, ry, seed) {
  const body = pick([0x3f6e50, 0x54606c, 0x7a4a3c], seed, 1);
  g.boxB(x, SIDEWALK_H, z, 2.6, 1.25, 1.5, body, ry);
  g.box(x, SIDEWALK_H + 1.32, z, 2.7, 0.14, 1.6, P.roofDark, ry);
  col.add(x, 0, z, 2.6, 1.6, 1.6, ry);
}

// Backyard pool: light deck + water.
function pool(g, col, x, z) {
  g.boxB(x, SIDEWALK_H + 0.02, z, 5.4, 0.14, 4.2, P.roofLight);
  g.boxB(x, SIDEWALK_H + 0.14, z, 4.4, 0.06, 3.2, P.water);
}

// Playground swing set.
function swingSet(g, col, x, z, ry) {
  const s = Math.sin(ry), c = Math.cos(ry);
  const at = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];
  for (const side of [-1.6, 1.6]) {
    const [px, pz] = at(side, 0);
    g.box(px, SIDEWALK_H, pz, 0.14, 2.4, 0.14, P.roofRed, ry);
  }
  const [bx, bz] = at(0, 0);
  g.box(bx, SIDEWALK_H + 2.4, bz, 3.5, 0.12, 0.12, P.roofRed, ry);
  for (const off of [-0.7, 0.7]) {
    const [sx, sz] = at(off, 0);
    g.box(sx, SIDEWALK_H + 0.9, sz, 0.5, 0.1, 0.25, 0xf4c542, ry);
    g.box(sx, SIDEWALK_H + 1.0, sz, 0.05, 1.5, 0.05, P.roofDark, ry);
  }
  col.add(x, 0, z, 3.6, 2.6, 1.0, ry);
}

// Flower bed: dirt patch with colored blobs.
function flowerBed(g, col, x, z, seed) {
  g.boxB(x, SIDEWALK_H + 0.02, z, 2.8, 0.12, 1.8, P.trunk);
  for (let i = 0; i < 5; i++) {
    const fx = x - 1.1 + frac(seed, i, 1) * 2.2;
    const fz = z - 0.6 + frac(seed, i, 2) * 1.2;
    g.box(fx, SIDEWALK_H + 0.14, fz, 0.3, 0.3, 0.3, pick([0xe04f43, 0xf4c542, 0xd66bb0, P.white], seed, i));
  }
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

// Parallel parking along the wide avenues (on the asphalt next to the curb).
// Skips spots inside cross-street intersections.
const CROSS = [-500, -380, -260, -140, 140, 260, 380, 500];
const nearCross = (v) => CROSS.some((c) => Math.abs(v - c) < 10);
function curbsideParking() {
  // x = 0 avenue (18 wide): east & west curb lanes hugging the curb at x = ±7.5
  for (const [zA, zB] of [[-460, -170], [170, 460]]) {
    for (let z = zA, k = 0; z <= zB; z += 26, k++) {
      if (hash(3, k, Math.round(zA)) % 3 === 0) continue; // leave gaps
      if (!nearCross(z)) parkedCar(null, null, 7.5, z, 0, hash(41, k, Math.round(zA)), 0.06);
      if (hash(4, k, Math.round(zA)) % 2 === 0 && !nearCross(z + 11))
        parkedCar(null, null, -7.5, z + 11, Math.PI, hash(42, k, Math.round(zA)), 0.06);
    }
  }
  // z = 0 avenue: north & south curb lanes at z = ±7.5
  for (const [xA, xB] of [[-460, -170], [170, 460]]) {
    for (let x = xA, k = 0; x <= xB; x += 26, k++) {
      if (hash(5, k, Math.round(xA)) % 3 === 0) continue;
      if (!nearCross(x)) parkedCar(null, null, x, -7.5, Math.PI / 2, hash(43, k, Math.round(xA)), 0.06);
      if (hash(6, k, Math.round(xA)) % 2 === 0 && !nearCross(x + 11))
        parkedCar(null, null, x + 11, 7.5, -Math.PI / 2, hash(44, k, Math.round(xA)), 0.06);
    }
  }
}

// Small plaza/market kiosk with a striped awning roof.
function kiosk(g, col, x, z, seed, ry = 0) {
  const a = pick(P.awnings, seed, 1);
  g.boxB(x, SIDEWALK_H, z, 2.6, 2.3, 2.6, P.offwhite, ry);
  g.prism(x, SIDEWALK_H + 2.3, z, 3.4, 1.1, 3.4, a, ry);
  const c = Math.cos(ry), s = Math.sin(ry);
  g.box(x + s * 1.35, SIDEWALK_H + 1.35, z + c * 1.35, 1.9, 1.1, 0.15, P.doorDark, ry);
  col.add(x, 0, z, 2.8, 3.4, 2.8, ry);
}

// Perimeter-block apartments: slabs on all four street frontages with a
// green courtyard in the middle (dense, urban).
function buildApartments(g, col, b, seed) {
  const r = slabAndSidewalk(g, col, b, P.grass);
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  const t = 15; // slab thickness
  // N & S slabs (full frontage minus corner gaps)
  apartment(g, col, r.cx, r.z0 + t / 2 + 0.5, w - 2 * t - 6, t, 3 + (hash(seed, 1) % 4), pick(P.bodies, seed, 11), hash(seed, 12));
  apartment(g, col, r.cx, r.z1 - t / 2 - 0.5, w - 2 * t - 6, t, 3 + (hash(seed, 2) % 4), pick(P.bodies, seed, 13), hash(seed, 14));
  // E & W slabs (full depth)
  apartment(g, col, r.x0 + t / 2 + 0.5, r.cz, t, d - 3, 3 + (hash(seed, 3) % 4), pick(P.bodies, seed, 15), hash(seed, 16));
  apartment(g, col, r.x1 - t / 2 - 0.5, r.cz, t, d - 3, 3 + (hash(seed, 4) % 4), pick(P.bodies, seed, 17), hash(seed, 18));
  // courtyard: trees, benches, playground
  tree(g, col, r.cx - w * 0.12, r.cz - d * 0.08, 0.9, hash(seed, 21) % 3);
  tree(g, col, r.cx + w * 0.13, r.cz + d * 0.1, 1.0, hash(seed, 22) % 3);
  bench(g, col, r.cx - 4, r.cz + 5, Math.PI / 2);
  bench(g, col, r.cx + 5, r.cz - 4, 0);
  // playground: slide + sandbox
  const px = r.cx + w * 0.1, pz = r.cz - d * 0.12;
  g.boxB(px, SIDEWALK_H, pz, 5, 0.25, 5, P.path);
  g.boxB(px - 1.2, SIDEWALK_H + 0.25, pz, 1.2, 1.4, 1.2, 0xe04f43);
  g.prism(px + 0.8, SIDEWALK_H + 0.25, pz, 3.0, 1.35, 1.1, 0xf4c542);
  col.add(px, 0, pz, 5, 1.9, 5);
  swingSet(g, col, px - 7, pz + 1, Math.PI / 2);
  hedge(g, col, r.cx - w * 0.18, r.cz + d * 0.16, 7, 1);
  hedge(g, col, r.cx + w * 0.16, r.cz - d * 0.18, 7, 1);
  flowerBed(g, col, r.cx - 2, r.cz - 7, hash(seed, 51));
  flowerBed(g, col, r.cx + 9, r.cz + 8, hash(seed, 52));
  dumpster(g, col, r.x0 + t + 2.5, r.z0 + t + 2.5, 0, hash(seed, 53));
  streetTrees(g, col, b, seed);
  cornerLamps(g, col, b);
}

function buildDowntown(g, col, b, seed) {
  const r = slabAndSidewalk(g, col, b, P.concrete);
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  if (hash(seed, 1) % 3 === 0) {
    // one landmark tower + three mid-rises
    tower(g, col, r.cx - w * 0.22, r.cz - d * 0.22, w * 0.42, d * 0.42, 13 + (hash(seed, 2) % 9), hash(seed, 2));
    tower(g, col, r.x1 - w * 0.2, r.z0 + d * 0.2, w * 0.32, d * 0.32, 6 + (hash(seed, 3) % 4), hash(seed, 3));
    tower(g, col, r.x1 - w * 0.2, r.z1 - d * 0.2, w * 0.32, d * 0.32, 5 + (hash(seed, 4) % 4), hash(seed, 4));
    apartment(g, col, r.x0 + w * 0.2, r.z1 - d * 0.16, w * 0.34, d * 0.24, 4, pick(P.bodies, seed, 5), hash(seed, 5));
  } else {
    // 2x2 tower cluster
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const f = 6 + (hash(seed, i * 2 + j, 6) % 10);
        tower(g, col, r.x0 + w * (0.25 + i * 0.5), r.z0 + d * (0.25 + j * 0.5), w * 0.38, d * 0.38, f, hash(seed, i, j + 7));
      }
    }
  }
  hedge(g, col, r.cx, r.z1 - 3.2, 6, 1);
  bench(g, col, r.cx + 6, r.z1 - 3.4, 0);
  bench(g, col, r.x0 + 3.4, r.cz, Math.PI / 2);
  // fill the central cross band between the towers with plaza furniture
  planter(g, col, r.cx - w * 0.05, r.cz);
  planter(g, col, r.cx + w * 0.05, r.cz);
  planter(g, col, r.cx, r.cz - d * 0.05);
  planter(g, col, r.cx, r.cz + d * 0.05);
  kiosk(g, col, r.cx - w * 0.05, r.cz - d * 0.18, hash(seed, 61), 0);
  bench(g, col, r.cx + w * 0.05, r.cz + d * 0.18, Math.PI / 2);
  flowerBed(g, col, r.cx - w * 0.16, r.cz + 2, hash(seed, 62));
  flowerBed(g, col, r.cx + w * 0.16, r.cz - 2, hash(seed, 63));
  dumpster(g, col, r.x0 + 3.2, r.z0 + 3.2, Math.PI / 2, hash(seed, 64));
  streetTrees(g, col, b, seed);
  cornerLamps(g, col, b);
}

function buildOldtown(g, col, b, seed) {
  const r = slabAndSidewalk(g, col, b, P.concrete);
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  // rowhouses on ALL four frontages
  let k = 0;
  let x = r.x0 + 7;
  while (x < r.x1 - 7) {
    const bw = 8 + (hash(seed, k, 1) % 4);
    if (x + bw > r.x1 - 5) break;
    rowhouse(g, col, x + bw / 2, r.z0 + 5.5, bw, 2 + (hash(seed, k, 2) % 2), hash(seed, k, 3), Math.PI);
    rowhouse(g, col, x + bw / 2, r.z1 - 5.5, bw, 2 + (hash(seed, k, 4) % 2), hash(seed, k, 5), 0);
    x += bw + 1.2;
    k++;
  }
  let z = r.z0 + 15;
  while (z < r.z1 - 15) {
    const bw = 8 + (hash(seed, k, 6) % 4);
    if (z + bw > r.z1 - 13) break;
    rowhouse(g, col, r.x0 + 5.5, z + bw / 2, bw, 2 + (hash(seed, k, 7) % 2), hash(seed, k, 8), -Math.PI / 2);
    rowhouse(g, col, r.x1 - 5.5, z + bw / 2, bw, 2 + (hash(seed, k, 9) % 2), hash(seed, k, 10), Math.PI / 2);
    z += bw + 1.2;
    k++;
  }
  // inner courtyard green with market kiosks
  g.boxB(r.cx, SIDEWALK_H + 0.02, r.cz, w * 0.42, 0.02, d * 0.32, P.grass);
  tree(g, col, r.cx - 5, r.cz, 0.9, 0);
  tree(g, col, r.cx + 6, r.cz + 3, 0.8, 2);
  kiosk(g, col, r.cx + 8, r.cz - 6, hash(seed, 31), 0);
  kiosk(g, col, r.cx - 9, r.cz + 6, hash(seed, 32), Math.PI);
  bench(g, col, r.cx, r.cz - 4, 0);
  bench(g, col, r.cx - 8, r.cz + 5, Math.PI);
  flowerBed(g, col, r.cx + 2, r.cz + 5, hash(seed, 33));
  flowerBed(g, col, r.cx - 6, r.cz - 5, hash(seed, 34));
  tree(g, col, r.cx + 12, r.cz + 6, 0.7, 1);
  cornerLamps(g, col, b);
}

function buildShopsRow(g, col, r, seed) {
  let x = r.x0 + 7;
  let k = 0;
  while (x < r.x1 - 7) {
    const bw = 9 + (hash(seed, k, 21) % 4);
    if (x + bw > r.x1 - 5) break;
    shop(g, col, x + bw / 2, r.z1 - 6, bw, 9, hash(seed, k, 22), 0);
    x += bw + 1.5;
    k++;
  }
}

function buildMidrise(g, col, b, seed) {
  const r = slabAndSidewalk(g, col, b, P.concrete);
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  // two apartment slabs at the back
  const bw = w * 0.42, bd = d * 0.3;
  for (let i = 0; i < 2; i++) {
    const x = r.x0 + w * (0.25 + i * 0.5);
    const floors = 3 + (hash(seed, i, 31) % 3);
    apartment(g, col, x, r.z0 + d * 0.18, bw, bd, floors, pick(P.bodies, seed, i + 40), hash(seed, i, 32));
  }
  // middle band: one more slab + parking with parked cars
  apartment(g, col, r.x0 + w * 0.26, r.cz + d * 0.05, w * 0.44, d * 0.24, 3 + (hash(seed, 33) % 3), pick(P.bodies, seed, 44), hash(seed, 34));
  const lotX = r.x1 - w * 0.24, lotZ = r.cz + d * 0.05;
  g.boxB(lotX, SIDEWALK_H + 0.01, lotZ, w * 0.4, 0.02, d * 0.22, P.concreteDark);
  for (let i = 0; i < 5; i++) {
    parkedCar(g, col, lotX - w * 0.13 + (i % 3) * w * 0.13, lotZ + (i < 3 ? 0 : -d * 0.08), i < 3 ? 0 : Math.PI, hash(seed, i, 35));
  }
  dumpster(g, col, lotX + w * 0.16, lotZ + d * 0.08, Math.PI / 2, hash(seed, 36));
  dumpster(g, col, r.x0 + 3, r.cz + d * 0.18, 0, hash(seed, 37));
  planter(g, col, r.cx - w * 0.05, r.z0 + d * 0.36);
  planter(g, col, r.cx + w * 0.08, r.z0 + d * 0.36);
  flowerBed(g, col, r.cx, r.cz + d * 0.2, hash(seed, 38));
  // shops along the south frontage
  buildShopsRow(g, col, r, seed);
  g.boxB(r.cx, SIDEWALK_H + 0.02, r.z0 + d * 0.36, w * 0.7, 0.02, d * 0.1, P.grass);
  tree(g, col, r.cx - w * 0.2, r.z0 + d * 0.36, 0.8, 1);
  tree(g, col, r.cx + w * 0.22, r.z0 + d * 0.37, 0.9, 0);
  streetTrees(g, col, b, seed);
  cornerLamps(g, col, b);
}

function buildMixed(g, col, b, seed) {
  if (hash(seed, 1) % 2) buildMidrise(g, col, b, hash(seed, 2));
  else buildApartments(g, col, b, hash(seed, 3));
}

function buildSuburb(g, col, b, seed) {
  const r = slabAndSidewalk(g, col, b, P.grass);
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  const lotsX = 4, lotsZ = 2;
  for (let i = 0; i < lotsX; i++) {
    for (let j = 0; j < lotsZ; j++) {
      const lx = r.x0 + (w / lotsX) * (i + 0.5);
      const lz = r.z0 + (d / lotsZ) * (j + 0.5);
      const facing = j === 0 ? Math.PI : 0; // face outward street
      const off = j === 0 ? -d * 0.1 : d * 0.1;
      house(g, col, lx, lz + off, hash(seed, i, j), facing);
      // driveway
      const dwx = lx + (w / lotsX) * 0.3;
      const dwz0 = j === 0 ? r.z0 : lz + off;
      const dwz1 = j === 0 ? lz + off : r.z1;
      g.boxB(dwx, SIDEWALK_H + 0.01, (dwz0 + dwz1) / 2, 3, 0.02, dwz1 - dwz0, P.concreteDark);
      if (hash(seed, i, j + 17) % 2) parkedCar(g, col, dwx, lz + off * 2.2, 0, hash(seed, i, j + 18));
      // yard tree + shed
      tree(g, col, lx - (w / lotsX) * 0.28, lz - off, 0.7 + frac(seed, i, j) * 0.4, hash(seed, i, j + 9) % 3);
      if (hash(seed, i, j + 19) % 3 === 0) {
        const shx = lx - (w / lotsX) * 0.3, shz = lz + off * 0.3;
        g.boxB(shx, SIDEWALK_H, shz, 2.6, 2.1, 2.2, P.trunk);
        g.prism(shx, SIDEWALK_H + 2.1, shz, 3.0, 1.0, 2.6, P.roofDark);
        col.add(shx, 0, shz, 2.6, 3.1, 2.2);
      }
      // backyard extras: pool, swing set, flower bed (deterministic per lot)
      const byz = lz - off * 2.2; // behind the house
      if (hash(seed, i, j + 23) % 4 === 0) pool(g, col, lx + (w / lotsX) * 0.18, byz);
      else if (hash(seed, i, j + 24) % 3 === 0) swingSet(g, col, lx + (w / lotsX) * 0.15, byz, hash(seed, i, j + 25) % 2 ? 0 : Math.PI / 2);
      if (hash(seed, i, j + 26) % 2 === 0) flowerBed(g, col, lx - (w / lotsX) * 0.1, lz + off * 1.9, hash(seed, i, j + 27));
      if (hash(seed, i, j + 28) % 3 === 0) g.ico(lx + (w / lotsX) * 0.3, SIDEWALK_H + 0.4, lz - off * 0.5, 0.8, P.leaf3);
    }
  }
  // white picket fences between lots and along street edges (with gate gaps)
  for (let i = 1; i < lotsX; i++) {
    const fx = r.x0 + (w / lotsX) * i;
    fenceRun(g, col, fx, r.z0 + 1, fx, r.z1 - 1);
  }
  fenceRun(g, col, r.x0 + 1, r.z0 + 1, r.x0 + 1, r.z1 - 1);
  fenceRun(g, col, r.x1 - 1, r.z0 + 1, r.x1 - 1, r.z1 - 1);
  for (let i = 0; i < lotsX; i++) {
    const lx0 = r.x0 + (w / lotsX) * i, lx1 = r.x0 + (w / lotsX) * (i + 1);
    for (const fz of [r.z0 + 1, r.z1 - 1]) {
      fenceRun(g, col, lx0 + 0.5, fz, (lx0 + lx1) / 2 - 1.5, fz);
      fenceRun(g, col, (lx0 + lx1) / 2 + 1.5, fz, lx1 - 0.5, fz);
    }
  }
}

function buildIndustrial(g, col, b, seed, big = false) {
  const r = slabAndSidewalk(g, col, b, P.concreteDark);
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  const crates = (n, x0, z0, spanX, spanZ) => {
    for (let k = 0; k < n; k++) {
      const cx = x0 + frac(seed, k, 61) * spanX;
      const cz = z0 + frac(seed, k, 62) * spanZ;
      g.boxB(cx, SIDEWALK_H, cz, 2.2, 2.2, 2.2, pick([P.trunk, P.concreteDark, P.roofRed, 0x4a6b8a], seed, k));
      if (hash(seed, k, 63) % 3 === 0) g.boxB(cx, SIDEWALK_H + 2.2, cz, 2.0, 2.0, 2.0, pick([P.trunk, P.roofRed], seed, k + 9));
      col.add(cx, 0, cz, 2.2, 4.4, 2.2);
    }
  };
  if (big) {
    warehouse(g, col, r.x0 + w * 0.18, r.cz - d * 0.24, w * 0.28, d * 0.34, hash(seed, 1), 0);
    warehouse(g, col, r.x0 + w * 0.52, r.cz - d * 0.24, w * 0.28, d * 0.34, hash(seed, 2), 0);
    warehouse(g, col, r.x0 + w * 0.3, r.cz + d * 0.22, w * 0.42, d * 0.3, hash(seed, 6), 0);
    silo(g, col, r.x1 - 8, r.z0 + 10, hash(seed, 3));
    silo(g, col, r.x1 - 8, r.z0 + 18, hash(seed, 4));
    silo(g, col, r.x1 - 15, r.z0 + 10, hash(seed, 5));
    silo(g, col, r.x1 - 15, r.z0 + 18, hash(seed, 7));
    // smokestack
    g.cyl(r.x1 - 24, SIDEWALK_H, r.z0 + 14, 1.2, 1.6, 22, P.roofRed);
    col.add(r.x1 - 24, 0, r.z0 + 14, 3.2, 22, 3.2);
    crates(16, r.x1 - w * 0.32, r.cz + d * 0.1, w * 0.26, d * 0.32);
    tank(g, col, r.x1 - 10, r.cz - d * 0.1, 0, hash(seed, 71));
    tank(g, col, r.x1 - 10, r.cz - d * 0.02, 0, hash(seed, 72));
    parkedCar(g, col, r.x0 + w * 0.18, r.cz, Math.PI / 2, hash(seed, 73), SIDEWALK_H + 0.01, 'truck');
    parkedCar(g, col, r.x0 + w * 0.52, r.cz, Math.PI / 2, hash(seed, 74), SIDEWALK_H + 0.01, 'truck');
    dumpster(g, col, r.x0 + w * 0.35, r.cz - d * 0.02, 0, hash(seed, 75));
  } else {
    warehouse(g, col, r.cx - w * 0.2, r.cz - d * 0.2, w * 0.44, d * 0.42, hash(seed, 1), 0);
    warehouse(g, col, r.cx - w * 0.18, r.cz + d * 0.24, w * 0.4, d * 0.3, hash(seed, 8), 0);
    silo(g, col, r.x1 - 7, r.z0 + 8, hash(seed, 2));
    silo(g, col, r.x1 - 7, r.z0 + 15, hash(seed, 3));
    silo(g, col, r.x1 - 14, r.z0 + 8, hash(seed, 9));
    crates(10, r.x1 - w * 0.3, r.cz + d * 0.08, w * 0.22, d * 0.3);
    tank(g, col, r.x1 - 9, r.cz - d * 0.05, Math.PI / 2, hash(seed, 76));
    parkedCar(g, col, r.cx + w * 0.15, r.cz + d * 0.02, 0, hash(seed, 77), SIDEWALK_H + 0.01, 'truck');
    dumpster(g, col, r.cx - w * 0.42, r.cz, Math.PI / 2, hash(seed, 78));
  }
}

function buildPark(g, col, b, seed, central = false, scene = null) {
  // central park pond: a real knee-deep depression carved out of the slab
  let pond = null, hole = null;
  if (central) {
    // pond geometry is owned by island.js (POND) so the plateau fan under
    // the bowl is carved at island build time; keep everything in sync
    pond = { x: POND.x, z: POND.z, rad: POND.a1 };
    const a0 = POND.a0;
    hole = { x0: pond.x - a0, x1: pond.x + a0, z0: pond.z - a0, z1: pond.z + a0 };
  }
  const r = slabAndSidewalk(g, col, b, P.grass, hole, central ? HILL : null);
  const w = r.x1 - r.x0, d = r.z1 - r.z0;

  // paths: cross through middle (clipped around the hill in central park)
  const hillGapX = central ? chordGap(HILL, r.cz, 'z') : null;
  const hillGapZ = central ? chordGap(HILL, r.cx, 'x') : null;
  for (const [lo, hi] of splitSpan(r.x0, r.x1, hillGapX)) {
    g.boxB((lo + hi) / 2, SIDEWALK_H + 0.02, r.cz, hi - lo, 0.02, 3, P.path);
  }
  for (const [lo, hi] of splitSpan(r.z0, r.z1, hillGapZ)) {
    g.boxB(r.cx, SIDEWALK_H + 0.02, (lo + hi) / 2, 3, 0.02, hi - lo, P.path);
  }

  if (central) {
    // diagonal boulevard — split around the pond bowl and the hill base
    const len = Math.hypot(w, d) * 0.92;
    const ang = Math.atan2(-d, w);
    const ux = Math.cos(ang), uz = -Math.sin(ang);
    const H2 = len / 2;
    const tx = [(hole.x0 - r.cx) / ux, (hole.x1 - r.cx) / ux];
    const tz = [(hole.z0 - r.cz) / uz, (hole.z1 - r.cz) / uz];
    const lo = Math.max(Math.min(...tx), Math.min(...tz));
    const hi = Math.min(Math.max(...tx), Math.max(...tz));
    let spans = lo < hi && hi > -H2 && lo < H2
      ? [[-H2, Math.max(lo - 3, -H2)], [Math.min(hi + 3, H2), H2]]
      : [[-H2, H2]];
    // hill cut: |P + u*s - C| < HILL.r + 4  (path half width 3 + margin)
    {
      const px = r.cx - HILL.x, pz = r.cz - HILL.z;
      const bq = px * ux + pz * uz;
      const cq = px * px + pz * pz - (HILL.r + 4) * (HILL.r + 4);
      const disc = bq * bq - cq;
      if (disc > 0) {
        const s0 = -bq - Math.sqrt(disc), s1 = -bq + Math.sqrt(disc);
        spans = spans.flatMap(([a, bnd]) => splitSpan(a, bnd, [s0, s1]));
      }
    }
    for (const [s0, s1] of spans) {
      if (s1 - s0 < 2) continue;
      const mid = (s0 + s1) / 2;
      g.boxB(r.cx + ux * mid, SIDEWALK_H + 0.03, r.cz + uz * mid, s1 - s0, 0.02, 6, P.path, ang);
    }
    // pond bowl: sandy shore terrace (-0.03) then floor (-0.25), each drop
    // within step-up range so wading in and out never needs a jump
    const a0 = pond.rad + 4, a1 = pond.rad;
    const SHORE = 0xd7c99c, BED = 0xc2b183;
    const ring = (outer, inner, top, hex, collide = true) => {
      const bands = [
        [pond.x, pond.z - (outer + inner) / 2, outer * 2, outer - inner],
        [pond.x, pond.z + (outer + inner) / 2, outer * 2, outer - inner],
        [pond.x - (outer + inner) / 2, pond.z, outer - inner, inner * 2],
        [pond.x + (outer + inner) / 2, pond.z, outer - inner, inner * 2],
      ];
      for (const [bx, bz, bw, bd] of bands) {
        g.boxB(bx, top - 0.6, bz, bw, 0.6, bd, hex);
        if (collide) col.add(bx, top - 0.6, bz, bw, 0.6, bd);
      }
    };
    ring(a0, a1, -0.03, SHORE);
    g.boxB(pond.x, -0.85, pond.z, a1 * 2, 0.6, a1 * 2, BED);
    col.add(pond.x, -0.85, pond.z, a1 * 2, 0.6, a1 * 2);
    // path ring around the rim (visual only — it lies on the lawn collider,
    // and its extra 0.04 height would break step-up out of the bowl)
    ring(a0 + 2.2, a0, SIDEWALK_H + 0.04, P.path, false);
    // transparent water (own mesh — the batch material is opaque)
    if (scene) {
      const aw = a1 + 1.0; // leave a 3m dry sand rim around the water
      const water = new THREE.Mesh(
        new THREE.BoxGeometry(aw * 2, 0.3, aw * 2),
        new THREE.MeshLambertMaterial({
          color: 0x4fb7e8, transparent: true, opacity: 0.55, depthWrite: false,
        })
      );
      water.position.set(pond.x, -0.05, pond.z);
      scene.add(water);
    }
    fountain(g, col, r.cx - w * 0.25, r.cz + d * 0.25);
    // lamps along the diagonal (skip any standing on the hill)
    for (let t = -0.4; t <= 0.4; t += 0.2) {
      const lx = r.cx + Math.cos(ang) * len * t, lz = r.cz + Math.sin(ang) * len * t + 4.5;
      if (Math.hypot(lx - HILL.x, lz - HILL.z) < HILL.r + 2) continue;
      lamp(g, col, lx, lz);
    }
  } else {
    fountain(g, col, r.cx, r.cz);
  }

  // deterministic tree scatter — the central park is a dense forest.
  // Nested hash decorrelates x from z (plain frac(seed,k,1)/frac(seed,k,2)
  // pairs are correlated and collapse the scatter onto diagonal lines).
  const n = central ? 140 : 26;
  for (let k = 0; k < n; k++) {
    const tx = r.x0 + 4 + frac(hash(seed, k, 1), 5) * (w - 8);
    const tz = r.z0 + 4 + frac(hash(seed, k, 2), 9) * (d - 8);
    // keep off paths and pond
    if (Math.abs(tx - r.cx) < 3.5 || Math.abs(tz - r.cz) < 3.5) continue;
    if (pond && Math.max(Math.abs(tx - pond.x), Math.abs(tz - pond.z)) < pond.rad + 7) continue;
    if (central && Math.hypot(tx - HILL.x, tz - HILL.z) < HILL.r + 2) continue;
    if (central) {
      // keep off the diagonal
      const ang = Math.atan2(-d, w);
      const dxp = tx - r.cx, dzp = tz - r.cz;
      const perp = Math.abs(-Math.sin(ang) * dxp + Math.cos(ang) * dzp);
      if (perp < 5) continue;
    }
    tree(g, col, tx, tz, 0.8 + frac(seed, k, 3) * 0.7, hash(seed, k, 4) % 3);
  }
  // benches along paths (skip anything standing on the central hill)
  const offHill = central
    ? (x, z) => Math.hypot(x - HILL.x, z - HILL.z) > HILL.r + 2
    : () => true;
  const benchH = (x, z, ry) => { if (offHill(x, z)) bench(g, col, x, z, ry); };
  const lampH = (x, z) => { if (offHill(x, z)) lamp(g, col, x, z); };
  const bedH = (x, z, s) => { if (offHill(x, z)) flowerBed(g, col, x, z, s); };
  benchH(r.cx - 6, r.cz + 2.4, 0);
  benchH(r.cx + 8, r.cz - 2.4, Math.PI);
  benchH(r.cx + 2.4, r.cz + 9, Math.PI / 2);
  benchH(r.cx - 2.4, r.cz - 10, -Math.PI / 2);
  bedH(r.cx + 4, r.cz + 4, hash(seed, 81));
  bedH(r.cx - 5, r.cz - 4, hash(seed, 82));
  if (central) {
    // undergrowth: bush scatter with the same keep-off-path rules
    const ang = Math.atan2(-d, w);
    for (let k = 0; k < 34; k++) {
      const bx = r.x0 + 5 + frac(hash(seed, k, 11), 5) * (w - 10);
      const bz = r.z0 + 5 + frac(hash(seed, k, 12), 9) * (d - 10);
      if (Math.abs(bx - r.cx) < 3.5 || Math.abs(bz - r.cz) < 3.5) continue;
      if (pond && Math.max(Math.abs(bx - pond.x), Math.abs(bz - pond.z)) < pond.rad + 7) continue;
      if (Math.hypot(bx - HILL.x, bz - HILL.z) < HILL.r + 2) continue;
      const perp = Math.abs(-Math.sin(ang) * (bx - r.cx) + Math.cos(ang) * (bz - r.cz));
      if (perp < 5) continue;
      const leafs = [P.leaf1, P.leaf2, P.leaf3];
      g.ico(bx, SIDEWALK_H + 0.32, bz, 0.5 + frac(seed, k, 13) * 0.5, leafs[hash(seed, k, 14) % 3]);
    }
    // benches, beds and lamps along the main cross paths
    for (let k = 0; k < 4; k++) {
      const off = -w * 0.38 + k * ((w * 0.76) / 3);
      benchH(r.cx + off, r.cz + 2.5, 0);
      benchH(r.cx + off + 9, r.cz - 2.5, Math.PI);
    }
    for (let k = 0; k < 3; k++) {
      const off = -d * 0.34 + k * ((d * 0.68) / 2);
      benchH(r.cx + 2.5, r.cz + off, Math.PI / 2);
      bedH(r.cx - 3.6, r.cz + off + 8, hash(seed, k, 15));
    }
    lampH(r.cx - w * 0.25, r.cz + 2.7);
    lampH(r.cx + w * 0.25, r.cz - 2.7);
    lampH(r.cx + 2.7, r.cz - d * 0.25);
    lampH(r.cx - 2.7, r.cz + d * 0.25);
  }
  if (!central) {
    swingSet(g, col, r.cx + w * 0.22, r.cz - d * 0.22, 0);
    hedge(g, col, r.cx - w * 0.2, r.cz + d * 0.22, 8, 1);
    g.ico(r.cx + w * 0.25, SIDEWALK_H + 0.4, r.cz + d * 0.25, 0.9, P.leaf2);
    g.ico(r.cx - w * 0.28, SIDEWALK_H + 0.4, r.cz - d * 0.2, 0.8, P.leaf3);
  }
  cornerLamps(g, col, b);
}

function buildPlaza(g, col, b, seed) {
  const r = slabAndSidewalk(g, col, b, P.concrete);
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  fountain(g, col, r.cx, r.cz);
  // flag pole
  g.cyl(r.cx + 12, SIDEWALK_H, r.cz, 0.1, 0.14, 9, P.white, 6);
  g.box(r.cx + 13.2, SIDEWALK_H + 8.2, r.cz, 2.2, 1.3, 0.08, 0xe04f43);
  col.add(r.cx + 12, 0, r.cz, 0.4, 9, 0.4);
  // tree planters at corners
  for (const [ix, iz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const px = r.cx + ix * w * 0.32, pz = r.cz + iz * d * 0.32;
    g.boxB(px, SIDEWALK_H, pz, 3, 0.6, 3, P.concreteDark);
    col.add(px, 0, pz, 3, 0.8, 3);
    tree(g, col, px, pz, 0.9, 0);
  }
  bench(g, col, r.cx - 7, r.cz - 7, Math.PI / 4);
  bench(g, col, r.cx + 7, r.cz + 7, Math.PI + Math.PI / 4);
  bench(g, col, r.cx - 7, r.cz + 7, -Math.PI / 4);
  bench(g, col, r.cx + 7, r.cz - 7, Math.PI * 0.75);
  // market kiosks along the north edge
  kiosk(g, col, r.cx - 14, r.z0 + 6, 11, 0);
  kiosk(g, col, r.cx - 7, r.z0 + 6, 12, 0);
  kiosk(g, col, r.cx, r.z0 + 6, 13, 0);
  hedge(g, col, r.cx + 12, r.z0 + 6, 8, 1.2);
  streetTrees(g, col, b, 77);
  cornerLamps(g, col, b);
}

function buildCityHall(g, col, b) {
  const r = slabAndSidewalk(g, col, b, P.concrete);
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  const bw = w * 0.6, bd = d * 0.42, h = 12;
  const x = r.cx, z = r.cz - d * 0.05;
  const y = SIDEWALK_H;
  g.boxB(x, y, z, bw, h, bd, P.offwhite);
  g.boxB(x, y + h, z, bw + 1, 0.8, bd + 1, P.roofLight);
  // pediment + columns on the front (facing -z, toward plaza? place facing west toward plaza: front faces -x)
  const fx = x - bw / 2;
  g.prism(x, y + h + 0.8, z, bd + 1, 2.6, bw + 1, P.roofLight, Math.PI / 2);
  for (let i = 0; i < 6; i++) {
    const cz2 = z - bd / 2 + 2.5 + i * ((bd - 5) / 5);
    g.cyl(fx - 2.2, y, cz2, 0.55, 0.65, h - 1, P.white, 8);
  }
  g.boxB(x - bw / 2 - 2.2, y + h - 1, z, 2.2, 1, bd + 0.5, P.white);
  // steps
  g.boxB(fx - 3.6, 0, z, 3, SIDEWALK_H + 0.35, 14, P.concrete);
  g.boxB(fx - 5.4, 0, z, 2.4, SIDEWALK_H + 0.15, 16, P.concrete);
  col.add(fx - 3.6, 0, z, 3, SIDEWALK_H + 0.35, 14);
  col.add(fx - 5.4, 0, z, 2.4, SIDEWALK_H + 0.15, 16);
  // door + windows
  g.box(fx + 0.05, y + 2, z, 0.3, 4, 3.2, P.doorDark);
  windowsWall(g, x, z, y + 1, 2, 4.5, bd, 'x', -bw / 2, 4, P.glassDark);
  windowsWall(g, x, z, y + 1, 2, 4.5, bd, 'x', bw / 2, 4, P.glassDark);
  windowsWall(g, x, z, y + 1, 2, 4.5, bw, 'z', bd / 2, 4, P.glassDark);
  windowsWall(g, x, z, y + 1, 2, 4.5, bw, 'z', -bd / 2, 4, P.glassDark);
  col.add(x, 0, z, bw, h + 3, bd);
  // lawn + trees behind
  const lawnW = Math.max(0, r.x1 - (x + bw / 2) - 2);
  g.boxB((x + bw / 2 + r.x1) / 2, SIDEWALK_H + 0.02, z, lawnW, 0.02, bd, P.grass);
  tree(g, col, r.x1 - 5, r.z0 + 8, 0.9, 0);
  tree(g, col, r.x1 - 5, r.z1 - 8, 0.9, 0);
  streetTrees(g, col, b, 88);
  cornerLamps(g, col, b);
}

function buildFireStation(g, col, b) {
  const r = slabAndSidewalk(g, col, b, P.concrete);
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  const bw = w * 0.55, bd = d * 0.5, h = 9;
  const x = r.x0 + bw / 2 + 4, z = r.cz;
  const y = SIDEWALK_H;
  const RED = 0xe04f43;
  g.boxB(x, y, z, bw, h, bd, RED);
  g.boxB(x, y + h, z, bw + 0.5, 0.5, bd + 0.5, P.roofLight);
  // helipad on roof
  g.cyl(x, y + h + 0.5, z, 6, 6, 0.25, P.concreteDark, 12);
  g.cyl(x, y + h + 0.75, z, 3.4, 3.4, 0.06, P.white, 12);
  g.cyl(x, y + h + 0.81, z, 2.6, 2.6, 0.06, P.concreteDark, 12);
  // three white garage doors on the front (facing +x toward plaza side)
  for (let i = -1; i <= 1; i++) {
    g.box(x + bw / 2 + 0.05, y + 2.2, z + i * (bd / 3.4), 0.3, 4.4, bd / 4.2, P.white);
  }
  // white band + sign block
  g.box(x + bw / 2 + 0.08, y + 5.6, z, 0.16, 1.0, bd * 0.8, P.white);
  // training tower (southwest yard, inside the fence line)
  const twx = x - bw / 2 + 1, twz = z - bd / 2 - 5;
  g.boxB(twx, y, twz, 6, 13, 6, P.concreteDark);
  col.add(twx, 0, twz, 6, 13, 6);
  // yard fence around block with a wide gate gap on the east
  fenceRun(g, col, r.x0 + 1, r.z0 + 1, r.x1 - 1, r.z0 + 1);
  fenceRun(g, col, r.x0 + 1, r.z1 - 1, r.x1 - 1, r.z1 - 1);
  fenceRun(g, col, r.x0 + 1, r.z0 + 1, r.x0 + 1, r.z1 - 1);
  fenceRun(g, col, r.x1 - 1, r.z0 + 1, r.x1 - 1, r.cz - 8);
  fenceRun(g, col, r.x1 - 1, r.cz + 8, r.x1 - 1, r.z1 - 1);
  col.add(x, 0, z, bw, h + 1, bd);
  // parked fire truck (static)
  const tx = x + bw / 2 + 8, tz = z - bd / 3;
  g.boxB(tx, SIDEWALK_H + 0.5, tz, 6, 1.8, 2.3, RED);
  g.boxB(tx + 1.8, SIDEWALK_H + 2.3, tz, 2, 1.2, 2.1, P.white);
  g.boxB(tx - 1, SIDEWALK_H + 2.3, tz, 3.4, 0.4, 1.6, P.roofLight);
  col.add(tx, 0, tz, 6, 3.5, 2.3);
  cornerLamps(g, col, b);
}

function buildChurch(g, col, b) {
  const r = slabAndSidewalk(g, col, b, P.grass);
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  const x = r.cx, z = r.cz;
  const y = SIDEWALK_H;
  // nave
  g.boxB(x, y, z, 12, 7, 24, P.offwhite);
  g.prism(x, y + 7, z, 25, 4.5, 13, P.roofRed, Math.PI / 2);
  col.add(x, 0, z, 12, 11, 24);
  // steeple
  const sz = z - 12 - 7;
  g.boxB(x, y, sz, 6, 16, 6, P.offwhite);
  g.cone(x, y + 16, sz, 4.4, 7, P.roofRed, 4);
  g.box(x, y + 24.4, sz, 0.3, 2.4, 0.3, P.offwhite);
  g.box(x, y + 24.8, sz, 1.3, 0.3, 0.3, P.offwhite);
  col.add(x, 0, sz, 6, 16, 6);
  // door + windows
  g.box(x, y + 1.6, sz + 3.05, 2, 3.2, 0.2, P.doorDark);
  for (const wx of [-6.05, 6.05]) {
    for (let i = 0; i < 4; i++) {
      g.box(x + wx, y + 3.6, z - 9 + i * 6, 0.2, 2.6, 1.2, P.glass);
    }
  }
  // churchyard trees + path
  g.boxB(x, SIDEWALK_H + 0.02, (r.z0 + sz) / 2, 3, 0.02, sz - r.z0, P.path);
  tree(g, col, r.x0 + 6, r.z1 - 8, 1.0, 1);
  tree(g, col, r.x1 - 6, r.z1 - 8, 1.1, 1);
  tree(g, col, r.x1 - 6, r.z0 + 8, 0.9, 0);
  bench(g, col, x + 6, sz + 6, Math.PI / 2);
  cornerLamps(g, col, b);
}

// ---- roads --------------------------------------------------------------
// Raised sidewalk strip alongside a road (axis 'x': runs along z at x = at).
function walkStrip(g, col, axis, at, from, to) {
  const lo = Math.min(from, to), hi = Math.max(from, to);
  if (hi - lo < 0.6) return;
  const mid = (lo + hi) / 2, len = hi - lo;
  if (axis === 'x') {
    g.boxB(at, 0, mid, 3, SIDEWALK_H, len, P.sidewalk);
    col.add(at, 0, mid, 3, SIDEWALK_H, len);
  } else {
    g.boxB(mid, 0, at, len, SIDEWALK_H, 3, P.sidewalk);
    col.add(mid, 0, at, len, SIDEWALK_H, 3);
  }
}

// Sidewalks along road edges facing the bay mouths — those cells have no
// block, so the flanking roads were missing a sidewalk on that side.
function buildBayWalks(g, col) {
  const segs = new Set(buildRoads().map((s) => s.axis + ':' + s.at + ':' + s.from));
  const has = (axis, at, from) => segs.has(axis + ':' + at + ':' + from);
  for (const key of REMOVED_CELLS) {
    const [i, j] = key.split(',').map(Number);
    const cx = [GRID[i], GRID[i + 1]], cz = [GRID[j], GRID[j + 1]];
    for (const e of [
      { axis: 'x', at: cx[0], dir: 1, lo: cz[0], hi: cz[1], perpFrom: cx[0] },
      { axis: 'x', at: cx[1], dir: -1, lo: cz[0], hi: cz[1], perpFrom: cx[0] },
      { axis: 'z', at: cz[0], dir: 1, lo: cx[0], hi: cx[1], perpFrom: cz[0] },
      { axis: 'z', at: cz[1], dir: -1, lo: cx[0], hi: cx[1], perpFrom: cz[0] },
    ]) {
      if (Math.abs(e.at) === 640 || !has(e.axis, e.at, e.lo)) continue;
      const c = e.at + e.dir * (roadWidth(e.at) / 2 + 1.5);
      const perp = e.axis === 'x' ? 'z' : 'x';
      // 'z' strips are inset past the 'x' strips at shared corners; strips
      // butt at the cell line when the perpendicular road was deleted
      const end = (v, sgn) => {
        if (Math.abs(v) === 640) return Math.sign(v) * 633; // meet the extension strips
        if (!has(perp, v, e.perpFrom)) return v;
        return v + sgn * (roadWidth(v) / 2 + (e.axis === 'z' ? 3 : 0));
      };
      walkStrip(g, col, e.axis, c, end(e.lo, 1), end(e.hi, -1));
    }
  }
}

function buildRoadGeometry(g, col) {
  for (const s of buildRoads()) {
    const len = s.to - s.from;
    const mid = (s.from + s.to) / 2;
    if (s.axis === 'x') {
      g.boxB(s.at, 0, mid, s.width, 0.04, len, P.road);
    } else {
      g.boxB(mid, 0, s.at, len, 0.05, s.width, P.road);
    }
    // center dashes (kept clear of the crosswalk bands at both ends)
    const n = Math.floor((len - 26) / 7);
    for (let i = 0; i < n; i++) {
      const p = s.from + 13 + i * 7 + 3.5;
      if (s.axis === 'x') g.boxB(s.at, 0.05, p, 0.35, 0.02, 2.4, P.dash);
      else g.boxB(p, 0.05, s.at, 2.4, 0.02, 0.35, P.dash);
    }
  }

  // grid streets extended outward from the old ±640 ring line to tee into
  // the coastal parkway (geometry solved in parkway.js)
  for (const e of streetExtensions()) {
    const end = 640 * e.sgn;
    const targ = e.sgn * (e.L + 4);
    const len = Math.abs(targ - end);
    const mid = (end + targ) / 2;
    if (e.axis === 'x') g.boxB(e.at, 0, mid, e.width, 0.04, len, P.road);
    else g.boxB(mid, 0, e.at, len, 0.05, e.width, P.road);
    // raised sidewalks on both sides, from the last block corner (±633) to
    // the parkway junction, flush against the parkway's inner sidewalk
    for (const side of [1, -1]) {
      // end the strip so BOTH its end corners stay clear of the parkway
      // band (-8) and junction asphalt (-6) lines on BOTH strip edges; the
      // corner fans in parkway.js pave the remaining notch up to the curve
      const eIn = e.at + side * (e.width / 2), eOut = e.at + side * (e.width / 2 + 3);
      const ends = [];
      for (const off of [-8, -6])
        for (const ln of [eIn, eOut]) ends.push(e.sgn * extStripCross(e, off, ln));
      const walkEnd = e.sgn * (Math.min(...ends) - 0.8);
      walkStrip(g, col, e.axis, e.at + side * (e.width / 2 + 1.5), 633 * e.sgn, walkEnd);
    }
    // zebra crosswalk just inside the parkway's inner sidewalk band; at
    // skewed tees the band line sits at different depths per side, so place
    // it 2.2m inside the CLOSEST band-edge crossing
    const bandC = e.sgn * (Math.min(e.sgn * extSidewalkEnd(e, 1), e.sgn * extSidewalkEnd(e, -1)) - 2.2);
    // center dashes (stop before the tee crosswalk)
    const dEnd = e.sgn * bandC - 640;
    const n = Math.max(0, Math.floor((dEnd - 7) / 7));
    for (let i = 0; i < n; i++) {
      const p = end + e.sgn * (2 + i * 7 + 1.2);
      if (e.axis === 'x') g.boxB(e.at, 0.05, p, 0.35, 0.02, 2.4, P.dash);
      else g.boxB(p, 0.05, e.at, 2.4, 0.02, 0.35, P.dash);
    }
    const span = e.width - 0.4;
    const nB = Math.floor((span - 0.55) / 1.1) + 1;
    const o0 = (-(nB - 1) * 1.1) / 2;
    for (let b = 0; b < nB; b++) {
      const o = o0 + b * 1.1;
      if (e.axis === 'x') g.boxB(e.at + o, 0.055, bandC, 0.55, 0.02, 2.3, P.dash);
      else g.boxB(bandC, 0.055, e.at + o, 2.3, 0.02, 0.55, P.dash);
    }
  }
}

// Zebra crosswalks on every leg of every 3- and 4-way grid intersection.
function buildCrosswalks(g) {
  const segs = new Set(buildRoads().map((s) => s.axis + ':' + s.at + ':' + s.from));
  const has = (axis, at, from) => segs.has(axis + ':' + at + ':' + from);
  const zebra = (cx, cz, alongZ, span) => {
    const nBars = Math.floor((span - 0.55) / 1.1) + 1;
    const off0 = (-(nBars - 1) * 1.1) / 2;
    for (let i = 0; i < nBars; i++) {
      const o = off0 + i * 1.1;
      if (alongZ) g.boxB(cx + o, 0.055, cz, 0.55, 0.02, 2.3, P.dash);
      else g.boxB(cx, 0.055, cz + o, 2.3, 0.02, 0.55, P.dash);
    }
  };
  for (let ia = 1; ia < GRID.length - 1; ia++) {
    for (let ib = 1; ib < GRID.length - 1; ib++) {
      const a = GRID[ia], b = GRID[ib]; // a: x of the N-S road, b: z of the E-W road
      const wa = roadWidth(a), wb = roadWidth(b);
      const legN = has('x', a, GRID[ib - 1]);
      const legS = has('x', a, b);
      const legW = has('z', b, GRID[ia - 1]);
      const legE = has('z', b, a);
      if (legN + legS + legW + legE < 3) continue;
      if (legN) zebra(a, b - wb / 2 - 1.9, true, wa - 0.4);
      if (legS) zebra(a, b + wb / 2 + 1.9, true, wa - 0.4);
      if (legW) zebra(a - wa / 2 - 1.9, b, false, wb - 0.4);
      if (legE) zebra(a + wa / 2 + 1.9, b, false, wb - 0.4);
    }
  }
}

// ---- coastal belt ---------------------------------------------------------
// Dense low-rise infill between the square grid (blocks end at ±633) and the
// coastal parkway — fills the wide grass wedges near the island's capes.
// Buildings sit in concentric rows that follow the grid's outer edge and
// face the parkway. Deterministic: sizes/colors/heights from hash only.
function beltBuilding(g, col, x, z, w, d, ry, seed) {
  const floors = 2 + (hash(seed, 1) % 4);
  const h = floors * 3;
  const body = hash(seed, 2) % 3 ? pick(P.bodies, seed, 3) : pick(P.towerBodies, seed, 3);
  const glass = hash(seed, 4) % 2 ? P.window : P.glassDark;
  g.boxB(x, 0, z, w, h, d, body, ry);
  g.boxB(x, h, z, w + 0.4, 0.4, d + 0.4, hash(seed, 5) % 2 ? P.roofLight : P.roofDark, ry);
  const s = Math.sin(ry), c = Math.cos(ry);
  for (let f = 0; f < floors; f++) {
    const wy = f * 3 + 1.9;
    // front band (local +z, faces the parkway) skipped on the ground floor
    if (f > 0) g.box(x + s * (d / 2), wy, z + c * (d / 2), w - 1.8, 1.3, 0.2, glass, ry);
    g.box(x - s * (d / 2), wy, z - c * (d / 2), w - 1.8, 1.3, 0.2, glass, ry);
    g.box(x + c * (w / 2), wy, z - s * (w / 2), 0.2, 1.3, d - 1.8, glass, ry);
    g.box(x - c * (w / 2), wy, z + s * (w / 2), 0.2, 1.3, d - 1.8, glass, ry);
  }
  g.box(x + s * (d / 2 + 0.03), 1.2, z + c * (d / 2 + 0.03), 2.0, 2.4, 0.26, P.doorDark, ry);
  g.box(x + s * (d / 2 + 0.7), 2.6, z + c * (d / 2 + 0.7), 2.8, 0.16, 1.5, pick(P.awnings, seed, 6), ry);
  if (hash(seed, 7) % 2) g.boxB(x + c * (w / 5) * 0.8, h + 0.4, z - s * (w / 5) * 0.8, 1.8, 1.1, 1.8, P.concreteDark, ry);
  col.add(x, 0, z, w, h + 1, d, ry); // exact rotated footprint
}

function buildCoastalBelt(g, col) {
  const exts = streetExtensions();
  const rectR = (th) => 633 / Math.max(Math.abs(Math.cos(th)), Math.abs(Math.sin(th)));
  let k = 0;
  // rows sit on concentric circles so neighbours never overlap; the per-spot
  // checks reject anything digging into the grid blocks or the parkway
  for (let row = 0; row < 17; row++) {
    let th = -Math.PI;
    while (th < Math.PI) {
      const seed = hash(7310 + row, k++);
      const w = 10 + frac(seed, 1) * 6;   // tangential frontage
      const d = 9 + frac(seed, 2) * 3;    // radial depth
      const r = 637 + row * 17 + d / 2;
      const halfA = (w / 2 + 1) / r;
      let ok = true;
      for (const t of [th - halfA, th, th + halfA]) {
        if (r - d / 2 < rectR(t) + 3 || r + d / 2 + 2.5 > parkwayCenterR(t) - 9) ok = false;
      }
      if (ok) {
        const x = Math.cos(th) * r, z = Math.sin(th) * r;
        // keep out of the extended-street corridors
        ok = ok && !exts.some((e) => {
          const main = e.axis === 'x' ? x : z;
          const other = (e.axis === 'x' ? z : x) * e.sgn;
          return Math.abs(main - e.at) < e.width / 2 + 10 && other > 620 && other < e.L + 14;
        });
        if (ok) {
          beltBuilding(g, col, x, z, w, d, Math.atan2(Math.cos(th), Math.sin(th)), seed);
          th += (w + 2.5 + frac(seed, 8) * 2.5) / r;
          continue;
        }
      }
      th += 6 / r;
    }
  }
}

// Ring walkways through the coastal belt: a raised sidewalk arc in front of
// each building row, clipped exactly against the extension-street sidewalks
// so every belt building is reachable on pavement from the grid or parkway.
function buildBeltWalks(g, col) {
  const exts = streetExtensions();
  const rectR = (th) => 633 / Math.max(Math.abs(Math.cos(th)), Math.abs(Math.sin(th)));
  for (let row = 0; row < 17; row++) {
    const rw = 637 + row * 17 + 13.2;
    const dth = 4 / rw;
    // radial clearance to the parkway asphalt edge: the -6 perpendicular
    // offset spans MORE than 6m radially where the parkway runs oblique to
    // the radial direction (dR/dth large near headlands and tees)
    const pwEdge = (th) => {
      const r = parkwayCenterR(th);
      const dd = 0.01;
      const dr = (parkwayCenterR(th + dd) - parkwayCenterR(th - dd)) / (2 * dd);
      return r - 6.3 * Math.sqrt(1 + (dr / r) ** 2);
    };
    const pass = (th) => {
      // allowed right up to the parkway's inner sidewalk band so rows butt
      // into it flush instead of stopping short in the grass; grid side may
      // reach ~0.5m INTO the corner block's perimeter sidewalk band, flush
      if (rw - 1.5 < rectR(th) - 2 || rw + 1.1 > pwEdge(th)) return false;
      const x = Math.cos(th) * rw, z = Math.sin(th) * rw;
      return !exts.some((e) => {
        const main = e.axis === 'x' ? x : z;
        const other = (e.axis === 'x' ? z : x) * e.sgn;
        // stop inside the extension sidewalk band so the two decks meet flush
        return Math.abs(main - e.at) < e.width / 2 + 2 && other > 620 && other < e.L + 14;
      });
    };
    const clamp = (thOk, thBad) => {
      let lo = thOk, hi = thBad;
      for (let it = 0; it < 24; it++) {
        const m = (lo + hi) / 2;
        if (pass(m)) lo = m; else hi = m;
      }
      return lo;
    };
    const seg = (t0, t1) => {
      if (t1 - t0 < 3 / rw) return; // drop tiny orphan fragments
      const thm = (t0 + t1) / 2;
      const x = Math.cos(thm) * rw, z = Math.sin(thm) * rw;
      const len = 2 * rw * Math.sin((t1 - t0) / 2) + 0.35;
      const ry = Math.atan2(-Math.cos(thm), -Math.sin(thm)); // tangential
      g.boxB(x, 0, z, len, SIDEWALK_H, 2.2, P.sidewalk, ry);
      col.add(x, 0, z, len, SIDEWALK_H, 2.2, ry);
    };
    for (let th = -Math.PI; th < Math.PI; th += dth) {
      const ok0 = pass(th), ok1 = pass(th + dth);
      if (ok0 && ok1) seg(th, th + dth);
      else if (ok0) seg(th, clamp(th, th + dth));
      else if (ok1) seg(clamp(th + dth, th), th + dth);
    }
  }
}

// ---- clouds -------------------------------------------------------------
function buildClouds(g) {
  const spots = [
    [-380, 150, -200], [220, 170, -420], [500, 140, 300], [-150, 160, 420],
    [80, 180, 60], [-550, 150, -500], [420, 165, -120], [-320, 175, 320],
  ];
  let k = 0;
  for (const [x, y, z] of spots) {
    const n = 3 + (hash(k, 1) % 3);
    for (let i = 0; i < n; i++) {
      const ox = (frac(k, i, 2) - 0.5) * 26;
      const oz = (frac(k, i, 3) - 0.5) * 14;
      const s = 7 + frac(k, i, 4) * 9;
      g.box(x + ox, y + (frac(k, i, 5) - 0.5) * 4, z + oz, s, s * 0.35, s * 0.7, 0xffffff);
    }
    k++;
  }
}

// ---- main entry ---------------------------------------------------------
export function buildCity(scene, col) {
  const g = new GeoBatch();

  // (the island mesh in island.js provides the ground/water now)

  buildRoadGeometry(g, col);
  buildBayWalks(g, col);
  buildCrosswalks(g);
  buildParkway(scene, g, col, { tree, bench, lamp, P });

  for (const b of blocksOnce()) {
    const seed = hash(Math.round(b.x0), Math.round(b.z0));
    switch (b.type) {
      case 'apartments': buildApartments(g, col, b, seed); break;
      case 'downtown': buildDowntown(g, col, b, seed); break;
      case 'oldtown': buildOldtown(g, col, b, seed); break;
      case 'midrise': buildMidrise(g, col, b, seed); break;
      case 'mixed': buildMixed(g, col, b, seed); break;
      case 'suburb': buildSuburb(g, col, b, seed); break;
      case 'industrial': buildIndustrial(g, col, b, seed, false); break;
      case 'industrial-big': buildIndustrial(g, col, b, seed, true); break;
      case 'park': buildPark(g, col, b, seed, false); break;
      case 'park-central': buildPark(g, col, b, seed, true, scene); break;
      case 'plaza': buildPlaza(g, col, b, seed); break;
      case 'cityhall': buildCityHall(g, col, b); break;
      case 'firestation': buildFireStation(g, col, b); break;
      case 'church': buildChurch(g, col, b); break;
    }
  }

  buildClouds(g);
  buildCoastalBelt(g, col);
  buildBeltWalks(g, col);
  curbsideParking();

  const group = g.build();
  scene.add(group);
  return group;
}

let _blocks = null;
function blocksOnce() {
  if (!_blocks) _blocks = buildBlocks();
  return _blocks;
}
export { blocksOnce as getBlocks };
