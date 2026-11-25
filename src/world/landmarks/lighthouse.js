// A tall clifftop lighthouse standing in the open plateau green-belt on the
// far western coast (world (-930, 415)), a few dozen metres inside the plateau
// edge so it reads as perched over the sea. Like manor.js / arena.js it is a
// hand-placed WORLD-COORDINATE feature, not a CITY grid entry.
//
// Two thirds of it is static (a rocky foot, a tapering white stone tower, an
// overhanging gallery, a red-framed glass lantern room and a red cap) drawn
// into its own batched mesh + the shared Colliders. The remaining third — the
// glowing lamp and its long rotating light beam — cannot be baked into the
// static batch because it animates, so this is a small class (constructed in
// main.js alongside Traffic/Balls) whose update() spins the beam each frame.
//
// Everything is deterministic — the boulder ring is coordinate-seeded, no
// Math.random.
import * as THREE from 'three';
import { GeoBatch } from '../../core/geo.js';
import { frac } from '../../core/util.js';
import { PALETTE as P } from '../../core/palette.js';

// ---- placement & profile ------------------------------------------------
const LX = -930, LZ = 415;      // tower centre (on grass, groundHeight ~0 here)

// Vertical build-up, base-anchored, bottom → top (heights chosen so the finial
// lands ~70m up — the tallest thing on the island by a clear margin):
const BASE_H = 3.5;             // rocky stone foot
const TOWER_H = 52;             // white tapering shaft
const GALL_H = 1.8;             // overhanging gallery deck
const RAIL_H = 1.3;             // red parapet ring on the deck
const LANT_H = 6.0;             // glass lantern room
const ROOF_H = 6.0;             // red conical cap
const BASE_TOP = BASE_H;                 // 3.5
const TOWER_TOP = BASE_TOP + TOWER_H;    // 55.5
const GALL_TOP = TOWER_TOP + GALL_H;     // 57.3
const RAIL_TOP = GALL_TOP + RAIL_H;      // 58.6
const LANT_TOP = GALL_TOP + LANT_H;      // 63.3
const ROOF_TOP = LANT_TOP + ROOF_H;      // 69.3
const LAMP_Y = GALL_TOP + LANT_H / 2;    // 60.3: lamp centred in the lantern

const R_TOWER = 6.5;            // shaft base radius (cyl() tapers it ~0.76 -> ~4.9 at top)
const R_GALL = 6.9;             // gallery deck radius (overhangs the shaft top)
const R_LANT = 3.7;             // lantern-room glass radius

// Beam aim & sweep. The lamp only throws its light *seaward* (radially away
// from the island centre) and rocks back and forth across that arc rather than
// spinning a full circle. CENTER is the beam.rotation.y that points local +x
// straight out to sea: local +x rotated by y maps to world (cos y, 0, -sin y),
// which we set equal to the outward unit vector (LX,LZ) — i.e. atan2(-LZ, LX).
const BEAM_CENTER = Math.atan2(-LZ, LX);
const BEAM_SWEEP = 0.79;        // half-arc (~45°): a wide, dramatic sea sweep
const BEAM_L = 220;             // beam reach (m)
const BEAM_R = 24;              // cone mouth radius at full reach

export class Lighthouse {
  constructor(scene, col) {
    const g = new GeoBatch();
    this._static(g, col);
    scene.add(g.build());
    this._lamp(scene);          // glowing lamp + rotating beam (animated)
    this.spin = 0;
  }

  // ---- static stone/glass shell -----------------------------------------
  _static(g, col) {
    // rocky stone foot (tapered drum) + a sparse ring of boulders around it
    g.cyl(LX, 0, LZ, 6.8, 9.0, BASE_H, P.concreteDark);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const rr = 8.5 + frac(i, 1, 2) * 2.2;
      const bx = LX + Math.cos(a) * rr, bz = LZ + Math.sin(a) * rr;
      const s = 1.7 + frac(i, 2, 3) * 1.9;
      g.ico(bx, 0.15 + s * 0.35, bz, s, i % 2 ? P.concreteDark : P.roofDark);
      col.add(bx, 0, bz, s * 1.5, s * 1.4, s * 1.5);
    }

    // white tapering shaft, with a couple of thin red string-course bands
    g.cyl(LX, BASE_TOP, LZ, 4.9, R_TOWER, TOWER_H, P.white);
    g.cyl(LX, BASE_TOP + TOWER_H * 0.33, LZ, 5.7, 5.7, 0.9, P.roofRed);
    g.cyl(LX, BASE_TOP + TOWER_H * 0.66, LZ, 5.2, 5.2, 0.9, P.roofRed);

    // overhanging gallery deck + red parapet ring standing on it
    g.cyl(LX, TOWER_TOP, LZ, R_GALL, R_GALL, GALL_H, P.concreteDark);
    g.cyl(LX, GALL_TOP, LZ, R_GALL - 0.3, R_GALL - 0.3, RAIL_H, P.roofRed);

    // glass lantern room: a glazed drum inside the parapet with red astragal
    // bars, capped by a red cornice ring under the roof
    g.cyl(LX, GALL_TOP, LZ, R_LANT, R_LANT, LANT_H, P.glassDark);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const bx = LX + Math.cos(a) * (R_LANT + 0.05), bz = LZ + Math.sin(a) * (R_LANT + 0.05);
      g.box(bx, GALL_TOP + LANT_H / 2, bz, 0.35, LANT_H, 0.35, P.roofRed);
    }
    g.cyl(LX, LANT_TOP - 0.4, LZ, R_LANT + 0.5, R_LANT + 0.5, 0.7, P.roofRed);

    // red conical cap + finial ball
    g.cone(LX, LANT_TOP, LZ, R_LANT + 0.9, ROOF_H, P.roofRed);
    g.ico(LX, ROOF_TOP + 0.5, LZ, 0.55, P.lampWarm);

    // collision: the visible tower is round, but a single square box either
    // leaves the wide rocky foot walk-through-able (small box) or grows big
    // phantom corners (large box). Approximate each round tier with a crossed
    // pair of boxes (0° + 45° → an octagon of OBBs, resolved exactly by
    // movePlayer): flats hug the visible radius, corners tuck just inside it.
    const oct = (y, r, h) => {
      col.add(LX, y, LZ, r * 2, h, r * 2, 0);
      col.add(LX, y, LZ, r * 2, h, r * 2, Math.PI / 4);
    };
    oct(0, 8.3, BASE_H + 0.5);            // rocky foot (visible radius 9 → 6.8)
    oct(BASE_H, 6.4, RAIL_TOP - BASE_H);  // white shaft (radius 6.5 → 4.9)
  }

  // ---- animated lamp + beam ---------------------------------------------
  _lamp(scene) {
    // the lamp itself: an unlit warm sphere so it glows regardless of the sun
    const lamp = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.9, 1),
      new THREE.MeshBasicMaterial({ color: 0xfff0c0, toneMapped: false })
    );
    lamp.position.set(LX, LAMP_Y, LZ);
    lamp.frustumCulled = false;
    scene.add(lamp);

    // a pivot carrying a single light fan pointed seaward. The fan is an open
    // cone whose apex sits at the lamp and whose mouth flares out to BEAM_R at
    // BEAM_L — so it grows conically with distance. It's additive + translucent
    // so it reads as a swept shaft of light, not solid, and its vertex colours
    // fade from warm yellow at the lamp to black at the mouth: under additive
    // blending black adds nothing, so the beam simply dissolves into the
    // distance instead of ending in a hard edge.
    this.beam = new THREE.Group();
    this.beam.position.set(LX, LAMP_Y, LZ);
    scene.add(this.beam);

    const geo = new THREE.ConeGeometry(BEAM_R, BEAM_L, 24, 1, true);
    geo.translate(0, -BEAM_L / 2, 0); // apex at local origin, wide base at -y
    geo.rotateZ(Math.PI / 2);         // lay it horizontal: apex at lamp, mouth +x
    const pos = geo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    const warm = new THREE.Color(0xffff1a);   // a strongly yellow beam
    for (let i = 0; i < pos.count; i++) {
      // fade lamp → mouth, squared so it eases to zero well before the mouth
      // (a softer dissolve than a straight linear ramp, no sharp cut-off edge)
      const f = (1 - Math.min(pos.getX(i) / BEAM_L, 1)) ** 2; // 1 at lamp → 0 out
      cols[i * 3] = warm.r * f;
      cols[i * 3 + 1] = warm.g * f;
      cols[i * 3 + 2] = warm.b * f;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));

    const beamMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const fan = new THREE.Mesh(geo, beamMat);
    fan.frustumCulled = false;
    this.beam.add(fan);
  }

  update(dt) {
    // rock the beam back and forth across the seaward arc (no full rotation)
    this.spin += dt * 0.55;
    this.beam.rotation.y = BEAM_CENTER + Math.sin(this.spin) * BEAM_SWEEP;
  }
}
