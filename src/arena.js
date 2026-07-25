// North-shore football arena: an open-air tiered bowl sitting on the coastal
// plateau pocket directly north of the suburbA blocks (grid row j=0, cells
// i=2..5), flanked by two parking lots. The pocket spills north of the grid,
// out toward the coastal parkway, so this is a hand-placed world-coordinate
// feature like parkway.js / paths.js rather than a CITY grid entry.
//
// Layout (world metres): the field runs long-axis east-west; four straight
// raked grandstands wrap it (the south one split by a walk-in GATE so the
// player can enter and stand on the pitch); floodlight towers mark the four
// open corners; goalposts stand on each end line. Everything is deterministic
// — no Math.random.
import { hash, frac } from './util.js';
import { PALETTE as P } from './palette.js';
import { TOP_Y, onLand } from './island.js';
import { parkwaySegments } from './parkway.js';
import { parkingLotAt, lamp, tree, scatterTrees, ironFence } from './blocks/index.js';

// ---- placement ----------------------------------------------------------
const AX = -445, AZ = -835;      // arena centre, comfortably inside the parkway
const GY = TOP_Y;                // base on the plateau surface the player walks on,
                                 // so the first step is a climbable 0.4m up from
                                 // the terrain (not 0.46 if we based it at y=0)

const FL = 110, FW = 49;         // American-football field: length (x) x width (z)
const ENDZONE = 9;               // end-zone depth at each end
const M = 5;                     // apron gap between field edge and stand front
const SD = 20;                   // grandstand depth (front-to-back)
const NT = 25;                   // tiers per stand
const PLINTH = 0.0, RISE = 0.40; // per-tier rise. Two constraints make the tiers
                                 // climbable: RISE < the 0.45m auto-step, AND the
                                 // tread depth (SD/NT = 0.8m) exceeds the player's
                                 // ~0.7m footprint so they don't straddle two steps.
const TOPH = PLINTH + NT * RISE; // stand height (~10m)
const GATE = 16;                 // width of the walk-in gap in the south stand

// field bounds
const FX0 = AX - FL / 2, FX1 = AX + FL / 2;   // -500 .. -390
const FZ0 = AZ - FW / 2, FZ1 = AZ + FW / 2;   // -859.5 .. -810.5

// colours (team blue / red bowl; the rest reuse the shared palette)
const PITCH = 0x3f8f3a;
const LINE = 0xf2f4f5;
const EZ_HOME = 0x2f5aa8, EZ_AWAY = 0xb0392f;
const SEAT_BANDS = [0x2f5aa8, 0xcdd2d7, 0xb0392f, 0xcdd2d7]; // blue / grey / red / grey
const ASPHALT = 0x2b2b30;
const POST = 0xf4c542;           // goalpost yellow
const GOLD = 0xf4c542, ACCENT = 0x3a63ad; // facade accents (gold + a lighter blue)

// ---- one straight raked grandstand --------------------------------------
// side: 'S'|'N'|'E'|'W'. `fCoord` is the field-facing FRONT edge coordinate
// (z for N/S stands, x for E/W). Each tier is a single ground-to-top step
// slice, one `runD` deep and rising `RISE` above the row in front — a solid
// stepped wedge (climbable staircase from the field side, a full-height wall
// from outside). Distinct depth slices mean no two boxes share an outward
// face, so the tiers don't z-fight. `gapHalf` opens a central gate.
function grandstand(g, col, side, fCoord, length, gapHalf = 0) {
  const alongX = side === 'S' || side === 'N';
  const dir = side === 'S' || side === 'E' ? 1 : -1; // +coord = away from field
  const runD = SD / NT;
  const half = length / 2;
  const segs = gapHalf > 0 ? [[-half, -gapHalf], [gapHalf, half]] : [[-half, half]];

  for (let r = 0; r < NT; r++) {
    const vc = r * runD + runD / 2;            // this step's depth-centre
    const h = PLINTH + (r + 1) * RISE;          // step top height (from ground)
    const seat = SEAT_BANDS[r % SEAT_BANDS.length];
    const perp = fCoord + dir * vc;
    for (const [a, b] of segs) {
      const ul = b - a; if (ul <= 0.1) continue;
      const uc = (a + b) / 2;
      // one collider per step too, so the ≤0.45m risers can be stepped up
      if (alongX) {
        g.boxB(AX + uc, GY, perp, ul, h, runD, seat);
        col.add(AX + uc, GY, perp, ul, h, runD);
      } else {
        g.boxB(perp, GY, AZ + uc, runD, h, ul, seat);
        col.add(perp, GY, AZ + uc, runD, h, ul);
      }
    }
  }
}

// ---- floodlight tower ---------------------------------------------------
function floodlight(g, col, x, z) {
  const H = 22;
  g.cyl(x, GY, z, 0.45, 0.7, H, P.concreteDark);
  g.box(x, GY + H + 1.4, z, 5.2, 3.0, 1.2, 0x2a2e33); // lamp housing
  let k = 0;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 2; j++)
      g.box(x - 1.6 + i * 1.6, GY + H + 0.6 + j * 1.5, z + 0.75, 1.3, 1.15, 0.3, 0xfdf6d0), k++;
  col.add(x, GY, z, 1.6, H, 1.6);
}

// ---- American-football goalpost (on the end line) -----------------------
function goalpost(g, col, x, z) {
  const baseH = 3.0, upH = 6.0, halfW = 2.9;
  g.cyl(x, GY, z, 0.13, 0.17, baseH, POST);
  g.box(x, GY + baseH, z, 0.2, 0.2, halfW * 2, POST);       // crossbar (along z)
  g.boxB(x, GY + baseH, z - halfW, 0.16, upH, 0.16, POST);   // uprights
  g.boxB(x, GY + baseH, z + halfW, 0.16, upH, 0.16, POST);
  col.add(x, GY, z, 0.5, baseH + upH, 0.5);
}

// ---- press / announcers box on top of the north grandstand --------------
// A glazed booth sitting on the back-top of the north stand, its big windows
// looking south over the field.
function announcerBox(g, col) {
  const backZ = FZ0 - M - SD;      // north stand back edge
  const cz = backZ + 3.4;          // perch over the upper rows
  const L = 64, D = 6, H = 4.8, y0 = TOPH;
  g.boxB(AX, y0, cz, L, H, D, P.offwhite);                 // body
  g.boxB(AX, y0 + H, cz, L + 1.4, 0.4, D + 1.4, P.concreteDark); // roof overhang
  g.boxB(AX, y0, cz, L + 0.4, 0.9, D + 0.4, P.concrete);   // sill (protrudes so it doesn't co-plane the body)
  // big window band on the field-facing (south, +z) side, split into panes
  const wz = cz + D / 2 + 0.05, bandL = L - 4, panes = 8, gap = 0.5;
  const pw = (bandL - gap * (panes - 1)) / panes;
  for (let i = 0; i < panes; i++) {
    const px = AX - bandL / 2 + pw / 2 + i * (pw + gap);
    g.box(px, y0 + 0.9 + (H - 1.2) / 2, wz, pw, H - 1.2, 0.25, P.glass);
  }
  col.add(AX, y0, cz, L, H, D);
}

// ---- large ceremonial arch over the south gate --------------------------
// A monumental arch straddling the walk-in gate, rising well above the stands.
// GeoBatch only yaws boxes, so the semicircle is stepped from small cubes.
function gateArch(g, col) {
  const archZ = FZ1 + M + SD;      // at the concourse-facing (south) entrance
  const R = 11, springY = 7, T = 2.4, STONE = P.offwhite;
  // piers just outside the gate opening
  for (const sx of [-1, 1]) {
    const px = AX + sx * R;
    g.boxB(px, GY, archZ, T, springY, T, STONE);
    col.add(px, GY, archZ, T, springY + R, T);
  }
  // stepped semicircular crown
  const N = 20;
  for (let i = 0; i <= N; i++) {
    const a = (Math.PI * i) / N;
    g.box(AX - R * Math.cos(a), springY + R * Math.sin(a), archZ, T, T, T, STONE);
  }
  g.box(AX, springY + R + 0.4, archZ, 3.4, 2.4, T + 0.5, EZ_HOME); // keystone banner
}

// ---- exterior wall dressing ---------------------------------------------
// Turns a blank outer stand wall into a rhythmed facade: a dark plinth, white
// pilasters framing alternating blue/red bays, a cornice with a gold fascia,
// hanging banners with roundel crests, and pennant bunting along the top.
// axis 'x': the wall runs along x at z = `wall`; 'z': runs along z at x = `wall`.
// `out` (±1) is the outward normal. Decorates [lo, hi], skipping [gLo, gHi]
// (the south gate). Protrusions are measured outward from the wall face.
function decorateWall(g, col, axis, wall, out, lo, hi, gLo = 0, gHi = 0) {
  const topY = GY + TOPH;
  const CORN = topY - 1.1;         // cornice underside
  const BASE = GY + 2.2;           // plinth top
  // (u along wall, o outward from face, y) -> world box; base-at-y and centred
  const P3 = (u, o) => [axis === 'x' ? u : wall + out * o, axis === 'x' ? wall + out * o : u];
  const D2 = (run, depth) => (axis === 'x' ? [run, depth] : [depth, run]);
  const put = (u, o, y, run, depth, h, hex) => { const [x, z] = P3(u, o), [sx, sz] = D2(run, depth); g.boxB(x, y, z, sx, h, sz, hex); };
  const putC = (u, o, y, run, depth, h, hex) => { const [x, z] = P3(u, o), [sx, sz] = D2(run, depth); g.box(x, y, z, sx, h, sz, hex); };
  const orb = (u, o, y, r, hex) => { const [x, z] = P3(u, o); g.ico(x, y, z, r, hex); };
  const solid = (u, o, y, run, depth, h) => { const [x, z] = P3(u, o), [sx, sz] = D2(run, depth); col.add(x, y, z, sx, h, sz); };

  const segs = gHi > gLo ? [[lo, gLo], [gHi, hi]] : [[lo, hi]];
  for (const [a, b] of segs) {
    const segLen = b - a; if (segLen < 4) continue;
    const uc = (a + b) / 2;
    put(uc, 0.25, GY, segLen, 0.5, 2.2, P.concreteDark);   // plinth
    solid(uc, 0.25, GY, segLen, 0.5, 2.4);
    put(uc, 0.35, CORN, segLen, 0.7, 1.1, P.concrete);      // cornice
    put(uc, 0.42, CORN - 0.35, segLen, 0.5, 0.35, GOLD);    // gold fascia stripe

    const nb = Math.max(1, Math.round(segLen / 13));
    const bw = segLen / nb;
    for (let k = 0; k <= nb; k++)                            // pilasters
      put(a + k * bw, 0.3, BASE, 1.8, 0.6, TOPH - 3.3, P.offwhite);
    for (let k = 0; k < nb; k++) {
      const cu = a + (k + 0.5) * bw;
      const s = hash(Math.round(cu), Math.round(wall));
      const bay = s % 2 ? EZ_AWAY : ACCENT;                 // alternating bay colour
      const ban = s % 2 ? ACCENT : EZ_AWAY;
      put(cu, 0.18, BASE, bw - 2.2, 0.36, TOPH - 3.4, bay); // recessed colour panel
      put(cu, 0.5, CORN - 3.2, 1.6, 0.25, 3.0, ban);        // hanging banner
      put(cu, 0.55, CORN - 3.35, 1.9, 0.2, 0.28, GOLD);     // banner top bar
      orb(cu, 0.6, CORN - 1.5, 0.7, GOLD);                  // roundel crest
      orb(cu, 0.66, CORN - 1.5, 0.44, bay);
    }
    const nbunt = Math.max(2, Math.round(segLen / 3.5));    // pennant bunting
    for (let i = 0; i <= nbunt; i++) {
      const c = [EZ_AWAY, P.white, ACCENT, GOLD][i % 4];
      putC(a + (i / nbunt) * segLen, 0.5, CORN - 0.85, 0.55, 0.22, 0.55, c);
    }
  }
}

// ---- safety fence around the stand rim ----------------------------------
// The same double-height wrought-iron fence as the reservoir crest, ringing
// the outer top edge of the bowl so a player who climbs the stands can't walk
// or jump off the ~10m back drop. Split around the south gate.
function topFence(g, col, nsHalf, ewHalf) {
  const y = GY + TOPH;
  const xW = AX - nsHalf + 0.6, xE = AX + nsHalf - 0.6;
  const zN = AZ - ewHalf + 0.6, zS = AZ + ewHalf - 0.6;
  ironFence(g, col, xW, zN, xE, zN, y, 2);                  // north
  ironFence(g, col, xW, zS, AX - GATE / 2, zS, y, 2);       // south (west of gate)
  ironFence(g, col, AX + GATE / 2, zS, xE, zS, y, 2);       // south (east of gate)
  ironFence(g, col, xW, zN, xW, zS, y, 2);                  // west
  ironFence(g, col, xE, zN, xE, zS, y, 2);                  // east
}

// ---- field markings -----------------------------------------------------
function field(g) {
  // concrete bowl pad under everything (top at 0.05)
  const padX0 = FX0 - M - SD, padX1 = FX1 + M + SD;
  const padZ0 = FZ0 - M - SD, padZ1 = FZ1 + M + SD;
  g.boxB((padX0 + padX1) / 2, GY, (padZ0 + padZ1) / 2, padX1 - padX0, 0.05, padZ1 - padZ0, P.concrete);

  // The field is TILED, not layered: home end zone | pitch | away end zone sit
  // edge-to-edge at one height (top 0.13), so no two coloured tops overlap and
  // there's nothing to z-fight. Markings then sit a clear step above at 0.13.
  const gx0 = FX0 + ENDZONE, gx1 = FX1 - ENDZONE;   // goal lines
  const fY = GY + 0.05, fT = 0.08;                  // field slab: 0.05 -> 0.13
  g.boxB((FX0 + gx0) / 2, fY, AZ, ENDZONE, fT, FW, EZ_HOME);
  g.boxB((gx1 + FX1) / 2, fY, AZ, ENDZONE, fT, FW, EZ_AWAY);
  g.boxB((gx0 + gx1) / 2, fY, AZ, gx1 - gx0, fT, FW, PITCH);

  const y = fY + fT;       // markings rest on the field top
  g.boxB(AX, y, FZ0 + 0.15, FL, 0.03, 0.3, LINE);   // sidelines
  g.boxB(AX, y, FZ1 - 0.15, FL, 0.03, 0.3, LINE);
  const n = 20, step = (gx1 - gx0) / n;             // yard lines
  for (let i = 0; i <= n; i++) {
    const gl = i === 0 || i === n;                  // goal lines a touch bolder
    g.boxB(gx0 + i * step, y, AZ, gl ? 0.4 : 0.25, 0.03, FW, LINE);
  }
}

// ---- parking, driveways, dressing ---------------------------------------
function surrounds(g, col) {
  // south concourse pad linking the gate to the perimeter street (z ~ -775)
  g.boxB(AX, GY, -785.5, FX1 - FX0 + 2 * (M + SD), 0.06, 8, P.concrete);

  // two painted lots (with parked cars) either side of the bowl
  parkingLotAt(g, col, -310, -818, 96, 44, GY, hash(881, 1), 0, null, 24);
  parkingLotAt(g, col, -578, -806, 96, 40, GY, hash(881, 2), 0, null, 22);

  // driveways from each lot down to the perimeter street (overlap both ends)
  g.boxB(-310, GY, -790, 12, 0.05, 24, ASPHALT);
  g.boxB(-578, GY, -784, 12, 0.05, 16, ASPHALT);

  // lot light poles + a row of trees screening each lot from the bowl
  for (const [lx, lz, uw] of [[-300, -818, 96], [-588, -806, 96]]) {
    lamp(g, col, lx - uw / 2 + 3, lz - 18);
    lamp(g, col, lx + uw / 2 - 3, lz - 18);
    lamp(g, col, lx - uw / 2 + 3, lz + 18);
    lamp(g, col, lx + uw / 2 - 3, lz + 18);
  }
  for (let i = 0; i < 4; i++) {
    tree(g, col, -360, -880 + i * 24, 0.8 + frac(882, i, 1) * 0.3, hash(882, i, 2) % 3);
    tree(g, col, -530, -880 + i * 24, 0.8 + frac(882, i, 3) * 0.3, hash(882, i, 4) % 3);
  }
}

// ---- grounds forest -----------------------------------------------------
// Blanket the plateau around the bowl with a deterministic jittered forest.
// scatterTrees already avoids every prior collider (stands, walls, fences,
// floodlights, goalposts, parked cars); `keepOut` handles the surfaces that
// have no colliders: the field interior, the two parking lots + driveways,
// the south concourse/perimeter street, the curved coastal parkway, and the
// plateau edge (so trees never spill past the coast or onto a road).
const _pwPolys = parkwaySegments().map((s) => s.points);

function inRect(x, z, cx, cz, w, d, m = 0) {
  return x > cx - w / 2 - m && x < cx + w / 2 + m
    && z > cz - d / 2 - m && z < cz + d / 2 + m;
}

// distance from (px,pz) to segment a->b
function distSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

function nearParkway(x, z, rad) {
  for (const poly of _pwPolys)
    for (let i = 0; i < poly.length - 1; i++)
      if (distSeg(x, z, poly[i][0], poly[i][1], poly[i + 1][0], poly[i + 1][1]) < rad)
        return true;
  return false;
}

function groundsTrees(g, col) {
  const sX0 = FX0 - M - SD - 2, sX1 = FX1 + M + SD + 2; // bowl footprint + margin
  const sZ0 = FZ0 - M - SD - 2, sZ1 = FZ1 + M + SD + 2;
  const keepOut = (x, z) => {
    if (!onLand(x, z)) return true;                          // off the plateau / past the coast
    if (z > -782) return true;                               // south concourse + perimeter street
    if (x > sX0 && x < sX1 && z > sZ0 && z < sZ1) return true; // the bowl itself
    if (inRect(x, z, -310, -818, 96, 44, 3)) return true;   // east parking lot
    if (inRect(x, z, -578, -806, 96, 40, 3)) return true;   // west parking lot
    if (inRect(x, z, -310, -790, 12, 24, 3)) return true;   // east driveway
    if (inRect(x, z, -578, -784, 12, 16, 3)) return true;   // west driveway
    if (nearParkway(x, z, 11)) return true;                 // coastal parkway (road + walk + buffer)
    return false;
  };
  const r = { x0: -680, z0: -920, x1: -235, z1: -782 };
  scatterTrees(g, col, r, hash(883, 7), 6, 0.75, 1.15, keepOut);
}

// ---- entry --------------------------------------------------------------
export function buildArena(g, col) {
  field(g);

  // grandstands: N/S run the field length (+ corners), E/W span the width.
  const nsLen = FL + 2 * (M + SD);   // overlap the end stands at the corners
  const ewLen = FW + 2 * M;
  grandstand(g, col, 'S', FZ1 + M, nsLen - 0.1, GATE / 2); // south stand with the gate
  grandstand(g, col, 'N', FZ0 - M, nsLen - 0.1);
  grandstand(g, col, 'E', FX1 + M, ewLen + 39.9);
  grandstand(g, col, 'W', FX0 - M, ewLen + 39.9);

  // dress the four outer walls + rail the rim (extents match the stand lengths)
  const nsHalf = (nsLen - 0.1) / 2, ewHalf = (ewLen + 39.9) / 2;
  const zS = FZ1 + M + SD, zN = FZ0 - M - SD, xE = FX1 + M + SD, xW = FX0 - M - SD;
  decorateWall(g, col, 'x', zS, +1, AX - nsHalf, AX + nsHalf, AX - GATE / 2, AX + GATE / 2);
  decorateWall(g, col, 'x', zN, -1, AX - nsHalf, AX + nsHalf);
  decorateWall(g, col, 'z', xE, +1, AZ - ewHalf, AZ + ewHalf);
  decorateWall(g, col, 'z', xW, -1, AZ - ewHalf, AZ + ewHalf);
  topFence(g, col, nsHalf, ewHalf);

  // floodlights at the four open corners
  const cx0 = FX0 - M - SD - 3, cx1 = FX1 + M + SD + 3;
  const cz0 = FZ0 - M - SD - 3, cz1 = FZ1 + M + SD + 3;
  floodlight(g, col, cx0 + 30, cz0);
  floodlight(g, col, cx1 - 30, cz0);
  floodlight(g, col, cx0 + 30, cz1);
  floodlight(g, col, cx1 - 30, cz1);

  // goalposts on each end line
  goalpost(g, col, FX0, AZ);
  goalpost(g, col, FX1, AZ);

  announcerBox(g, col);
  gateArch(g, col);
  surrounds(g, col);
  groundsTrees(g, col); // must run last: it avoids every collider added above
}
