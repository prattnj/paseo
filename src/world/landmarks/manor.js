// A grand neo-classical manor set in the open plateau green-belt west of the
// upper-class suburbA blocks (grid column i=1 is all REMOVED_CELLS here — a
// coastal lawn between the city and the western parkway). Like arena.js /
// parkway.js this is a hand-placed WORLD-COORDINATE feature, not a CITY grid
// entry, so it draws straight into the shared GeoBatch + Colliders.
//
// Composition (front faces EAST, +x, toward the suburb street at x=-665):
//   a symmetrical two-storey limestone house on a raised plinth, with a
//   six-column pedimented portico and a low central saucer dome; formal
//   gardens (clipped hedges, parterre flower beds, cypress rows, a rear-garden
//   gazebo) filling the grounds; and a dark-concrete drive running down the
//   central axis to a carriage roundabout circling a fountain directly in
//   front of the entrance, then out through a gated stone gateway to the
//   street. Everything is deterministic — no Math.random.
import * as THREE from 'three';
import { hash, frac } from '../../core/util.js';
import { PALETTE as P, SIDEWALK_H } from '../../core/palette.js';
import { tree, fountain, hedge, flowerBed, gazebo, bench, lamp } from '../blocks/props.js';
import { ironFence } from '../blocks/kit.js';
import { column, windowsWall } from '../blocks/pieces.js';

// ---- placement ----------------------------------------------------------
// The grounds are a raised manicured-lawn terrace, exactly like a city block
// (a sidewalk-height slab), so the shared garden props (hedges, flower beds,
// the gazebo, benches — all authored to stand on a block slab at SIDEWALK_H)
// sit correctly. GY is that terrace surface; everything else bases on it.
const GY = SIDEWALK_H;

// Estate footprint (the manicured grounds inside the perimeter fence). Kept
// clear of the x=-665 suburb street + its bay-walk on the east and safely
// inside the plateau edge (radius ~1083m here) on the west.
const EX0 = -762, EX1 = -675, EZ0 = -716, EZ1 = -604;
const ECZ = (EZ0 + EZ1) / 2;      // central axis z (=-660): the whole scheme is
                                  // mirror-symmetric about it.

// The house, set back to the west so the forecourt/drive have room to the east.
const MX = -740, MZ = ECZ;        // main-block centre
const BW = 18, BL = 44;           // block depth (x, front-to-back) x frontage (z)
const FRONT_X = MX + BW / 2;      // -731: east front wall plane
const PLINTH_H = 0.7;             // raised stone terrace the house sits on
const Y0 = GY + PLINTH_H;         // building ground-floor level
const FLOOR_H = 4.2, FLOORS = 2, BODY_H = FLOORS * FLOOR_H; // 8.4m to the cornice

// The forecourt roundabout (carriage loop) + its fountain, on-axis right in
// front of the entrance (its west edge meets the foot of the portico steps).
const RB_X = -710, RB_Z = ECZ;    // roundabout centre
const RB_OUT = 15, RB_IN = 8;     // drive ring runs between the island (rIn) and rOut

// West kerb of the x=-665 suburb street (asphalt spans -670..-660): the drive
// stops here so its dark concrete never runs out onto the city road.
const ROAD_W_EDGE = -670;

// ---- colours (warm limestone palette) -----------------------------------
const WALL = 0xe9e3d3;            // limestone wall body
const TRIM = 0xf3eee0;            // bright dressed stone: columns, cornices, quoins
const SHADOW = 0xcabfa6;          // darker stone: bases, entablature, string courses
const ROOF = 0x5f6873;            // slate pitched roof
const GOLD = 0xd9b45a;            // gilded finials
const WIN = P.glassDark;          // recessed sash windows
const DRIVE = 0x44474b;           // dark poured-concrete drive
const GRAVEL = P.path;            // pale gravel garden walks
const GRASS = 0x6db24a;           // lawn (matches the plateau grass shade)
const GRASS_DK = 0x5b9a3c;        // mown-stripe shade (a touch darker than GRASS)

// Drive surfaces ride a hair above the lawn top (SIDEWALK_H + 0.04) so their
// coplanar slabs never z-fight the grass.
const DRIVE_TOP = SIDEWALK_H + 0.055;

// ============ grounds terrace ============================================

// The estate lawn: a block-style raised slab (thin stone rim under the fence,
// grass over the rest) that lifts the whole grounds to SIDEWALK_H.
function ground(g, col) {
  const cx = (EX0 + EX1) / 2, cz = (EZ0 + EZ1) / 2;
  const W = EX1 - EX0, D = EZ1 - EZ0;
  g.boxB(cx, 0, cz, W, SIDEWALK_H, D, P.sidewalk);
  col.add(cx, 0, cz, W, SIDEWALK_H, D);

  // Striped mown lawn: big bands running across the grounds (along x), each
  // alternating between the normal grass shade and a slightly darker one, like
  // a roller-striped formal lawn. Bands span the full grass width in x.
  const gw = W - 0.6, gd = D - 0.6;
  const STRIPES = 16;
  const sd = gd / STRIPES;
  for (let i = 0; i < STRIPES; i++) {
    const sz = (EZ0 + 0.3) + (i + 0.5) * sd;
    g.boxB(cx, SIDEWALK_H, sz, gw, 0.04, sd, i % 2 ? GRASS_DK : GRASS);
  }
}

// ============ small shared pieces ========================================

// Formal-garden cypress: slim trunk + tall dark cone (a local copy of the
// mosque's, so the manor can plant avenues of them).
function cypress(g, col, x, z, s = 1) {
  g.cyl(x, GY, z, 0.26 * s, 0.4 * s, 1.1 * s, P.trunk, 6);
  g.cone(x, GY + 0.8 * s, z, 1.0 * s, 6.5 * s, 0x2f5d3a, 8);
  col.add(x, GY, z, 1.5 * s, 7.4 * s, 1.5 * s);
}

// A stone balustrade run between two points (axis-aligned): plinth rail, turned
// balusters, and a top coping. Visual only by default (roof/terrace edges).
function balustrade(g, col, x0, z0, x1, z1, y, collide = false) {
  const horiz = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  const len = Math.hypot(x1 - x0, z1 - z0);
  if (len < 0.5) return;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const rw = horiz ? len : 0.38, rd = horiz ? 0.38 : len;
  g.boxB(cx, y, cz, rw, 0.28, rd, SHADOW);              // bottom rail
  g.boxB(cx, y + 0.92, cz, rw + 0.12, 0.26, rd + 0.12, TRIM); // top coping
  const n = Math.max(2, Math.round(len / 0.9));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    g.cyl(x0 + (x1 - x0) * t, y + 0.28, z0 + (z1 - z0) * t, 0.1, 0.13, 0.66, TRIM);
  }
  if (collide) col.add(cx, y, cz, rw, 1.2, rd);
}

// A square stone gate pier with a moulded cap and a ball finial.
function gatePier(g, col, x, z) {
  g.boxB(x, GY, z, 1.7, 3.0, 1.7, TRIM);
  g.boxB(x, GY + 3.0, z, 2.1, 0.4, 2.1, SHADOW);   // cap
  g.ico(x, GY + 3.7, z, 0.55, TRIM);                // ball finial
  col.add(x, GY, z, 1.7, 3.4, 1.7);
}

// ============ the house ==================================================

// The two-storey main block: limestone body on a raised terrace, rusticated
// base band + first-floor string course, corner quoins, a full entablature +
// balustraded parapet, and glazed windows on every face.
function mainBlock(g, col) {
  // raised stone terrace (plinth) the house stands on
  g.boxB(MX, GY, MZ, BW + 4, PLINTH_H, BL + 4, SHADOW);
  g.boxB(MX, GY + PLINTH_H - 0.06, MZ, BW + 4.5, 0.09, BL + 4.5, TRIM); // terrace coping
  col.add(MX, GY, MZ, BW + 4, PLINTH_H, BL + 4);

  // body + one solid collider for the whole house
  g.boxB(MX, Y0, MZ, BW, BODY_H, BL, WALL);
  col.add(MX, GY, MZ, BW, Y0 + BODY_H, BL);

  g.boxB(MX, Y0, MZ, BW + 0.4, 0.7, BL + 0.4, SHADOW);                 // rusticated base band
  g.boxB(MX, Y0 + FLOOR_H - 0.15, MZ, BW + 0.3, 0.3, BL + 0.3, TRIM);  // first-floor string course
  g.boxB(MX, Y0 + BODY_H, MZ, BW + 1.1, 0.9, BL + 1.1, TRIM);          // main cornice
  g.boxB(MX, Y0 + BODY_H + 0.9, MZ, BW + 0.7, 0.45, BL + 0.7, SHADOW); // cornice bed-mould

  // corner quoins (dressed-stone vertical strips)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.boxB(MX + sx * (BW / 2 - 0.1), Y0, MZ + sz * (BL / 2 - 0.7), 0.5, BODY_H, 1.6, TRIM);
  }

  // windows: front & back spread along the frontage; the two ends get a few
  windowsWall(g, MX, MZ, Y0, FLOORS, FLOOR_H, BL - 6, 'x', BW / 2, 5.5, WIN);
  windowsWall(g, MX, MZ, Y0, FLOORS, FLOOR_H, BL - 6, 'x', -BW / 2, 5.5, WIN);
  windowsWall(g, MX, MZ, Y0, FLOORS, FLOOR_H, BW - 4, 'z', BL / 2, 5, WIN);
  windowsWall(g, MX, MZ, Y0, FLOORS, FLOOR_H, BW - 4, 'z', -BL / 2, 5, WIN);

  // balustraded parapet hiding the flat roof
  const py = Y0 + BODY_H + 1.35;
  balustrade(g, col, MX - BW / 2, MZ - BL / 2, MX + BW / 2, MZ - BL / 2, py);
  balustrade(g, col, MX - BW / 2, MZ + BL / 2, MX + BW / 2, MZ + BL / 2, py);
  balustrade(g, col, MX - BW / 2, MZ - BL / 2, MX - BW / 2, MZ + BL / 2, py);
  balustrade(g, col, MX + BW / 2, MZ - BL / 2, MX + BW / 2, MZ + BL / 2, py);
}

// The grand entrance: a projecting six-column portico carrying an entablature
// and a triangular pediment, a tall central doorway, and a flight of steps down
// to the forecourt.
function portico(g, col) {
  const PW = 26;                  // colonnade span (along z)
  const px = FRONT_X + 3;         // columns stand 3m proud of the front wall
  const entTop = Y0 + BODY_H;     // portico entablature aligns with the main cornice
  const colH = entTop - Y0;

  // porch platform (extends the terrace east under the columns)
  const porchCx = (FRONT_X + px + 0.5) / 2;
  const porchW = (px + 1.5) - FRONT_X;
  g.boxB(porchCx, GY, MZ, porchW, PLINTH_H, PW + 2, SHADOW);
  col.add(porchCx, GY, MZ, porchW, PLINTH_H, PW + 2);

  // six columns
  for (let i = 0; i < 6; i++) {
    const cz = MZ - PW / 2 + (i * PW) / 5;
    column(g, px, cz, Y0, colH, 0.85);
    col.add(px, Y0, cz, 1.8, colH, 1.8);
  }

  // entablature beam over the colonnade + pediment above it
  const beamCx = (FRONT_X + px) / 2;
  const beamW = (px + 1.1) - (FRONT_X - 0.3);
  g.boxB(beamCx, entTop - 1.3, MZ, beamW, 1.3, PW + 1.8, SHADOW);
  g.boxB(beamCx, entTop - 1.3, MZ, beamW + 0.2, 0.35, PW + 2.0, TRIM);   // fascia band
  g.prism(beamCx, entTop, MZ, beamW + 0.4, 4.0, PW + 2.2, TRIM);         // pediment (gable faces east)
  g.ico(px + 0.6, entTop + 4.0, MZ, 0.5, GOLD);                          // acroterion finial

  // tall central doorway on the front wall
  g.box(FRONT_X + 0.12, Y0 + 2.1, MZ, 0.3, 4.2, 3.0, P.doorDark);
  g.box(FRONT_X + 0.2, Y0 + 4.5, MZ, 0.25, 0.5, 4.0, TRIM);             // door lintel

  // steps down to grade, east of the porch
  const stepE = porchCx + porchW / 2;                                   // porch east edge
  for (let k = 0; k < 3; k++) {
    const top = PLINTH_H * (1 - (k + 1) / 3);
    const sx = stepE + 0.3 + k * 0.6;
    g.boxB(sx, GY, MZ, 0.65, top + 0.001, 11, SHADOW);
    if (top > 0.05) col.add(sx, GY, MZ, 0.65, top, 11);
  }
}

// A pitched slate roof over the main block: a low gable whose ridge runs along
// the long frontage axis (front/back slopes), rising behind the parapet, with a
// ridge cap and a pair of symmetric chimneys. GeoBatch's prism is a gable with
// its ridge along local X, so ry=PI/2 turns the ridge to run along world z.
function roof(g, col) {
  const eaveY = Y0 + BODY_H + 0.9;   // sits on the cornice, rising above the parapet
  const roofH = 6;
  g.prism(MX, eaveY, MZ, BL + 1.4, roofH, BW + 1.4, ROOF, Math.PI / 2);
  g.boxB(MX, eaveY + roofH - 0.2, MZ, 0.7, 0.35, BL + 1.4, SHADOW); // ridge cap
  for (const sz of [-1, 1]) {        // symmetric chimneys on the ridge
    const cz = MZ + sz * (BL / 2 - 6);
    g.boxB(MX, eaveY, cz, 2.2, roofH + 1.4, 2.2, SHADOW);
    g.boxB(MX, eaveY + roofH + 1.4, cz, 2.6, 0.4, 2.6, TRIM);
  }
}

// ============ drive, roundabout & fountain ================================

// A flat dark-concrete slab (a straight drive segment / apron), its top at
// DRIVE_TOP — a hair above the lawn, a hair below the roundabout ring.
function driveSlab(g, cx, cz, w, d) {
  g.boxB(cx, GY, cz, w, DRIVE_TOP - GY, d, DRIVE);
}

// A flat round disc (rIn=0) or annulus drawn straight to the scene. GeoBatch
// cylinders are only 10-sided; this keeps the roundabout genuinely circular.
function discRing(scene, cx, cz, y, rIn, rOut, seg, hex) {
  const pos = [], nrm = [], idx = [];
  for (let k = 0; k <= seg; k++) {
    const a = (k / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    pos.push(cx + c * rIn, y, cz + s * rIn, cx + c * rOut, y, cz + s * rOut);
    nrm.push(0, 1, 0, 0, 1, 0);
  }
  for (let k = 0; k < seg; k++) {
    const b = k * 2;
    idx.push(b, b + 1, b + 3, b, b + 3, b + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: hex, side: THREE.DoubleSide }));
  m.receiveShadow = true;
  scene.add(m);
}

function forecourt(g, col, scene) {
  // round carriage ring + planted island (true circles, layered so their tops
  // don't z-fight: ring just above the drive slabs, island just above the ring)
  discRing(scene, RB_X, RB_Z, DRIVE_TOP + 0.006, RB_IN - 0.5, RB_OUT, 64, DRIVE);
  discRing(scene, RB_X, RB_Z, DRIVE_TOP + 0.02, 0, RB_IN, 48, GRASS);
  for (let i = 0; i < 20; i++) {                             // clipped-box kerb ring
    const a = (i / 20) * Math.PI * 2;
    hedge(g, col, RB_X + Math.cos(a) * (RB_IN - 0.5), RB_Z + Math.sin(a) * (RB_IN - 0.5), 1.5, 1.5);
  }
  fountain(g, col, RB_X, RB_Z);                              // the fountain in the middle

  // straight entrance drive: roundabout -> gate (the roundabout's west edge
  // already meets the portico steps, so no separate apron is needed)
  driveSlab(g, (RB_X + RB_OUT + EX1) / 2, ECZ, (EX1 - (RB_X + RB_OUT)) + 2, 9);
  // gateway curb-cut outside the terrace: a flush ground-level slab from the gate
  // to the street's west kerb only — it stops short of the city road asphalt.
  g.boxB((EX1 + ROAD_W_EDGE) / 2, 0, ECZ, ROAD_W_EDGE - EX1, 0.06, 9, DRIVE);
}

// ============ gardens & grounds ==========================================

// Perimeter: wrought-iron fence on a low stone plinth around the estate, broken
// by the gateway on the east, with clipped hedging just inside it.
function perimeter(g, col) {
  const GZ0 = ECZ - 8, GZ1 = ECZ + 8;   // gateway opening on the east side
  // fence runs (east side split around the gate)
  ironFence(g, col, EX0, EZ0, EX1, EZ0, GY);          // north
  ironFence(g, col, EX0, EZ1, EX1, EZ1, GY);          // south
  ironFence(g, col, EX0, EZ0, EX0, EZ1, GY);          // west
  ironFence(g, col, EX1, EZ0, EX1, GZ0, GY);          // east (north of gate)
  ironFence(g, col, EX1, GZ1, EX1, EZ1, GY);          // east (south of gate)
  gatePier(g, col, EX1, GZ0 - 1.2);
  gatePier(g, col, EX1, GZ1 + 1.2);
  lamp(g, col, EX1 - 2, GZ0 - 2.5);
  lamp(g, col, EX1 - 2, GZ1 + 2.5);

  // hedge screen just inside the fence (leave the gateway + drive corridor open)
  const inset = 2.2, hz0 = ECZ - 7, hz1 = ECZ + 7;
  hedge(g, col, (EX0 + EX1) / 2, EZ0 + inset, EX1 - EX0 - 6, 1.8);   // north
  hedge(g, col, (EX0 + EX1) / 2, EZ1 - inset, EX1 - EX0 - 6, 1.8);   // south
  hedge(g, col, EX0 + inset, ECZ, 1.8, EZ1 - EZ0 - 6);              // west
  hedge(g, col, EX1 - inset, (EZ0 + hz0) / 2, 1.8, hz0 - EZ0 - 3);   // east, north of gate
  hedge(g, col, EX1 - inset, (hz1 + EZ1) / 2, 1.8, EZ1 - hz1 - 3);   // east, south of gate
}

// Formal planting: an avenue of cypress lining the entrance drive, parterre
// flower beds in the four forecourt quadrants, side-lawn tree groups, and a
// rear formal garden with a central gravel walk and a gazebo.
function gardens(g, col) {
  // an avenue of tall cypress lining the drive from the roundabout to the gate
  for (let i = 0; i < 4; i++) {
    const x = RB_X + RB_OUT + 2 + i * 5;   // -693, -688, -683, -678
    cypress(g, col, x, ECZ - 8, 1.05);
    cypress(g, col, x, ECZ + 8, 1.05);
  }

  // four parterre beds framing the roundabout (clear of the house and the drive)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const bx = RB_X + sx * 12, bz = RB_Z + sz * 16;
    flowerBed(g, col, bx, bz, hash(11 + sx, 7 + sz, 3));
    hedge(g, col, bx, bz + sz * 3.2, 6, 0.8);
  }

  // side lawns north & south of the house: tree groups + a bench + beds
  for (const sz of [-1, 1]) {
    const lz = MZ + sz * (BL / 2 + 12);
    for (let i = 0; i < 3; i++) {
      const x = MX - 6 + i * 9;
      tree(g, col, x, lz + (frac(i, sz, 5) - 0.5) * 6, 0.9 + frac(i, sz, 6) * 0.3, hash(i, sz) % 3);
    }
    flowerBed(g, col, MX + 4, lz - sz * 6, hash(sz, 21, 4));
    bench(g, col, MX - 4, lz - sz * 6, sz > 0 ? 0 : Math.PI);
  }

  // rear formal garden (west of the house): gravel cross-walk, gazebo, beds,
  // and a mirrored pair of cypresses framing the gazebo.
  const rgx = (EX0 + (MX - BW / 2)) / 2 - 1;   // rear-garden centre x
  g.boxB(rgx, GY, ECZ, (MX - BW / 2) - EX0 - 3, 0.05, 3.2, GRAVEL); // E-W walk
  g.boxB(rgx, GY, ECZ, 3.2, 0.05, 26, GRAVEL);                      // N-S walk
  gazebo(g, col, rgx, ECZ, hash(99, 1));
  for (const sz of [-1, 1]) {
    cypress(g, col, rgx, ECZ + sz * 10, 0.9);
    flowerBed(g, col, rgx + 7, ECZ + sz * 9, hash(sz, 44, 2));
    flowerBed(g, col, rgx - 7, ECZ + sz * 9, hash(sz, 45, 2));
  }
}

// ---- entry --------------------------------------------------------------
export function buildManor(g, col, scene) {
  ground(g, col);
  mainBlock(g, col);
  portico(g, col);
  roof(g, col);
  forecourt(g, col, scene);
  perimeter(g, col);
  gardens(g, col);
}
