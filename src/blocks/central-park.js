// The central park: two forested hills, a formal reflecting pool, and dense
// undergrowth threading between them.
import * as THREE from 'three';
import { PALETTE as P, SIDEWALK_H } from '../palette.js';
import { hash, frac } from '../util.js';
import { HILL, hillsInRect, hillRadii, hillHeight, POND } from '../island.js';
import { tree, bench, flowerBed } from './props.js';
import { slabAndSidewalk, cornerLamps } from './kit.js';

// The central park: two forested hills, a formal reflecting pool on the east
// side, a diagonal boulevard and dense undergrowth threading between them.
function buildCentralPark(g, col, b, seed, scene = null) {
  const r = slabAndSidewalk(g, col, b, P.grass, null, HILL);
  const w = r.x1 - r.x0, d = r.z1 - r.z0;

  // pick up whatever hills fall inside this park block, oval or round, and
  // treat each as a circle of its larger radius for path/keep-out clipping
  const hills = hillsInRect(b.x0, b.z0, b.x1, b.z1).map((H) => {
    const { rx, rz } = hillRadii(H);
    return { x: H.x, z: H.z, r: Math.max(rx, rz) };
  });
  const offHills = (x, z) => hills.every((H) => Math.hypot(x - H.x, z - H.z) > H.r + 2);

  // reflecting-pool footprint (interior water + stone coping)
  const px = POND.x, pz = POND.z, hx = POND.hx, hz = POND.hz, RIMW = 1.2;
  const pOut = { x0: px - hx - RIMW, x1: px + hx + RIMW, z0: pz - hz - RIMW, z1: pz + hz + RIMW };
  const offPool = (x, z, m = 5) => x < pOut.x0 - m || x > pOut.x1 + m || z < pOut.z0 - m || z > pOut.z1 + m;

  // ---- formal reflecting pool: stone bottom, coping rim, still water ----
  // RIM = coping height above the lawn; the floor sits BOT above the lawn, so
  // the water depth (surface -> floor) is ~RIM-BOT. Lowered floor => ~2x depth.
  {
    const gy = SIDEWALK_H, RIM = 0.5, BOT = 0.235, TILE = 0xb7c2c9;
    const bhx = hx + RIMW / 2, bhz = hz + RIMW / 2; // bottom tucks halfway under the rim
    g.boxB(px, gy, pz, bhx * 2, BOT, bhz * 2, TILE);
    col.add(px, 0, pz, bhx * 2, BOT, bhz * 2);
    const rim = (bx, bz, bw, bd) => { g.boxB(bx, gy, bz, bw, RIM, bd, P.concrete); col.add(bx, 0, bz, bw, RIM, bd); };
    rim(px, pz - hz - RIMW / 2, hx * 2 + RIMW * 2, RIMW);
    rim(px, pz + hz + RIMW / 2, hx * 2 + RIMW * 2, RIMW);
    rim(px - hx - RIMW / 2, pz, RIMW, hz * 2);
    rim(px + hx + RIMW / 2, pz, RIMW, hz * 2);
    if (scene) {
      const water = new THREE.Mesh(
        new THREE.BoxGeometry((hx - 0.15) * 2, 0.25, (hz - 0.15) * 2),
        new THREE.MeshLambertMaterial({ color: 0x3fa9dc, transparent: true, opacity: 0.68, depthWrite: false })
      );
      water.position.set(px, gy + RIM - 0.16, pz); // surface just under the coping
      scene.add(water);
    }
  }

  // densely fill every flat patch with trees: a jittered grid, keeping off the
  // hills and the pool (the hills' own forest covers their slopes)
  const STEP = 4.2, JIT = STEP * 0.42;
  let tk = 0;
  for (let gx = r.x0 + 2; gx < r.x1 - 1; gx += STEP) {
    for (let gz = r.z0 + 2; gz < r.z1 - 1; gz += STEP) {
      const jx = gx + (frac(hash(seed, tk, 1), 5) - 0.5) * 2 * JIT;
      const jz = gz + (frac(hash(seed, tk, 2), 9) - 0.5) * 2 * JIT;
      tk++;
      if (jx < r.x0 + 1 || jx > r.x1 - 1 || jz < r.z0 + 1 || jz > r.z1 - 1) continue;
      if (!offHills(jx, jz) || !offPool(jx, jz, 3)) continue;
      if (hash(seed, tk, 5) % 7 === 0) { // occasional bush instead of a tree
        const leafs = [P.leaf1, P.leaf2, P.leaf3];
        g.ico(jx, SIDEWALK_H + 0.32, jz, 0.5 + frac(seed, tk, 6) * 0.5, leafs[hash(seed, tk, 7) % 3]);
      } else {
        tree(g, col, jx, jz, 0.75 + frac(seed, tk, 3) * 0.7, hash(seed, tk, 4) % 3);
      }
    }
  }

  // benches and flower beds along BOTH long walks of the pool (skip any that
  // land on a hill). side = -1 west (face east), +1 east (face west). Uses the
  // exact (elliptical) hill height so the narrow strip beside an oval hill
  // isn't wrongly rejected by the circle approximation.
  const okSpot = (x, z) => hillHeight(x, z) < 0.6 && offPool(x, z, 1);
  for (const side of [-1, 1]) {
    const edge = side < 0 ? pOut.x0 : pOut.x1;
    for (let z = pz - hz + 6; z <= pz + hz - 6; z += 12) {
      const bx = edge + side * 3.2;
      if (okSpot(bx, z)) bench(g, col, bx, z, side < 0 ? Math.PI / 2 : -Math.PI / 2);
    }
    for (let z = pz - hz + 12; z <= pz + hz - 6; z += 15) {
      const fx = edge + side * 1.6;
      if (okSpot(fx, z)) flowerBed(g, col, fx, z, hash(seed, Math.round(z), side));
    }
  }
  cornerLamps(g, col, b);
}

export { buildCentralPark };
