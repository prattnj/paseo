// Shared "rounded polyline" route helpers: build a smooth curve through
// hand-placed [x, z] waypoints (straight legs, short rounded corners at each
// turn) and sample flat ribbon strips along it. Used by anything that needs
// an authored route through the world — the coastal parkway (parkway.js)
// and dirt paths (paths.js).
import * as THREE from 'three';

export const TURN_R = 18; // default corner-rounding radius (m) at each waypoint

// Shared sidewalk deck heights, so anything that butts against a parkway or
// grid sidewalk (e.g. junctions.js patches) lines up without z-fighting.
export const WALK_TOP = 0.157; // a hair above the grid's 0.15
export const CURB_BOT = -0.08; // curb skirt bottom

// Straight lines between waypoints, with each interior corner rounded by a
// short quadratic-bezier fillet of radius `turnR` (clamped to at most half
// of either adjacent leg, so short legs never produce overlapping fillets).
// e.g. points (0,0), (0,1), (3,1) go straight for ~1 unit, turn, then go
// straight for ~3 units, rather than bowing the whole path like a spline.
export function buildCurve(points, turnR = TURN_R) {
  const pts = points.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const path = new THREE.CurvePath();
  if (pts.length < 2) return path;
  if (pts.length === 2) {
    path.add(new THREE.LineCurve3(pts[0], pts[1]));
    return path;
  }
  let cursor = pts[0];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1], corner = pts[i], next = pts[i + 1];
    const dIn = corner.clone().sub(prev), lenIn = dIn.length();
    const dOut = next.clone().sub(corner), lenOut = dOut.length();
    const r = lenIn < 1e-6 || lenOut < 1e-6 ? 0 : Math.min(turnR, lenIn / 2, lenOut / 2);
    if (r < 1e-6) {
      if (corner.distanceTo(cursor) > 1e-6) path.add(new THREE.LineCurve3(cursor, corner));
      cursor = corner;
      continue;
    }
    const fromPt = corner.clone().sub(dIn.normalize().multiplyScalar(r));
    const toPt = corner.clone().add(dOut.normalize().multiplyScalar(r));
    if (fromPt.distanceTo(cursor) > 1e-6) path.add(new THREE.LineCurve3(cursor, fromPt));
    path.add(new THREE.QuadraticBezierCurve3(fromPt, corner, toPt));
    cursor = toPt;
  }
  const last = pts[pts.length - 1];
  if (last.distanceTo(cursor) > 1e-6) path.add(new THREE.LineCurve3(cursor, last));
  return path;
}

// Sample the curve at roughly one point every `step` meters (arc-length
// spaced). Capped high, not low: a long route (e.g. a full-island path) with
// many short corner fillets needs far more than a couple hundred samples or
// the fillets get skipped past and every turn renders as a straight cut.
export function sampleTs(curve, step = 3) {
  const n = Math.max(20, Math.min(6000, Math.round(curve.getLength() / step)));
  const ts = [];
  for (let k = 0; k <= n; k++) ts.push(k / n);
  return ts;
}

// Point at signed perpendicular offset `o` from the curve at arc-length
// parameter t (0..1). Positive o = to the right of the direction of travel.
export function curvePt(curve, t, o) {
  const u = Math.min(Math.max(t, 0), 1);
  const p = curve.getPointAt(u);
  const tan = curve.getTangentAt(u);
  const nx = tan.z, nz = -tan.x;
  return [p.x + o * nx, p.z + o * nz];
}

// Flat strip between two signed perpendicular offsets of the curve.
export function ribbon(scene, curve, ts, oIn, oOut, y, hex) {
  const n = ts.length;
  const pos = new Float32Array(n * 6);
  const nrm = new Float32Array(n * 6);
  for (let k = 0; k < n; k++) {
    const [xi, zi] = curvePt(curve, ts[k], oIn);
    const [xo, zo] = curvePt(curve, ts[k], oOut);
    pos.set([xi, y, zi, xo, y, zo], k * 6);
    nrm.set([0, 1, 0, 0, 1, 0], k * 6);
  }
  const idx = [];
  for (let k = 0; k < n - 1; k++) {
    const a = k * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); // CCW seen from above
  }
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
}
