// Upper-class suburbs: larger two-storey houses (street rows or a cul-de-sac),
// driveways/garages, pools and fenced yards.
import { PALETTE as P, SIDEWALK_H } from '../../core/palette.js';
import { hash, frac } from '../../core/util.js';
import { house2 } from './pieces.js';
import { pool, swingSet, tree, flowerBed, parkedCar, fenceRun, scatterTrees } from './props.js';
import { slabAndSidewalk, groundStripe, lotGrid, cornerLamps } from './kit.js';

// upper class suburbs — larger two-storey houses, varied layout (cul-de-sac
// or street rows), driveways/garages, pools & fenced yards.
function buildSuburbA(g, col, b, seed) {
  const r = slabAndSidewalk(g, col, b, P.grassDark);
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  if (hash(seed, 1) % 3 === 0) return suburbCulDeSac(g, col, r, seed, b);

  const cols = 2 + hash(seed, 2) % 2; // 2..3 cols × 2 rows -> 4..6 houses
  lotGrid(r, 2, cols, (c) => {
    const s = hash(seed, c.i, c.j);
    const garage = hash(s, 40) % 4 !== 0;              // most; some older-style skip it
    const side = hash(s, 41) % 2 ? 1 : -1;
    const hz = c.lz + c.frontZ * c.cd * 0.04;
    const { w: hw, d: hd } = house2(g, col, c.lx, hz, s, c.ry, { garage, side });
    // paved driveway on the garage side, running out to the street
    const dvx = c.lx + side * (garage ? hw / 2 + 1.9 : hw * 0.3) * c.frontZ;
    const dz0 = hz + (hd / 2) * c.frontZ, dz1 = c.streetZ - c.frontZ * 0.4;
    groundStripe(g, dvx, (dz0 + dz1) / 2, garage ? 3.4 : 3.0, Math.abs(dz1 - dz0), P.concreteDark);
    if (hash(s, 17) % 2) parkedCar(g, col, dvx, dz0 + c.frontZ * 3.0, c.ry, hash(s, 18));
    // backyard: pool (or play set), specimen tree, flower bed near the door
    const byz = hz - c.frontZ * (hd / 2 + 4.5);
    if (hash(s, 23) % 3 !== 0) pool(g, col, c.lx - side * hw * 0.14, byz);
    else swingSet(g, col, c.lx, byz, c.ry);
    tree(g, col, c.lx - side * c.cw * 0.36, hz - c.frontZ * 2.0, 0.95 + frac(s, 5) * 0.5, hash(s, 6) % 3);
    if (hash(s, 26) % 2 === 0) flowerBed(g, col, c.lx + side * hw * 0.14, dz0 + c.frontZ * 1.2, hash(s, 27));
  });

  // tidy white picket fences: between columns and along the side streets
  for (let i = 1; i < cols; i++) {
    const fx = r.x0 + (w / cols) * i;
    fenceRun(g, col, fx, r.z0 + 1, fx, r.z1 - 1);
  }
  fenceRun(g, col, r.x0 + 1, r.z0 + 1, r.x0 + 1, r.z1 - 1);
  fenceRun(g, col, r.x1 - 1, r.z0 + 1, r.x1 - 1, r.z1 - 1);
  // dense, slightly larger landscaping trees
  scatterTrees(g, col, r, hash(seed, 210), 5.2, 0.9, 1.5);
  cornerLamps(g, col, b);
}

// Cul-de-sac variant of suburbA: houses ring a central paved court with a
// green island, each facing inward with a short driveway to the loop.
function suburbCulDeSac(g, col, r, seed, b) {
  const cx = r.cx, cz = r.cz;
  const R = 30, Rout = 22, Rin = 16;
  // paved court + raised grass island (island top proud of the paving, so no
  // coplanar faces) + a specimen tree and flowers on the island
  g.cyl(cx, SIDEWALK_H, cz, Rout, Rout, 0.05, P.concreteDark);
  g.cyl(cx, SIDEWALK_H, cz, Rin, Rin, 0.09, P.grassDark);
  tree(g, col, cx, cz, 1.4, 0);
  for (let k = 0; k < 5; k++) {
    const a = k * 1.256;
    flowerBed(g, col, cx + Math.cos(a) * (Rin - 4), cz + Math.sin(a) * (Rin - 4), hash(seed, 60, k));
  }

  // access road running out to one block edge, connecting the court to the
  // street. Drawn a hair taller (top 0.205) so it never fights the loop paving.
  const dirs = [[1, 0, 0], [0, 1, Math.PI / 2], [-1, 0, Math.PI], [0, -1, -Math.PI / 2]];
  const [ex, ez, phi] = dirs[hash(seed, 4) % 4];
  if (ex) {
    const x0 = cx + ex * Rin, edge = ex > 0 ? r.x1 : r.x0;
    groundStripe(g, (x0 + edge) / 2, cz, Math.abs(edge - x0), 6, P.concreteDark, 0, 0.055);
  } else {
    const z0 = cz + ez * Rin, edge = ez > 0 ? r.z1 : r.z0;
    groundStripe(g, cx, (z0 + edge) / 2, 6, Math.abs(edge - z0), P.concreteDark, 0, 0.055);
  }

  const N = 6 + hash(seed, 3) % 3; // 6..8 homes minus the entrance gap
  for (let k = 0; k < N; k++) {
    const th = (2 * Math.PI * k) / N + 0.3;
    let dd = (th - phi) % (2 * Math.PI);
    if (dd > Math.PI) dd -= 2 * Math.PI; else if (dd < -Math.PI) dd += 2 * Math.PI;
    if (Math.abs(dd) < 0.6) continue; // leave the gap for the access road
    const ct = Math.cos(th), st = Math.sin(th);
    const hx = cx + ct * R, hz = cz + st * R;
    const ry = Math.atan2(-ct, -st);          // front (local +z) points at centre
    const s = hash(seed, 70, k);
    const garage = hash(s, 40) % 3 !== 0;
    const { d: hd } = house2(g, col, hx, hz, s, ry, { garage, side: hash(s, 41) % 2 ? 1 : -1 });
    // radial driveway from the house front inward to the loop paving
    const rFront = R - hd / 2 - 0.2, rMid = (rFront + Rout) / 2;
    groundStripe(g, cx + ct * rMid, cz + st * rMid, 3.2, Math.max(1, rFront - Rout), P.concreteDark, Math.atan2(ct, st));
    if (hash(s, 17) % 2) parkedCar(g, col, cx + ct * (rFront - 1.5), cz + st * (rFront - 1.5), ry, hash(s, 18));
  }

  // trees everywhere outside the court and its access road
  const keepOut = (px, pz) => {
    if (Math.hypot(px - cx, pz - cz) < Rout + 2) return true;
    if (ex) return Math.abs(pz - cz) < 4.5 && (ex > 0 ? px > cx : px < cx);
    return Math.abs(px - cx) < 4.5 && (ez > 0 ? pz > cz : pz < cz);
  };
  scatterTrees(g, col, r, hash(seed, 220), 5.2, 0.9, 1.5, keepOut);
  cornerLamps(g, col, b);
}

export { buildSuburbA };
