// The Poo Man block: a colossal statue of the town hero on a grassed NW
// quarter, the other three quarters filled with downtown skyscrapers.
import * as THREE from 'three';
import { PALETTE as P, SIDEWALK_H } from '../palette.js';
import { hash } from '../util.js';
import { tower } from './pieces.js';
import { scatterTrees } from './props.js';
import { slabAndSidewalk, groundStripe, wallSign, cornerLamps } from './kit.js';
import { SPEAKER_SPOTS, SPEAKER_W, SPEAKER_H, SPEAKER_D } from '../speakers.js';

// Stepped stone pedestal (~5.5m to the cap) for the Poo Man statue. Wide enough
// to carry the towering figure.
function pedestal(g, col, cx, cz) {
  const y = SIDEWALK_H, S = 0xc2b7a2, SD = 0x9d9280;
  g.boxB(cx, y, cz, 19, 1.2, 19, SD);
  g.boxB(cx, y + 1.2, cz, 16.5, 1.2, 16.5, S);
  g.boxB(cx, y + 2.4, cz, 13, 4.2, 13, SD);
  g.boxB(cx, y + 6.6, cz, 13.6, 0.5, 13.6, S);
  col.add(cx, 0, cz, 19, y + 7.1, 19);
}

// Poo Man, the town hero: a colossal blocky superhero — brown "poo" body, tan
// (skin) head & hands, dark hair, black eyes — in a heroic pose (one arm raised
// at an angle, one hand on the hip). The body/head are batched; the angled arms
// and the thick cape are meshes parented to a scaled, rotated group that aligns
// with the batch. `py` = figure base (pedestal top); `ry` = facing; `S` = scale.
function pooMan(g, col, scene, cx, py, cz, ry, S) {
  const BODY = 0x6e4a2c, CAPE = 0x553a20, SKIN = 0xe8c99a, HAIR = 0x412d19, EYE = 0x161616, BELT = 0xddc022;
  const c = Math.cos(ry), sn = Math.sin(ry);
  const bx = (dx, dy, dz, w, h, d, hex) => g.boxB(cx + dx * S * c + dz * S * sn, py + dy * S, cz - dx * S * sn + dz * S * c, w * S, h * S, d * S, hex, ry);
  // stance + torso + belt (slightly proud, wrapping the torso bottom)
  for (const s of [-1, 1]) bx(s * 1.15, 0, 0, 1.5, 4.4, 1.7, BODY);
  bx(0, 4.2, 0, 3.7, 5.2, 2.4, BODY);
  bx(0, 4.19, 0, 3.9, 0.9, 2.6, BELT);
  // head: a skin-coloured cube with dark hair on top + front, eyes and a mouth
  const H = 9.4;
  bx(0, H, 0, 2.8, 2.8, 2.6, SKIN);
  bx(0, H + 2.55, 0, 2.95, 0.7, 2.75, HAIR);        // hair on top
  bx(0, H + 2.15, 1.15, 2.5, 0.65, 0.35, HAIR);     // front hairline
  for (const s of [-1, 1]) bx(s * 0.5, H + 1.15, 1.45, 0.35, 0.5, 0.15, EYE); // eyes
  bx(0, H + 0.5, 1.45, 0.95, 0.22, 0.15, 0x46281c); // mouth
  bx(0, 8.4, -1.3, 3.7, 1.3, 0.5, CAPE);            // cape collar

  // angled arms + thick cape as their own meshes (a group at the figure's
  // frame, so local coords/dims/rotations line up with the batched body)
  if (scene) {
    const fg = new THREE.Group();
    fg.position.set(cx, py, cz); fg.rotation.y = ry; fg.scale.setScalar(S);
    scene.add(fg);
    const lmat = (hex, dbl) => new THREE.MeshLambertMaterial({ color: hex, flatShading: true, side: dbl ? THREE.DoubleSide : THREE.FrontSide });
    // a box "bone" from (x0,y0) to (x1,y1) in the figure's frontal plane
    const bone = (x0, y0, x1, y1, z, thick, depth, hex) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(thick, Math.hypot(x1 - x0, y1 - y0), depth), lmat(hex));
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, z);
      m.rotation.z = Math.atan2(-(x1 - x0), y1 - y0);
      m.castShadow = m.receiveShadow = true; fg.add(m);
    };
    const cube = (x, y, z, w, h, d, hex) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lmat(hex)); m.position.set(x, y, z); m.castShadow = true; fg.add(m); };
    // raised right arm, angled outward with a slight elbow, fist up
    bone(2.1, 8.4, 2.9, 11.6, 0, 1.05, 1.3, BODY);
    bone(2.9, 11.6, 3.1, 13.9, 0, 0.95, 1.2, BODY);
    cube(3.1, 14.3, 0, 1.2, 1.4, 1.5, SKIN);
    // left arm akimbo: down-and-out to the elbow, forearm in to the hip, hand
    bone(-1.5, 8.4, -3.8, 6.0, 0, 1.0, 1.3, BODY);
    bone(-3.95, 6.5, -1.7, 4.7, 0, 1.0, 1.3, BODY);
    cube(-1.5, 4.7, 0.45, 1.1, 1.2, 1.75, SKIN);
    // one-piece tapered cape, extruded to give it thickness, sweeping back/down
    const q = [[-2.5, 8.6, -1.4], [2.5, 8.6, -1.4], [3.4, 0.8, -4.0], [-3.4, 0.8, -4.0]];
    const e1 = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]];
    const e2 = [q[3][0] - q[0][0], q[3][1] - q[0][1], q[3][2] - q[0][2]];
    let nr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const nl = Math.hypot(...nr) || 1; nr = nr.map((v) => (v / nl) * 0.22); // half-thickness
    const front = q.map((p) => [p[0] + nr[0], p[1] + nr[1], p[2] + nr[2]]);
    const back = q.map((p) => [p[0] - nr[0], p[1] - nr[1], p[2] - nr[2]]);
    const cp = [];
    const quad = (a, bb, cc, d) => cp.push(...a, ...bb, ...cc, ...a, ...cc, ...d);
    quad(front[0], front[1], front[2], front[3]);
    quad(back[3], back[2], back[1], back[0]);
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(front[i], back[i], back[j], front[j]); }
    const cgeo = new THREE.BufferGeometry();
    cgeo.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    cgeo.computeVertexNormals();
    const cape = new THREE.Mesh(cgeo, lmat(CAPE, true));
    cape.castShadow = cape.receiveShadow = true; fg.add(cape);
  }
  col.add(cx, py, cz, 8 * S, 15 * S, 6 * S);
}

// The Poo Man block: a colossal statue of the town hero on a grassed NW quarter,
// the other three quarters filled with downtown skyscrapers.
function buildPooMan(g, col, b, seed, scene = null) {
  const r = slabAndSidewalk(g, col, b, P.concrete);
  const cx = r.cx, cz = r.cz;
  const nwx = (r.x0 + cx) / 2, nwz = (r.z0 + cz) / 2;
  // NW quarter is a grassy plaza
  groundStripe(g, nwx, nwz, cx - r.x0, cz - r.z0, P.grass);
  pedestal(g, col, nwx, nwz);
  pooMan(g, col, scene, nwx, SIDEWALK_H + 7.1, nwz, -3 * Math.PI / 4, 1.85); // faces the NW intersection
  // sign at the NW corner of the quarter (closest to the intersection), diagonal
  if (scene) wallSign(g, col, scene, r.x0 + 7, SIDEWALK_H, r.z0 + 7, 6, 'POO MAN DUTY CALLS', 1, -3 * Math.PI / 4, 0.5);
  // reserve the two flanking-speaker footprints (built + animated in speakers.js
  // from main.js) so the player is blocked and the tree scatter below avoids them
  for (const s of SPEAKER_SPOTS) col.add(s.x, 0, s.z, SPEAKER_W, SIDEWALK_H + SPEAKER_H, SPEAKER_D, s.ry);

  // the other three quarters: varied skyscrapers reaching the block edges
  const seam = 1;
  tower(g, col, (cx + r.x1) / 2, (r.z0 + cz) / 2, (r.x1 - cx) - seam, (cz - r.z0) - seam, 11 + hash(seed, 1) % 13, hash(seed, 11), r); // NE
  tower(g, col, (r.x0 + cx) / 2, (cz + r.z1) / 2, (cx - r.x0) - seam, (r.z1 - cz) - seam, 11 + hash(seed, 2) % 13, hash(seed, 12), r); // SW
  tower(g, col, (cx + r.x1) / 2, (cz + r.z1) / 2, (r.x1 - cx) - seam, (r.z1 - cz) - seam, 11 + hash(seed, 3) % 13, hash(seed, 13), r); // SE
  cornerLamps(g, col, b);
  // fairly dense trees on the grassy plaza around the pedestal (keeps clear of
  // the pedestal/sign/tower colliders automatically)
  scatterTrees(g, col, { x0: r.x0, x1: cx, z0: r.z0, z1: cz }, hash(seed, 50), 4.5, 0.7, 1.3);
}

export { buildPooMan };
