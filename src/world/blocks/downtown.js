// Downtown: tile the block with a tight grid of skyscrapers, every footprint
// reaching the sidewalk on the block's outer edges.
import { PALETTE as P } from '../../core/palette.js';
import { hash, frac } from '../../core/util.js';
import { tower } from './pieces.js';
import { slabAndSidewalk, cornerLamps } from './kit.js';

function buildDowntown(g, col, b, seed) {
  const r = slabAndSidewalk(g, col, b, P.concrete);
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  // Tile the whole block with a tight grid of towers — no empty space, and
  // every footprint reaches the sidewalk on the block's outer edges. Interior
  // partition lines get a thin seam so adjacent towers read as separate
  // buildings (and their coplanar walls don't z-fight).
  const layouts = [[2, 1], [1, 2], [2, 2]];
  const [nx, nz] = layouts[hash(seed, 1) % layouts.length];
  // split coordinates, nudged off-centre so tower footprints vary in size
  const xs = [r.x0];
  for (let i = 1; i < nx; i++) xs.push(r.x0 + w * (i / nx + (frac(seed, i, 2) - 0.5) * 0.18));
  xs.push(r.x1);
  const zs = [r.z0];
  for (let j = 1; j < nz; j++) zs.push(r.z0 + d * (j / nz + (frac(seed, j, 3) - 0.5) * 0.18));
  zs.push(r.z1);
  const pad = 0.5; // half the seam width between neighbouring towers
  let k = 0;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const sx0 = xs[i] + (i > 0 ? pad : 0), sx1 = xs[i + 1] - (i < nx - 1 ? pad : 0);
      const sz0 = zs[j] + (j > 0 ? pad : 0), sz1 = zs[j + 1] - (j < nz - 1 ? pad : 0);
      const ts = hash(seed, k, 9);
      const floors = 8 + (hash(ts, 4) % 15); // 8..22 storeys for a varied skyline
      tower(g, col, (sx0 + sx1) / 2, (sz0 + sz1) / 2, sx1 - sx0, sz1 - sz0, floors, ts, r);
      k++;
    }
  }
  cornerLamps(g, col, b);
}

export { buildDowntown };
