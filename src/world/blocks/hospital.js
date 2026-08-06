// Hospital complex: a tall main building with a rooftop helipad and red-cross
// emblem, a lower ER wing with an ambulance canopy, and a large parking lot.
import { PALETTE as P, SIDEWALK_H } from '../../core/palette.js';
import { hash } from '../../core/util.js';
import { bigBuilding } from './pieces.js';
import { tree, bench, parkedCar } from './props.js';
import { slabAndSidewalk, parkingLotAt, wallSign, cornerLamps } from './kit.js';

// Hospital complex filling the block: a tall main building with a rooftop
// helipad and a red-cross emblem, a lower ER wing with an ambulance canopy,
// and a large parking lot.
function buildHospital(g, col, b, seed, scene) {
  const r = slabAndSidewalk(g, col, b, P.concrete);
  const gy = SIDEWALK_H + 0.2, y = SIDEWALK_H;
  const cx = r.cx, cz = r.cz, w = r.x1 - r.x0;
  const RED = 0xd94f4f, floors = 7, mh = floors * 3.5;
  // main hospital building, tall, north (entrance faces the forecourt +z)
  bigBuilding(g, col, cx, r.z0 + 18, w - 10, 32, floors, P.offwhite, RED, 1);
  // rooftop helipad
  const hpx = cx + w * 0.22, hpz = r.z0 + 12, roofY = y + mh + 0.7;
  g.cyl(hpx, roofY, hpz, 5, 5, 0.2, P.concreteDark, 14);
  g.cyl(hpx, roofY + 0.04, hpz, 4, 4, 0.15, 0xf2c14e, 14);
  for (const dx of [-1.3, 1.3]) g.box(hpx + dx, roofY + 0.2, hpz, 0.5, 0.06, 2.6, P.white);
  g.box(hpx, roofY + 0.2, hpz, 2.6, 0.06, 0.5, P.white);            // H crossbar
  // red-cross emblem on the front facade
  const fz = r.z0 + 34 + 0.25;
  g.box(cx - w * 0.26, y + mh * 0.66, fz, 1.1, 4.2, 0.3, RED);
  g.box(cx - w * 0.26, y + mh * 0.66, fz, 4.2, 1.1, 0.3, RED);
  // ER wing (lower) + ambulance canopy, south-west
  bigBuilding(g, col, r.x0 + 22, cz + 12, 34, 30, 2, P.offwhite, RED, -1);
  const erz = cz + 12 - 18;
  g.box(r.x0 + 22, y + 4.2, erz, 18, 0.4, 7, RED);                  // canopy
  for (const dx of [-8, 8]) g.cyl(r.x0 + 22 + dx, gy, erz - 3, 0.16, 0.18, 4.2, P.concreteDark);
  g.box(r.x0 + 22, y + 5.7, erz + 3.4, 6, 1.2, 0.3, P.white);       // ER sign
  parkedCar(g, col, r.x0 + 10, erz, Math.PI / 2, hash(seed, 20), gy + 0.01, 'truck'); // ambulance
  // large parking lot, south-east
  parkingLotAt(g, col, r.x1 - 26, cz + 20, 44, 46, gy, hash(seed, 5));
  tree(g, col, r.x0 + 9, r.z0 + 40, 0.9, 1); tree(g, col, cx, r.z0 + 42, 0.9, 0);
  bench(g, col, cx - 8, r.z0 + 42, 0); bench(g, col, cx + 8, r.z0 + 42, 0);
  // south-west garden fills the empty corner by the ER wing
  g.boxB(r.x0 + 19, gy + 0.02, r.z1 - 11, 38, 0.02, 22, P.grass);
  tree(g, col, r.x0 + 7, r.z1 - 8, 1.0, 0); tree(g, col, r.x0 + 19, r.z1 - 15, 0.9, 1);
  tree(g, col, r.x0 + 32, r.z1 - 7, 1.0, 2); tree(g, col, r.x0 + 12, r.z1 - 19, 0.8, 1);
  bench(g, col, r.x0 + 25, r.z1 - 6, 0);
  // concrete monument sign against the building, east of the entrance, facing out
  wallSign(g, col, scene, cx + w * 0.2, gy, r.z0 + 35, 14, 'DAWSON J. TAYLOR MEMORIAL HOSPITAL', 1);
  cornerLamps(g, col, b);
}

export { buildHospital };
