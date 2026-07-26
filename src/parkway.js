// The coastal parkway: a handful of independent road segments, each an
// explicit hand-placed route through waypoints you choose — no coastline-
// following or grid-clearance math. To add or reshape a segment, walk to
// each point in-game (player.js logs x/z/th to the console every second)
// and list the waypoints below, in order. The road runs straight between
// waypoints and only curves in a short arc near each turn (see TURN_R in
// curve.js) — e.g. points (0,0), (0,1), (3,1) go straight for ~1 unit, turn,
// then go straight for ~3 units, rather than bowing the whole path like a
// spline. The route-building math is shared with paths.js (curve.js).
//
// Everything is deterministic — the route is fixed data, no Math.random.
import * as THREE from 'three';
import { buildCurve, sampleTs, curvePt, ribbon, WALK_TOP, CURB_BOT } from './curve.js';

const HALF_ROAD = 5;    // 10m asphalt
const WALK_W = 3;       // sidewalk band width (matches the grid's INSET in city.js)

// Each segment: a name + ordered [x, z] waypoints in world meters, plus an
// optional per-segment `turnR` (falls back to TURN_R). Two points make a
// straight line — add more points between them to route the road. Walk to
// the spot you want in-game and read its x/z off the console.
const SEGMENTS = [
  {
    name: 'north',
    points: [
      [115, -450],
      [115, -480],
      [0, -595],
      [-35, -655],
      [-147, -725],
      [-205, -775],
      [-220, -775],
    ],
  },
  {
    name: 'north',
    points: [
      [-225, -780],
      [-225, -800],
      [-256, -855],
      [-288, -887],
      [-333, -900],
      [-400, -900],
      [-470, -915],
      [-520, -910],
      [-552, -869],
      [-630, -842],
      [-665, -800],
      [-665, -780],
    ],
  },
  {
    name: 'west',
    points: [
      [-665, -440],
      [-665, -425],
      [-625, -335],
      [-625, -225],
      [-665, -135],
      [-665, -120],
    ],
  },
  {
    name: 'west2',
    points: [
      [-670, -115],
      [-685, -115],
      [-775, -30],
      [-775, -10],
    ],
  },
];

// Raised sidewalk band (like the grid curbs): flat deck at WALK_TOP with
// vertical curb skirts on both edges, plus rotated collider slabs so the
// player steps up onto it. Always capped at both ends (segments are open).
function ribbonRaised(scene, col, curve, ts, oIn, oOut, hex) {
  const n = ts.length;
  const pos = new Float32Array(n * 18);
  const nrm = new Float32Array(n * 18);
  for (let k = 0; k < n; k++) {
    const t = Math.min(Math.max(ts[k], 0), 1);
    const tan = curve.getTangentAt(t);
    const c = tan.z, s = -tan.x; // outward normal components (tan is unit)
    const [xi, zi] = curvePt(curve, t, oIn);
    const [xo, zo] = curvePt(curve, t, oOut);
    // 6 rows per sample: inner skirt pair, deck pair, outer skirt pair
    pos.set([
      xi, CURB_BOT, zi, xi, WALK_TOP, zi,
      xi, WALK_TOP, zi, xo, WALK_TOP, zo,
      xo, WALK_TOP, zo, xo, CURB_BOT, zo,
    ], k * 18);
    nrm.set([-c, 0, -s, -c, 0, -s, 0, 1, 0, 0, 1, 0, c, 0, s, c, 0, s], k * 18);
  }
  const idx = [];
  for (let k = 0; k < n - 1; k++) {
    for (const r of [0, 2, 4]) {
      const a = k * 6 + r;
      idx.push(a, a + 6, a + 1, a + 1, a + 6, a + 7);
    }
  }
  idx.push(0, 1, 3, 0, 3, 5);
  const e0 = (n - 1) * 6;
  idx.push(e0, e0 + 3, e0 + 1, e0, e0 + 5, e0 + 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  const m = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ color: hex, side: THREE.DoubleSide })
  );
  m.receiveShadow = true;
  scene.add(m);
  // one thin rotated slab collider per sample chord
  for (let k = 0; k < n - 1; k++) {
    const oc = (oIn + oOut) / 2;
    const [x0, z0] = curvePt(curve, ts[k], oc);
    const [x1, z1] = curvePt(curve, ts[k + 1], oc);
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz) + 0.3;
    col.add((x0 + x1) / 2, 0, (z0 + z1) / 2, oOut - oIn, WALK_TOP, len, Math.atan2(dx, dz));
  }
}

export function buildParkway(scene, g, col, H) {
  for (const seg of SEGMENTS) buildParkwaySegment(scene, g, col, H, seg);
}

function buildParkwaySegment(scene, g, col, H, seg) {
  const { P } = H;
  if (seg.points.length < 2) return;
  const curve = buildCurve(seg.points, seg.turnR);
  const ts = sampleTs(curve);

  ribbon(scene, curve, ts, -HALF_ROAD, HALF_ROAD, 0.03, P.road);
  ribbonRaised(scene, col, curve, ts, HALF_ROAD, HALF_ROAD + WALK_W, P.sidewalk);
  ribbonRaised(scene, col, curve, ts, -HALF_ROAD - WALK_W, -HALF_ROAD, P.sidewalk);

  // center dashes, aligned to the local road direction; drop the outermost
  // dash at each end to leave a clear zone for a future zebra crosswalk where
  // the segment meets the grid.
  const dashKs = [];
  for (let k = 1; k < ts.length - 1; k += 2) dashKs.push(k);
  for (let di = 1; di < dashKs.length - 1; di++) {
    const t = ts[dashKs[di]];
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    const ry = Math.atan2(tan.x, tan.z);
    g.box(p.x, 0.045, p.z, 0.35, 0.02, 2.4, P.dash, ry);
  }
}

// Sampled (x, z) points per segment, for the minimap to draw as independent
// polylines.
export function parkwaySegments() {
  return SEGMENTS.filter((s) => s.points.length >= 2).map((seg) => {
    const curve = buildCurve(seg.points, seg.turnR);
    const ts = sampleTs(curve);
    return { name: seg.name, points: ts.map((t) => { const p = curve.getPointAt(t); return [p.x, p.z]; }) };
  });
}
