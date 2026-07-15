// The coastal parkway: a curved road that hugs the island's plateau edge
// all the way around in one closed ring, replacing the old square ring
// road. Between its outer sidewalk and the scarp edge there is always a
// solid grass gap; in five authored windows the road pulls further inland
// and the widened gap becomes a pocket park with trees, a winding dirt
// path, benches and lamps.
//
// Where the traced coastline swallowed grid cells (layout.js REMOVED_CELLS)
// the ring swings inland through the resulting green belts, staying clear
// of the surviving boundary roads. Grid streets that still reach the map
// edge are extended outward by city.js to tee into it (streetExtensions()).
//
// Everything is deterministic — hash/frac only, no Math.random.
import * as THREE from 'three';
import { plateauEdgeR, nearStair, coastObliquity } from './island.js';
import { GRID, roadWidth, buildRoads, REMOVED_CELLS } from './layout.js';
import { hash, frac } from './util.js';

const N = 720;                 // angular samples (0.5°), matches island.js
const HALF_ROAD = 6;           // 12m asphalt
const WALK_W = 2;              // sidewalk band width
const GAP = 8;                 // minimum grass gap: outer sidewalk -> plateau edge
const LANE = 2.6;              // traffic lane offset from the centerline

// Pocket-park windows: the road pulls `extra` meters further inland around
// coast angle th (gaussian falloff), widening the seaside strip into a park.
// Angles picked where the coast leaves the most room (tmp-trace.py).
const PARKS = [
  { th: -2.007, extra: 24, sigma: 0.12 },  // NW lobe
  { th: -0.707, extra: 24, sigma: 0.13 },  // NE grand lobe
  { th: 0.201, extra: 22, sigma: 0.11 },   // east bulge
  { th: 1.58, extra: 22, sigma: 0.10 },    // south shore
  { th: 2.592, extra: 24, sigma: 0.12 },   // hook peninsula
];

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function parkExtra(th) {
  let e = 0;
  for (const p of PARKS) {
    const d = angDiff(th, p.th);
    e += p.extra * Math.exp(-(d * d) / (2 * p.sigma * p.sigma));
  }
  return e;
}

const thAt = (i) => -Math.PI + (2 * Math.PI * i) / N;
const fOfTh = (th) => ((th + Math.PI) / (2 * Math.PI)) * N;

// The road may never come closer to the center than the surviving city
// blocks along that direction: per-sample smallest radius whose point keeps
// a true EUCLIDEAN margin from the union of kept grid cells — 3m past the
// outer ±640 edge (no road there) or 22m past an inner kept/removed
// boundary road (clears road + sidewalks). Euclidean distance (not ray-exit
// + radial margin) makes the floor round block corners with proper arcs.
const MIN_R = new Float32Array(N);
{
  const kept = [];
  for (let i = 0; i < 10; i++) {
    for (let j = 0; j < 10; j++) {
      if (!REMOVED_CELLS.has(i + ',' + j)) {
        kept.push([GRID[i], GRID[i + 1], GRID[j], GRID[j + 1]]);
      }
    }
  }
  const distTo = (x, z) => {
    let best = Infinity;
    for (const [x0, x1, z0, z1] of kept) {
      const dx = Math.max(x0 - x, 0, x - x1);
      const dz = Math.max(z0 - z, 0, z - z1);
      const d = Math.hypot(dx, dz);
      if (d < best) best = d;
    }
    return best;
  };
  for (let s = 0; s < N; s++) {
    const dx = Math.cos(thAt(s)), dz = Math.sin(thAt(s));
    let exit = 0;
    for (const [x0, x1, z0, z1] of kept) {
      let lo = 0, hi = Infinity;
      for (const [d, p0, p1] of [[dx, x0, x1], [dz, z0, z1]]) {
        if (Math.abs(d) < 1e-12) {
          if (0 < p0 || 0 > p1) { lo = 1; hi = 0; }
          continue;
        }
        const a = p0 / d, b = p1 / d;
        lo = Math.max(lo, Math.min(a, b));
        hi = Math.min(hi, Math.max(a, b));
      }
      if (lo < hi && hi > exit) exit = hi;
    }
    const outer = Math.max(Math.abs(exit * dx), Math.abs(exit * dz)) > 639.5;
    const margin = outer ? 3 : 22;
    let lo = exit, hi = exit + margin * 1.6;
    while (distTo(hi * dx, hi * dz) < margin) { lo = hi; hi += margin; }
    for (let it = 0; it < 30; it++) {
      const mid = (lo + hi) / 2;
      if (distTo(mid * dx, mid * dz) < margin) lo = mid; else hi = mid;
    }
    // never push the floor past the coast cap (minus a hair): near outer-
    // edge block corners the full corner arc would leave the land, and the
    // street tee junction covers that closeness legitimately
    const cap = plateauEdgeR(thAt(s)) - (GAP + WALK_W + HALF_ROAD) * coastObliquity(thAt(s));
    MIN_R[s] = Math.min((lo + hi) / 2, Math.max(cap - 2, exit + margin));
  }
}

// The ring is never cut anymore (the parkway hugs the coast through the
// green belts instead of detouring on grid streets). Kept for the minimap.
export function parkwayCut() {
  return false;
}

// Centerline radius per sample.
const PW_R = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const th = thAt(i);
  // the inland clearance is a RADIAL offset; scale it by the coast
  // obliquity so the road keeps its true gap (and never overhangs the
  // scarp) where the coastline runs nearly radially (the inlet walls)
  PW_R[i] = Math.max(MIN_R[i], plateauEdgeR(th) - (GAP + WALK_W + HALF_ROAD) * coastObliquity(th) - parkExtra(th));
}

// Round off hairpin corners (the inlet head, kept-block corners on the
// MIN_R floor): wherever the centerline turns sharply between samples,
// relax samples toward their neighbors' chord, clamped between the city
// floor (MIN_R) and the coast cap. Converges to a drivable curve while
// leaving smooth stretches (incl. the pocket-park pull-ins) untouched.
{
  const CAP = Float32Array.from(PW_R);
  const LIMIT = 0.06; // ~3.4° per 0.5° sample ≈ 40m turn radius at r 700
  const px = (i) => Math.cos(thAt(i)) * PW_R[i];
  const pz = (i) => Math.sin(thAt(i)) * PW_R[i];
  for (let pass = 0; pass < 4000; pass++) {
    let moved = false;
    for (let i = 0; i < N; i++) {
      const a = (i + N - 1) % N, b = (i + 1) % N;
      const ax = px(a), az = pz(a), bx = px(b), bz = pz(b), x = px(i), z = pz(i);
      const t1 = Math.atan2(z - az, x - ax), t2 = Math.atan2(bz - z, bx - x);
      let d = Math.abs(t2 - t1);
      if (d > Math.PI) d = 2 * Math.PI - d;
      if (d < LIMIT) continue;
      const proj = ((ax + bx) / 2) * Math.cos(thAt(i)) + ((az + bz) / 2) * Math.sin(thAt(i));
      // the 22m city margin baked into MIN_R carries ~6m of pure grass —
      // hairpins (the inlet head) may borrow it to reach a drivable radius
      const nr = Math.max(Math.min(proj, CAP[i]), MIN_R[i] - 6);
      if (Math.abs(nr - PW_R[i]) > 0.005) { PW_R[i] = nr; moved = true; }
    }
    if (!moved) break;
  }
}

export function parkwayCenterR(th) {
  // wrap so callers can sample slightly past ±π (finite differences etc.)
  const f = (((((th + Math.PI) / (2 * Math.PI)) * N) % N) + N) % N;
  const i = Math.floor(f) % N;
  const j = (i + 1) % N;
  const t = f - Math.floor(f);
  return PW_R[i] * (1 - t) + PW_R[j] * t;
}

// Grid streets that still reach the old ±640 ring line, extended outward
// to tee into the parkway. Solved once; used by city.js (asphalt) and here
// (junction angles, to break the parkway dash line at each tee).
let _exts = null;
export function streetExtensions() {
  if (_exts) return _exts;
  const segs = new Set(buildRoads().map((s) => s.axis + ':' + s.at + ':' + s.from));
  const list = [];
  for (const at of GRID) {
    if (Math.abs(at) === 640) continue;
    for (const axis of ['x', 'z']) {
      for (const sgn of [1, -1]) {
        const from = sgn === 1 ? 500 : -640;
        if (!segs.has(axis + ':' + at + ':' + from)) continue;
        // First crossing of the street line with the parkway centerline:
        // walk outward from the grid edge until the point leaves the ring,
        // then bisect. (A fixed-point iteration here could 2-cycle where
        // the ring radius changes quickly, stranding the tee mid-grass.)
        const h = (t) => {
          const x = axis === 'x' ? at : sgn * t;
          const z = axis === 'x' ? sgn * t : at;
          return Math.hypot(x, z) - parkwayCenterR(Math.atan2(z, x));
        };
        let lo = 520;
        while (h(lo) > 0 && lo > 40) lo -= 40; // ring closer in than the grid edge
        let hi = lo + 4;
        while (h(hi) < 0) { lo = hi; hi += 4; }
        for (let it = 0; it < 40; it++) {
          const mid = (lo + hi) / 2;
          if (h(mid) < 0) lo = mid; else hi = mid;
        }
        const L = (lo + hi) / 2;
        const th = axis === 'x' ? Math.atan2(sgn * L, at) : Math.atan2(at, sgn * L);
        list.push({ axis, at, sgn, L, th, width: roadWidth(at) });
      }
    }
  }
  _exts = list;
  return list;
}

// Clockwise traffic lane polyline (right-hand inner lane), one closed ring,
// offset perpendicular to the road at full sample resolution so cars stay
// on the asphalt even where the coast runs steeply (inlet walls, the hook).
export function parkwayLanePts() {
  const pts = [];
  for (let i = 0; i < N; i++) {
    const [x, z] = stripPt(pwAt, i, -LANE);
    pts.push([x, z]);
  }
  return pts;
}

// ---- geometry -------------------------------------------------------------

// PW_R lookup at a fractional sample index (wraps).
function pwAt(f) {
  const a = ((f % N) + N) % N;
  const i0 = Math.floor(a) % N;
  const i1 = (i0 + 1) % N;
  const t = a - Math.floor(a);
  return PW_R[i0] * (1 - t) + PW_R[i1] * t;
}

// True centerline direction (as a box ry) at fractional index f — accounts
// for dR/dth, so dashes stay parallel to the road even where the radius
// changes quickly (headlands, park windows).
function dirAt(f) {
  const th = thAt(f);
  const r = pwAt(f);
  const dr = (pwAt(f + 1) - pwAt(f - 1)) / (2 * ((2 * Math.PI) / N));
  const dx = dr * Math.cos(th) - r * Math.sin(th);
  const dz = dr * Math.sin(th) + r * Math.cos(th);
  return Math.atan2(dx, dz);
}

// Point at signed PERPENDICULAR offset `o` (positive = seaward) from the
// polar curve rAt at fractional sample f. Radial offsets would collapse the
// strip to a sliver where the curve runs steeply (dR/dth large): the traced
// coast has near-radial stretches along the inlet walls and the hook climb.
function stripPt(rAt, f, o) {
  const th = thAt(f);
  const r = rAt(f);
  const dr = (rAt(f + 1) - rAt(f - 1)) / (2 * ((2 * Math.PI) / N));
  const c = Math.cos(th), s = Math.sin(th);
  const tx = dr * c - r * s, tz = dr * s + r * c; // tangent (increasing th)
  const il = 1 / Math.hypot(tx, tz);
  // outward normal = tangent rotated -90deg in the xz plane
  return [c * r + o * tz * il, s * r - o * tx * il];
}

// Flat strip between two signed perpendicular offsets of the polar curve
// cAt. Sample indices may be fractional (used to clip sidewalks at tees).
function ribbon(scene, run, cAt, oIn, oOut, y, hex) {
  const n = run.length;
  const pos = new Float32Array(n * 6);
  const nrm = new Float32Array(n * 6);
  for (let k = 0; k < n; k++) {
    const f = run[k];
    const [xi, zi] = stripPt(cAt, f, oIn);
    const [xo, zo] = stripPt(cAt, f, oOut);
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

// Raised sidewalk band (like the grid curbs): flat deck at TOP with vertical
// curb skirts on both edges, plus rotated collider slabs so the player steps
// up onto it. Cars ignore colliders this low (see collideCarWorld's lowY).
const WALK_TOP = 0.157; // a hair above the grid's 0.15 so butt joints never z-fight
function ribbonRaised(scene, col, run, cAt, oIn, oOut, hex, closed = false) {
  const BOT = -0.08;
  const n = run.length;
  const pos = new Float32Array(n * 18);
  const nrm = new Float32Array(n * 18);
  for (let k = 0; k < n; k++) {
    const f = run[k];
    const th = thAt(f);
    const c = Math.cos(th), s = Math.sin(th);
    const [xi, zi] = stripPt(cAt, f, oIn);
    const [xo, zo] = stripPt(cAt, f, oOut);
    // 6 rows per sample: inner skirt pair, deck pair, outer skirt pair
    pos.set([
      xi, BOT, zi, xi, WALK_TOP, zi,
      xi, WALK_TOP, zi, xo, WALK_TOP, zo,
      xo, WALK_TOP, zo, xo, BOT, zo,
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
  // cap both ends (tee windows) so the curb isn't an open slot — skipped on
  // closed rings, where both ends coincide and the caps would z-fight
  if (!closed) {
    idx.push(0, 1, 3, 0, 3, 5);
    const e0 = (n - 1) * 6;
    idx.push(e0, e0 + 3, e0 + 1, e0, e0 + 5, e0 + 3);
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
  // one thin rotated slab collider per sample chord
  for (let k = 0; k < n - 1; k++) {
    const f0 = run[k], f1 = run[k + 1];
    const oc = (oIn + oOut) / 2;
    const [x0, z0] = stripPt(cAt, f0, oc);
    const [x1, z1] = stripPt(cAt, f1, oc);
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz) + 0.3;
    col.add((x0 + x1) / 2, 0, (z0 + z1) / 2, oOut - oIn, WALK_TOP, len, Math.atan2(dx, dz));
  }
}

// Along-street coordinate where the parkway's inner-sidewalk outer edge
// crosses the line offset `side * (width/2 + 1.1)` from an extension street's
// centerline — city.js butts the extension sidewalks flush against it.
export function extSidewalkEnd(e, side) {
  const fJ = ((e.th + Math.PI) / (2 * Math.PI)) * N;
  const f = teeCross(e, -HALF_ROAD - WALK_W, e.at + side * (e.width / 2 + 1.5), fJ);
  const [x, z] = stripPt(pwAt, f, -HALF_ROAD - WALK_W);
  return e.axis === 'x' ? z : x;
}

// Along-street coordinate where the parkway band line at perpendicular
// offset `off` crosses the street-parallel line coord = target. Used to end
// the extension sidewalk strips so BOTH end corners land inside the
// parkway's inner sidewalk band (flush at oblique tees).
export function extStripCross(e, off, target) {
  const fJ = ((e.th + Math.PI) / (2 * Math.PI)) * N;
  const f = teeCross(e, off, target, fJ);
  const [x, z] = stripPt(pwAt, f, off);
  return e.axis === 'x' ? z : x;
}

// Winding dirt path radius through a park strip.
function pathR(f) {
  const th = thAt(f);
  const inEdge = pwAt(f) + HALF_ROAD + WALK_W + 2;   // just past the outer sidewalk
  const outEdge = plateauEdgeR(th) - 5;
  const t = 0.5 + 0.3 * Math.sin(5 * th + 1.1);
  return inEdge + (outEdge - inEdge) * t;
}

// A sample is parkland only if the pull-in actually happened: where the
// city floor (MIN_R) stopped the road from moving inland the seaside strip
// stays narrow and the path/props would land on the asphalt.
const inPark = (i) => {
  if (parkExtra(thAt(i)) <= 7) return false;
  const inEdge = PW_R[i] + HALF_ROAD + WALK_W + 2;
  const outEdge = plateauEdgeR(thAt(i)) - 5;
  return outEdge - inEdge > 7;
};

// fractional f near junction fj where the band at perpendicular offset `off`
// crosses the axis line coord = target. Scans outward for the sign-change
// bracket NEAREST fj (a fixed window could miss the crossing entirely at
// very oblique tees, silently returning a window endpoint), then bisects.
function teeCross(e, off, target, fj) {
  const cf = (f) => stripPt(pwAt, f, off)[e.axis === 'x' ? 0 : 1];
  const STEP = 0.25, RANGE = 30;
  const v0 = cf(fj) - target;
  let lo = null, hi = null;
  let p1 = fj, v1 = v0, p2 = fj, v2 = v0;
  for (let d = STEP; d <= RANGE && lo === null; d += STEP) {
    const fa = fj + d, va = cf(fa) - target;
    if ((v1 < 0) !== (va < 0)) { lo = p1; hi = fa; break; }
    p1 = fa; v1 = va;
    const fb = fj - d, vb = cf(fb) - target;
    if ((vb < 0) !== (v2 < 0)) { lo = fb; hi = p2; break; }
    p2 = fb; v2 = vb;
  }
  if (lo === null) { lo = fj - 6; hi = fj + 6; } // fallback: legacy window
  if (cf(lo) > cf(hi)) { const t = lo; lo = hi; hi = t; } // orient rising
  for (let it = 0; it < 44; it++) {
    const mid = (lo + hi) / 2;
    if (cf(mid) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// fractional-ended sample list [f0, ceil(f0)..floor(f1), f1] for ribbon()
function frRun(f0, f1) {
  const a = [f0];
  for (let k = Math.ceil(f0 + 1e-6); k < f1 - 1e-6; k++) a.push(k);
  a.push(f1);
  return a;
}

export function buildParkway(scene, g, col, H) {
  const { tree, bench, lamp, P } = H;

  const exts = streetExtensions();
  const fOf = (th) => ((th + Math.PI) / (2 * Math.PI)) * N;

  // One closed ring. Start the sample run well clear of every street tee so
  // no inner-sidewalk window straddles the wrap seam. Coords are CONTINUOUS
  // (may exceed N — all lookups wrap).
  let start = 0;
  for (let i = 0; i < N; i++) {
    if (exts.every((e) => Math.abs(angDiff(thAt(i), e.th)) > 0.09)) { start = i; break; }
  }
  const n0 = start, n1 = start + N;
  const ring = frRun(n0, n1); // first and last sample coincide -> closed

  ribbon(scene, ring, pwAt, -HALF_ROAD, HALF_ROAD, 0.03, P.road);
  ribbonRaised(scene, col, ring, pwAt, HALF_ROAD, HALF_ROAD + WALK_W, P.sidewalk, true);

  {
    // Inner sidewalk is dropped across each street tee so the junction reads
    // as continuous asphalt. The band's end cap is cut perpendicular to the
    // parkway, so at oblique tees its corners (offsets -8 / -6) swing along
    // the street: take the EARLIEST/LATEST clearance-line crossing so no cap
    // corner ever pokes over the junction asphalt. The wider gap this leaves
    // is paved by the corner fills below.
    const wins = [];
    for (const e of exts) {
      let f = fOf(e.th);
      while (f < n0) f += N;
      if (f > n1) continue;
      const clearT = e.width / 2 + 0.3;
      const cb = [], ca = [];
      for (const side of [-1, 1]) {
        for (const off of [-8, -6]) {
          const c = teeCross(e, off, e.at + side * clearT, f);
          (c < f ? cb : ca).push(c);
        }
      }
      wins.push([Math.min(...cb), Math.max(...ca)]);
    }
    wins.sort((a, b) => a[0] - b[0]);
    let cursor = n0;
    const segs = [];
    for (const [a, b] of wins) {
      if (a > cursor) segs.push([cursor, Math.min(a, n1)]);
      cursor = Math.max(cursor, b);
      if (cursor >= n1) break;
    }
    if (cursor < n1) segs.push([cursor, n1]);
    // merge the seam-spanning piece: drop the leading segment and extend the
    // trailing one across the wrap, so the ring has no coincident end caps
    if (segs.length > 1 && segs[0][0] === n0 && segs[segs.length - 1][1] === n1) {
      const first = segs.shift();
      segs[segs.length - 1][1] = n1 + (first[1] - n0);
    }
    for (const [fa, fb] of segs) {
      if (fb - fa > 0.05) {
        const closed = fb - fa >= N; // no tees at all (never in practice)
        ribbonRaised(scene, col, frRun(fa, fb), pwAt, -HALF_ROAD - WALK_W, -HALF_ROAD, P.sidewalk, closed);
      }
    }
  }

  // center dashes (skipped across the street tees + their crosswalks with
  // a true 2D corridor test), aligned to the local road direction
  for (let k = 1; k < ring.length - 1; k += 2) {
    const i = ring[k];
    const th = thAt(i);
    const r = pwAt(i);
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    if (exts.some((e) => {
      const main = e.axis === 'x' ? x : z;
      const other = e.axis === 'x' ? z : x;
      // corridor widens with tee obliquity: the tee zebras get pushed
      // outward by up to 5.6*comp so their far ends reach further along
      const comp = Math.abs(e.axis === 'x' ? Math.cos(e.th) : Math.sin(e.th));
      return Math.abs(main - e.at) < e.width / 2 + 3.6 + 11.2 * comp && Math.abs(other - e.sgn * e.L) < 30;
    })) continue;
    g.box(x, 0.045, z, 0.35, 0.02, 2.4, P.dash, dirAt(i));
  }

  // zebra crosswalks over the parkway on both sides of each street tee
  for (const e of exts) {
    const fJ = fOf(e.th);
    const span = 2 * HALF_ROAD - 0.4;
    const nBars = Math.floor((span - 0.55) / 1.1) + 1;
    const off0 = (-(nBars - 1) * 1.1) / 2;
    for (const side of [-1, 1]) {
      // two-pass solve: the bar row runs radially, so at oblique tees its
      // near end swings toward the street by 5.6*|radial·streetAxis| —
      // push the row center out by that much so no bar enters the junction
      const f1 = teeCross(e, 0, e.at + side * (e.width / 2 + 1.9), fJ);
      const comp = Math.abs(e.axis === 'x' ? Math.cos(thAt(f1)) : Math.sin(thAt(f1)));
      const f = teeCross(e, 0, e.at + side * (e.width / 2 + 1.9 + 5.6 * comp), fJ);
      const ry = dirAt(f);
      for (let b = 0; b < nBars; b++) {
        const [x, z] = stripPt(pwAt, f, off0 + b * 1.1);
        g.box(x, 0.065, z, 0.55, 0.02, 2.3, P.dash, ry);
      }
    }
  }

  // corner fills: the extension sidewalk strips and the inner-sidewalk band
  // are both cut back conservatively at each tee, leaving two unpaved pieces
  // per street side: (a) the notch between the strip's flat cap and the
  // curved junction asphalt edge, and (b) the band gap between the band's
  // cap and the street edge. Pave (a) with a triangle fan and (b) with a
  // raised band segment ended at the street edge line, so the corner reads
  // as continuous pavement with no grass notch and no asphalt overlap.
  for (const e of exts) {
    const fJ = fOf(e.th);
    const w2 = e.width / 2;
    const along = (f, off) => stripPt(pwAt, f, off)[e.axis === 'x' ? 1 : 0];
    // clearance-line crossings (same solve as the band window above)
    const cb = [], ca = [];
    for (const s2 of [-1, 1]) {
      for (const off of [-8, -6]) {
        const c = teeCross(e, off, e.at + s2 * (w2 + 0.3), fJ);
        (c < fJ ? cb : ca).push(c);
      }
    }
    for (const side of [-1, 1]) {
      const line0 = e.at + side * w2, line1 = e.at + side * (w2 + 3);
      // strip end (same solve as city.js walkEnd)
      const f0c = teeCross(e, -6, line0, fJ), f1c = teeCross(e, -6, line1, fJ);
      const f0b = teeCross(e, -8, line0, fJ), f1b = teeCross(e, -8, line1, fJ);
      const walkEnd = e.sgn * (Math.min(
        e.sgn * along(f0c, -6), e.sgn * along(f1c, -6),
        e.sgn * along(f0b, -8), e.sgn * along(f1b, -8),
      ) - 0.8);
      const pt2 = (lineC, alongC) => (e.axis === 'x' ? [lineC, alongC] : [alongC, lineC]);
      const TOP = 0.17, BOT = -0.08;
      const pos = [];
      const tri = (a, b, c) => pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      const A = pt2(line0, walkEnd), B = pt2(line1, walkEnd);
      const edge = [];
      for (let k = 0; k <= 6; k++) {
        const f = f1c + ((f0c - f1c) * k) / 6;
        edge.push(stripPt(pwAt, f, -HALF_ROAD));
      }
      const up = (p) => [p[0], TOP, p[1]];
      let prev = [B[0], TOP, B[1]];
      for (const q of edge) {
        tri([A[0], TOP, A[1]], prev, up(q));
        prev = up(q);
      }
      // curb skirt along the asphalt edge
      for (let k = 0; k < edge.length - 1; k++) {
        const a = edge[k], b = edge[k + 1];
        tri([a[0], TOP, a[1]], [a[0], BOT, a[1]], [b[0], TOP, b[1]]);
        tri([b[0], TOP, b[1]], [a[0], BOT, a[1]], [b[0], BOT, b[1]]);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshLambertMaterial({ color: P.sidewalk, side: THREE.DoubleSide })
      );
      m.receiveShadow = true;
      scene.add(m);
      // thin step-up collider over the fan
      {
        const capA = e.sgn * walkEnd;
        const hi = Math.min(e.sgn * along(f0c, -6), e.sgn * along(f1c, -6));
        const len = Math.max(hi - capA, 0.1);
        const [cx, cz] = pt2((line0 + line1) / 2, e.sgn * (capA + hi) / 2);
        if (e.axis === 'x') col.add(cx, 0, cz, 3, TOP, len);
        else col.add(cx, 0, cz, len, TOP, 3);
      }
      // (b) band gap: continue the inner sidewalk band from its cap up to
      // the street edge line (ended at the crossing that keeps every point
      // off the street asphalt; the fan above covers the leftover sliver)
      const before = f0c < fJ;
      const fCap = before ? Math.min(...cb) : Math.max(...ca);
      const fIn = before ? Math.min(f0c, f0b) : Math.max(f0c, f0b);
      const fa = before ? fCap + 0.004 : fIn;
      const fb = before ? fIn : fCap - 0.004;
      if (fb - fa > 0.01) {
        ribbonRaised(scene, col, frRun(fa, fb), pwAt, -HALF_ROAD - WALK_W, -HALF_ROAD, P.sidewalk);
      }
    }
  }

  // dirt paths through the pocket parks
  {
    let seg = null;
    const flush = () => {
      if (seg && seg.length > 3) ribbon(scene, seg, pathR, -0.85, 0.85, 0.025, P.path);
      seg = null;
    };
    for (const i of ring) {
      if (inPark(i)) (seg ??= []).push(i);
      else flush();
    }
    flush();
  }

  // park props: trees on either side of the path, benches facing the sea,
  // lamps along the path — all clear of the staircases
  for (let i = 0; i < N; i += 3) {
    if (!inPark(i)) continue;
    const th = thAt(i);
    if (nearStair(th)) continue;
    const pr = pathR(i);
    const inEdge = PW_R[i] + HALF_ROAD + WALK_W + 2;
    const outEdge = plateauEdgeR(th) - 5;
    const h = hash(9501, i);
    if (h % 10 < 7) {
      const inner = hash(9502, i) % 2 === 0;
      const r0 = inner ? inEdge : pr + 2.5;
      const r1 = inner ? pr - 2.5 : outEdge;
      if (r1 - r0 > 2) {
        const r = r0 + frac(9503, i) * (r1 - r0);
        tree(g, col, Math.cos(th) * r, Math.sin(th) * r, 0.85 + frac(9504, i) * 0.5, hash(9505, i) % 3);
      }
    }
    if (i % 9 === 0 && outEdge - pr > 4.5) {
      const r = pr + 1.9;
      bench(g, col, Math.cos(th) * r, Math.sin(th) * r, Math.atan2(Math.cos(th), Math.sin(th)));
    }
    if (i % 15 === 0 && pr - inEdge > 3.5) {
      const r = pr - 1.9;
      lamp(g, col, Math.cos(th) * r, Math.sin(th) * r);
    }
  }
}




