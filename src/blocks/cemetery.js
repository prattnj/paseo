// Cemetery: a headstone field on a dirt-aisle grid, a central mausoleum, a few
// large monuments, a wrought-iron perimeter fence and a planted tree band.
import { PALETTE as P, SIDEWALK_H } from '../palette.js';
import { hash, frac, pick } from '../util.js';
import { bench, tree } from './props.js';
import { slabAndSidewalk, groundStripe, ironFence, cornerLamps } from './kit.js';

// One weathered headstone. `t` (0..9) selects among ten styles. Upper pieces
// are embedded 0.05 into the piece below so no stacked stone faces are
// coplanar (no z-fighting). Rows share ry so a field reads as tidy rows.
const _STONE = [0x9a9a94, 0x8a8880, 0xb0aea6, 0x7d7b74, 0xa8a29a, 0x88857d, 0x9f988c];

function headstone(g, col, x, z, seed, ry = 0) {
  const c = _STONE[hash(seed, 1) % _STONE.length];
  const t = hash(seed, 2) % 10;
  const y = SIDEWALK_H, cs = Math.cos(ry), sn = Math.sin(ry);
  const at = (dx) => [x + dx * cs, z - dx * sn];
  let mh = 1.2;
  if (t === 0) {                                   // upright slab, flat top
    g.boxB(x, y, z, 1.0, 1.2, 0.18, c, ry);
  } else if (t === 1) {                            // slab on a wider base
    g.boxB(x, y, z, 1.1, 0.25, 0.42, c, ry);
    g.boxB(x, y + 0.20, z, 0.85, 1.05, 0.2, c, ry); mh = 1.25;
  } else if (t === 2) {                            // cross
    g.boxB(x, y, z, 0.22, 1.5, 0.22, c, ry);
    g.box(x, y + 1.08, z, 0.8, 0.22, 0.2, c, ry); mh = 1.5;
  } else if (t === 3) {                            // wide low tablet
    g.boxB(x, y, z, 1.4, 0.72, 0.2, c, ry); mh = 0.72;
  } else if (t === 4) {                            // peaked (pyramid cap)
    g.boxB(x, y, z, 0.9, 1.0, 0.24, c, ry);
    g.cone(x, y + 0.95, z, 0.52, 0.55, c, 4); mh = 1.5;
  } else if (t === 5) {                            // small obelisk
    g.boxB(x, y, z, 0.55, 0.3, 0.55, c, ry);
    g.boxB(x, y + 0.25, z, 0.36, 1.5, 0.36, c, ry);
    g.cone(x, y + 1.70, z, 0.24, 0.5, c, 4); mh = 2.2;
  } else if (t === 6) {                            // stepped rounded top
    g.boxB(x, y, z, 0.95, 0.9, 0.2, c, ry);
    g.boxB(x, y + 0.85, z, 0.72, 0.18, 0.2, c, ry);
    g.boxB(x, y + 0.98, z, 0.46, 0.16, 0.2, c, ry); mh = 1.14;
  } else if (t === 7) {                            // flat ground marker
    g.boxB(x, y, z, 0.9, 0.14, 0.62, c, ry); mh = 0.14;
  } else if (t === 8) {                            // tilted / broken old slab
    g.boxB(x, y, z, 0.9, 1.0, 0.18, c, ry + (frac(seed, 3) - 0.5) * 0.55); mh = 1.0;
  } else {                                         // double headstone on one base
    g.boxB(x, y, z, 1.7, 0.22, 0.46, c, ry);
    const [ax, az] = at(-0.4), [bx, bz] = at(0.4);
    g.boxB(ax, y + 0.17, az, 0.7, 0.95, 0.2, c, ry);
    g.boxB(bx, y + 0.17, bz, 0.7, 0.95, 0.2, c, ry); mh = 1.12;
  }
  col.add(x, 0, z, 1.3, mh, 0.65, ry);
}

// Central stone mausoleum/chapel: stepped base, portico columns, gabled roof,
// dark doorway facing +z (toward the gate).
function mausoleum(g, col, cx, cz, seed) {
  const S = 0x9a978f, SD = 0x83817b, ROOF = 0x55585e, y = SIDEWALK_H;
  const w = 9, d = 7, h = 4.2;
  g.boxB(cx, y, cz, w + 1.6, 0.45, d + 1.6, SD);          // plinth
  g.boxB(cx, y + 0.40, cz, w, h, d, S);                   // cella
  g.prism(cx, y + 0.40 + h, cz, w + 0.9, 2.3, d + 0.9, ROOF);
  // portico: four columns proud of the front face + entablature beam
  const fz = cz + d / 2 + 0.6;
  for (const ox of [-w / 2 + 0.9, -w / 2 + 3.1, w / 2 - 3.1, w / 2 - 0.9]) {
    g.cyl(cx + ox, y + 0.40, fz, 0.34, 0.34, h - 0.3, S);
  }
  g.boxB(cx, y + 0.40 + h - 0.35, fz, w + 0.4, 0.55, 1.0, SD); // entablature
  g.box(cx, y + 1.75, cz + d / 2 + 0.05, 1.7, 2.7, 0.2, 0x1a1c1f); // doorway
  col.add(cx, 0, cz, w + 1.6, h + 2.6, d + 2.0);
}

// A large graveyard monument: tall obelisk, statue-on-pedestal, or crypt.
function monument(g, col, x, z, seed) {
  const S = 0x9a978f, SD = 0x83817b, y = SIDEWALK_H;
  const t = hash(seed, 1) % 3;
  if (t === 0) {                                   // obelisk
    g.boxB(x, y, z, 1.8, 0.5, 1.8, SD);
    g.boxB(x, y + 0.45, z, 1.1, 0.4, 1.1, S);
    g.boxB(x, y + 0.80, z, 0.7, 4.0, 0.7, S);
    g.cone(x, y + 4.75, z, 0.5, 1.05, S, 4);
    col.add(x, 0, z, 1.8, 5.9, 1.8);
  } else if (t === 1) {                            // statue on pedestal
    g.boxB(x, y, z, 1.5, 1.9, 1.5, SD);
    g.boxB(x, y + 1.85, z, 0.5, 1.1, 0.35, 0xdedbd2);
    g.ico(x, y + 3.1, z, 0.32, 0xdedbd2);
    col.add(x, 0, z, 1.5, 3.5, 1.5);
  } else {                                         // family crypt
    g.boxB(x, y, z, 3.0, 0.4, 2.2, SD);
    g.boxB(x, y + 0.35, z, 2.4, 1.6, 1.7, S);
    g.prism(x, y + 1.90, z, 2.7, 0.9, 2.0, 0x55585e);
    g.box(x, y + 1.1, z + 0.88, 0.9, 1.5, 0.18, 0x1a1c1f);
    col.add(x, 0, z, 3.0, 2.9, 2.2);
  }
}

function buildCemetery(g, col, b, seed) {
  const r = slabAndSidewalk(g, col, b, P.grass);
  const w = r.x1 - r.x0, d = r.z1 - r.z0, cx = r.cx, cz = r.cz;
  const PATH = 0xbcae8c; // packed-dirt aisle

  // --- dirt aisles: a regular grid; the central N–S aisle is the gate walk.
  // Horizontals sit a hair higher than verticals so crossings never z-fight.
  const nx = 4, nz = 4, xA = [], zA = [];
  for (let k = 1; k < nx; k++) xA.push(r.x0 + (w * k) / nx);
  for (let k = 1; k < nz; k++) zA.push(r.z0 + (d * k) / nz);
  for (const ax of xA) groundStripe(g, ax, cz, 3, d, PATH, 0, 0.05);
  for (const az of zA) groundStripe(g, cx, az, w, 3, PATH, 0, 0.058);

  // --- central mausoleum (door faces +z / the gate)
  mausoleum(g, col, cx, cz, seed);

  // --- a few large monuments in the quadrants (kept off the aisles)
  const mons = [
    [cx - w * 0.30, cz - d * 0.30], [cx + w * 0.30, cz - d * 0.30],
    [cx - w * 0.30, cz + d * 0.30], [cx + w * 0.30, cz + d * 0.30],
    [cx - w * 0.30, cz],
  ];
  mons.forEach((m, i) => monument(g, col, m[0], m[1], hash(seed, 300, i)));

  // --- the headstone field: a ~2 m grid inside a planted perimeter band,
  // skipping aisles, the mausoleum, and the monuments.
  const M = 6; // perimeter band reserved for trees/bushes
  for (let x = r.x0 + M; x <= r.x1 - M; x += 2.2) {
    for (let z = r.z0 + M; z <= r.z1 - M; z += 2.4) {
      if (xA.some((a) => Math.abs(x - a) < 2.2)) continue;
      if (zA.some((a) => Math.abs(z - a) < 2.2)) continue;
      if (Math.abs(x - cx) < 7 && Math.abs(z - cz) < 6) continue; // mausoleum
      if (mons.some((m) => Math.abs(x - m[0]) < 2.8 && Math.abs(z - m[1]) < 2.8)) continue;
      const hs = hash(seed, Math.round(x), Math.round(z));
      const ry = z < cz ? 0 : Math.PI; // rows face the nearest half toward centre
      headstone(g, col, x, z, hs, ry);
    }
  }

  // --- wrought-iron perimeter fence with a gate gap on the south (+z) edge
  const fx0 = r.x0 + 1, fx1 = r.x1 - 1, fz0 = r.z0 + 1, fz1 = r.z1 - 1;
  ironFence(g, col, fx0, fz0, fx1, fz0);       // north
  ironFence(g, col, fx0, fz0, fx0, fz1);       // west
  ironFence(g, col, fx1, fz0, fx1, fz1);       // east
  ironFence(g, col, fx0, fz1, cx - 3, fz1);    // south (left of gate)
  ironFence(g, col, cx + 3, fz1, fx1, fz1);    // south (right of gate)
  for (const px of [cx - 3, cx + 3]) {         // gate pillars
    g.boxB(px, SIDEWALK_H, fz1, 0.6, 2.5, 0.6, 0x6f6d66);
    col.add(px, 0, fz1, 0.6, 2.5, 0.6);
  }
  bench(g, col, cx - 3.2, cz + d * 0.30, 0);
  bench(g, col, cx + 3.2, cz + d * 0.30, Math.PI);

  // --- trees & bushes in the perimeter band (far fewer than the suburbs),
  // spaced along each side and skipping the gate.
  const bandOff = 3.3; // inside the fence, before the first grave row
  const place = (x, z, k) => {
    if (hash(seed, 400, k) % 4 === 0) {
      g.ico(x, SIDEWALK_H + 0.5, z, 0.6 + frac(seed, 401, k) * 0.35, pick([P.leaf1, P.leaf2, P.leaf3], seed, 402, k));
      col.add(x, 0, z, 1.0, 1.1, 1.0);
    } else {
      tree(g, col, x, z, 0.85 + frac(seed, 403, k) * 0.5, hash(seed, 404, k) % 3);
    }
  };
  let k = 0;
  for (let x = r.x0 + 8; x <= r.x1 - 8; x += 12) {
    place(x, r.z0 + bandOff, k++);                       // north band
    if (Math.abs(x - cx) > 6) place(x, r.z1 - bandOff, k++); // south band, skip gate
  }
  for (let z = r.z0 + 8; z <= r.z1 - 8; z += 12) {
    place(r.x0 + bandOff, z, k++);                       // west band
    place(r.x1 - bandOff, z, k++);                       // east band
  }
  cornerLamps(g, col, b);
}

export { buildCemetery };
