// Neighborhood baseball diamond on the open plateau pocket east of the city,
// with home plate at (788,-18) and the field opening toward the NORTH-EAST.
// Like arena.js / prison.js this is a hand-placed WORLD-COORDINATE feature
// drawn straight into the shared city GeoBatch + Colliders, not a CITY grid
// entry — the pocket is unbuilt open ground that nothing in layout.js owns.
//
// Because home faces NE, the two foul lines land exactly on the world axes:
// the first-base line runs due +x (east) and the third-base line runs due -z
// (north). Fair territory is therefore the axis-aligned NE quadrant of home
// (x >= HX, z <= HZ), and the mowed PLAYING FIELD is a QUARTER CIRCLE centred
// on home: the two foul lines are its straight radial edges and the outfield
// is the 90deg arc. The disc can't be a GeoBatch box, so it is one flat sector
// mesh (a 90deg CircleGeometry) laid straight into the scene in a green a clear
// step darker than the wild plateau lawn, so the field's curved edge reads. On
// top of it the infield is all axis-aligned boxes: the bases form a 90ft
// square (which the player, sighting NE down its diagonal, reads as a diamond),
// the dirt base paths are a frame inset just inside that square, and a raised
// dirt mound sits on the home->2nd line. A low chain-link backstop hugs behind
// home (the only fence). Trees densely fill ONLY the fair-quadrant land beyond
// the outfield arc, out to the coast (the north & east margins) — never the
// south/west city side, which carries the z=0 avenue. The plateau here is dead
// flat (~TOP_Y); only the tree fill queries onLand to stop at the water.
// Everything is deterministic — no Math.random.
import * as THREE from 'three';
import { PALETTE as P } from '../../core/palette.js';
import { TOP_Y, onLand } from '../island.js';
import { frac, hash } from '../../core/util.js';
import { tree } from '../blocks/index.js';

// ---- placement ----------------------------------------------------------
const GY = TOP_Y;                       // flat plateau surface
const HX = 788, HZ = -18;               // home plate (apex of the quarter circle)
const BASE = 27.432;                    // 90 ft between bases
const FIELD = 50;                       // playing-field radius (foul-line length)
// bases (an axis-aligned square because the foul lines lie on the axes)
const B1 = [HX + BASE, HZ];             // first  (due east of home)
const B2 = [HX + BASE, HZ - BASE];      // second (the NE corner)
const B3 = [HX, HZ - BASE];             // third  (due north of home)
const IC = [HX + BASE / 2, HZ - BASE / 2]; // infield centre
const MOUND = [HX + 0.70710678 * 18.44, HZ - 0.70710678 * 18.44]; // 60.5 ft toward CF

// The wild plateau lawn is ~0x6db24a, so the mowed field is a clear step darker.
const FIELD_GREEN = 0x549239;
const INFIELD_GREEN = 0x4c8834;         // infield grass a touch darker still

// layered surface heights (avoid coplanar z-fighting)
const Y_DISC = GY + 0.05;   // outfield sector mesh, just above terrain
const Y_IN = GY + 0.07;     // infield grass pad
const Y_DIRT = GY + 0.09;   // dirt sits just above the grass
const Y_MARK = GY + 0.12;   // bases / plate / chalk sit just above the dirt
const PATH_W = 3.7;         // base-path width

// ---- field surfaces -----------------------------------------------------
function fieldSurface(g, scene) {
  // Outfield: a flat 90deg sector (CircleGeometry, thetaStart 0 -> length
  // PI/2). Baked flat with rotateX(-90deg): local +X maps to world +x (the
  // first-base line) and local +Y to world -z (the third-base line), so the
  // wedge fills exactly the NE fair quadrant with home at its apex.
  const geo = new THREE.CircleGeometry(FIELD, 40, 0, Math.PI / 2);
  geo.rotateX(-Math.PI / 2);
  const disc = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ color: FIELD_GREEN, flatShading: true })
  );
  disc.position.set(HX, Y_DISC, HZ);
  disc.receiveShadow = true;
  scene.add(disc);

  // infield grass square (a touch darker) — exactly the base square, so it sits
  // entirely inside the wedge / fair territory
  g.boxB(IC[0], Y_IN, IC[1], BASE, Y_DIRT - Y_IN, BASE, INFIELD_GREEN);

  // chalk foul lines: the wedge's two straight radial edges, from home out
  g.boxB(HX + FIELD / 2, Y_MARK, HZ, FIELD, 0.02, 0.15, P.white);   // 1st-base line (+x)
  g.boxB(HX, Y_MARK, HZ - FIELD / 2, 0.15, 0.02, FIELD, P.white);   // 3rd-base line (-z)
}

function infield(g) {
  // dirt base paths: a frame of four strips inset JUST inside the base square
  // so it stays in fair territory. North/south strips run the full width and
  // own the corners; east/west strips are shortened to fit between them (no
  // overlap -> no coplanar z-fighting).
  const t = Y_MARK - Y_DIRT, vLen = BASE - 2 * PATH_W;
  g.boxB(IC[0], Y_DIRT, HZ - PATH_W / 2, BASE, t, PATH_W, P.dirt);          // home->1st
  g.boxB(IC[0], Y_DIRT, B2[1] + PATH_W / 2, BASE, t, PATH_W, P.dirt);       // 3rd->2nd
  g.boxB(HX + PATH_W / 2, Y_DIRT, IC[1], PATH_W, t, vLen, P.dirt);          // home->3rd
  g.boxB(B1[0] - PATH_W / 2, Y_DIRT, IC[1], PATH_W, t, vLen, P.dirt);       // 1st->2nd

  // skinned dirt area around home / the batter's boxes
  g.cyl(HX, Y_IN, HZ, 4.5, 4.5, t, P.dirt);

  // raised pitcher's mound (dirt disc, gently proud of the grass)
  g.cyl(MOUND[0], Y_DIRT, MOUND[1], 2.7, 2.7, 0.22, P.dirtLight);
  g.box(MOUND[0], Y_DIRT + 0.24, MOUND[1], 0.6, 0.05, 0.15, P.white, -Math.PI / 4); // rubber, angled 45deg CW

  // bases (white pads) + home plate
  for (const [bx, bz] of [B1, B2, B3])
    g.boxB(bx, Y_MARK, bz, 0.95, 0.03, 0.95, P.white);
  g.boxB(HX, Y_MARK, HZ, 1.08, 0.03, 1.08, P.white);
}

// ---- backstop (a low chain-link wrap hugging behind home) ---------------
const BS_R = 5.0, BS_H = 4.0, STEEL = 0x5b626b, WIRE = 0xb7bcc2;

function chainlinkTexture() {
  const S = 64, c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  x.clearRect(0, 0, S, S);
  x.strokeStyle = '#e9edf1';
  x.lineWidth = 3;
  for (let o = -S; o < S * 2; o += 12) {   // '/' + '\' diagonals -> diamonds
    x.beginPath(); x.moveTo(o, 0); x.lineTo(o + S, S); x.stroke();
    x.beginPath(); x.moveTo(o, S); x.lineTo(o + S, 0); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const _chain = chainlinkTexture();

// One straight backstop panel p0->p1: posts + top/bottom rails (opaque, in the
// GeoBatch), a see-through chain-link plane (in the scene), and one thin solid
// collider so the player can't walk through it.
function backstopPanel(g, col, scene, p0, p1) {
  const [x0, z0] = p0, [x1, z1] = p1;
  const L = Math.hypot(x1 - x0, z1 - z0);
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  const ry = Math.atan2(x1 - x0, z1 - z0); // yaw so local +z runs p0->p1

  const t = _chain.clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(L / 1.6, BS_H / 1.6);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(L, BS_H),
    new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.35,
      side: THREE.DoubleSide, color: WIRE, depthWrite: false })
  );
  mesh.position.set(mx, GY + BS_H / 2, mz);
  mesh.rotation.y = ry - Math.PI / 2; // plane's width axis is local X; align to p0->p1
  scene.add(mesh);

  for (const y of [GY + 0.12, GY + BS_H]) g.box(mx, y, mz, 0.07, 0.07, L, STEEL, ry);
  for (const [px, pz] of [p0, p1]) g.cyl(px, GY, pz, 0.09, 0.1, BS_H + 0.15, STEEL);

  col.add(mx, GY, mz, 0.3, BS_H, L, ry); // thin solid collider along the run
}

// A shallow arc of three panels wrapping the SW side just behind home (home
// faces NE, so "behind" is the 135deg bearing). BS_R keeps it clear of the
// z=0 avenue to the south.
function backstop(g, col, scene) {
  const pts = [];
  for (let i = 0; i <= 3; i++) {
    const a = (100 + i * (70 / 3)) * Math.PI / 180; // 100deg..170deg around home
    pts.push([HX + Math.cos(a) * BS_R, HZ + Math.sin(a) * BS_R]);
  }
  for (let i = 0; i < 3; i++) backstopPanel(g, col, scene, pts[i], pts[i + 1]);
}

// ---- surrounding trees (fair-quadrant land beyond the arc, out to coast) --
// A dense jittered grid filling ONLY the land north & east of the outfield
// arc (the NE fair quadrant, past radius FIELD), out to the coast — never the
// south/west city side. Skip anything off the plateau (onLand) or already
// occupied by a collider.
const _tq = [];
function occupied(col, x, z, rad) {
  col.query(x - rad, z - rad, x + rad, z + rad, _tq);
  for (const idx of _tq) {
    const b = col.boxes[idx];
    if (b.maxY < 0.6) continue; // ignore ground slabs
    if (x + rad > b.minX && x - rad < b.maxX && z + rad > b.minZ && z - rad < b.maxZ) return true;
  }
  return false;
}
function surroundingTrees(g, col) {
  const STEP = 5.5;                 // dense
  let k = 0;
  for (let gx = HX; gx <= HX + 195; gx += STEP) {
    for (let gz = HZ; gz >= HZ - 155; gz -= STEP) {
      const x = gx + (frac(k, 1, 3) - 0.5) * 3.4;
      const z = gz + (frac(k, 2, 7) - 0.5) * 3.4;
      k++;
      const dx = x - HX, dz = z - HZ;
      if (dx < 0 || dz > 0) continue;                  // NE fair quadrant only
      if (Math.hypot(dx, dz) < FIELD + 2) continue;    // stay beyond the outfield arc
      if (!onLand(x, z)) continue;                     // stop at the water
      if (occupied(col, x, z, 1.0)) continue;
      tree(g, col, x, z, 0.85 + frac(k, 4, 9) * 0.6, hash(k, 5) % 3);
    }
  }
}

// ---- entry --------------------------------------------------------------
export function buildBaseball(g, col, scene) {
  fieldSurface(g, scene);
  infield(g);
  backstop(g, col, scene);
  surroundingTrees(g, col);
}
