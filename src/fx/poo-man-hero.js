// Poo Man, airborne. The town hero (see blocks/poo-man.js for the memorial
// statue he's modelled on) cruises the sky over the whole island: body prone,
// one arm outstretched forward like a proper flying superhero, cape streaming
// behind. ~3m scale, cruising just above the tallest skyscraper (~82-90m),
// banking through a slow, meandering, seemingly-random path.
//
// Like Lighthouse/Traffic this is a small class constructed in main.js and
// stepped each frame. It lives entirely in the sky, above all geometry, so it
// touches neither the colliders nor groundHeight.
//
// DETERMINISM: the flight path is a PURE FUNCTION of accumulated flight time
// (a sum of incommensurate sinusoids), not Math.random — so it's smooth,
// non-repeating for a long while, and byte-identical on every load, keeping
// with the project's no-Math.random rule. He casts a moving shadow on the city.
import * as THREE from 'three';
import { mat } from '../actors/character.js';

// Memorial palette (matches blocks/poo-man.js pooMan()).
const BODY = 0x6e4a2c, CAPE = 0x553a20, SKIN = 0xe8c99a, HAIR = 0x412d19, EYE = 0x161616, BELT = 0xddc022;

// Flight envelope. Path is built so |x|,|z| stay well inside the coastline
// (~±650 of the ±885 grid) and altitude stays in the low band.
const AX1 = 420, AX2 = 230, AZ1 = 420, AZ2 = 230; // path amplitudes (m)
const WX1 = 0.035, WX2 = 0.057, WZ1 = 0.039, WZ2 = 0.066; // path frequencies (rad/s)
const ALT = 86, ALT_A = 4, ALT_W = 0.045;         // altitude 82..90m, just above the tallest tower (~79m)

// Flight position as a pure function of time. Slow, graceful, non-repeating.
function flightPos(t, out) {
  out.x = AX1 * Math.sin(WX1 * t) + AX2 * Math.sin(WX2 * t + 2.1);
  out.z = AZ1 * Math.cos(WZ1 * t) + AZ2 * Math.sin(WZ2 * t + 0.7);
  out.y = ALT + ALT_A * Math.sin(ALT_W * t + 1.3);
  return out;
}

// Build the prone hero in a local frame where +Z is the direction of flight,
// +Y is up. Torso lies flat along Z; head leads (+Z), legs trail (-Z). Returns
// the group (ready to be positioned/rotated in the world).
function makeFlyingPooMan() {
  const g = new THREE.Group();
  const box = (w, h, d, hex, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(hex));
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };

  // torso (flat, along Z) + a proud yellow belt near the waist (rear of torso)
  box(0.52, 0.34, 0.78, BODY, 0, 0, 0);
  box(0.56, 0.4, 0.16, BELT, 0, 0, -0.3);

  // head leads the flight, tan cube with dark hair on top/front + eyes + mouth
  const H = 0.55;
  box(0.34, 0.34, 0.32, SKIN, 0, 0.05, H);
  box(0.37, 0.1, 0.35, HAIR, 0, 0.24, H - 0.02);          // hair cap
  box(0.3, 0.28, 0.08, HAIR, 0, 0.12, H - 0.16);          // rear hairline
  for (const s of [-1, 1]) box(0.06, 0.08, 0.05, EYE, s * 0.09, 0.06, H + 0.17); // eyes
  box(0.16, 0.04, 0.05, 0x46281c, 0, -0.06, H + 0.17);    // mouth

  // right arm outstretched straight forward, fist leading (the hero pose)
  box(0.14, 0.15, 0.6, BODY, 0.28, 0.03, 0.62);
  box(0.17, 0.17, 0.17, SKIN, 0.28, 0.03, 0.98);          // fist

  // left arm swept back along the flank, tucked to the side
  box(0.14, 0.15, 0.62, BODY, -0.31, 0.0, -0.02);
  box(0.16, 0.16, 0.16, SKIN, -0.31, 0.0, -0.36);         // left hand

  // legs trailing straight back, slightly spread
  for (const s of [-1, 1]) {
    box(0.18, 0.2, 0.82, BODY, s * 0.13, 0, -0.78);       // brown "poo" thighs+shins
    box(0.2, 0.12, 0.16, HAIR, s * 0.13, -0.06, -1.22);   // dark boot
  }

  // cape: a tapered, thick quad anchored at the shoulders, streaming back and
  // lifting in the slipstream (same extrude-with-thickness trick as the statue)
  const cmat = new THREE.MeshLambertMaterial({ color: CAPE, flatShading: true, side: THREE.DoubleSide });
  const q = [
    [-0.3, 0.14, 0.16], [0.3, 0.14, 0.16],   // near edge, at the shoulders
    [0.46, 0.5, -0.95], [-0.46, 0.5, -0.95], // far edge, flared + lifted, trailing
  ];
  const e1 = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]];
  const e2 = [q[3][0] - q[0][0], q[3][1] - q[0][1], q[3][2] - q[0][2]];
  let nr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const nl = Math.hypot(...nr) || 1; nr = nr.map((v) => (v / nl) * 0.03); // half-thickness
  const front = q.map((p) => [p[0] + nr[0], p[1] + nr[1], p[2] + nr[2]]);
  const back = q.map((p) => [p[0] - nr[0], p[1] - nr[1], p[2] - nr[2]]);
  const cp = [];
  const quad = (a, bb, cc, d) => cp.push(...a, ...bb, ...cc, ...a, ...cc, ...d);
  quad(front[0], front[1], front[2], front[3]);
  quad(back[3], back[2], back[1], back[0]);
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(front[i], back[i], back[j], front[j]); }
  const cgeo = new THREE.BufferGeometry();
  cgeo.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
  cgeo.computeVertexNormals();
  const cape = new THREE.Mesh(cgeo, cmat);
  cape.castShadow = true;
  g.add(cape);
  g.userData.cape = cape;

  return g;
}

export class PooManHero {
  constructor(scene) {
    this.t = 0;
    this.group = makeFlyingPooMan();
    this.group.scale.setScalar(1.7); // ~3m hero, big enough to spot from the street
    scene.add(this.group);
    this._p = new THREE.Vector3();
    this._prevHd = 0;
    // seed initial placement/heading so frame one already looks right
    flightPos(0, this._p);
    this.group.position.copy(this._p);
  }

  update(dt) {
    this.t += dt;
    const t = this.t;

    // position (pure function of flight time)
    flightPos(t, this._p);
    this.group.position.copy(this._p);

    // heading from the analytic velocity (d/dt of flightPos x,z)
    const dx = AX1 * WX1 * Math.cos(WX1 * t) + AX2 * WX2 * Math.cos(WX2 * t + 2.1);
    const dz = -AZ1 * WZ1 * Math.sin(WZ1 * t) + AZ2 * WZ2 * Math.cos(WZ2 * t + 0.7);
    const hd = Math.atan2(dx, dz); // local +Z is forward, matching peds/traffic
    this.group.rotation.y = hd;

    // bank into turns: roll proportional to turn rate, smoothed & clamped
    let turn = hd - this._prevHd;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    this._prevHd = hd;
    const targetRoll = Math.max(-0.5, Math.min(0.5, (turn / Math.max(dt, 1e-3)) * -0.9));
    this.group.rotation.z += (targetRoll - this.group.rotation.z) * Math.min(1, dt * 4);

    // gentle cape flutter in the slipstream
    const cape = this.group.userData.cape;
    if (cape) cape.rotation.x = Math.sin(t * 3.1) * 0.08;
  }
}
