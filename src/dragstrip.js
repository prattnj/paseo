// West-side drag strip: two dead-straight asphalt lanes running the length of
// the empty plateau green-belt between the coastal parkway and the westmost
// city blocks (grid column i~2, rows j=4..6). Like arena.js / lighthouse.js it
// is a hand-placed WORLD-COORDINATE feature, not a CITY grid entry — the belt
// spills outside the grid toward the parkway.
//
// Layout (world metres, +z is south): the lanes run north->south. The START
// line sits at the north end with the two Top Fuel dragsters staged just
// behind it, one per lane; the FINISH line and its timing gantry sit at the
// south end. The whole area is paved concrete (where it isn't asphalt), with a
// low painted centre divider, a Christmas-tree light tower on the start line,
// and a small east-facing bleacher bank tucked into each western bulge (where
// the parkway recedes and the belt widens) so spectators look across the track.
//
// The two dragsters are the ONLY instances of that vehicle type — they are
// registered into PARKED here and spawned as real drivable cars by traffic.js.
// Everything is deterministic — no Math.random.
import { hash, frac, pick } from './util.js';
import { PALETTE as P } from './palette.js';
import { TOP_Y, groundHeight } from './island.js';
import { parkwaySegments } from './parkway.js';
import { PARKED, scatterTrees } from './blocks/index.js';
import { makeHumanoid } from './character.js';

const GY = TOP_Y;                 // plateau surface the whole strip sits on

// ---- corridor geometry --------------------------------------------------
// The usable belt pinches to ~60m in the middle (the parkway bulges to
// x=-625); everything below is kept east of x~-612 so it clears the pinch.
const LANE_W = 10;                // asphalt lane width
const XA = -598, XB = -574;       // lane centres (west lane, east lane)
const XDIV = -586;                // painted centre divider
const SLAB_X0 = -612, SLAB_X1 = -560; // main concrete pad x-extent (meets the street at -555)

const Z_N = -428, Z_S = -140;     // asphalt lane extent (north .. south)
const START_Z = -405;             // start line
const FINISH_Z = -165;            // finish line
const STAGE_Z = -418;             // dragsters staged just behind the start line

// ---- ground: concrete pad + asphalt lanes -------------------------------
// No colliders on any paving (matching the grid roads): cars drive on the
// terrain height and simply roll across the flat asphalt/concrete.
function paving(g) {
  const slab = (x0, x1, z0, z1, hex) =>
    g.boxB((x0 + x1) / 2, GY, (z0 + z1) / 2, Math.abs(x1 - x0), 0.06, Math.abs(z1 - z0), hex);

  // main concrete pad the full length, plus a widened apron in each western
  // bulge to carry the bleachers
  slab(SLAB_X0, SLAB_X1, -432, -136, P.concrete);
  slab(-632, SLAB_X0, -432, -382, P.concrete); // north bleacher apron
  slab(-632, SLAB_X0, -188, -136, P.concrete); // south bleacher apron

  // the two asphalt lanes on top of the pad
  for (const xc of [XA, XB]) {
    g.boxB(xc, 0.0, (Z_N + Z_S) / 2, LANE_W, 0.04, Z_S - Z_N, P.road);
    // crisp white edge lines down both sides of the lane
    for (const sx of [-1, 1])
      g.boxB(xc + sx * (LANE_W / 2 - 0.2), 0.04, (Z_N + Z_S) / 2, 0.2, 0.02, Z_S - Z_N, P.white);
  }

  // low painted centre divider (decorative — no collider, cars can cross)
  g.boxB(XDIV, 0.04, (Z_N + Z_S) / 2, 1.6, 0.14, Z_S - Z_N, P.concreteDark);
}

// solid white band across a lane (start line)
function lineBand(g, xc, z, depth, hex = P.white) {
  g.boxB(xc, 0.05, z, LANE_W - 0.4, 0.02, depth, hex);
}

// checkered finish band across a lane
function checkerBand(g, xc, z) {
  const tiles = 8, tw = (LANE_W - 0.4) / tiles, dep = 1.4, rows = 2;
  const x0 = xc - (LANE_W - 0.4) / 2;
  for (let r = 0; r < rows; r++)
    for (let i = 0; i < tiles; i++) {
      const dark = (i + r) % 2 === 0;
      g.boxB(x0 + tw * (i + 0.5), 0.05, z - dep / 2 + dep / rows * (r + 0.5),
        tw, 0.02, dep / rows, dark ? 0x1a1b1e : P.white);
    }
}

function startFinishLines(g) {
  for (const xc of [XA, XB]) {
    lineBand(g, xc, START_Z, 0.7);       // start line
    checkerBand(g, xc, FINISH_Z);        // finish line (checkered)
  }
}

// ---- bleachers ----------------------------------------------------------
// A raked stand facing EAST (+x) toward the track: front row lowest at the
// track side, each step receding west and rising. Solid ground-to-top wedges
// (a climbable staircase from the front, a wall from behind) — RISE < the
// 0.45m auto-step and the 0.8m tread exceeds the player footprint.
const BL_ROWS = 10, BL_RISE = 0.4, BL_DEP = 0.8;
const SEAT_BANDS = [0x2f5aa8, 0xcdd2d7, 0xb0392f, 0xcdd2d7];
function bleacher(g, col, frontX, z0, z1) {
  const zc = (z0 + z1) / 2, len = Math.abs(z1 - z0);
  for (let r = 0; r < BL_ROWS; r++) {
    const xc = frontX - BL_DEP * (r + 0.5);   // steps recede west
    const h = (r + 1) * BL_RISE;
    g.boxB(xc, GY, zc, BL_DEP, h, len, SEAT_BANDS[r % SEAT_BANDS.length]);
    col.add(xc, GY, zc, BL_DEP, h, len);
  }
}

// ---- spectators ---------------------------------------------------------
// A deterministic standing crowd on the steps (posed at rest — never walks or
// reacts, so these are plain baked humanoid meshes, not Pedestrians actors).
// Each occupied seat holds a figure standing on the tread of its step, facing
// east across the track. Coordinate-seeded colours/jitter/gaps — no random.
const SPEC_SHIRTS = [0x4a90d9, 0xe04f43, 0xf4c542, 0x3aa7a3, 0xe07f9a, 0x8bc34a, 0xf2f4f5, 0xf39a3a];
const SPEC_PANTS = [0x37474f, 0x5d4037, 0x455a64, 0x263238, 0x6d4c41];
const SPEC_SKINS = [0xf0c8a0, 0xc68863, 0x8d5524, 0xffdbac];
const SPEC_HAIR = [0x5d4037, 0x212121, 0x8d6e63, 0xbdb76b];
function crowd(scene, frontX, z0, z1, seed) {
  const lo = Math.min(z0, z1) + 1.5, hi = Math.max(z0, z1) - 1.5;
  for (let r = 0; r < BL_ROWS; r++) {
    const xc = frontX - BL_DEP * (r + 0.5) + 0.14; // near the front of the tread
    const y = GY + (r + 1) * BL_RISE;              // feet on the step top
    for (let zc = lo; zc < hi; zc += 3.0) {
      const s = hash(seed, r * 131 + Math.round(zc));
      if (s % 10 < 7) continue;                    // ~70% of seats empty
      const h = makeHumanoid({
        shirt: pick(SPEC_SHIRTS, s, 2), pants: pick(SPEC_PANTS, s, 3),
        skin: pick(SPEC_SKINS, s, 4), hair: pick(SPEC_HAIR, s, 5),
      });
      h.group.position.set(xc + (frac(s, 8) - 0.5) * 0.3, y, zc + (frac(s, 7) - 0.5) * 1.3);
      h.group.rotation.y = Math.PI / 2 + (frac(s, 9) - 0.5) * 0.5; // face east, toward the track
      h.group.scale.setScalar(0.9 + (s % 20) / 100);
      scene.add(h.group);
    }
  }
}

// ---- Christmas-tree staging lights --------------------------------------
// The classic drag-strip light tower straddling the centre line on the start:
// a dark board carrying a top-down column of pre-stage/stage/amber/green/red
// bulbs (baked bright so they read against the board).
function christmasTree(g, col, x, z) {
  g.cyl(x, GY, z, 0.18, 0.24, 6.2, P.concreteDark);          // pole
  g.boxB(x, GY + 1.4, z - 0.15, 0.7, 4.6, 0.25, 0x1a1b1e);   // bulb board
  const AMB = 0xf3a01f, GRN = 0x27c93f, RED = 0xe0342b, WHT = 0xf2f4f5;
  const bulbs = [WHT, WHT, AMB, AMB, AMB, GRN, RED];         // top -> bottom
  const zf = z - 0.32;
  bulbs.forEach((c, i) => g.box(x, GY + 5.4 - i * 0.62, zf, 0.34, 0.34, 0.18, c));
  col.add(x, GY, z, 0.9, 6.2, 0.9);
}

// ---- finish-line gantry -------------------------------------------------
function finishGantry(g, col, z) {
  const xW = XA - LANE_W / 2 - 1, xE = XB + LANE_W / 2 + 1, H = 7;
  for (const px of [xW, xE]) {
    g.cyl(px, GY, z, 0.28, 0.34, H, P.concreteDark);
    col.add(px, GY, z, 0.8, H, 0.8);
  }
  const w = xE - xW;
  g.boxB((xW + xE) / 2, GY + H, z, w + 1.2, 0.6, 0.7, P.roofDark);       // top beam
  g.boxB((xW + xE) / 2, GY + H - 1.3, z, w - 1.0, 1.3, 0.3, P.offwhite); // banner face
  // a checkered stripe along the banner
  const tiles = Math.round((w - 1.0) / 1.4);
  const bx0 = (xW + xE) / 2 - (w - 1.0) / 2, bw = (w - 1.0) / tiles;
  for (let i = 0; i < tiles; i++)
    g.box(bx0 + bw * (i + 0.5), GY + H - 0.55, z - 0.16, bw, 0.5, 0.06, i % 2 ? 0x1a1b1e : P.white);
}

// ---- surrounding woods --------------------------------------------------
// Fill the belt's leftover grass — the strip west of the pad out toward the
// parkway, plus the north/south end bands — with near-forest-density trees.
// scatterTrees avoids every collider already placed (the bleachers, light
// tower and gantry); keepOut carves out the un-collidered paving, the parkway
// ribbon, and anything off the plateau (so nothing lands on the coast/scarp).
const _pw = parkwaySegments().map((s) => s.points);
// Closest point on the whole parkway polyline set to (x,z): its distance and
// the parkway's x there. The strip belt sits entirely EAST of the parkway, so
// a point west of that x (px) is on the far, seaward side.
function closestParkway(x, z) {
  let bd = Infinity, bx = 0;
  for (const poly of _pw)
    for (let i = 0; i < poly.length - 1; i++) {
      const ax = poly[i][0], az = poly[i][1], dx = poly[i + 1][0] - ax, dz = poly[i + 1][1] - az;
      const l2 = dx * dx + dz * dz;
      let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      const px = ax + t * dx, pz = az + t * dz;
      const d = Math.hypot(x - px, z - pz);
      if (d < bd) { bd = d; bx = px; }
    }
  return { d: bd, px: bx };
}
// inside the concrete footprint (pad + both bleacher aprons), plus a margin
function onPaving(x, z, m = 1.5) {
  const inr = (x0, x1, z0, z1) => x > x0 - m && x < x1 + m && z > z0 - m && z < z1 + m;
  return inr(SLAB_X0, SLAB_X1, -432, -136)   // main pad
      || inr(-632, SLAB_X0, -432, -382)      // north bleacher apron
      || inr(-632, SLAB_X0, -188, -136);     // south bleacher apron
}
// The parkway is 10m of road + a 3m sidewalk each side (±8 from centre); clear
// that plus a margin, and reject anything on/beyond the seaward side entirely.
const PW_CLEAR = 9.5;
function woods(g, col) {
  const keepOut = (x, z) => {
    if (onPaving(x, z) || groundHeight(x, z) < -0.4) return true;
    const p = closestParkway(x, z);
    return p.d < PW_CLEAR || x <= p.px; // on the ribbon/sidewalk, or beyond it
  };
  scatterTrees(g, col, { x0: -662, z0: -437, x1: -560, z1: -121 },
    hash(4211, 1), 5.0, 0.75, 1.3, keepOut);
}

// ---- entry --------------------------------------------------------------
export function buildDragstrip(g, col, scene) {
  paving(g);
  startFinishLines(g);
  christmasTree(g, col, XDIV, START_Z);
  finishGantry(g, col, FINISH_Z);

  // an east-facing bleacher bank in each western bulge (near start & finish),
  // each with a standing spectator crowd on its steps
  const BL_FRONT = -622;
  bleacher(g, col, BL_FRONT, -430, -384);
  bleacher(g, col, BL_FRONT, -184, -140);
  crowd(scene, BL_FRONT, -430, -384, hash(4207, 1));
  crowd(scene, BL_FRONT, -184, -140, hash(4207, 2));

  // dense trees over all the leftover grass (added last, so they steer clear
  // of every structure placed above)
  woods(g, col);

  // the two Top Fuel dragsters, one staged behind the start line in each lane,
  // facing down the strip (nose toward the finish, +z). These are the only
  // instances of the type; traffic.js spawns them as real drivable cars.
  PARKED.push({ x: XA, z: STAGE_Z, ry: 0, seed: hash(4201, 1), y: 0.06, type: 'dragster' });
  PARKED.push({ x: XB, z: STAGE_Z, ry: 0, seed: hash(4201, 2), y: 0.06, type: 'dragster' });
}
