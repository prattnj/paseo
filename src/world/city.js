// Assembles the static city: streets, sidewalks, crosswalks, supplemental
// chunks, and the per-cell CITY map that dispatches each grid block to its
// builder. Building geometry lives in src/blocks/; colours in palette.js.
import { GeoBatch } from '../core/geo.js';
import { buildRoads, GRID, EDGE, roadWidth, REMOVED_CELLS, cellRect } from './layout.js';
import { buildParkway } from './parkway.js';
import { buildPaths } from './paths.js';
import { buildArena } from './landmarks/arena.js';
import { buildPrison } from './landmarks/prison.js';
import { buildTrailerPark } from './landmarks/trailerpark.js';
import { buildManor } from './landmarks/manor.js';
import { buildHedgerows } from './landmarks/hedgerow.js';
import { buildBaseball } from './landmarks/baseball.js';
import { buildRomanRuins } from './landmarks/roman-ruins.js';
import { buildFlatiron } from './landmarks/flatiron.js';
import { buildDragstrip } from './landmarks/dragstrip.js';
import { buildFactory } from './landmarks/factory.js';
import { buildFoodTrucks } from './landmarks/foodtrucks.js';
import { buildGrocery } from './landmarks/store.js';
import { buildGarden } from './landmarks/garden.js';
import { buildTank } from './landmarks/tank.js';
import { buildShipwreck } from './landmarks/shipwreck.js';
import { hash, frac } from '../core/util.js';
import { PALETTE as P, SIDEWALK_H } from '../core/palette.js';
import {
  tree, bench, lamp, curbsideParking,
  treeFill,
  buildApartments, buildDowntown, buildOldtown, buildMidrise,
  buildSuburbA, buildSuburbB, buildIndustrial, buildPark, buildCentralPark, buildDirtyPark, buildPlaza,
  buildFireStation, buildChurch,
  buildConstruction,
  buildSchool,
  buildHospital,
  buildCemetery,
  buildPooMan,
  buildMosque,
  buildReservoir,
} from './blocks/index.js';

// ---- roads --------------------------------------------------------------
// Raised sidewalk strip alongside a road (axis 'x': runs along z at x = at).
function walkStrip(g, col, axis, at, from, to) {
  const lo = Math.min(from, to), hi = Math.max(from, to);
  if (hi - lo < 0.6) return;
  const mid = (lo + hi) / 2, len = hi - lo;
  if (axis === 'x') {
    g.boxB(at, 0, mid, 3, SIDEWALK_H, len, P.sidewalk, 0, false);
    col.add(at, 0, mid, 3, SIDEWALK_H, len);
  } else {
    g.boxB(mid, 0, at, len, SIDEWALK_H, 3, P.sidewalk, 0, false);
    col.add(mid, 0, at, len, SIDEWALK_H, 3);
  }
}

// Curb of the outermost block, where the grid ends and the extension
// strips into the parkway begin (EDGE minus the outer road's own half-width).
const OUTER_CURB = EDGE - roadWidth(EDGE) / 2;

// Sections of bay-walk sidewalk to remove (both the geometry and its
// collider). Each cut is a tagged coordinate pair: `{ z: [a, b] }` opens a
// gap in any bay walk that RUNS along z (a N-S strip) where its span crosses
// [a, b]; `{ x: [a, b] }` does the same for a bay walk running along x (an
// E-W strip). Order within a pair doesn't matter. Optionally add
// `at: <coord>` to limit the cut to the one strip at that perpendicular
// position (the x of a z-strip, or the z of an x-strip) — otherwise every
// matching strip in that range is cut. Walk the coast in-game (player.js
// logs x/z to the console) to read off the coordinates.
const BAYWALK_CUTS = [
  { x: [-665, -657], at: -782 },
  { x: [-665, -657], at: -438 },
  { x: [-665, -657], at: -122 },
  { x: [-775, -767], at: -12 },
  //{ x: [-673, -657], at: 232 },
  { z: [-115, -107], at: -672 },
  { x: [107, 123], at: -452 },
  { x: [-233, -225], at: -782 },
  { z: [-775, -767], at: -218 },
];

// Subtract any applicable BAYWALK_CUTS from a strip's [lo, hi] span,
// returning the surviving sub-segments. `spanKey` is the coordinate the span
// is measured in ('z' for an axis-'x' strip, 'x' for an axis-'z' one); `perp`
// is the strip's fixed perpendicular coordinate (matched against `at`).
function bayWalkSegments(spanKey, perp, lo, hi) {
  let segs = [[Math.min(lo, hi), Math.max(lo, hi)]];
  for (const cut of BAYWALK_CUTS) {
    const range = cut[spanKey];
    if (!range) continue;
    if (cut.at !== undefined && Math.abs(cut.at - perp) > 0.5) continue;
    const ca = Math.min(range[0], range[1]), cb = Math.max(range[0], range[1]);
    const next = [];
    for (const [a, b] of segs) {
      if (cb <= a || ca >= b) { next.push([a, b]); continue; } // no overlap
      if (ca > a) next.push([a, ca]);   // keep the piece before the cut
      if (cb < b) next.push([cb, b]);   // keep the piece after the cut
    }
    segs = next;
  }
  return segs;
}

// Sidewalks along road edges facing the bay mouths — those cells have no
// block, so the flanking roads were missing a sidewalk on that side.
function buildBayWalks(g, col) {
  const segs = new Set(buildRoads().map((s) => s.axis + ':' + s.at + ':' + s.from));
  const has = (axis, at, from) => segs.has(axis + ':' + at + ':' + from);
  for (const key of REMOVED_CELLS) {
    const [i, j] = key.split(',').map(Number);
    const cx = [GRID[i], GRID[i + 1]], cz = [GRID[j], GRID[j + 1]];
    for (const e of [
      { axis: 'x', at: cx[0], dir: 1, lo: cz[0], hi: cz[1], perpFrom: cx[0] },
      { axis: 'x', at: cx[1], dir: -1, lo: cz[0], hi: cz[1], perpFrom: cx[0] },
      { axis: 'z', at: cz[0], dir: 1, lo: cx[0], hi: cx[1], perpFrom: cz[0] },
      { axis: 'z', at: cz[1], dir: -1, lo: cx[0], hi: cx[1], perpFrom: cz[0] },
    ]) {
      if (Math.abs(e.at) === EDGE || !has(e.axis, e.at, e.lo)) continue;
      const c = e.at + e.dir * (roadWidth(e.at) / 2 + 1.5);
      const perp = e.axis === 'x' ? 'z' : 'x';
      // 'z' strips are inset past the 'x' strips at shared corners; strips
      // butt at the cell line when the perpendicular road was deleted
      const end = (v, sgn) => {
        if (Math.abs(v) === EDGE) return Math.sign(v) * OUTER_CURB; // meet the extension strips
        if (!has(perp, v, e.perpFrom)) return v;
        return v + sgn * (roadWidth(v) / 2 + (e.axis === 'z' ? 3 : 0));
      };
      // clip the strip around any BAYWALK_CUTS covering it, then draw the
      // surviving pieces (span is z for an 'x' strip, x for a 'z' strip)
      const spanKey = e.axis === 'x' ? 'z' : 'x';
      for (const [a, b] of bayWalkSegments(spanKey, c, end(e.lo, 1), end(e.hi, -1))) {
        walkStrip(g, col, e.axis, c, a, b);
      }
    }
  }
}

// ---- supplemental chunks ------------------------------------------------
// Hand-placed extra road and sidewalk chunks, independent of the grid and of
// each other (a road chunk never implies a sidewalk, or vice versa). Each is
// an axis-aligned rectangle given by its x- and z-extents; the asphalt (or
// sidewalk) simply fills that box. Optional `ry` (radians) rotates the box
// about its own center for the rare angled piece. Colour and slab thickness
// are fixed: every road chunk is P.road at ROAD_H, every sidewalk chunk is
// P.sidewalk at SIDEWALK_H (matching the grid). Walk the spot in-game
// (player.js logs x/z) to read off the corners. x1/x2 and z1/z2 may be given
// in either order.
const ROAD_H = 0.04; // asphalt slab thickness (matches grid roads below)

// Road chunks: filled with P.road, flat on the ground, no collider (cars and
// the player drive/walk straight over asphalt).
const EXTRA_ROADS = [
  // { x1: 100, x2: 160, z1: -300, z2: -290, ry: 0.3 }, // angled piece
  { x1: -225, x2: -220, z1: -780, z2: -775 },
  { x1: -670, x2: -665, z1: -780, z2: -775 },
  { x1: -670, x2: -665, z1: -445, z2: -440 },
  { x1: -670, x2: -665, z1: -120, z2: -115 },
  { x1: -780, x2: -775, z1: -10, z2: 0 },
  { x1: -780, x2: -775, z1: 225, z2: 230 },
  { x1: -10, x2: 0, z1: 775, z2: 780 },
  { x1: 445, x2: 450, z1: 775, z2: 780 },
  { x1: 555, x2: 560, z1: 665, z2: 670 },
  { x1: 665, x2: 670, z1: 555, z2: 560 },
  { x1: 885, x2: 890, z1: 445, z2: 450 },
  { x1: 885, x2: 890, z1: -10, z2: 0 },
  { x1: 775, x2: 780, z1: -120, z2: -115 },
  { x1: 665, x2: 670, z1: -230, z2: -225 },
  { x1: 555, x2: 560, z1: -450, z2: -445 },
  { x1: 0, x2: 10, z1: -560, z2: -555 },
  { x1: -115, x2: -110, z1: -670, z2: -665 },
];

// Sidewalk chunks: filled with P.sidewalk, raised, with a step-up collider so
// the player mounts it like any other curb.
const EXTRA_WALKS = [
  { x1: -673, x2: -670, z1: -780, z2: -775 },
  { x1: -673, x2: -670, z1: -445, z2: -440 },
  { x1: -783, x2: -780, z1: -10, z2: 0 },
  { x1: -783, x2: -780, z1: 225, z2: 233 },
  { x1: -780, x2: -775, z1: 230, z2: 233 },
  { x1: -13, x2: -10, z1: 775, z2: 783 },
  { x1: -10, x2: 0, z1: 780, z2: 783 },
  { x1: 445, x2: 450, z1: 780, z2: 783 },
  { x1: 450, x2: 453, z1: 775, z2: 783 },
  { x1: 555, x2: 560, z1: 670, z2: 673 },
  { x1: 560, x2: 563, z1: 665, z2: 673 },
  { x1: 665, x2: 670, z1: 560, z2: 563 },
  { x1: 670, x2: 673, z1: 555, z2: 563 },
  { x1: 885, x2: 890, z1: 450, z2: 453 },
  { x1: 890, x2: 893, z1: 445, z2: 453 },
  { x1: 885, x2: 890, z1: -13, z2: -10 },
  { x1: 890, x2: 893, z1: -13, z2: 0 },
  { x1: 775, x2: 780, z1: -123, z2: -120 },
  { x1: 780, x2: 783, z1: -123, z2: -115 },
  { x1: 665, x2: 670, z1: -233, z2: -230 },
  { x1: 670, x2: 673, z1: -233, z2: -225 },
  { x1: 555, x2: 560, z1: -453, z2: -450 },
  { x1: 560, x2: 563, z1: -453, z2: -445 },
  { x1: 0, x2: 10, z1: -563, z2: -560 },
  { x1: 10, x2: 13, z1: -563, z2: -555 },
  { x1: -115, x2: -110, z1: -673, z2: -670 },
  { x1: -110, x2: -107, z1: -673, z2: -665 },
];

function buildExtras(g, col) {
  for (const r of EXTRA_ROADS) {
    const cx = (r.x1 + r.x2) / 2, cz = (r.z1 + r.z2) / 2;
    const w = Math.abs(r.x2 - r.x1), d = Math.abs(r.z2 - r.z1);
    g.boxB(cx, 0, cz, w, ROAD_H, d, P.road, r.ry || 0, false);
  }
  for (const s of EXTRA_WALKS) {
    const cx = (s.x1 + s.x2) / 2, cz = (s.z1 + s.z2) / 2;
    const w = Math.abs(s.x2 - s.x1), d = Math.abs(s.z2 - s.z1);
    g.boxB(cx, 0, cz, w, SIDEWALK_H, d, P.sidewalk, s.ry || 0, false);
    col.add(cx, 0, cz, w, SIDEWALK_H, d, s.ry || 0);
  }
}

// Width of the curb parking lane on the avenues (the strip between the white
// divider line and the curb); a parked car sits here.
const AVE_PARK_LANE = 2.8;

function buildRoadGeometry(g, col) {
  for (const s of buildRoads()) {
    const len = s.to - s.from;
    const mid = (s.from + s.to) / 2;
    if (s.axis === 'x') {
      g.boxB(s.at, 0, mid, s.width, 0.04, len, P.road, 0, false);
    } else {
      g.boxB(mid, 0, s.at, len, 0.05, s.width, P.road, 0, false);
    }
    // center dashes (kept clear of the crosswalk bands at both ends)
    const n = Math.floor((len - 26) / 7);
    for (let i = 0; i < n; i++) {
      const p = s.from + 13 + i * 7 + 3.5;
      if (s.axis === 'x') g.boxB(s.at, 0.05, p, 0.35, 0.02, 2.4, P.dash, 0, false);
      else g.boxB(p, 0.05, s.at, 2.4, 0.02, 0.35, P.dash, 0, false);
    }
    // on the avenues (20m), a solid white line down each side splits the curb
    // parking lane from the driving lane. Extend it the full segment length,
    // stopping each end just past the crosswalk band: the crosswalk sits at
    // the perpendicular road's half-width + 1.9m, with ~1.15m half-depth, so
    // clear roadWidth/2 + 3.55 (incl. a small gap) at each end.
    if (s.width >= 20) {
      const off = s.width / 2 - AVE_PARK_LANE; // centerline -> line
      const clear = (w) => w / 2 + 3.55;
      const lo = s.from + clear(roadWidth(s.from));
      const hi = s.to - clear(roadWidth(s.to));
      if (hi > lo) {
        const c = (lo + hi) / 2, lineLen = hi - lo;
        for (const sgn of [-1, 1]) {
          if (s.axis === 'x') g.boxB(s.at + sgn * off, 0.05, c, 0.25, 0.02, lineLen, P.dash, 0, false);
          else g.boxB(c, 0.05, s.at + sgn * off, lineLen, 0.02, 0.25, P.dash, 0, false);
        }
      }
    }
  }
}

// One zebra crosswalk band centered at (cx, cz). `spanX` true lays the stripe
// band across the x direction (a crossing over a N-S road); false across z (an
// E-W road). `span` is the road width the band covers.
function zebra(g, cx, cz, spanX, span) {
  const nBars = Math.floor((span - 0.55) / 1.1) + 1;
  const off0 = (-(nBars - 1) * 1.1) / 2;
  for (let i = 0; i < nBars; i++) {
    const o = off0 + i * 1.1;
    if (spanX) g.boxB(cx + o, 0.055, cz, 0.55, 0.02, 2.3, P.dash, 0, false);
    else g.boxB(cx, 0.055, cz + o, 2.3, 0.02, 0.55, P.dash, 0, false);
  }
}

// Zebra crosswalks on every leg of every 3- and 4-way grid intersection.
function buildCrosswalks(g) {
  const segs = new Set(buildRoads().map((s) => s.axis + ':' + s.at + ':' + s.from));
  const has = (axis, at, from) => segs.has(axis + ':' + at + ':' + from);
  for (let ia = 1; ia < GRID.length - 1; ia++) {
    for (let ib = 1; ib < GRID.length - 1; ib++) {
      const a = GRID[ia], b = GRID[ib]; // a: x of the N-S road, b: z of the E-W road
      const wa = roadWidth(a), wb = roadWidth(b);
      const legN = has('x', a, GRID[ib - 1]);
      const legS = has('x', a, b);
      const legW = has('z', b, GRID[ia - 1]);
      const legE = has('z', b, a);
      if (legN + legS + legW + legE < 3) continue;
      if (legN) zebra(g, a, b - wb / 2 - 1.9, true, wa - 0.4);
      if (legS) zebra(g, a, b + wb / 2 + 1.9, true, wa - 0.4);
      if (legW) zebra(g, a - wa / 2 - 1.9, b, false, wb - 0.4);
      if (legE) zebra(g, a + wa / 2 + 1.9, b, false, wb - 0.4);
    }
  }
}

// Extra hand-placed zebra crosswalks for spots the automatic grid crosswalks
// miss — parkway↔grid junctions and outer grid corners. All grid-aligned.
// Each entry: a center { x, z } and `span` = the axis the stripe band extends
// along (the road-width direction): 'x' for a crossing over a N-S road (one
// running along z), 'z' for a crossing over an E-W road. Set `avenue: true`
// for the double-wide crossings over the 20m x=0 / z=0 avenues. Walk the spot
// in-game (player.js logs x/z) to read off the center.
const CROSSWALK_W = 10; // standard road width the band spans (avenues are 2x)
const EXTRA_CROSSWALKS = [
  { x: -225, z: -768.5, span: 'x' },
  { x: -225, z: -781.5, span: 'x' },
  { x: -231.5, z: -775, span: 'z' },
  { x: -218.5, z: -775, span: 'z' },
  { x: -665, z: -768.5, span: 'x' },
  { x: -665, z: -781.5, span: 'x' },
  { x: -658.5, z: -775, span: 'z' },
  { x: -665, z: -438.5, span: 'x' },
  { x: -665, z: -451.5, span: 'x' },
  { x: -658.5, z: -445, span: 'z' },
  { x: -665, z: -108.5, span: 'x' },
  { x: -665, z: -121.5, span: 'x' },
  { x: -671.5, z: -115, span: 'z' },
  { x: -658.5, z: -115, span: 'z' },
  { x: -775, z: 11.5, span: 'x' },
  { x: -775, z: -11.5, span: 'x' },
  { x: -768.5, z: 0, span: 'z', avenue: true },
  { x: -775, z: 218.5, span: 'x' },
  { x: -768.5, z: 225, span: 'z' },
  //{ x: -665, z: 231.5, span: 'x' },
  { x: 0, z: 768.5, span: 'x', avenue: true },
  { x: 11.5, z: 775, span: 'z' },
  { x: 445, z: 768.5, span: 'x' },
  { x: 438.5, z: 775, span: 'z' },
  { x: 555, z: 658.5, span: 'x' },
  { x: 548.5, z: 665, span: 'z' },
  { x: 665, z: 548.5, span: 'x' },
  { x: 658.5, z: 555, span: 'z' },
  { x: 885, z: 438.5, span: 'x' },
  { x: 878.5, z: 445, span: 'z' },
  { x: 885, z: 11.5, span: 'x' },
  { x: 878.5, z: 0, span: 'z', avenue: true },
  { x: 775, z: -108.5, span: 'x' },
  { x: 768.5, z: -115, span: 'z' },
  { x: 665, z: -218.5, span: 'x' },
  { x: 658.5, z: -225, span: 'z' },
  { x: 555, z: -438.5, span: 'x' },
  { x: 548.5, z: -445, span: 'z' },
  { x: 115, z: -451.5, span: 'x' },
  { x: 0, z: -548.5, span: 'x', avenue: true },
  { x: -11.5, z: -555, span: 'z' },
  { x: -115, z: -658.5, span: 'x' },
  { x: -121.5, z: -665, span: 'z' },
];

function buildExtraCrosswalks(g) {
  for (const c of EXTRA_CROSSWALKS) {
    const span = (c.avenue ? 2 * CROSSWALK_W : CROSSWALK_W) - 0.4;
    zebra(g, c.x, c.z, c.span === 'x', span);
  }
}

// ---- clouds -------------------------------------------------------------
function buildClouds(g) {
  const spots = [
    [-380, 150, -200], [220, 170, -420], [500, 140, 300], [-150, 160, 420],
    [80, 180, 60], [-550, 150, -500], [420, 165, -120], [-320, 175, 320],
  ];
  let k = 0;
  for (const [x, y, z] of spots) {
    const n = 3 + (hash(k, 1) % 3);
    for (let i = 0; i < n; i++) {
      const ox = (frac(k, i, 2) - 0.5) * 26;
      const oz = (frac(k, i, 3) - 0.5) * 14;
      const s = 7 + frac(k, i, 4) * 9;
      g.box(x + ox, y + (frac(k, i, 5) - 0.5) * 4, z + oz, s, s * 0.35, s * 0.7, 0xffffff);
    }
    k++;
  }
}

// ---- tree fills ---------------------------------------------------------
// Hand-placed clumps of trees for the leftover green-belt gaps around the map
// edge. Each entry is a rectangle (corners in any order) and `n`, how many
// trees to scatter into it — placement is deterministic and keeps clear of
// buildings and of the other trees in the fill. Walk the gap in-game (player.js
// logs x/z to the console) to read off the corners.
const TREE_FILLS = [
  // { x1: -985, x2: -900, z1: 300, z2: 520, n: 40 },
];

function buildTreeFills(g, col) {
  for (const f of TREE_FILLS) {
    treeFill(g, col, f.x1, f.x2, f.z1, f.z2, f.n, hash(Math.round(f.x1), Math.round(f.z1)));
  }
}

// ---- main entry ---------------------------------------------------------
export function buildCity(scene, col) {
  const g = new GeoBatch();

  // (the island mesh in island.js provides the ground/water now)

  buildRoadGeometry(g, col);
  buildBayWalks(g, col);
  buildCrosswalks(g);
  buildExtraCrosswalks(g);
  buildParkway(scene, g, col, { tree, bench, lamp, P });
  buildPaths(scene, P);
  buildExtras(g, col);
  buildArena(g, col, scene);
  buildPrison(g, col, scene);
  buildTrailerPark(g, col, scene);
  buildManor(g, col, scene);
  buildHedgerows(g, col);
  buildBaseball(g, col, scene);
  buildRomanRuins(g, col, scene);
  buildFlatiron(g, col, scene);
  buildDragstrip(g, col, scene);
  buildFactory(g, col);
  buildFoodTrucks(g, col, scene);
  buildGarden(g, col, scene);
  buildTank(g, col, scene);
  buildShipwreck(g, col, scene);

  for (const b of resolveBlocks()) {
    const seed = hash(Math.round(b.x0), Math.round(b.z0));
    const fn = b.build || TYPE_BUILDERS[b.type];
    if (fn) fn(g, col, b, seed, scene);
    else console.warn(`CITY: no builder for type '${b.type}' (cell ${b.i},${b.j})`);
  }

  buildTreeFills(g, col); // after blocks so tree scatter avoids the buildings

  //buildClouds(g);
  curbsideParking();

  const group = g.build();
  scene.add(group);
  return group;
}

// ---- city block map -----------------------------------------------------
// Every built grid cell is assigned here by grid index — nothing is derived
// from position anymore. Each entry covers either a single cell ({ i, j }) or
// a rectangular run of cells ({ ix0, iz0, ix1, iz1 }, upper indices EXCLUSIVE,
// same convention as cellRect). An entry sets:
//   type   a label; also selects the shared builder for repeatable districts
//   build  (optional) a builder for a one-off cell — overrides the type
//          dispatch. Signature (g, col, b, seed, scene); reads b.opts.
//   opts   (optional) freeform per-cell knobs, handed to the builder as b.opts
// Multi-cell blocks still need their interior roads removed via DELETED in
// layout.js. Every non-removed cell must appear exactly once — resolveBlocks()
// warns at load about any gaps, overlaps, or removed-cell entries.

// Repeatable district types → their shared builder.
const TYPE_BUILDERS = {
  downtown: buildDowntown,
  apartments: buildApartments,
  suburbA: buildSuburbA,
  suburbB: buildSuburbB,
  midrise: buildMidrise,
  oldtown: buildOldtown,
  industrial: buildIndustrial,
  park: buildPark,
  dirtypark: buildDirtyPark,
};

const CITY = [

  // upper class suburbs
  { i: 2, j: 1, type: 'suburbA' }, { i: 3, j: 1, type: 'suburbA' }, { i: 4, j: 1, type: 'suburbA' }, { i: 5, j: 1, type: 'suburbA' },
  { i: 2, j: 2, type: 'suburbA' }, { i: 4, j: 2, type: 'suburbA' }, { i: 5, j: 2, type: 'suburbA' }, { i: 6, j: 2, type: 'suburbA' },
  { i: 2, j: 3, type: 'suburbA' }, { i: 3, j: 3, type: 'suburbA' }, { i: 4, j: 3, type: 'suburbA' }, { i: 6, j: 3, type: 'suburbA' }, { i: 7, j: 3, type: 'suburbA' },
  
  // lower class suburbs
  { i: 12, j: 6, type: 'suburbB' }, { i: 12, j: 8, type: 'suburbB' }, { i: 12, j: 9, type: 'suburbB' }, { i: 12, j: 10, type: 'suburbB' },
  { i: 13, j: 6, type: 'suburbB' }, { i: 13, j: 8, type: 'suburbB' }, { i: 13, j: 10, type: 'suburbB' },
  { i: 14, j: 7, type: 'suburbB' }, { i: 14, j: 8, type: 'suburbB' }, { i: 14, j: 9, type: 'suburbB' }, { i: 14, j: 10, type: 'suburbB' }, { i: 14, j: 11, type: 'suburbB' },
  { i: 15, j: 8, type: 'suburbB' }, { i: 15, j: 9, type: 'suburbB' }, { i: 15, j: 10, type: 'suburbB' }, { i: 15, j: 11, type: 'suburbB' },

  // apartments
  { i: 1, j: 8, type: 'apartments' }, { i: 1, j: 9, type: 'apartments' }, { i: 2, j: 7, type: 'apartments' }, { i: 2, j: 8, type: 'apartments' }, { i: 2, j: 9, type: 'apartments' },
  { i: 3, j: 5, type: 'apartments' }, { i: 3, j: 6, type: 'apartments' }, { i: 3, j: 7, type: 'apartments' }, { i: 3, j: 8, type: 'apartments' }, { i: 3, j: 9, type: 'apartments' },

  // parks
  { ix0: 5, iz0: 6, ix1: 7, iz1: 8, type: 'park-central', build: buildCentralPark },
  { i: 3, j: 2, type: 'park' }, { i: 8, j: 12, type: 'park', build: buildDirtyPark }, { i: 13, j: 9, type: 'park' },

  // industrial
  { i: 8, j: 13, type: 'industrial' }, { i: 9, j: 13, type: 'industrial' }, { i: 10, j: 13, type: 'industrial' }, { i: 11, j: 13, type: 'industrial' }, { i: 12, j: 13, type: 'industrial' },
  { i: 8, j: 14, type: 'industrial' }, { i: 9, j: 14, type: 'industrial' }, { i: 10, j: 14, type: 'industrial' }, { i: 11, j: 14, type: 'industrial' },

  // downtown
  { i: 5, j: 5, type: 'downtown' }, { i: 6, j: 5, type: 'downtown' }, { i: 7, j: 5, type: 'downtown' }, { i: 8, j: 5, type: 'downtown' }, { i: 9, j: 5, type: 'downtown' }, { i: 10, j: 5, type: 'downtown' },
  { i: 7, j: 6, type: 'downtown' }, { i: 10, j: 6, type: 'downtown' }, { i: 7, j: 7, type: 'downtown' }, { i: 10, j: 7, type: 'downtown' },
  { i: 5, j: 8, type: 'downtown' }, { i: 6, j: 8, type: 'downtown' }, { i: 7, j: 8, type: 'downtown' }, { i: 8, j: 8, type: 'downtown' }, { i: 9, j: 8, type: 'downtown' }, { i: 10, j: 8, type: 'downtown' },
  { i: 8, j: 9, type: 'downtown' }, { i: 9, j: 9, type: 'downtown' }, { i: 10, j: 9, type: 'downtown' },
  { i: 8, j: 10, type: 'downtown' }, { i: 10, j: 10, type: 'downtown' },
  { i: 8, j: 11, type: 'downtown' }, { i: 9, j: 11, type: 'downtown' }, { i: 10, j: 11, type: 'downtown' },

  // commercial
  { i: 3, j: 4, type: 'midrise' }, { i: 4, j: 4, type: 'midrise' }, { i: 5, j: 4, type: 'midrise' }, { i: 6, j: 4, type: 'midrise' }, { i: 7, j: 4, type: 'midrise' },
  { i: 9, j: 4, type: 'midrise' }, { i: 10, j: 4, type: 'midrise' }, { i: 11, j: 4, type: 'midrise' }, { i: 12, j: 4, type: 'midrise' },
  { i: 4, j: 5, type: 'midrise' }, { i: 4, j: 6, type: 'midrise' }, { i: 4, j: 7, type: 'midrise' }, { i: 4, j: 8, type: 'midrise' }, { i: 4, j: 9, type: 'midrise' },
  { i: 11, j: 6, type: 'midrise' }, { i: 11, j: 7, type: 'midrise' }, { i: 11, j: 8, type: 'midrise' }, { i: 11, j: 9, type: 'midrise' }, { i: 11, j: 11, type: 'midrise' }, { i: 11, j: 12, type: 'midrise' },
  { i: 12, j: 5, type: 'midrise' },

  // old town
  { i: 5, j: 9, type: 'oldtown' }, { i: 6, j: 9, type: 'oldtown' }, { i: 7, j: 9, type: 'oldtown' },

  // other
  { ix0: 8, iz0: 6, ix1: 10, iz1: 8, type: 'plaza', build: buildPlaza },
  { ix0: 12, iz0: 11, ix1: 14, iz1: 13, type: 'construction', build: buildConstruction },
  { i: 5, j: 3, type: 'school', build: buildSchool },
  { i: 11, j: 5, type: 'hospital', build: buildHospital },
  { i: 12, j: 7, type: 'church', build: buildChurch },
  { i: 13, j: 7, type: 'cemetery', build: buildCemetery },
  { i: 9, j: 10, type: 'poo-man', build: buildPooMan },
  { i: 11, j: 10, type: 'firestation', build: buildFireStation },
  { i: 9, j: 12, type: 'mosque', build: buildMosque },
  { i: 10, j: 12, type: 'reservoir', build: buildReservoir },
  { i: 8, j: 4, type: 'grocery', build: buildGrocery },
];

// Expand CITY into laid-out block objects (once), validating coverage.
let _blocks = null;
function resolveBlocks() {
  if (_blocks) return _blocks;
  const blocks = [];
  const seen = new Map(); // "i,j" -> type, for overlap/coverage checks
  let id = 0;
  for (const e of CITY) {
    const ix0 = e.ix0 ?? e.i, iz0 = e.iz0 ?? e.j;
    const ix1 = e.ix1 ?? (e.i + 1), iz1 = e.iz1 ?? (e.j + 1);
    const r = cellRect(ix0, iz0, ix1, iz1);
    blocks.push({ ...r, i: ix0, j: iz0, type: e.type, opts: e.opts || null, build: e.build || null, id: id++ });
    for (let i = ix0; i < ix1; i++)
      for (let j = iz0; j < iz1; j++) {
        const key = i + ',' + j;
        if (REMOVED_CELLS.has(key)) console.warn(`CITY: entry '${e.type}' covers removed cell ${key}`);
        if (seen.has(key)) console.warn(`CITY: cell ${key} covered twice ('${seen.get(key)}' & '${e.type}')`);
        seen.set(key, e.type);
      }
  }
  const NC = GRID.length - 1;
  for (let i = 0; i < NC; i++)
    for (let j = 0; j < NC; j++) {
      const key = i + ',' + j;
      if (!REMOVED_CELLS.has(key) && !seen.has(key)) console.warn(`CITY: built cell ${key} has no entry`);
    }
  _blocks = blocks;
  return blocks;
}
export { resolveBlocks as getBlocks };
