// Neighborhood park: a soccer pitch on one half, a wooded serpentine-path half
// on the other, with benches, flower beds and a memorial sign.
import * as THREE from 'three';
import { PALETTE as P, SIDEWALK_H } from '../palette.js';
import { hash, frac } from '../util.js';
import { ribbon } from '../curve.js';
import { BALL_SPAWNS } from '../balls.js';
import { tree, bench, flowerBed, scatterTrees } from './props.js';
import { slabAndSidewalk, groundStripe, cornerLamps, wallSign } from './kit.js';

// Marked-out soccer pitch centred at (cx,cz): fw along x, fd along z. Mowed
// stripes, painted lines, centre circle, penalty boxes and two goals. Heights
// are staggered (stripes < lines < spot) so nothing coplanar z-fights.
function soccerField(g, col, cx, cz, fw, fd) {
  const y = SIDEWALK_H, LINE = 0xf2f4f5, lw = 0.3;
  const x0 = cx - fw / 2, x1 = cx + fw / 2, z0 = cz - fd / 2, z1 = cz + fd / 2;
  // mowed stripes (alternating greens, slightly staggered height at the seams)
  const n = 10, sd = fd / n;
  for (let i = 0; i < n; i++) {
    g.boxB(cx, SIDEWALK_H, z0 + sd * (i + 0.5), fw, 0.05 + (i % 2) * 0.004, sd, i % 2 ? 0x74be47 : 0x84cf55);
  }
  const line = (lx, lz, sx, sz) => g.boxB(lx, SIDEWALK_H, lz, sx, 0.056, sz, LINE);
  // boundary + halfway
  line(cx, z0, fw, lw); line(cx, z1, fw, lw);
  line(x0, cz, lw, fd); line(x1, cz, lw, fd);
  line(cx, cz, fw, lw);
  // centre circle (white disc carved back to a ring by a proud green disc) + spot
  g.cyl(cx, SIDEWALK_H, cz, 4.5, 4.5, 0.056, LINE);
  g.cyl(cx, SIDEWALK_H, cz, 3.9, 3.9, 0.062, 0x7abf4c);
  g.boxB(cx, SIDEWALK_H, cz, 0.5, 0.066, 0.5, LINE);
  // penalty boxes + goals at both ends
  for (const zz of [z0, z1]) {
    const dir = zz === z0 ? 1 : -1;
    line(cx, zz + dir * 8, 18, lw);
    line(cx - 9, zz + dir * 4, lw, 8); line(cx + 9, zz + dir * 4, lw, 8);
    for (const gx of [-3.3, 3.3]) {
      g.boxB(cx + gx, y, zz, 0.2, 2.3, 0.2, LINE);
      col.add(cx + gx, 0, zz, 0.24, 2.3, 0.24); // post only — the mouth stays open
    }
    g.box(cx, y + 2.25, zz, 6.8, 0.2, 0.2, LINE);
    col.add(cx, y + 2.15, zz, 6.8, 0.2, 0.24);   // crossbar (up high; walk/drive under)
  }
}

// Distance from (px,pz) to a polyline, for path keep-outs.
function distToPath(px, pz, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(px - (ax + dx * t), pz - (az + dz * t)));
  }
  return best;
}

function buildPark(g, col, b, seed, scene = null) {
  const r = slabAndSidewalk(g, col, b, P.grass);
  const w = r.x1 - r.x0, d = r.z1 - r.z0;

  // Split into halves along x: one gets a soccer pitch, the other a wood with
  // a winding path. Which side is which flips per park for variety.
  const soccerWest = hash(seed, 1) % 2 === 0;
  const fieldCx = soccerWest ? r.x0 + w * 0.25 : r.x1 - w * 0.25;
  const fx0 = soccerWest ? r.cx : r.x0, fx1 = soccerWest ? r.x1 : r.cx; // wooded half

  soccerField(g, col, fieldCx, r.cz, w * 0.42, d - 22);
  BALL_SPAWNS.push({ x: fieldCx, z: r.cz }); // pushable ball at the centre spot

  // path down the dividing line (connects the two street edges); a hair taller
  // so it cleanly covers the wooded path where it tees off.
  groundStripe(g, r.cx, r.cz, 3, d, P.path, 0, 0.055);

  // A smooth serpentine path threading the wooded half, rendered as one
  // seamless ribbon (same helper as the coastal paths) so the bends have no
  // faceted joints.
  const inX = soccerWest ? 1 : -1; // direction into the wood
  const near = r.cx, far = soccerWest ? r.x1 - 2 : r.x0 + 2;
  const span = Math.abs(far - near);
  const ctrl = [
    [near, r.cz], [near + inX * span * 0.28, r.cz - d * 0.22],
    [near + inX * span * 0.52, r.cz + d * 0.24], [near + inX * span * 0.78, r.cz - d * 0.14],
    [far, r.cz + d * 0.05],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal');
  const n = Math.max(24, Math.round(curve.getLength() / 2));
  const ts = [];
  for (let k = 0; k <= n; k++) ts.push(k / n);
  if (scene) ribbon(scene, curve, ts, -1.4, 1.4, 0.20, P.path);
  const pathPts = ts.map((t) => { const p = curve.getPointAt(t); return [p.x, p.z]; });

  // fairly dense trees in the wooded half, kept off the paths
  const wood = { x0: Math.min(fx0, fx1) + 1, x1: Math.max(fx0, fx1) - 1, z0: r.z0 + 1, z1: r.z1 - 1 };
  const keepOut = (px, pz) => Math.abs(px - r.cx) < 2.4 || distToPath(px, pz, pathPts) < 2.6;
  scatterTrees(g, col, wood, hash(seed, 200), 4.7, 0.8, 1.4, keepOut);

  // benches along the divider path + a couple of flower beds on the field edge
  bench(g, col, r.cx - 2.2, r.cz - d * 0.28, -Math.PI / 2);
  bench(g, col, r.cx + 2.2, r.cz + d * 0.28, Math.PI / 2);
  const fieldEdge = soccerWest ? r.cx - 3 : r.cx + 3;
  flowerBed(g, col, fieldEdge, r.cz - d * 0.30, hash(seed, 81));
  flowerBed(g, col, fieldEdge, r.cz + d * 0.30, hash(seed, 82));

  // concrete memorial-park sign, behind the goal on the field half, facing the
  // south street.
  const name = b.i < 8 ? 'HAYDEN T. HEATON MEMORIAL PARK' : 'BRANDON T. SMITH MEMORIAL PARK';
  if (scene) wallSign(g, col, scene, fieldCx, SIDEWALK_H, r.z1 - 3, 22, name, 1);
  cornerLamps(g, col, b);
}

export { buildPark };
