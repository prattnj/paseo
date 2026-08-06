// Reusable multi-part building archetypes dispatched by several block builders:
// apartment slabs, downtown towers, suburban houses, shopfronts, the
// institutional box, and the classical column/arch shared by plaza and mosque.
import { PALETTE as P, SIDEWALK_H } from '../../core/palette.js';
import { hash, pick, frac } from '../../core/util.js';

// Stone tones for the classical column/arch (shared by the plaza + the mosque).
const STONE = 0xdad3c2;     // wall body (warm limestone)
const STONE_LT = 0xf1ecdd;  // columns / highlights (bright)
const STONE_MD = 0xbdb59f;  // cornices / bands / mouldings (darker, for depth)

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

// One decorated apartment wall face. Same (center, len, plane) convention as
// windowsWall: axis 'x' → plane at x+wallOff facing ±x, windows spread along z;
// axis 'z' → plane at z+wallOff facing ±z, windows spread along x. `style`
// selects the outer-wall treatment layered over the windows:
//   0 plain · 1 balconies (upper floors) · 2 string courses · 3 pilasters.
function facade(g, x, z, y0, floors, floorH, len, axis, wallOff, style, trim, winHex) {
  windowsWall(g, x, z, y0, floors, floorH, len, axis, wallOff, 4, winHex);
  const sign = Math.sign(wallOff) || 1;
  const h = floors * floorH;
  const n = Math.floor((len - 3) / 4);
  const start = -((n - 1) * 4) / 2;
  if (style === 1 && n >= 1) {           // juliet balconies under upper windows
    for (let f = 1; f < floors; f++) {
      const by = y0 + f * floorH + 0.15;
      for (let i = 0; i < n; i++) {
        const off = start + i * 4;
        if (axis === 'x') {
          g.box(x + wallOff + sign * 0.55, by, z + off, 1.0, 0.16, 2.6, P.concrete);
          g.box(x + wallOff + sign * 1.0, by + 0.55, z + off, 0.1, 0.9, 2.6, trim);
        } else {
          g.box(x + off, by, z + wallOff + sign * 0.55, 2.6, 0.16, 1.0, P.concrete);
          g.box(x + off, by + 0.55, z + wallOff + sign * 1.0, 2.6, 0.9, 0.1, trim);
        }
      }
    }
  } else if (style === 2) {              // horizontal string courses at each floor
    for (let f = 1; f < floors; f++) {
      const by = y0 + f * floorH;
      if (axis === 'x') g.box(x + wallOff + sign * 0.06, by, z, 0.16, 0.35, len, trim);
      else g.box(x, by, z + wallOff + sign * 0.06, len, 0.35, 0.16, trim);
    }
  } else if (style === 3 && n >= 1) {    // vertical pilasters between window columns
    for (let i = 0; i <= n; i++) {
      const off = start - 2 + i * 4;
      if (Math.abs(off) > len / 2 - 0.4) continue;
      if (axis === 'x') g.box(x + wallOff + sign * 0.08, y0 + h / 2, z + off, 0.16, h, 0.7, trim);
      else g.box(x + off, y0 + h / 2, z + wallOff + sign * 0.08, 0.7, h, 0.16, trim);
    }
  }
}

// Colorful mid-rise apartment slab (the reference-image look). Windows/doors go
// on the two walls of the longer dimension; pass allWalls to also glaze the two
// short walls (for slabs whose ends are exposed to the street, e.g. the frontage
// runs of a perimeter block). A per-seed facade style + trim/glazing tint break
// up what would otherwise be a wall of identical slabs.
function apartment(g, col, x, z, w, d, floors, bodyHex, seed, allWalls = false) {
  const floorH = 3;
  const h = floors * floorH;
  const y = SIDEWALK_H;
  const style = hash(seed, 30) % 4;
  const trim = pick(P.trims, seed, 31);
  const winHex = pick(P.windowTints, seed, 32);
  g.boxB(x, y, z, w, h, d, bodyHex);
  // parapet + roof slab (trim-coloured cornice for extra facade variety)
  g.boxB(x, y + h, z, w + 0.5, 0.5, d + 0.5, hash(seed, 33) % 2 ? trim : P.roofLight);
  // roof clutter: stair bulkhead, an AC block, and an occasional water tank
  g.boxB(x - w / 4, y + h + 0.5, z, 2.2, 1.4, 2.2, P.roofLight);
  if (hash(seed, 7) % 2) g.boxB(x + w / 4, y + h + 0.5, z + d / 5, 1.6, 1.0, 1.6, P.concreteDark);
  if (hash(seed, 34) % 3 === 0) {
    const tx = x + w / 5, tz = z - d / 5;
    for (const lx of [-0.7, 0.7]) g.box(tx + lx, y + h + 0.6, tz, 0.16, 1.2, 0.16, P.roofDark);
    g.cyl(tx, y + h + 1.3, tz, 1.0, 1.0, 1.4, 0x7a6a52, 8);
  }
  const doorSign = hash(seed, 3) % 2 ? 1 : -1;
  if (w >= d) {
    facade(g, x, z, y, floors, floorH, w, 'z', d / 2, style, trim, winHex);
    facade(g, x, z, y, floors, floorH, w, 'z', -(d / 2), style, trim, winHex);
    if (allWalls) {
      facade(g, x, z, y, floors, floorH, d, 'x', w / 2, style, trim, winHex);
      facade(g, x, z, y, floors, floorH, d, 'x', -(w / 2), style, trim, winHex);
    }
    g.box(x, y + 1.25, z + doorSign * d / 2, 2.2, 2.5, 0.25, P.doorDark);
    g.box(x, y + 2.7, z + doorSign * (d / 2 + 0.6), 3.2, 0.18, 1.4, pick(P.awnings, seed, 9));
  } else {
    facade(g, x, z, y, floors, floorH, d, 'x', w / 2, style, trim, winHex);
    facade(g, x, z, y, floors, floorH, d, 'x', -(w / 2), style, trim, winHex);
    if (allWalls) {
      facade(g, x, z, y, floors, floorH, w, 'z', d / 2, style, trim, winHex);
      facade(g, x, z, y, floors, floorH, w, 'z', -(d / 2), style, trim, winHex);
    }
    g.box(x + doorSign * w / 2, y + 1.25, z, 0.25, 2.5, 2.2, P.doorDark);
    g.box(x + doorSign * (w / 2 + 0.6), y + 2.7, z, 1.4, 0.18, 3.2, pick(P.awnings, seed, 9));
  }
  col.add(x, 0, z, w, h + 1, d);
}

// Ground-floor storefronts wrapped around a tower's street-facing walls.
// `exp` flags which of the four walls are exposed to the street; each
// exposed wall is tiled with retail units of varied awnings/signs.
function towerRetail(g, x0, z0, x1, z1, y, exp, seed) {
  const walls = [];
  if (exp.zmin) walls.push(['x', z0, -1, x0, x1]);
  if (exp.zmax) walls.push(['x', z1, +1, x0, x1]);
  if (exp.xmin) walls.push(['z', x0, -1, z0, z1]);
  if (exp.xmax) walls.push(['z', x1, +1, z0, z1]);
  let u = 0;
  for (const [axis, fixed, out, lo, hi] of walls) {
    const len = hi - lo;
    const n = Math.max(1, Math.round(len / 9)); // ~9m storefronts
    const sw = len / n;
    for (let i = 0; i < n; i++) {
      const c = lo + sw * (i + 0.5);
      const s = hash(seed, u * 29 + i, 5);
      const gw = sw - 1.4;              // leave pilasters between units
      const awn = pick(P.awnings, s, 3);
      const sign = hash(s, 2) % 4 === 3; // some units get a flat sign instead
      const kind = hash(s, 6) % 3;       // storefront layout variety
      // Box in (along c, proud-out) space. Everything is pushed clearly proud
      // of the wall with backs embedded, and stacked so no faces are coplanar
      // (which z-fights); the stall riser sinks below the sidewalk.
      const rb = (cc, proud, wy, aLen, hh, th, hex) => axis === 'x'
        ? g.box(cc, wy, fixed + out * proud, aLen, hh, th, hex)
        : g.box(fixed + out * proud, wy, cc, th, hh, aLen, hex);
      rb(c, 0.12, y + 0.2, gw, 1.0, 0.3, P.concreteDark);      // stall riser
      if (kind === 0) {                  // full glass
        rb(c, 0.12, y + 1.95, gw, 2.5, 0.3, P.glassDark);
      } else if (kind === 1) {           // glass + a taller glass door
        rb(c - gw * 0.16, 0.12, y + 1.95, gw * 0.62, 2.5, 0.3, P.glassDark);
        rb(c + gw * 0.33, 0.13, y + 1.7, gw * 0.3, 3.0, 0.32, P.glassDark);
        rb(c + gw * 0.16, 0.12, y + 1.95, 0.18, 2.5, 0.3, P.concreteDark); // mullion
      } else {                            // twin panes split by a central door
        rb(c - gw * 0.28, 0.12, y + 1.95, gw * 0.36, 2.5, 0.3, P.glassDark);
        rb(c + gw * 0.28, 0.12, y + 1.95, gw * 0.36, 2.5, 0.3, P.glassDark);
        rb(c, 0.13, y + 1.7, gw * 0.22, 3.0, 0.34, P.glassDark);          // door
        for (const m of [-1, 1]) rb(c + m * gw * 0.12, 0.12, y + 1.95, 0.16, 2.5, 0.3, P.concreteDark);
      }
      if (sign) rb(c, 0.12, y + 3.75, gw, 0.7, 0.28, pick(P.bodies, s, 4));
      else rb(c, 0.5, y + 3.35, gw + 0.4, 0.18, 1.1, awn);
    }
    u++;
  }
}

// Downtown skyscraper. Six façade styles; the ground floor is a retail band
// wrapped around whichever walls face the street (`r` = the block's inset
// rect, used to tell exposed walls from ones shared with a neighbour tower).
function tower(g, col, x, z, w, d, floors, seed, r = null) {
  const y = SIDEWALK_H;
  const RETAIL = 4.2, fh = 3.2;
  const h = RETAIL + floors * fh;
  const yb = y + RETAIL;             // base of the office floors (above retail)
  const top = y + h;
  const body = pick(P.towerBodies, seed, 1);
  const cap = pick(P.roofCaps, seed, 3); // light-grey roof cap, varies per building
  const glass = hash(seed, 2) % 2 ? P.glass : P.glassDark;
  const style = hash(seed, 7) % 6;
  const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;

  // horizontal ribbon windows on the four walls between [ya, yend]
  const ribbon = (bw, bd, ya, yend, gap = 1.2) => {
    for (let wy = ya; wy < yend - 1; wy += fh) {
      g.box(x, wy, z + bd / 2, bw - gap, 1.4, 0.2, glass);
      g.box(x, wy, z - bd / 2, bw - gap, 1.4, 0.2, glass);
      g.box(x + bw / 2, wy, z, 0.2, 1.4, bd - gap, glass);
      g.box(x - bw / 2, wy, z, 0.2, 1.4, bd - gap, glass);
    }
  };

  if (style === 2) {
    // tiered setback tower: stacked shrinking slabs with ledges
    const tiers = floors >= 12 ? 3 : 2;
    let ty = y, tw = w, td = d;
    const tierH = h / tiers;
    for (let t = 0; t < tiers; t++) {
      g.boxB(x, ty, z, tw, tierH, td, body);
      for (let wy = Math.max(ty + 1.7, yb + 1); wy < ty + tierH - 1; wy += fh) {
        g.box(x, wy, z + td / 2, tw - 1.6, 1.3, 0.2, glass);
        g.box(x, wy, z - td / 2, tw - 1.6, 1.3, 0.2, glass);
        g.box(x + tw / 2, wy, z, 0.2, 1.3, td - 1.6, glass);
        g.box(x - tw / 2, wy, z, 0.2, 1.3, td - 1.6, glass);
      }
      g.boxB(x, ty + tierH, z, tw + 0.5, 0.4, td + 0.5, cap);
      ty += tierH + 0.4; tw -= 3.2; td -= 3.2;
    }
  } else if (style === 4) {
    // art-deco stepped spire: shaft with vertical piers, setbacks, spire
    const shaftH = h * 0.68;
    g.boxB(x, y, z, w, shaftH, d, body);
    for (const [axis, len] of [['x', w], ['z', d]]) {
      const n = Math.max(2, Math.floor((len - 3) / 4.2));
      const start = -((n - 1) * 4.2) / 2;
      const sy = (yb + y + shaftH) / 2, sh = (y + shaftH) - yb - 1;
      if (sh > 0) for (let i = 0; i < n; i++) {
        const off = start + i * 4.2;
        for (const side of [1, -1]) {
          if (axis === 'x') g.box(x + off, sy, z + side * d / 2, 2.0, sh, 0.18, glass);
          else g.box(x + side * w / 2, sy, z + off, 0.18, sh, 2.0, glass);
        }
      }
    }
    let ty = y + shaftH, tw = w, td = d;
    const steps = 3, stepH = (h - shaftH) / (steps + 1);
    for (let s = 0; s < steps; s++) {
      tw *= 0.68; td *= 0.68;
      g.boxB(x, ty, z, tw, stepH, td, body);
      g.boxB(x, ty + stepH, z, tw + 0.3, 0.3, td + 0.3, cap);
      ty += stepH;
    }
    g.boxB(x, ty, z, Math.max(tw, td) * 0.42, stepH, Math.max(tw, td) * 0.42, body);
    g.cyl(x, ty + stepH, z, 0.9, 0.1, 5.5, P.roofLight, 6);
  } else {
    // full-height box styles (0 strips, 1 ribbon, 3 curtain wall, 5 notched)
    g.boxB(x, y, z, w, h, d, style === 3 ? glass : body);
    if (style === 0) {
      for (const [axis, len] of [['x', d], ['z', w]]) {
        const n = Math.floor((len - 3) / 3.4);
        const start = -((n - 1) * 3.4) / 2;
        const sy = (yb + top) / 2, sh = top - yb - 1;
        for (let i = 0; i < n; i++) {
          const off = start + i * 3.4;
          for (const side of [1, -1]) {
            if (axis === 'x') g.box(x + side * w / 2, sy, z + off, 0.2, sh, 1.9, glass);
            else g.box(x + off, sy, z + side * d / 2, 1.9, sh, 0.2, glass);
          }
        }
      }
    } else if (style === 1) {
      ribbon(w, d, yb + 0.9, top);
    } else if (style === 3) {
      // glass curtain wall: a frame grid over the glass body
      const frame = 0xc4ccd1;
      for (let wy = yb; wy <= top - 0.5; wy += fh) {           // spandrels
        g.box(x, wy, z + d / 2, w, 0.2, 0.06, frame);
        g.box(x, wy, z - d / 2, w, 0.2, 0.06, frame);
        g.box(x + w / 2, wy, z, 0.06, 0.2, d, frame);
        g.box(x - w / 2, wy, z, 0.06, 0.2, d, frame);
      }
      for (const [axis, len] of [['x', w], ['z', d]]) {          // mullions
        const n = Math.floor(len / 5.5), start = -((n - 1) * 5.5) / 2;
        const my = (yb + top) / 2, mh = top - yb;
        for (let i = 0; i < n; i++) {
          const off = start + i * 5.5;
          for (const side of [1, -1]) {
            if (axis === 'x') g.box(x + off, my, z + side * d / 2, 0.12, mh, 0.06, frame);
            else g.box(x + side * w / 2, my, z + off, 0.06, mh, 0.12, frame);
          }
        }
      }
    } else {
      // style 5: notched slab with contrasting full-height corner columns
      ribbon(w, d, yb + 0.9, top);
      const cc = pick(P.towerBodies, seed, 9);
      const cw = 2.6;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        g.boxB(x + sx * (w / 2 - cw / 2 + 0.2), y, z + sz * (d / 2 - cw / 2 + 0.2), cw, h + 0.6, cw, cc);
      }
    }
    g.boxB(x, top, z, w + 0.4, 0.5, d + 0.4, cap);
    if (style === 5) g.boxB(x, top, z, w * 0.5, h * 0.1, d * 0.5, body); // crown notch
  }

  // roof furniture (helipad / AC block / antenna) on the flat-topped styles
  if (style === 0 || style === 1 || style === 3 || style === 5) {
    const roofY = top + 0.5;
    if (hash(seed, 8) % 4 === 0 && w > 10) {
      g.cyl(x, roofY, z, 3.4, 3.4, 0.3, P.roofLight, 12);
      g.boxB(x, roofY + 0.3, z, 2.6, 0.06, 0.5, P.white);
      g.boxB(x, roofY + 0.3, z, 0.5, 0.06, 2.6, P.white);
    } else {
      g.boxB(x - w / 6, roofY, z + w / 8, 3, 2, 3, P.roofDark);
    }
    if (hash(seed, 5) % 3 === 0) g.cyl(x + w / 5, roofY, z - w / 6, 0.12, 0.12, 6, P.roofDark, 5);
  }

  // ground-floor retail on whichever walls face the street
  const eps = 0.6;
  const exp = r
    ? { xmin: x0 <= r.x0 + eps, xmax: x1 >= r.x1 - eps, zmin: z0 <= r.z0 + eps, zmax: z1 >= r.z1 - eps }
    : { xmin: true, xmax: true, zmin: true, zmax: true };
  towerRetail(g, x0, z0, x1, z1, y, exp, hash(seed, 21));

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

// Worn, muted tones for lower-class suburbB; richer creams/brick for the
// upper-class suburbA two-storeys.
const HOUSE_B_BODIES = [0xd8d0bf, 0xc7b596, 0xb7a184, 0xccbfa6, 0xa8b0a0, 0xc6a88c, 0xbfc2b4];
const HOUSE_B_ROOFS = [0x6a5343, 0x55585e, 0x796957, 0x4a4440, 0x5c4a3a];
const HOUSE_A_BODIES = [0xf2efe6, 0xece0c8, 0xdccbb0, 0xcdd9e0, 0xe6d3ce, 0xdfe6d6, 0xf0e6d2];
const HOUSE_A_BRICK = [0x9c5a48, 0xa86a52, 0x8c5442, 0xb07a5a];
const HOUSE_A_ROOFS = [0x463c37, 0x39424d, 0x574636, 0x6b5545, 0x4a4440];

// Small single-storey suburbB house with per-seed style variation (roof
// shape, size, worn vs painted body, optional side window / porch stoop).
function house(g, col, x, z, seed, ry = 0) {
  const worn = hash(seed, 30) % 3 !== 0; // most are weathered
  const body = worn ? pick(HOUSE_B_BODIES, seed, 1) : pick(P.houseBodies, seed, 1);
  const roof = pick(HOUSE_B_ROOFS, seed, 2);
  const w = 7 + (hash(seed, 3) % 4);          // 7..10
  const d = 6 + (hash(seed, 4) % 3);          // 6..8
  const h = 2.8 + (hash(seed, 8) % 3) * 0.25; // 2.8..3.3
  const y = SIDEWALK_H;
  const s = Math.sin(ry), c = Math.cos(ry);
  const at = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];
  g.boxB(x, y, z, w, h, d, body, ry);
  const roofStyle = hash(seed, 9) % 3;
  if (roofStyle === 2) {
    g.boxB(x, y + h - 0.1, z, w + 0.5, 0.4, d + 0.5, roof, ry); // flat parapet (embedded)
  } else {
    g.prism(x, y + h, z, w + 0.7, roofStyle ? 1.5 : 2.3, d + 0.7, roof, ry); // gable / low gable
    const [chx, chz] = at(w / 4, -d / 8);
    g.boxB(chx, y + h + 0.6, chz, 0.7, 1.8, 0.7, P.concreteDark, ry);
  }
  // door + two front windows (local +z face)
  const [dxp, dzp] = at(-w / 6, d / 2);
  g.box(dxp, y + 1.05, dzp, 1.1, 2.1, 0.2, P.doorDark, ry);
  for (const off of [w / 5, w / 2.6]) {
    const [wx, wz] = at(off, d / 2);
    g.box(wx, y + 1.6, wz, 1.1, 1.1, 0.22, P.window, ry);
  }
  if (hash(seed, 11) % 2) { // side window
    const [swx, swz] = at(w / 2, -d / 8);
    g.box(swx, y + 1.6, swz, 0.22, 1.0, 1.1, P.window, ry);
  }
  col.add(x, 0, z, w, h + 2.2, d, ry);
}

// Two-storey upper-class suburbA house. opts.garage (bool) + opts.side (±1
// local-x) attach a single-storey garage wing; the caller matches the
// driveway to that side.
function house2(g, col, x, z, seed, ry = 0, opts = {}) {
  const brick = hash(seed, 40) % 3 === 0;
  const body = brick ? pick(HOUSE_A_BRICK, seed, 1) : pick(HOUSE_A_BODIES, seed, 1);
  const roof = pick(HOUSE_A_ROOFS, seed, 2);
  const trim = P.white;
  const w = 11 + (hash(seed, 3) % 4);   // 11..14
  const d = 8 + (hash(seed, 4) % 3);    // 8..10
  const fh = 2.9, h = fh * 2;           // two storeys
  const y = SIDEWALK_H;
  const s = Math.sin(ry), c = Math.cos(ry);
  const at = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];

  g.boxB(x, y, z, w, h, d, body, ry);
  g.boxB(x, y + fh - 0.09, z, w + 0.05, 0.18, d + 0.05, trim, ry); // storey band
  g.prism(x, y + h, z, w + 0.9, 2.8 + (hash(seed, 5) % 2) * 0.7, d + 0.9, roof, ry);
  const [chx, chz] = at(w / 3, -d / 6);
  g.boxB(chx, y + h + 0.5, chz, 0.9, 2.2, 0.9, brick ? body : 0x8c5442, ry);

  // front door + windows on both storeys (local +z face)
  const [dxp, dzp] = at(-w / 5, d / 2);
  g.box(dxp, y + 1.2, dzp, 1.3, 2.4, 0.2, P.doorDark, ry);
  const cols = [-w / 5 + w * 0.34, w * 0.34, -w / 3.2];
  for (const flo of [0, 1]) {
    for (const off of cols) {
      if (flo === 0 && Math.abs(off + w / 5) < 1.2) continue; // skip window behind door
      const [wx, wz] = at(off, d / 2);
      g.box(wx, y + 1.7 + flo * fh, wz, 1.2, 1.4, 0.22, P.window, ry);
    }
    // side windows
    for (const sgn of [-1, 1]) {
      const [swx, swz] = at(sgn * w / 2, -d / 6);
      g.box(swx, y + 1.7 + flo * fh, swz, 0.22, 1.2, 1.2, P.window, ry);
    }
  }
  col.add(x, 0, z, w, h + 2.6, d, ry);

  if (opts.garage) {
    const side = opts.side || 1;
    const gw = 4.8, gd = Math.min(d, 7), gh = 3.0;
    const glx = side * (w / 2 + gw / 2 - 0.5), glz = d / 2 - gd / 2;
    const [gx, gz] = at(glx, glz);
    g.boxB(gx, y, gz, gw, gh, gd, body, ry);
    g.prism(gx, y + gh, gz, gw + 0.5, 1.3, gd + 0.5, roof, ry);
    const [gdx, gdz] = at(glx, d / 2); // garage front aligns with house front
    g.box(gdx, y + 1.15, gdz, gw - 0.9, 2.2, 0.18, 0x6f7176, ry); // garage door
    col.add(gx, 0, gz, gw, gh + 1.3, gd, ry);
  }
  return { w, d };
}

// A big institutional building: windowed box, flat parapet roof, and a glazed
// entrance with a colored canopy on the `faceZ` (+/-z) side.
function bigBuilding(g, col, x, z, w, d, floors, bodyHex, accent, faceZ = 1) {
  const y = SIDEWALK_H, fh = 3.5, h = floors * fh;
  g.boxB(x, y, z, w, h, d, bodyHex);
  g.boxB(x, y + h, z, w + 0.5, 0.6, d + 0.5, P.roofLight);
  col.add(x, 0, z, w, h + 0.6, d);
  windowsWall(g, x, z, y, floors, fh, w, 'z', d / 2, 4.2);
  windowsWall(g, x, z, y, floors, fh, w, 'z', -(d / 2), 4.2);
  windowsWall(g, x, z, y, floors, fh, d, 'x', w / 2, 4.2);
  windowsWall(g, x, z, y, floors, fh, d, 'x', -(w / 2), 4.2);
  const fz = z + faceZ * d / 2;
  g.box(x, y + 1.6, fz + faceZ * 0.12, Math.min(10, w - 4), 3.2, 0.4, P.glassDark); // entrance glazing
  g.box(x, y + 3.6, fz + faceZ * 0.1, Math.min(13, w - 2), 1.1, 0.3, accent);        // entry band
  g.box(x, y + 3.7, fz + faceZ * 1.3, Math.min(13, w - 2), 0.3, 2.6, accent);        // canopy
}

// A classical column: square base, slightly tapered round shaft, capital.
function column(g, x, z, y, h, rad = 1.0) {
  const s = rad * 2.6;
  g.boxB(x, y, z, s, 0.6, s, STONE_MD);                     // base
  g.cyl(x, y + 0.6, z, rad * 0.7, rad, h - 1.2, STONE_LT);  // tapered shaft
  g.boxB(x, y + h - 0.6, z, s, 0.6, s, STONE_MD);           // capital / abacus
}

// Solid masonry filling the wall above a passage, cut to a semicircular arch:
// each vertical slice descends only to the arch curve, leaving the opening.
// A curved archivolt moulding + keystone are added on both faces so the
// gateway reads clearly as a round arch. `axis` 'x' = passage runs across x.
function archHeader(g, cx, cz, axis, width, depth, springY, facadeTop, hex) {
  const r = width / 2, n = 40, sw = width / n;
  for (let i = 0; i < n; i++) {
    const dx = ((i + 0.5) / n - 0.5) * width;
    const bot = springY + Math.sqrt(Math.max(0, r * r - dx * dx));
    if (facadeTop <= bot) continue;
    if (axis === 'x') g.boxB(cx + dx, bot, cz, sw + 0.05, facadeTop - bot, depth, hex);
    else g.boxB(cx, bot, cz + dx, depth, facadeTop - bot, sw + 0.05, hex);
  }
  // archivolt: curved band of voussoir blocks tracing the arch on both faces
  for (let a = 0; a <= Math.PI + 1e-6; a += Math.PI / 20) {
    const dx = r * Math.cos(a), ay = springY + r * Math.sin(a);
    for (const fp of [-depth / 2 - 0.12, depth / 2 + 0.12]) {
      if (axis === 'x') g.box(cx + dx, ay, cz + fp, 1.4, 1.4, 0.4, STONE_MD);
      else g.box(cx + fp, ay, cz + dx, 0.4, 1.4, 1.4, STONE_MD);
    }
  }
  // keystone at the crown, both faces
  for (const fp of [-depth / 2 - 0.1, depth / 2 + 0.1]) {
    if (axis === 'x') g.boxB(cx, springY + r - 0.4, cz + fp, 1.7, 2.8, 0.5, STONE_LT);
    else g.boxB(cx + fp, springY + r - 0.4, cz, 0.5, 2.8, 1.7, STONE_LT);
  }
}

export { windowsWall, facade, apartment, tower, shop, house, house2,
  bigBuilding, column, archHeader, STONE, STONE_LT, STONE_MD };
