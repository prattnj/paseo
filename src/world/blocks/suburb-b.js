// Lower-class suburbs: dense 4-row layout of worn single-storey houses, dirt
// paths instead of driveways, some strewn with trash, trees crammed everywhere.
import { PALETTE as P, SIDEWALK_H } from '../../core/palette.js';
import { hash, frac } from '../../core/util.js';
import { house } from './pieces.js';
import { dumpster, parkedCar, tree, trashCluster, scatterTrees } from './props.js';
import { slabAndSidewalk, groundStripe, lotGrid, cornerLamps } from './kit.js';

// lower class suburbs — dense 4-row layout (~14–15 homes), dirt paths instead
// of driveways, worn houses, some strewn with trash, trees crammed everywhere.
function buildSuburbB(g, col, b, seed) {
  const r = slabAndSidewalk(g, col, b, P.grassDark);
  const DIRT = 0x7d6a4e;
  const cols = 4; // every suburbB block is now the dense 4-row layout
  groundStripe(g, r.cx, r.cz, r.x1 - r.x0, 3.6, DIRT); // central dirt lane

  lotGrid(r, 4, cols, (c) => {
    // drop the odd lot for ragged variation (-> ~14–15 homes)
    if (hash(seed, c.i * 7 + c.j, 90) % 7 === 0) return;
    const s = hash(seed, c.i, c.j);
    const hz = c.lz + c.frontZ * c.cd * 0.08;
    house(g, col, c.lx, hz, s, c.ry);
    // dirt path from the front toward the street/lane (short of the lane)
    const px = c.lx + c.cw * 0.22 * (hash(s, 3) % 2 ? 1 : -1);
    const pz0 = hz + c.frontZ * 3.2, pz1 = c.streetZ - c.frontZ * (c.laneSide ? 2.8 : 0.8);
    groundStripe(g, px, (pz0 + pz1) / 2, 2.2, Math.abs(pz1 - pz0), DIRT);
    if (hash(s, 17) % 3 === 0) parkedCar(g, col, px, hz + c.frontZ * 2.2, c.ry, hash(s, 18));
    if (hash(s, 9) % 3 !== 0) tree(g, col, c.lx - c.cw * 0.28, hz - c.frontZ * 2.2, 0.65 + frac(s, 5) * 0.4, hash(s, 6) % 3);
    // trash strewn around some houses
    if (hash(s, 50) % 3 === 0) {
      for (let k = 0, n = 1 + hash(s, 51) % 2; k < n; k++) {
        const tx = c.lx + (frac(s, 52, k) - 0.5) * c.cw * 0.7;
        const tz = hz - c.frontZ * (1.5 + frac(s, 53, k) * 2.5);
        trashCluster(g, col, tx, tz, hash(s, 54, k), 0.7 + frac(s, 55, k) * 0.5);
      }
    }
    // occasional back shed or roadside dumpster
    if (hash(s, 19) % 4 === 0) {
      const shx = c.lx - c.cw * 0.28, shz = hz - c.frontZ * 3.0;
      g.boxB(shx, SIDEWALK_H, shz, 2.6, 2.1, 2.2, P.trunk);
      g.prism(shx, SIDEWALK_H + 2.1, shz, 3.0, 1.0, 2.6, P.roofDark);
      col.add(shx, 0, shz, 2.6, 3.1, 2.2);
    } else if (hash(s, 20) % 5 === 0) {
      dumpster(g, col, c.lx + c.cw * 0.34, hz + c.frontZ * 3.0, c.ry, hash(s, 21));
    }
  });
  // dense trees crammed into every gap (overgrown, unkempt feel)
  scatterTrees(g, col, r, hash(seed, 200), 4.95, 0.6, 1.2);
  cornerLamps(g, col, b);
}

export { buildSuburbB };
