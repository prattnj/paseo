// A run-down park: the same layout, but with a dry grimy fountain, dead-grass
// patches, overflowing dumpsters and trash strewn across the lawn.
import { PALETTE as P, SIDEWALK_H } from '../../core/palette.js';
import { hash, frac } from '../../core/util.js';
import { fountain, dumpster, bench, tree } from './props.js';
import { slabAndSidewalk, cornerLamps } from './kit.js';

// A run-down version of the typical park: same layout, but with a few
// scattered piles of trash strewn across the lawn.
function buildDirtyPark(g, col, b, seed) {
  const r = slabAndSidewalk(g, col, b, P.grass);
  const w = r.x1 - r.x0, d = r.z1 - r.z0;

  // paths: cross through the middle
  g.boxB(r.cx, SIDEWALK_H + 0.02, r.cz, w, 0.02, 3, P.path);
  g.boxB(r.cx, SIDEWALK_H + 0.02, r.cz, 3, 0.02, d, P.path);

  fountain(g, col, r.cx, r.cz, true); // dry, grimy fountain

  // deterministic tree scatter (same as the clean park)
  for (let k = 0; k < 26; k++) {
    const tx = r.x0 + 4 + frac(hash(seed, k, 1), 5) * (w - 8);
    const tz = r.z0 + 4 + frac(hash(seed, k, 2), 9) * (d - 8);
    if (Math.abs(tx - r.cx) < 3.5 || Math.abs(tz - r.cz) < 3.5) continue;
    tree(g, col, tx, tz, 0.8 + frac(seed, k, 3) * 0.7, hash(seed, k, 4) % 3);
  }
  // benches along paths
  // benches around the fountain, each turned to face it
  for (const [bx, bz] of [[r.cx - 6, r.cz + 2.4], [r.cx + 8, r.cz - 2.4], [r.cx + 2.4, r.cz + 9], [r.cx - 2.4, r.cz - 10]])
    bench(g, col, bx, bz, Math.atan2(r.cx - bx, r.cz - bz));

  const TRASH = [0x6b5b3e, 0x4a4440, 0x8a8f94, 0x5c5340, 0x746a52]; // muddy bags / sacks / grey
  const LITTER = [0xe04f43, 0xf4c542, 0x4a90d9, 0xf2f4f5, 0x8bc34a, 0xe07f9a, 0x9a6fc0];
  const offMid = (x, z) => Math.abs(x - r.cx) > 3.5 && Math.abs(z - r.cz) > 3.5; // off the cross paths
  // bare-dirt / dead-grass patches (staggered heights so overlaps don't fight)
  for (let k = 0; k < 12; k++) {
    const mx = r.x0 + 5 + frac(hash(seed, k, 61), 5) * (w - 10);
    const mz = r.z0 + 5 + frac(hash(seed, k, 62), 9) * (d - 10);
    if (!offMid(mx, mz)) continue;
    g.boxB(mx, SIDEWALK_H, mz, 3 + frac(seed, k, 63) * 4, 0.05 + (k % 3) * 0.004, 3 + frac(seed, k, 64) * 4,
      0x6a5f45, frac(seed, k, 65) * Math.PI);
  }
  // trash mounds: frequent, varied sizes (~1 in 4 is a big overflowing heap)
  for (let k = 0; k < 26; k++) {
    const px = r.x0 + 4 + frac(hash(seed, k, 21), 5) * (w - 8);
    const pz = r.z0 + 4 + frac(hash(seed, k, 22), 9) * (d - 8);
    if (!offMid(px, pz) || Math.hypot(px - r.cx, pz - r.cz) < 8) continue; // off paths + fountain
    const big = hash(seed, k, 40) % 4 === 0;
    const s = big ? 1.4 + frac(seed, k, 23) * 0.8 : 0.6 + frac(seed, k, 23) * 0.6;
    // a lumpy mound (a couple of overlapping blobs)
    g.ico(px, SIDEWALK_H + 0.2 * s, pz, 0.5 * s, TRASH[hash(seed, k, 24) % TRASH.length]);
    g.ico(px + 0.4 * s, SIDEWALK_H + 0.16 * s, pz - 0.3 * s, 0.36 * s, TRASH[hash(seed, k, 25) % TRASH.length]);
    col.add(px, 0, pz, 1.7 * s, 0.7 * s, 1.7 * s);
    for (let j = 0; j < (big ? 7 : 3); j++) {
      const ox = (frac(hash(seed, k, 25), 3 + j) - 0.5) * 2.8 * s;
      const oz = (frac(hash(seed, k, 26), 5 + j) - 0.5) * 2.8 * s;
      g.boxB(px + ox, SIDEWALK_H + 0.08, pz + oz, 0.4 * s, 0.16, 0.28 * s,
        LITTER[hash(seed, k, 31 + j) % LITTER.length], frac(seed, k, 30 + j) * Math.PI);
    }
  }
  // loose litter strewn all over the lawn
  for (let k = 0; k < 80; k++) {
    const lx = r.x0 + 3 + frac(hash(seed, k, 51), 5) * (w - 6);
    const lz = r.z0 + 3 + frac(hash(seed, k, 52), 9) * (d - 6);
    if (Math.abs(lx - r.cx) < 2.5 && Math.abs(lz - r.cz) < 2.5) continue;
    g.boxB(lx, SIDEWALK_H + 0.06, lz, 0.28 + frac(seed, k, 54) * 0.3, 0.1, 0.18 + frac(seed, k, 55) * 0.2,
      LITTER[hash(seed, k, 56) % LITTER.length], frac(seed, k, 53) * Math.PI);
  }
  // overflowing dumpsters near the paths (a heap of trash spilling over the lid)
  for (const [dxo, dzo, dry2] of [[w * 0.28, 6, 0], [-w * 0.30, -6, Math.PI / 2]]) {
    const dx1 = r.cx + dxo, dz1 = r.cz + dzo;
    dumpster(g, col, dx1, dz1, dry2, hash(seed, 80, dxo | 0));
    for (let j = 0; j < 4; j++) {
      const ox = (frac(hash(seed, 82, j), dxo | 0) - 0.5) * 2.2;
      const oz = (frac(hash(seed, 83, j), dzo | 0) - 0.5) * 1.2;
      g.ico(dx1 + ox, SIDEWALK_H + 1.5, dz1 + oz, 0.35 + frac(seed, 84, j) * 0.25, TRASH[hash(seed, 85, j) % TRASH.length]);
    }
  }
  cornerLamps(g, col, b);
}

export { buildDirtyPark };
