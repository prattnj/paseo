// Maximum-security prison, sitting in the empty plateau pocket east of the
// commercial midrise blocks (removed grid cells 13,4 & 13,5), between the
// x=555 street and the eastern bay-walk. Like arena.js / manor.js this is a
// hand-placed WORLD-COORDINATE feature, not a CITY grid entry — the pocket is
// an unbuilt (REMOVED_CELLS) gap, so nothing in layout.js/city.js owns it.
//
// Footprint is an L (looking down, north = -z): a narrower cell-block wing
// fills the TOP (north) of the L, and a wider exercise yard fills the BOTTOM
// (south) foot, which opens further east toward the bay where the land is
// wider. The whole L is ringed by a see-through chain-link perimeter fence
// topped with barbed-wire coils and watched from four corner guard towers.
// The yard holds a basketball court; orange-jumpsuited inmates meander it
// (the crowd is spawned by peds.js from the PRISON_YARD zone exported here).
//
// The perimeter fence is a SOLID collider all the way round (fully sealed —
// the player can see in but not enter), even though its fabric renders as a
// transparent textured plane. Everything is deterministic (no Math.random) —
// only the live inmate crowd wanders randomly, like every other ped zone.
import * as THREE from 'three';
import { PALETTE as P } from '../../core/palette.js';
import { TOP_Y } from '../island.js';

// ---- placement ----------------------------------------------------------
const GY = TOP_Y;                 // base everything on the plateau surface

// The L outline (fence line), clockwise from the north-west corner. The
// building wing (north) is held east of x=626 so it clears the bay-walk near
// x=630; the yard foot (south) spreads out to x=650 where the coast is wider.
const WX = 565;                   // shared west edge (just east of the x=555 bay-walk)
const NZ = -435, MZ = -288, SZ = -235; // north edge / L-notch z / south edge
const BEX = 626;                  // building-wing east edge
const YEX = 670;                  // yard-foot east edge

const FENCE_H = 3.2;              // chain-link fabric height
const COIL_H = 0.6;               // barbed-wire coil band above it
const STEEL = 0x5b626b, WIRE = 0xb7bcc2;

// Two cell blocks stacked north→south, both with the long axis running
// north-south and their sally-port entrances facing west toward the city.
// Same footprint (roughly the hospital's plan area, a touch smaller); the
// southern block is a few storeys taller. `A` sits at the top of the wing,
// `B` just south of it across a narrow yard alley.
const FLOOR_H = 4;
const BUILDING_A = { x0: 575, x1: 615, z0: -424, z1: -356, floors: 3 };
const BUILDING_B = { x0: 575, x1: 615, z0: -346, z1: -278, floors: 6 };
const BUILDINGS = [BUILDING_A, BUILDING_B];

// Three identical basketball courts in an east-west row across the south of
// the yard, each rotated so its long axis runs north-south (z).
const COURT_L = 28, COURT_W = 15;   // L along z (long), W along x
const HOOP_DZ = COURT_L / 2 - 1.5;  // hoops just inside each baseline
const COURTS = [[595, -258], [615, -258], [635, -258]];

// Four guard towers, inset from the L's outer corners so their bases sit
// inside the fence.
const TOWERS = [
  [WX + 3, NZ + 3], [BEX - 3, NZ + 3],   // north pair (over the building wing)
  [YEX - 3, SZ - 3], [WX + 3, SZ - 3],   // south pair (over the yard foot)
];

// ---- shared chain-link / razor-wire textures ----------------------------
// A diamond mesh drawn once and tiled per fence run (repeat cloned per run so
// each length keeps a constant ~1.6 m tile). alphaTest punches out the gaps so
// you see straight through to the yard.
function chainlinkTexture() {
  const S = 64, c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  x.clearRect(0, 0, S, S);
  x.strokeStyle = '#e9edf1';
  x.lineWidth = 3;
  for (let o = -S; o < S * 2; o += 12) {           // '/' then '\' diagonals -> diamonds
    x.beginPath(); x.moveTo(o, 0); x.lineTo(o + S, S); x.stroke();
    x.beginPath(); x.moveTo(o, S); x.lineTo(o + S, 0); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Coiled razor wire: overlapping loops with little barb ticks, tiled along the
// top rail.
function razorTexture() {
  const W = 128, H = 40, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.clearRect(0, 0, W, H);
  x.strokeStyle = '#c6cbd1';
  x.lineWidth = 2.4;
  const r = 15, cy = H / 2;
  for (let cx = 0; cx <= W + r; cx += 22) {         // the coil loops
    x.beginPath(); x.arc(cx, cy, r, -Math.PI * 0.85, Math.PI * 0.85); x.stroke();
    for (const a of [-2.0, -0.7, 0.7, 2.0]) {       // barbs radiating off each loop
      x.beginPath();
      x.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      x.lineTo(cx + Math.cos(a) * (r + 5), cy + Math.sin(a) * (r + 5));
      x.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const _chain = chainlinkTexture();
const _razor = razorTexture();

function fabricPanel(scene, x0, z0, x1, z1, y0, h, tex, tileU, vRep) {
  const horiz = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  const L = Math.hypot(x1 - x0, z1 - z0);
  const t = tex.clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(L / tileU, vRep);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(L, h),
    new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.35,
      side: THREE.DoubleSide, color: WIRE, depthWrite: false })
  );
  mesh.position.set((x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2);
  if (!horiz) mesh.rotation.y = Math.PI / 2;
  scene.add(mesh);
}

// ---- one straight fence run ---------------------------------------------
// Posts + top/bottom rails (opaque, in the GeoBatch), transparent chain-link
// fabric and a razor-wire coil (planes in the scene), and ONE solid collider
// so the sealed perimeter can't be walked or jumped through.
function fenceRun(g, col, scene, x0, z0, x1, z1) {
  const horiz = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  const L = Math.hypot(x1 - x0, z1 - z0);
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;

  // fabric (diamonds tiled ~square) + coil (one loop band along the top)
  fabricPanel(scene, x0, z0, x1, z1, GY + 0.1, FENCE_H - 0.1, _chain, 1.6, (FENCE_H - 0.1) / 1.6);
  fabricPanel(scene, x0, z0, x1, z1, GY + FENCE_H, COIL_H, _razor, 2.2, 1);

  // top + bottom rails
  for (const ry of [GY + 0.15, GY + FENCE_H]) {
    if (horiz) g.box(mx, ry, mz, L, 0.07, 0.07, STEEL);
    else g.box(mx, ry, mz, 0.07, 0.07, L, STEEL);
  }
  // posts
  const n = Math.max(1, Math.round(L / 4.5));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    g.cyl(x0 + (x1 - x0) * t, GY, z0 + (z1 - z0) * t, 0.09, 0.1, FENCE_H + 0.15, STEEL);
  }
  // solid collider (thin along the run's normal)
  col.add(mx, GY, mz, horiz ? L : 0.3, FENCE_H + COIL_H, horiz ? 0.3 : L);
}

// ---- guard tower --------------------------------------------------------
// A tapered concrete pylon carrying a glazed cabin under a hipped roof, well
// above the fence so it reads as overlooking the yard. A stubby searchlight
// points in toward the complex centre.
function guardTower(g, col, x, z) {
  const legH = 5, upH = 3.5, base = GY;
  g.boxB(x, base, z, 2.8, legH, 2.8, P.concrete);            // lower pylon
  g.boxB(x, base + legH, z, 2.2, upH, 2.2, P.concreteDark);  // upper pylon
  col.add(x, base, z, 2.8, legH + upH, 2.8);
  const y0 = base + legH + upH;
  g.boxB(x, y0 - 0.2, z, 4.6, 0.25, 4.6, P.concreteDark);    // catwalk lip
  g.boxB(x, y0, z, 4.0, 0.8, 4.0, P.offwhite);               // cabin sill
  g.boxB(x, y0 + 0.8, z, 3.9, 1.7, 3.9, P.glass);            // glass band
  g.boxB(x, y0 + 2.5, z, 4.2, 0.6, 4.2, P.offwhite);         // cabin header
  g.cone(x, y0 + 3.1, z, 3.1, 1.7, P.concreteDark, 4);       // hipped roof
  // searchlight aimed roughly at the complex centre
  const ax = Math.sign(595 - x) || 1, az = Math.sign(-337 - z) || 1;
  g.box(x + ax * 1.8, y0 + 1.6, z + az * 1.8, 0.7, 0.7, 0.7, 0x2a2e33);
  g.box(x + ax * 2.1, y0 + 1.6, z + az * 2.1, 0.35, 0.5, 0.35, 0xfdf6d0);
}

// ---- cell-block building ------------------------------------------------
// A blank concrete institutional block with a base plinth, a roof parapet and
// rooftop plant, a west-facing sally-port entrance under a canopy, and rows of
// small barred windows on all four faces.
function cellBlock(g, col, b) {
  const { x0: BX0, x1: BX1, z0: BZ0, z1: BZ1, floors } = b;
  const BCX = (BX0 + BX1) / 2, BCZ = (BZ0 + BZ1) / 2;
  const BW = BX1 - BX0, BD = BZ1 - BZ0, BH = floors * FLOOR_H;
  // plinth + main mass
  g.boxB(BCX, GY, BCZ, BW + 1.4, 0.7, BD + 1.4, P.concreteDark);
  g.boxB(BCX, GY, BCZ, BW, BH, BD, P.concrete);
  col.add(BCX, GY, BCZ, BW, BH, BD);
  // roof parapet + plant
  g.boxB(BCX, GY + BH, BCZ, BW + 0.8, 0.8, BD + 0.8, P.concreteDark);
  for (const [dx, dz] of [[-8, -18], [9, 4], [-6, 20]])
    g.boxB(BCX + dx, GY + BH + 0.4, BCZ + dz, 5, 1.6, 4, P.steel);
  g.boxB(BCX + 6, GY + BH + 0.4, BCZ - 8, 2.2, 3.2, 2.2, P.concreteDark); // stair head

  // west (front) sally-port entrance + canopy, facing the city
  g.boxB(BX0 - 0.2, GY, BCZ, 0.5, 5.0, 9, 0x24272d);         // recessed dark portal
  g.box(BX0 - 0.35, GY + 2.6, BCZ, 0.3, 3.4, 4.6, 0x2f333a); // steel door leaves
  for (const dz of [-2.3, 0, 2.3]) g.box(BX0 - 0.5, GY + 2.6, BCZ + dz, 0.12, 3.2, 0.12, WIRE);
  g.boxB(BX0 - 3, GY + 5.1, BCZ, 6, 0.5, 11, P.concreteDark); // entrance canopy
  for (const dz of [-4.5, 4.5]) g.cyl(BX0 - 5.6, GY, BCZ + dz, 0.16, 0.18, 5.1, P.concreteDark);

  // barred windows: rows per floor on all faces. Long faces (west/east) run
  // along z; short faces (north/south) run along x.
  const paneH = 1.5, barCol = WIRE, recess = 0x191c21;
  for (let f = 0; f < floors; f++) {
    const y = GY + f * FLOOR_H + FLOOR_H - 1.7;
    // west & east (skip a gap on the west for the entrance bay)
    for (let z = BZ0 + 6; z <= BZ1 - 6; z += 6.5) {
      const nearDoor = Math.abs(z - BCZ) < 6 && f === 0;
      for (const [fx, nx] of [[BX0, -1], [BX1, 1]]) {
        if (nx < 0 && nearDoor) continue;
        g.box(fx + nx * 0.13, y, z, 0.26, paneH, 1.1, recess);
        for (const dz of [-0.32, 0.32]) g.box(fx + nx * 0.26, y, z + dz, 0.1, paneH, 0.09, barCol);
      }
    }
    // north & south
    for (let x = BX0 + 6; x <= BX1 - 6; x += 6.5)
      for (const [fz, nz] of [[BZ0, -1], [BZ1, 1]]) {
        g.box(x, y, fz + nz * 0.13, 1.1, paneH, 0.26, recess);
        for (const dx of [-0.32, 0.32]) g.box(x + dx, y, fz + nz * 0.26, 0.09, paneH, 0.1, barCol);
      }
  }
}

// ---- basketball court ---------------------------------------------------
// A gooseneck stanchion: a pole planted just inside the baseline carries two
// extension arms that reach out over the paint and hold the backboard, so the
// board is actually connected to the post. The rim (with a net and a painted
// target square) hangs off the board's court-facing front. (dx,dz) is the unit
// vector pointing INTO the court.
function hoop(g, x, z, dx, dz) {
  const POLE = 0x3b3f45, ORANGE = 0xe4622a, NET = 0xe9edf1;
  const ARM = 1.15;                                   // board overhang from the pole
  const boardY = GY + 3.45, rimY = GY + 3.05;
  const across = (w) => [dz !== 0 ? w : 0.09, dx !== 0 ? w : 0.09]; // [sx,sz] spanning the board's width

  // base plate + set-back stanchion
  g.cyl(x, GY, z, 0.34, 0.34, 0.16, POLE);
  g.cyl(x, GY + 0.16, z, 0.12, 0.13, 3.6, POLE);

  // two extension-arm struts from the pole out to the backboard
  for (const ay of [GY + 3.24, GY + 3.66]) {
    const sx = dx !== 0 ? ARM : 0.1, sz = dz !== 0 ? ARM : 0.1;
    g.box(x + dx * ARM / 2, ay, z + dz * ARM / 2, sx, 0.1, sz, POLE);
  }

  // backboard, with a painted target square and a bottom padding trim
  const bx = x + dx * (ARM + 0.05), bz = z + dz * (ARM + 0.05);
  const [bsx, bsz] = across(1.8);
  g.box(bx, boardY, bz, bsx, 1.05, bsz, P.white);
  const fx = x + dx * (ARM + 0.11), fz = z + dz * (ARM + 0.11); // just proud of the front face
  const [qsx, qsz] = across(0.62);
  g.box(fx, rimY + 0.34, fz, qsx, 0.46, qsz, ORANGE);          // shooter's square
  const [tsx, tsz] = across(1.8);
  g.box(fx, boardY - 0.5, fz, tsx, 0.09, tsz, ORANGE);         // bottom trim

  // rim: a short mount off the board front, then the ring, then a hanging net
  const rx = x + dx * (ARM + 0.31), rz = z + dz * (ARM + 0.31);
  g.box((fx + rx) / 2, rimY, (fz + rz) / 2, dx ? 0.24 : 0.05, 0.06, dz ? 0.24 : 0.05, ORANGE);
  g.cyl(rx, rimY, rz, 0.23, 0.23, 0.05, ORANGE);
  g.cyl(rx, rimY - 0.17, rz, 0.19, 0.19, 0.17, NET);          // net (upper ring)
  g.cyl(rx, rimY - 0.34, rz, 0.12, 0.12, 0.17, NET);          // net (tapers in below)
}

// One court centred at (cx,cz) with its long axis running north-south (z).
function court(g, cx, cz) {
  const x0 = cx - COURT_W / 2, z0 = cz - COURT_L / 2;
  g.boxB(cx, GY + 0.06, cz, COURT_W, 0.05, COURT_L, 0x37618f); // blue asphalt
  const y = GY + 0.12, LINE = P.white;
  g.boxB(cx, y, cz, COURT_W - 1, 0.02, COURT_L - 1, 0x2f5680); // inner court shade
  // sidelines (run along z) + half-court line (runs along x)
  g.boxB(x0 + 0.5, y, cz, 0.18, 0.03, COURT_L, LINE);
  g.boxB(x0 + COURT_W - 0.5, y, cz, 0.18, 0.03, COURT_L, LINE);
  g.boxB(cx, y, cz, COURT_W, 0.03, 0.18, LINE);
  g.cyl(cx, y, cz, 2.4, 2.4, 0.03, LINE);                     // centre circle (disc)
  g.cyl(cx, y + 0.01, cz, 2.1, 2.1, 0.03, 0x2f5680);
  hoop(g, cx, cz - HOOP_DZ, 0, 1);
  hoop(g, cx, cz + HOOP_DZ, 0, -1);
}

// ---- yard dressing ------------------------------------------------------
function guardBooth(g, col, x, z) {
  g.boxB(x, GY, z, 3.2, 2.8, 3.2, P.offwhite);
  g.boxB(x, GY + 2.8, z, 3.6, 0.4, 3.6, P.concreteDark);
  g.box(x - 1.62, GY + 1.9, z, 0.08, 1.1, 2.2, P.glass);
  col.add(x, GY, z, 3.2, 2.8, 3.2);
}

// ---- the exercise-yard wander zone (consumed by peds.js) ----------------
// Union of the two L rectangles, inset from the fence, minus the building
// footprint, the guard-tower bases, the booth and the basketball poles.
const _keep = [
  // the six basketball-hoop poles
  ...COURTS.flatMap(([cx, cz]) => [[cx, cz - HOOP_DZ, 1.6], [cx, cz + HOOP_DZ, 1.6]]),
  [574, -250, 3.0],                                                     // guard booth
  ...TOWERS.map(([tx, tz]) => [tx, tz, 3.4]),                           // tower bases
];
export const PRISON_YARD = {
  cx: 605, cz: -258, y: GY + 0.12,
  _inL(x, z) {
    const inN = x >= WX + 2 && x <= BEX - 2 && z >= NZ + 2 && z <= MZ;
    const inS = x >= WX + 2 && x <= YEX - 2 && z >= MZ && z <= SZ - 2;
    return inN || inS;
  },
  valid(x, z) {
    if (!this._inL(x, z)) return false;
    for (const b of BUILDINGS)                                          // both cell blocks
      if (x >= b.x0 - 2 && x <= b.x1 + 2 && z >= b.z0 - 2 && z <= b.z1 + 2) return false;
    for (const k of _keep) if ((x - k[0]) ** 2 + (z - k[1]) ** 2 < k[2] * k[2]) return false;
    return true;
  },
  nearest(x, z) {
    const px = Math.max(WX + 3, Math.min(YEX - 3, x));
    const pz = Math.max(NZ + 3, Math.min(SZ - 3, z));
    if (this.valid(px, pz)) return { x: px, z: pz };
    for (let rr = 2; rr < 60; rr += 2)
      for (let a = 0; a < 8; a++) {
        const ax = this.cx + Math.cos(a / 8 * Math.PI * 2) * rr;
        const az = this.cz + Math.sin(a / 8 * Math.PI * 2) * rr;
        if (this.valid(ax, az)) return { x: ax, z: az };
      }
    return { x: this.cx, z: this.cz };
  },
  spawn() {
    let x, z, t = 0;
    do { x = WX + Math.random() * (YEX - WX); z = NZ + Math.random() * (SZ - NZ); }
    while (!this.valid(x, z) && ++t < 80);
    return { x, z };
  },
};

// ---- entry --------------------------------------------------------------
export function buildPrison(g, col, scene) {
  // ground pads: building wing + yard foot (cover terrain seams under the L)
  g.boxB((WX + BEX) / 2, GY, (NZ + MZ) / 2, BEX - WX, 0.12, MZ - NZ, P.concrete);
  g.boxB((WX + YEX) / 2, GY, (MZ + SZ) / 2, YEX - WX, 0.12, SZ - MZ, P.concrete);

  for (const b of BUILDINGS) cellBlock(g, col, b);
  for (const [cx, cz] of COURTS) court(g, cx, cz);
  guardBooth(g, col, 574, -250);

  // a few concrete benches along the yard's west edge, clear of the courts
  for (const [bx, bz] of [[572, -258], [572, -300], [660, -258]]) {
    g.boxB(bx, GY + 0.06, bz, 0.5, 0.45, 2.2, P.concreteDark);
    g.boxB(bx, GY + 0.51, bz, 0.6, 0.12, 2.2, P.concrete);
  }

  // perimeter fence (the L outline, clockwise)
  fenceRun(g, col, scene, WX, NZ, BEX, NZ);   // N (building wing)
  fenceRun(g, col, scene, BEX, NZ, BEX, MZ);  // E (building wing)
  fenceRun(g, col, scene, BEX, MZ, YEX, MZ);  // notch step out to the yard
  fenceRun(g, col, scene, YEX, MZ, YEX, SZ);  // E (yard foot)
  fenceRun(g, col, scene, YEX, SZ, WX, SZ);   // S
  fenceRun(g, col, scene, WX, SZ, WX, NZ);    // W (front, faces the city)

  for (const [tx, tz] of TOWERS) guardTower(g, col, tx, tz);
}
