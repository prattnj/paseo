// A large 18th-century wooden ship run aground and wrecked on the NE beach at
// world (604, 820) — a partial, dramatically listing hull with three broken
// masts, tattered rigging and a boardable deck. Like tank.js / roman-ruins.js
// this is a hand-placed WORLD-COORDINATE feature, not a layout.js grid cell:
// it sits on open beach that nothing else owns.
//
// The one engine tension this build resolves: GeoBatch and the collider world
// are BOTH yaw-only (no pitch/roll), and the player walks on TOP of collider
// boxes via a <=0.45 m step-up (that's how the tank pad works). So the wreck is
// split into two layers that share the same footprint:
//
//   1. THE VISUAL HULL (this file's big THREE.Group `hull`) is tilted freely —
//      a bow-up PITCH and a heavy sideways LIST (roll) — to sell the wreck.
//      Everything in it (planked hull, deck, bulwarks, stern castle, masts,
//      yards, rotting sails, rigging, deck clutter) is standalone meshes,
//      because a batched/collider box can only carry a yaw. The group pivots
//      about the DECK CENTRELINE (local y=0), so the deck crown stays put and
//      only the beam edges rise/fall as it heels.
//
//   2. THE WALKABLE LAYER is level, world-axis colliders on that same centre:
//      a flat deck box whose top sits exactly at the crown height MD, ringed by
//      bulwark rails (with a gap amidships on the landward side), reached by a
//      stepped gangplank up from the dry sand. So you board and walk a flat,
//      rail-bounded deck while the hull, masts and rigging cant dramatically
//      around you — honest to the physics, and bug-free underfoot.
//
// Orientation: the ship lies BROADSIDE to the beach (keel along the shore
// tangent), bow up-coast, listing toward the SEA (starboard, downhill into the
// surf) with the landward port rail low over the dry sand where you climb
// aboard. Everything is deterministic (fixed geometry + coord-seeded hashes;
// no Math.random).
import * as THREE from 'three';
import { PALETTE as P } from '../../core/palette.js';
import { groundHeight } from '../island.js';
import { hash, frac, pick } from '../../core/util.js';

// ---- placement & orientation --------------------------------------------
const CX = 604, CZ = 820;                 // wreck centre, on the NE beach
const TH = Math.atan2(CZ, CX);            // bearing out to sea from the island
// Basis in the beach plane: T = shore tangent (the keel / bow line, up-coast),
// R = radial seaward (starboard, into the surf). Landward (port, boarding side)
// is -R.
const T = { x: -Math.sin(TH), z: Math.cos(TH) };
const R = { x: Math.cos(TH), z: Math.sin(TH) };
const RY = Math.atan2(T.x, T.z);          // yaw that lays local +z along the bow line

const G0 = groundHeight(CX, CZ);          // sand height under the wreck (~ -6.47)
const MD = G0 + 4.3;                        // main-deck crown height (world y): high
// enough that even the low (port) side clears ~2 m of headroom over the hold so
// you can walk in through the landward breach.
const KEEL_LOCAL = -5.2;                   // keel bottom, in deck-relative local y
const RAIL_H = 1.15;                        // bulwark rail height above the deck

// The dramatic list. It heels toward the LAND (port down) so the low rail dips
// over the dry sand where you board, and the masts rake out over the beach. The
// walkable deck is a terraced stack of level strips that hug this heel (see
// buildColliders), so the ship lists hard while the footing stays honest; that
// only works if the deck plane stays level fore-aft, so there is no bow pitch.
const LIST = 18 * Math.PI / 180;           // heel toward land (port/landward down)
const TERRACE_W = 1.1;                      // deck-strip width: 1.1*sin18 = 0.34 m rise/step (< 0.45 step-up)

// Hull envelope (local): z in [-HALF_L, +HALF_L], half-beam HB(t) below.
const HALF_L = 22, HB_MAX = 6;

// World point from ship-plane offsets: f = fore-aft (+bow), s = starboard
// (+seaward), y = world height. Used for the level colliders / gangplank.
function W(f, s, y) {
  return { x: CX + T.x * f + R.x * s, y, z: CZ + T.z * f + R.z * s };
}

// Half-beam as a function of t = z / HALF_L in [-1,1]: full amidships, tapering
// to a fine bow (t>0) and a fuller stern (t<0).
function halfBeam(t) {
  const base = HB_MAX * Math.sqrt(Math.max(0, 1 - 0.88 * t * t));
  return base * (t > 0 ? 1 - 0.28 * t : 1 + 0.05 * t);
}
// Sheer: the rail line lifts toward bow and (more) stern for the galleon curve.
function sheer(t) { return 0.35 * t * t + (t < 0 ? 0.6 * t * t : 0); }

// ---- shared hull profile (used by BOTH the visual planking and the hull-side
// colliders, so they line up) ------------------------------------------------
const NST = 12, STRK = 6;                   // longitudinal stations / vertical strakes
const zAt = (i) => -HALF_L + (2 * HALF_L) * i / NST;
const gAt = (fm) => 0.18 + 0.82 * fm;        // side half-beam scale: keel(0) -> sheer(1)
// Missing planks (the "partial hull"): a big breach high on the SEAWARD hull,
// and a tall walk-in gap low on the LANDWARD side (station 5-6) so the player
// can clamber into the hold — the collider bands skip exactly the same cells.
const breached = (side, i, k) =>
  (side > 0 && k >= 3 && i >= 4 && i <= 8 && ((i + k) % 5 !== 0)) ||   // seaward, upper
  (side < 0 && k <= 4 && (i === 5 || i === 6));                        // landward, floor->head

// World position of the tilted hull's OUTER surface at side(-1 port / +1 stbd),
// station-mid tm in [-1,1], strake fraction fm (0=keel, 1=sheer). Applies the
// LIST roll about the deck centreline exactly as the visual group does (its
// rotation is Ry*Rz with Rx=0), so anything built from this lines up with the
// planking. Returns ship-plane offsets for W(): f (fore-aft), s (starboard) and
// the world height wy.
function hullSurface(side, tm, fm) {
  const xl = side * halfBeam(tm) * gAt(fm);
  const yl = KEEL_LOCAL * (1 - fm) + sheer(tm) * fm;
  const c = Math.cos(LIST), s = Math.sin(LIST);
  return { f: tm * HALF_L, s: xl * c - yl * s, wy: MD + xl * s + yl * c };
}

// ---- little mesh kit (everything lives in the tilted `hull` group) --------
const MATS = new Map();
function mat(hex) {
  let m = MATS.get(hex);
  if (!m) { m = new THREE.MeshLambertMaterial({ color: hex, flatShading: true }); MATS.set(hex, m); }
  return m;
}
const UP = new THREE.Vector3(0, 1, 0);

// Axis-aligned (local) box, centre-anchored, optional local-yaw.
function box(g, hex, x, y, z, sx, sy, sz, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat(hex));
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = true; m.receiveShadow = true;
  g.add(m);
  return m;
}
// A beam/plank/spar spanning p0->p1 with cross-section w (across) x th (thick).
function beam(g, hex, p0, p1, w, th) {
  const dir = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
  const len = dir.length();
  if (len < 1e-4) return;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, th), mat(hex));
  m.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
  m.position.set((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2);
  m.castShadow = true; m.receiveShadow = true;
  g.add(m);
  return m;
}
// A round spar (masts, bowsprit) from p0->p1.
function spar(g, hex, p0, p1, r) {
  const dir = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, len, 8), mat(hex));
  m.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
  m.position.set((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2);
  m.castShadow = true; m.receiveShadow = true;
  g.add(m);
  return m;
}

// ---- the visual hull ------------------------------------------------------
// Built in deck-relative local coords (deck y=0, keel y=KEEL_LOCAL, +z bow,
// +x starboard/seaward) then tilted as one group.
function buildHullMeshes(g) {
  // NST/STRK/zAt/gAt/breached are shared module-scope profile helpers so the
  // visual planking and the hull-side colliders stay in lock-step.
  for (const side of [-1, 1]) {            // -1 port (landward), +1 starboard (sea)
    for (let k = 0; k < STRK; k++) {
      const f0 = k / STRK, f1 = (k + 1) / STRK;
      const fm = (f0 + f1) / 2;
      for (let i = 0; i < NST; i++) {
        if (breached(side, i, k)) continue;
        const t0 = zAt(i) / HALF_L, t1 = zAt(i + 1) / HALF_L;
        const hb0 = halfBeam(t0), hb1 = halfBeam(t1);
        const y0 = KEEL_LOCAL * (1 - fm) + (sheer(t0)) * fm;   // strake y at station i
        const y1 = KEEL_LOCAL * (1 - fm) + (sheer(t1)) * fm;
        const x0 = side * hb0 * gAt(fm), x1 = side * hb1 * gAt(fm);
        const p0 = [x0, y0 + fm * 0.0, zAt(i)];
        const p1 = [x1, y1 + fm * 0.0, zAt(i + 1)];
        const shade = k === 0 ? P.shipHullDark : (k >= STRK - 1 ? P.shipHullLt : P.shipHull);
        beam(g, shade, p0, p1, 0.9 - 0.02 * k, (f1 - f0) * (Math.abs(KEEL_LOCAL) + 0.4) + 0.18);
      }
    }
  }

  // Transverse ribs/frames at each station (show through the breach & over the
  // open deck), plus a keelson down the centre.
  for (let i = 1; i < NST; i++) {
    const t = zAt(i) / HALF_L, hb = halfBeam(t);
    for (const side of [-1, 1])
      beam(g, P.shipDeckDark, [0, KEEL_LOCAL + 0.3, zAt(i)],
        [side * hb * gAt(1), sheer(t), zAt(i)], 0.28, 0.28);
  }
  beam(g, P.shipHullDark, [0, KEEL_LOCAL, -HALF_L], [0, KEEL_LOCAL, HALF_L], 0.5, 0.6);

  // Deck planking: fore-aft planks filling the beam at y=0 (the visual crown),
  // with a rectangular cargo hatch left open amidships.
  const NP = 15;
  for (let p = 0; p < NP; p++) {
    const x = -HB_MAX + (2 * HB_MAX) * (p + 0.5) / NP;
    const g1 = gAt(1);
    // z-extent where |x| still fits inside the hull (deck follows the taper)
    let zlo = -HALF_L + 1, zhi = HALF_L - 1.5;
    for (let s = 0; s < 40; s++) {          // clip ends to the hull outline
      const tt = -1 + 2 * s / 39; const hb = halfBeam(tt) * g1;
      if (Math.abs(x) > hb - 0.2) { const zz = tt * HALF_L; if (zz < 0) zlo = Math.max(zlo, zz); else zhi = Math.min(zhi, zz); }
    }
    if (zhi - zlo < 1) continue;
    const pw = (2 * HB_MAX) / NP - 0.06;
    const shade = (p % 2) ? P.shipDeck : P.shipDeckDark;
    const plank = (a, b) => { if (b - a > 0.4) box(g, shade, x, -0.08, (a + b) / 2, pw, 0.16, b - a); };
    if (Math.abs(x) < 2.2) {                 // open hold amidships: plank fore & aft of the hatch
      plank(zlo, -4.6);
      plank(4.2, zhi);
    } else {
      plank(zlo, zhi);
    }
  }
  // Raised coaming rim around the open hatch (the hold floor is the beach sand
  // itself, so no floor plank is drawn — you drop/see straight down to the sand).
  for (const sx of [-2.3, 2.3]) box(g, P.shipTrim, sx, 0.12, -0.2, 0.18, 0.5, 9.0);
  for (const sz of [-4.6, 4.2]) box(g, P.shipTrim, 0, 0.12, sz, 4.6, 0.5, 0.18);

  // ---- bulwarks (visual side rails) following the sheer -------------------
  for (const side of [-1, 1]) {
    for (let i = 0; i < NST; i++) {
      const t0 = zAt(i) / HALF_L, t1 = zAt(i + 1) / HALF_L;
      const p0 = [side * halfBeam(t0) * gAt(1), sheer(t0) + RAIL_H / 2, zAt(i)];
      const p1 = [side * halfBeam(t1) * gAt(1), sheer(t1) + RAIL_H / 2, zAt(i + 1)];
      // leave a boarding gap in the LANDWARD (port) rail amidships
      if (side < 0 && zAt(i) > -5 && zAt(i) < 6) continue;
      beam(g, P.shipTrim, p0, p1, 0.22, RAIL_H);
      beam(g, P.shipHullLt, [p0[0], p0[1] + RAIL_H / 2, p0[2]],
        [p1[0], p1[1] + RAIL_H / 2, p1[2]], 0.26, 0.16);   // caprail
    }
  }

  // ---- bow: raked stem, beakhead & bowsprit -------------------------------
  const bz = HALF_L;
  beam(g, P.shipHull, [0, KEEL_LOCAL, bz - 0.5], [0, sheer(1) + 0.6, bz + 1.8], 0.7, 1.0); // stem post
  box(g, P.shipTrim, 0, sheer(1) + 0.2, bz - 0.3, 1.6, 0.7, 1.2);                          // beakhead rail
  spar(g, P.shipHullLt, [0, sheer(1) + 0.4, bz], [0, sheer(1) + 4.2, bz + 7.5], 0.28);     // bowsprit
  spar(g, P.shipHullLt, [0, sheer(1) + 3.6, bz + 6.3], [0, sheer(1) + 6.6, bz + 5.9], 0.16); // jackstaff/sprit topmast stub

  // ---- stern: transom, sterncastle, gallery windows, gilt carving, lantern -
  const sz = -HALF_L;
  const stW = halfBeam(-1) * gAt(1) * 2;
  // transom slab rising above the sheer
  box(g, P.shipHull, 0, sheer(-1) + 1.4, sz + 0.1, stW + 0.3, 3.6, 0.5);
  box(g, P.shipTrim, 0, sheer(-1) + 3.1, sz + 0.15, stW + 0.5, 0.5, 0.5);         // taffrail band
  // stern gallery windows (small glass panes) + gilt frames
  for (let w = 0; w < 4; w++) {
    const wx = -stW / 2 + stW * (w + 0.5) / 4;
    box(g, P.window, wx, sheer(-1) + 1.5, sz + 0.36, stW / 5, 1.1, 0.12);
    box(g, P.shipGold, wx, sheer(-1) + 1.5, sz + 0.3, stW / 5 + 0.14, 1.3, 0.1);
  }
  box(g, P.shipGold, 0, sheer(-1) + 2.6, sz + 0.32, 1.6, 0.7, 0.14);              // central carved escutcheon
  // quarterdeck (raised aft deck, visual) + a stern lantern
  box(g, P.shipDeck, 0, 0.32, sz + 3.2, stW - 1.2, 0.16, 6.0);
  box(g, P.shipGold, 0, sheer(-1) + 3.9, sz + 0.2, 0.5, 0.9, 0.5);                // lantern base
  box(g, P.lampWarm, 0, sheer(-1) + 4.4, sz + 0.2, 0.34, 0.5, 0.34);              // lantern glass

  // ---- deck clutter: capstan, ship's wheel, a couple of broken barrels -----
  const capY = 0;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 1.0, 10), mat(P.shipHullLt)); // capstan
  cap.position.set(0, capY + 0.5, 6.5); cap.castShadow = true; g.add(cap);
  for (let a = 0; a < 6; a++) box(g, P.shipDeckDark, Math.cos(a) * 0.75, capY + 0.75, 6.5 + Math.sin(a) * 0.75, 1.4, 0.12, 0.12, a);
  // ship's wheel on the quarterdeck
  box(g, P.shipHull, 0, 0.4 + 0.4, sz + 3.4, 0.3, 1.0, 0.2);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.08, 6, 14), mat(P.shipHullLt));
  wheel.position.set(0, 0.4 + 1.0, sz + 3.55); wheel.castShadow = true; g.add(wheel);
  // broken barrels & a crate rolled to the low (starboard) rail
  barrel(g, 2.9, 0.0, -2.0, false);
  barrel(g, 3.4, 0.0, 1.0, true);
  box(g, P.shipDeckDark, 3.0, 0.45, 8.0, 1.1, 0.9, 1.1, 0.3);   // crate

  // ---- masts (broken) + yards + tattered sails + rigging ------------------
  rigging(g);

  // ---- anchor stowed on the landward bow ----------------------------------
  const ax = -halfBeam(0.7) * gAt(1) - 0.1;
  beam(g, P.shipHullDark, [ax, sheer(0.7) - 0.2, 15], [ax, sheer(0.7) - 3.2, 13], 0.18, 0.18); // shank
  box(g, P.shipHullDark, ax, sheer(0.7) - 0.1, 15.2, 0.1, 0.2, 1.8);                            // stock
  beam(g, P.shipHullDark, [ax, sheer(0.7) - 3.0, 13], [ax, sheer(0.7) - 2.4, 12.0], 0.16, 0.16); // fluke
  beam(g, P.shipHullDark, [ax, sheer(0.7) - 3.0, 13], [ax, sheer(0.7) - 2.4, 14.0], 0.16, 0.16);
}

function barrel(g, x, y, z, broken) {
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, broken ? 0.5 : 0.95, 9), mat(P.shipHull));
  b.rotation.z = broken ? Math.PI / 2 : 0;
  b.position.set(x, y + (broken ? 0.42 : 0.48), z);
  b.castShadow = true; g.add(b);
  for (const yy of broken ? [] : [0.2, 0.75]) box(g, P.shipHullDark, x, y + yy, z, 0.9, 0.08, 0.9);
}

// Three masts, all broken, with yards, rotted sail panels and rigging. Mast
// bases sit near the centreline so they line up with their collider stubs.
function rigging(g) {
  // foremast: snapped low at ~3 m, its upper trunk fallen across the deck to
  // starboard (into the sea rail).
  const fz = 12;
  spar(g, P.shipHull, [0.2, 0, fz], [0.2, 3.0, fz], 0.32);
  spar(g, P.shipHull, [0.2, 3.0, fz], [7.5, 1.0, fz - 3.5], 0.28);          // toppled upper trunk
  yard(g, [0.2, 2.6, fz], 5.5, 0.7);

  // mainmast: tallest, snapped at ~13 m with a jagged top; carries the one
  // still-bent yard with a big torn sail.
  const mz = -1;
  spar(g, P.shipHull, [0, 0, mz], [0, 13, mz], 0.42);
  spar(g, P.shipHull, [0, 13, mz], [-1.2, 15.6, mz + 0.4], 0.22);          // broken splintered top
  yard(g, [0, 7.5, mz], 8.5, 1.0);
  sail(g, 0, 4.3, mz, 6.6, 4.6, true);                                     // main course, torn
  yard(g, [0, 11.2, mz], 5.6, 0.8);
  sail(g, 0, 9.4, mz, 4.4, 2.6, false);                                    // topsail remnant

  // mizzen: shorter, leaning aft, largely bare with a shredded lateen scrap.
  const zz = -13;
  spar(g, P.shipHull, [0, 0.3, zz], [-0.6, 9.5, zz - 1.6], 0.34);
  yard(g, [-0.4, 6.2, zz - 0.9], 4.0, 0.7);
  sail(g, -0.4, 4.2, zz - 0.9, 2.6, 3.2, true);

  // standing rigging: shrouds fanning from the two big mast heads down to the
  // channels each side, plus a couple of slack fallen lines.
  for (const [hx, hy, hz, spread] of [[0, 12.4, mz, 1], [0.2, 2.8, fz, 0.6]]) {
    for (const side of [-1, 1])
      for (let s = 0; s < 3; s++) {
        const cx = side * (halfBeam((hz) / HALF_L) * 0.9);
        beam(g, P.shipRope, [hx, hy, hz], [cx, sheer(hz / HALF_L) + RAIL_H, hz + (s - 1) * 2.2], 0.05, 0.05);
      }
  }
  beam(g, P.shipRope, [0, 7.5, mz], [4.5, sheer(0) + RAIL_H, 3.0], 0.06, 0.06);   // slack fallen line
}

// A yard (horizontal spar) across a mast at point p, half-span hs.
function yard(g, p, hs, r) {
  spar(g, P.shipHullLt, [p[0] - hs, p[1], p[2]], [p[0] + hs, p[1], p[2]], r * 0.18 + 0.1);
}
// A tattered square sail hanging below a yard: a canvas panel with a couple of
// torn gaps (skipped sub-panels) and a ragged lower edge.
function sail(g, cx, cy, cz, w, h, tattered) {
  const cols = 5, rows = 4;
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const seed = hash(Math.round(cx * 7), i, j + Math.round(cz));
      if (tattered && j === rows - 1 && frac(seed, 1) < 0.55) continue;      // ragged foot
      if (tattered && frac(seed, 2) < 0.18) continue;                        // holes
      const px = cx - w / 2 + w * (i + 0.5) / cols;
      const py = cy + h - h * (j + 0.5) / rows;
      const bow = Math.sin((i + 0.5) / cols * Math.PI) * 0.5;                // belly of the sail
      box(g, (i + j) % 2 ? P.shipCanvas : P.shipCanvasDark,
        px, py, cz - 0.35 - bow, w / cols + 0.02, h / rows + 0.02, 0.08);
    }
}

// ---- the walkable layer (level terraced colliders + gangplank) ------------
// The heeled deck plane is approximated by fore-aft STRIPS, each a level OBB,
// stepping down the list by TERRACE_W*sin(LIST) ~ 0.38 m (< the 0.45 step-up)
// so you can walk across the canted deck strip-to-strip. Each strip runs the
// hull's full length and is full-height (buried keel -> its own deck top), so
// the union both blocks pass-through and provides the stepped walk surface.
function terraceTopY(s) { return MD + s * Math.sin(LIST); }  // world deck height at starboard-offset s (port down)

const HALF_BEAM = HB_MAX * 0.9;             // walkable half-beam (inside the visual sheer)
const HATCH_HS = 2.4, HATCH_F0 = -4.6, HATCH_F1 = 4.2;   // deck hatch hole (matches the visual)
const GANG_F = 8;                           // gangplank / rail-gap position along the hull

function buildColliders(col, g) {
  const nT = Math.round((2 * HALF_BEAM) / TERRACE_W);
  const len = 2 * HALF_L * 0.9, halfLen = len / 2;
  const BASE_Y = G0 - 2.0;                   // hull/wall base, safely below the sand
  const sLow = -HALF_BEAM + TERRACE_W * 0.5;
  const sHigh = -HALF_BEAM + TERRACE_W * (nT - 0.5);

  // ---- deck: THIN walkable strips stepping down the list, OPEN below (the
  // hold). The central strips are split around a hatch hole you can drop through.
  const DT = 0.6;
  const strip = (fc, flen, s) => {
    if (flen < 0.5) return;
    const p = W(fc, s, 0);
    col.add(p.x, terraceTopY(s) - DT, p.z, TERRACE_W + 0.06, DT, flen, RY);
  };
  for (let k = 0; k < nT; k++) {
    const s = -HALF_BEAM + TERRACE_W * (k + 0.5);
    if (Math.abs(s) < HATCH_HS) {              // leave the hatch hole open
      strip((-halfLen + HATCH_F0) / 2, HATCH_F0 + halfLen, s);   // aft of hatch
      strip((HATCH_F1 + halfLen) / 2, halfLen - HATCH_F1, s);    // fwd of hatch
    } else {
      strip(0, len, s);
    }
  }

  // ---- hull sides: stepped band colliders that follow the tilted planking
  // (built from the shared hull profile), so the hull blocks/contains exactly
  // where the planks are. The landward breach is left open via breached().
  buildHullBands(col, BASE_Y);

  // ---- bulwark rails on top of the deck (fall prevention); a gap on the low
  // landward side at GANG_F admits the gangplank.
  const railT = 0.3;
  addRail(col, 0, sHigh, len, railT, RAIL_H + 0.4);                           // high seaward rail
  addRail(col, (GANG_F - 2 - halfLen) / 2, sLow, halfLen + GANG_F - 2, railT, RAIL_H); // low rail aft of gap
  addRail(col, (GANG_F + 2 + halfLen) / 2, sLow, halfLen - GANG_F - 2, railT, RAIL_H); // low rail fwd of gap
  addRailCross(col, halfLen, sLow, sHigh, railT);                            // bow cap
  addRailCross(col, -halfLen, sLow, sHigh, railT);                           // stern cap

  // ---- mast stubs + the toppled foremast (obstacles on deck) ----
  for (const f of [12, -1, -13]) {
    const p = W(f, 0, terraceTopY(0));
    col.add(p.x, terraceTopY(0), p.z, 1.0, 3.0, 1.0, RY);
  }
  const tp = W(9, 3.5, terraceTopY(3.5));
  col.add(tp.x, terraceTopY(3.5), tp.z, 8.0, 0.7, 0.8, RY + 0.5);

  // ---- gangplank: stepped planks from the dry sand up to the low-side gap ----
  const STEPS = 9, OUT = 12, deckTop = terraceTopY(sLow);
  for (let i = 0; i <= STEPS; i++) {
    const u = i / STEPS;                        // 0 at deck, 1 at sand
    const s = sLow - OUT * u;                   // step further landward (more negative)
    const wp = W(GANG_F, s, 0);
    const gy = groundHeight(wp.x, wp.z);
    const top = deckTop - (deckTop - gy) * u;   // ramp from deck down to sand
    const stepLen = (OUT / STEPS) + 0.5;
    plankWorld(g, wp.x, top, wp.z, 2.6, stepLen);   // visual tread
    col.add(wp.x, top - 0.35, wp.z, stepLen, 0.5, 2.6, RY);
  }
}

// Hull-side collision as a staircase of short band colliders that trace the
// heeled planking. For each station segment (i) and strake (k) that still has a
// plank, place one thin vertical box at that patch's world position/height, so
// the collider steps sideways with the list exactly as the hull leans. Skipping
// breached() cells leaves the seaward hole and the landward walk-in gap open.
function buildHullBands(col, baseY) {
  const segLen = (2 * HALF_L) / NST;
  for (const side of [-1, 1]) {
    for (let i = 0; i < NST; i++) {
      const tm = (zAt(i) + zAt(i + 1)) / 2 / HALF_L;
      for (let k = 0; k < STRK; k++) {
        if (breached(side, i, k)) continue;
        const lo = hullSurface(side, tm, k / STRK);
        const hi = hullSurface(side, tm, (k + 1) / STRK);
        const wyLo = Math.min(lo.wy, hi.wy), wyHi = Math.max(lo.wy, hi.wy);
        const base = k === 0 ? baseY : wyLo - 0.12;   // lowest strake reaches under the sand
        const p = W(lo.f, (lo.s + hi.s) / 2, 0);
        col.add(p.x, base, p.z, 0.55, wyHi + 0.12 - base, segLen * 1.06, RY);
      }
    }
  }
  // bow & stern end caps: close the tapered tips across their small beam.
  for (const end of [-1, 1]) {
    const tm = end * 0.985;
    const dk = hullSurface(0, tm, 1).wy;                    // centre deck height at the tip
    const beam = 2 * halfBeam(tm) * gAt(0.55) * Math.cos(LIST) + 1.2;
    const p = W(tm * HALF_L, 0, 0);
    col.add(p.x, baseY, p.z, beam, dk - baseY, 0.7, RY);
  }
}

// world-space rail collider centred at fore-aft f, starboard-offset s, running
// along the hull length (local +z = T), so its length goes in sz.
function addRail(col, f, s, len, th, h) {
  const y = terraceTopY(s), p = W(f, s, y);
  col.add(p.x, y, p.z, th, h, len, RY);
}
// world-space rail collider spanning the beam s0..s1 at fore-aft f (an end cap):
// it runs across the beam (local +x = R), so its span goes in sx.
function addRailCross(col, f, s0, s1, th) {
  const sm = (s0 + s1) / 2, y = terraceTopY(sm), p = W(f, sm, y);
  col.add(p.x, y, p.z, Math.abs(s1 - s0) + 0.6, RAIL_H + 0.4, th, RY);
}

// A standalone level gangplank plank in world space (the gangplank is NOT part
// of the tilted hull group — it leans on the sand, not the ship).
const PLANK_MATS = new Map();
function plankWorld(scene, x, y, z, w, len) {
  let m = PLANK_MATS.get('p');
  if (!m) { m = new THREE.MeshLambertMaterial({ color: P.shipDeckDark, flatShading: true }); PLANK_MATS.set('p', m); }
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, 0.14, w), m);
  mesh.position.set(x, y - 0.07, z);
  mesh.rotation.y = RY;
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
}

// ---- sand scour piled around the buried keel ------------------------------
function buildScour(scene) {
  for (let i = 0; i < 10; i++) {
    const seed = hash(9042, i);
    const f = (frac(seed, 1) - 0.5) * 2 * HALF_L * 0.9;
    const s = (frac(hash(seed, 2), 5) - 0.5) * 2 * (HB_MAX + 2);
    const wp = W(f, s, 0);
    const gy = groundHeight(wp.x, wp.z);
    const sz = 1.2 + frac(seed, 3) * 2.2;
    const m = new THREE.Mesh(new THREE.SphereGeometry(sz, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: pick([P.sand, P.sandDark], seed, 4), flatShading: true }));
    m.position.set(wp.x, gy - 0.15, wp.z);
    m.scale.y = 0.28;
    m.receiveShadow = true; m.castShadow = true;
    scene.add(m);
  }
}

// ---- cargo scattered on the sand floor of the hold (world-upright, so it
// stands flat on the beach you actually walk on inside the wreck) --------------
function buildHoldClutter(scene) {
  const items = [
    [-6, 0.8, 'barrel'], [1, -1.2, 'barrel'], [4, 1.0, 'barrel'],
    [-2, 1.4, 'crate'], [7, -0.6, 'crate'],
  ];
  for (const [f, s, kind] of items) {
    const wp = W(f, s, 0), gy = groundHeight(wp.x, wp.z);
    if (kind === 'barrel') {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.95, 9),
        new THREE.MeshLambertMaterial({ color: P.shipHull, flatShading: true }));
      b.position.set(wp.x, gy + 0.48, wp.z); b.rotation.y = RY;
      b.castShadow = true; b.receiveShadow = true; scene.add(b);
    } else {
      const c = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 1.1),
        new THREE.MeshLambertMaterial({ color: P.shipDeckDark, flatShading: true }));
      c.position.set(wp.x, gy + 0.45, wp.z); c.rotation.y = RY + 0.3;
      c.castShadow = true; c.receiveShadow = true; scene.add(c);
    }
  }
}

// ---- entry ----------------------------------------------------------------
export function buildShipwreck(g, col, scene) {
  // 1) the tilted visual hull, pivoting about the deck crown centreline.
  const hull = new THREE.Group();
  hull.rotation.order = 'YXZ';
  hull.position.set(CX, MD, CZ);
  hull.rotation.y = RY;
  hull.rotation.z = LIST;      // starboard (+x, seaward) up => port (landward) down
  buildHullMeshes(hull);
  scene.add(hull);

  // 2) the walkable layer: thin terraced deck over an open hold, hull walls with
  // a landward breach, rails, gangplank. Tag every box the wreck adds as
  // camera-transparent so the third-person boom never zooms to first person when
  // the hull is behind your head on deck or inside the hold.
  const cStart = col.boxes.length;
  buildColliders(col, scene);
  for (let i = cStart; i < col.boxes.length; i++) col.boxes[i].noCam = true;

  // 3) sand scour banked around the keel + cargo strewn in the hold.
  buildScour(scene);
  buildHoldClutter(scene);
}
