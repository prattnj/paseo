// School campus: a classroom wing, a gym, a small park, a staff lot and an
// entrance plaza with a flagpole.
import { PALETTE as P, SIDEWALK_H } from '../../core/palette.js';
import { hash } from '../../core/util.js';
import { bigBuilding } from './pieces.js';
import { fountain, tree, bench, flowerBed } from './props.js';
import { slabAndSidewalk, parkingLotAt, wallSign, cornerLamps } from './kit.js';

// sports field, a staff parking lot, and an entrance plaza with a flagpole.
function buildSchool(g, col, b, seed, scene) {
  const r = slabAndSidewalk(g, col, b, P.concrete);
  const gy = SIDEWALK_H + 0.2, y = SIDEWALK_H;
  const cx = r.cx, cz = r.cz, w = r.x1 - r.x0;
  // main classroom wing along the north edge, entrance facing the yard (+z)
  bigBuilding(g, col, cx, r.z0 + 15, w - 8, 24, 3, 0xb5654a, 0xf2c14e, 1);
  // gym: taller, east-central, entrance facing the yard (-z)
  bigBuilding(g, col, r.x1 - 20, cz + 4, 30, 28, 4, 0xcdb89a, 0x4a90d9, -1);
  // small park, south-west: lawn, crossing paths, fountain, trees, benches
  g.boxB(r.x0 + 27, gy + 0.02, r.z1 - 26, 48, 0.02, 44, P.grass);
  g.boxB(r.x0 + 27, gy + 0.05, r.z1 - 26, 5, 0.02, 44, P.path);
  g.boxB(r.x0 + 27, gy + 0.05, r.z1 - 26, 48, 0.02, 5, P.path);
  fountain(g, col, r.x0 + 27, r.z1 - 26);
  tree(g, col, r.x0 + 12, r.z1 - 14, 1.0, 0); tree(g, col, r.x0 + 44, r.z1 - 14, 1.0, 1);
  tree(g, col, r.x0 + 12, r.z1 - 38, 0.9, 2); tree(g, col, r.x0 + 42, r.z1 - 38, 0.9, 0);
  bench(g, col, r.x0 + 20, r.z1 - 26, Math.PI / 2); bench(g, col, r.x0 + 34, r.z1 - 26, -Math.PI / 2);
  flowerBed(g, col, r.x0 + 17, r.z1 - 19, hash(seed, 30)); flowerBed(g, col, r.x0 + 38, r.z1 - 33, hash(seed, 31));
  // staff / visitor parking lot, south-east
  parkingLotAt(g, col, r.x1 - 22, r.z1 - 14, 40, 22, gy, hash(seed, 5));
  // concrete monument sign against the building, beside the entrance, facing out
  wallSign(g, col, scene, cx - w * 0.22 - 8, gy, r.z0 + 28, 12, 'NOSH CITY SCHOOL DISTRICT', 1);
  // entrance plaza + flagpole + bike racks between the wing and the yard
  g.boxB(cx, gy + 0.02, r.z0 + 33, w * 0.5, 0.02, 12, P.path);
  g.cyl(cx - w * 0.2, gy, r.z0 + 33, 0.1, 0.14, 10, P.white, 6);
  g.box(cx - w * 0.2 + 1.3, gy + 8.6, r.z0 + 33, 2.4, 1.4, 0.08, 0xe04f43); // flag
  col.add(cx - w * 0.2, 0, r.z0 + 33, 0.4, 10, 0.4);
  for (const dx of [-3, 0, 3]) g.box(cx + w * 0.18 + dx, gy + 0.5, r.z0 + 33, 0.1, 1.0, 1.8, P.concreteDark); // bike racks
  tree(g, col, r.x0 + 9, r.z0 + 34, 0.9, 0); tree(g, col, cx + w * 0.32, r.z0 + 34, 0.9, 1);
  bench(g, col, cx - 6, r.z0 + 38, 0); bench(g, col, cx + 6, r.z0 + 38, 0);
  cornerLamps(g, col, b);
}

export { buildSchool };
