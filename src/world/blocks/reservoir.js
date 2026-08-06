// A square dirt berm brim-full of deep water: a smooth walkable slope up to a
// fenced crest with one inconspicuous gap in the fence.
import * as THREE from 'three';
import { PALETTE as P } from '../../core/palette.js';
import { RESERVOIR, bermHeight } from '../island.js';
import { slabAndSidewalk, ironFence, cornerLamps } from './kit.js';

// A square dirt berm brim-full of deep water (drowns the player — see
// island.js RESERVOIR / player.js). Walkable stepped slope up to a fenced
// crest with grass patches and one inconspicuous gap in the fence.
function buildReservoir(g, col, b, seed, scene = null) {
  slabAndSidewalk(g, col, b, 0x5c4a30); // dirt ground (mostly hidden under the berm)
  const R = RESERVOIR, cx = R.cx, cz = R.cz;
  const DIRT = 0x6e5a3c, GRASS = 0x6db24a;

  // Smooth berm as one triangulated terrain mesh — the physics matches it via
  // island.reservoirGround, so the slope is a smooth walkable hill, not steps.
  if (scene) {
    const seg = 12;
    const loop = (hd, y) => {
      const p = [], C = [[-hd, -hd], [hd, -hd], [hd, hd], [-hd, hd]];
      for (let c = 0; c < 4; c++) {
        const [ax, az] = C[c], [bx, bz] = C[(c + 1) % 4];
        for (let s = 0; s < seg; s++) { const t = s / seg; p.push([cx + ax + (bx - ax) * t, y, cz + az + (bz - az) * t]); }
      }
      return p;
    };
    const rings = [];
    const NS = 8; // rings along the rounded outer slope
    for (let i = 0; i <= NS; i++) { const hd = R.outHalf - (R.outHalf - R.crestOut) * (i / NS); rings.push(loop(hd, bermHeight(hd))); }
    rings.push(loop(R.waterHalf, R.crestY)); // crest inner edge
    rings.push(loop(R.waterHalf, R.baseY));  // sheer inner retaining wall
    const pos = [];
    const tri = (A, B, C2) => pos.push(A[0], A[1], A[2], B[0], B[1], B[2], C2[0], C2[1], C2[2]);
    for (let r = 0; r < rings.length - 1; r++) {
      const A = rings[r], B = rings[r + 1], n = A.length;
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; tri(A[i], B[i], B[j]); tri(A[i], B[j], A[j]); }
    }
    const fl = R.waterHalf; // basin floor
    tri([cx - fl, R.baseY, cz - fl], [cx + fl, R.baseY, cz + fl], [cx + fl, R.baseY, cz - fl]);
    tri([cx - fl, R.baseY, cz - fl], [cx - fl, R.baseY, cz + fl], [cx + fl, R.baseY, cz + fl]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: DIRT, side: THREE.DoubleSide }));
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // twice-as-tall wrought-iron fence on the crest, with one inconspicuous gap
  const f = R.fenceHalf, y = R.crestY, hx = cx + 9;
  ironFence(g, col, cx - f, cz - f, cx + f, cz - f, y, 2);   // north
  ironFence(g, col, cx - f, cz - f, cx - f, cz + f, y, 2);   // west
  ironFence(g, col, cx + f, cz - f, cx + f, cz + f, y, 2);   // east
  ironFence(g, col, cx - f, cz + f, hx - 0.7, cz + f, y, 2); // south (left of gap)
  ironFence(g, col, hx + 0.7, cz + f, cx + f, cz + f, y, 2); // south (right of gap)

  // deep, murky water (less blue than the ocean, not as brown as the fountain)
  if (scene) {
    const water = new THREE.Mesh(
      new THREE.BoxGeometry((R.waterHalf - 0.15) * 2, R.waterY - R.baseY, (R.waterHalf - 0.15) * 2),
      new THREE.MeshLambertMaterial({ color: 0x5a8f94, transparent: true, opacity: 0.72, depthWrite: false })
    );
    water.position.set(cx, (R.baseY + R.waterY) / 2, cz);
    scene.add(water);
  }
  cornerLamps(g, col, b);
}

export { buildReservoir };
