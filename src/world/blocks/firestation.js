// Public-safety block: fire station + apparatus garage (two driveable trucks)
// on the left half, police station + cruiser lot on the right.
import { PALETTE as P, SIDEWALK_H } from '../../core/palette.js';
import { hash } from '../../core/util.js';
import { bigBuilding } from './pieces.js';
import { parkedCar, tree, planter } from './props.js';
import { slabAndSidewalk, parkingLotAt, wallSign, cornerLamps, concreteScoring } from './kit.js';

// Public-safety block: fire station + apparatus garage (with two driveable
// fire trucks) on the left half, police station + cruiser lot on the right.
function buildFireStation(g, col, b, seed, scene) {
  const r = slabAndSidewalk(g, col, b, P.concrete);
  concreteScoring(g, r, 9);
  const gy = SIDEWALK_H + 0.2, y = SIDEWALK_H;
  const cx = r.cx, cz = r.cz;
  const RED = 0xd6362f, POLICE = 0x2b4a7a;
  const lcx = (r.x0 + cx) / 2, rcx = (cx + r.x1) / 2; // left/right half centres

  // ---- FIRE: station (north) + apparatus garage (south) ----
  bigBuilding(g, col, lcx, r.z0 + 15, 42, 26, 3, RED, P.white, 1);
  // hose-drying / training tower in the yard
  g.boxB(r.x0 + 7, y, cz - 4, 5.5, 16, 5.5, P.concreteDark);
  col.add(r.x0 + 7, 0, cz - 4, 5.5, 16, 5.5);
  // staff parking in the yard
  parkingLotAt(g, col, lcx + 3, cz + 4, 36, 16, gy, hash(seed, 6), 0, null, 5);
  // apparatus garage: 3-sided shell, bay front open toward +z
  const gW = 42, gD = 24, gH = 8, gcz = r.z1 - 19, front = gcz + gD / 2;
  g.boxB(lcx, y, gcz - gD / 2, gW, gH, 1.4, P.offwhite); col.add(lcx, 0, gcz - gD / 2, gW, gH, 1.4);
  for (const sx of [-1, 1]) { const wx = lcx + sx * (gW / 2 - 0.7); g.boxB(wx, y, gcz, 1.4, gH, gD, P.offwhite); col.add(wx, 0, gcz, 1.4, gH, gD); }
  g.boxB(lcx, y + gH, gcz, gW + 0.6, 0.7, gD + 0.6, P.roofLight);            // roof
  g.boxB(lcx, y + gH - 2.0, front - 0.4, gW - 0.4, 2.0, 0.9, P.offwhite);    // header over the bays
  g.box(lcx, y + gH - 0.9, front + 0.1, gW - 1, 1.2, 0.2, RED);             // red fascia band
  g.boxB(lcx, y, front - 0.6, 1.6, gH - 2.0, 1.4, P.offwhite); col.add(lcx, 0, front - 0.6, 1.6, gH - 2.0, 1.4); // centre pillar
  g.boxB(lcx, SIDEWALK_H + 0.04, front + 3, gW, 0.02, 6, P.concreteDark);   // apron, just above the slab
  // the two driveable fire trucks, nosed toward the exit (+z)
  parkedCar(g, col, lcx - 10, gcz - 1, 0, hash(seed, 1), gy + 0.02, 'ladder');
  parkedCar(g, col, lcx + 10, gcz - 1, 0, hash(seed, 2), gy + 0.02, 'pumper');
  g.cyl(r.x0 + 4, gy, front + 4, 0.22, 0.26, 0.9, RED);                     // hydrant

  // ---- POLICE: station (north) + cruiser lot (south) ----
  bigBuilding(g, col, rcx, r.z0 + 15, 42, 26, 3, POLICE, 0xdbb84a, 1);
  parkingLotAt(g, col, rcx, cz + 12, 42, 46, gy, hash(seed, 3), 0, 'police', 8);
  // concrete monument sign against the police station, facing the forecourt
  wallSign(g, col, scene, rcx - 15, gy, r.z0 + 29, 9, 'NOSH CITY POLICE', 1);
  // green strip with trees between the police lot and the south road
  g.boxB(rcx, gy + 0.02, r.z1 - 6, 42, 0.02, 10, P.grass);
  for (const tx of [rcx - 16, rcx - 5, rcx + 6, rcx + 16]) tree(g, col, tx, r.z1 - 6, 0.8, hash(seed, tx | 0) % 3);

  // shared forecourt: flagpole, greenery, lamps
  g.cyl(cx, gy, r.z0 + 32, 0.1, 0.14, 10, P.white, 6);
  g.box(cx + 1.3, gy + 8.6, r.z0 + 32, 2.4, 1.4, 0.08, POLICE);
  col.add(cx, 0, r.z0 + 32, 0.4, 10, 0.4);
  planter(g, col, cx - 6, r.z0 + 32); planter(g, col, cx + 6, r.z0 + 32);
  for (const tx of [r.x0 + 10, r.x1 - 10]) tree(g, col, tx, r.z0 + 34, 0.8, 1);
  cornerLamps(g, col, b);
}

export { buildFireStation };
