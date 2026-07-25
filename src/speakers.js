// Two colossal PA speakers flanking the Poo Man memorial, animated to bump to
// the beat of PooMan.mp3. The music is a spatial (positional) source anchored at
// the memorial: it fades out with distance (a `MeshLambertMaterial`-black block
// or so away it is silent) and, while the player is near, it ducks the city's
// default background music down to nothing so it *replaces* rather than layers.
//
// The cabinets are ordinary meshes (not GeoBatch instances) because their woofer
// cones are animated every frame — the batch is for static geometry only. The
// beat is read live from the playing audio with a Web-Audio analyser (bass-band
// energy), so the bounce is genuinely in time with the song — and, importantly,
// no `Math.random` is involved, keeping the scene deterministic.
//
// Placement is derived from the poo-man block's cell (i:9, j:10 in city.js) so
// the spots line up with the memorial's grassy NW plaza. buildings.js imports
// SPEAKER_SPOTS to reserve their colliders (and keep scattered trees off them)
// during the static build; the visuals + audio are constructed here from main.js.
import * as THREE from 'three';
import { SIDEWALK_H } from './palette.js';
import { cellRect } from './layout.js';

// Memorial plaza centre = centre of the poo-man block's NW quarter (matches
// buildPooMan's `nwx,nwz`). Statue + speakers all face the NW intersection.
const R = cellRect(9, 10, 10, 11);
const CX = R.cx ?? (R.x0 + R.x1) / 2, CZ = R.cz ?? (R.z0 + R.z1) / 2;
const MX = (R.x0 + CX) / 2, MZ = (R.z0 + CZ) / 2; // (145, 255)
const FACE = -3 * Math.PI / 4;                     // same facing as the statue

// Flank the pedestal: L out along the speaker's side axis, F forward (toward the
// NW approach). side = (cos,‑sin), forward = (sin,cos) for a THREE yaw.
const L = 15, F = 7;
const _s = [Math.cos(FACE), -Math.sin(FACE)];
const _f = [Math.sin(FACE), Math.cos(FACE)];
export const MEMORIAL = { x: MX, z: MZ };
export const SPEAKER_SPOTS = [1, -1].map((k) => ({
  x: MX + _s[0] * L * k + _f[0] * F,
  z: MZ + _s[1] * L * k + _f[1] * F,
  ry: FACE,
}));

// Cabinet footprint (for the reserved collider in buildings.js).
export const SPEAKER_W = 2.2, SPEAKER_H = 3.5, SPEAKER_D = 1.5;

const BODY = 0x1b1d21, EDGE = 0x2b2e34, BAFFLE = 0x121316; // cabinet
const SURR = 0x3c414a, CONE = 0x24272c, CAP = 0x0d0e11, TWEET = 0xc09a44; // drivers

export class Speakers {
  constructor(scene, listener) {
    this.woofers = []; // { cone, baseZ } — animated per frame
    this.level = 0;    // smoothed bass energy 0..1
    this.t = 0;        // clock for the continuous pulse

    const mat = (hex) => new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
    const mats = {
      body: mat(BODY), edge: mat(EDGE), baffle: mat(BAFFLE),
      surr: mat(SURR), cone: mat(CONE), cap: mat(CAP), tweet: mat(TWEET),
    };
    for (const sp of SPEAKER_SPOTS) this._cabinet(scene, mats, sp);

    // ---- positional audio: one looping source at the memorial centre ----
    this.sound = new THREE.PositionalAudio(listener);
    const holder = new THREE.Object3D();
    holder.position.set(MX, SIDEWALK_H + 3, MZ);
    holder.add(this.sound);
    scene.add(holder);
    this.sound.setLoop(true);
    this.sound.setVolume(1.0);
    this.sound.setDistanceModel('linear'); // hard silence past maxDistance
    this.sound.setRefDistance(20);
    this.sound.setMaxDistance(130);        // ~a block; music dies beyond it
    this.sound.setRolloffFactor(1);

    this.ready = false;
    this._wantPlay = false;
    new THREE.AudioLoader().load('/audio/PooMan.mp3', (buf) => {
      this.sound.setBuffer(buf);
      this.analyser = new THREE.AudioAnalyser(this.sound, 64); // 32 bins
      this.ready = true;
      if (this._wantPlay) this.play();
    });
  }

  // Build one cabinet: dark box + inset baffle carrying a big woofer, a mid, and
  // a tweeter. The two moving drivers are wrapped in a `cone` group so we can pop
  // them forward and pulse their scale without disturbing the cabinet.
  _cabinet(scene, m, sp) {
    const g = new THREE.Group();
    g.position.set(sp.x, SIDEWALK_H, sp.z);
    g.rotation.y = sp.ry;
    const W = SPEAKER_W, H = SPEAKER_H, D = SPEAKER_D, HD = D / 2;

    const box = (x, y, z, w, h, d, mat) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; g.add(b);
      return b;
    };
    // cabinet body + a thin lighter trim cap on top, front baffle inset flush
    box(0, H / 2, 0, W, H, D, m.body);
    box(0, H - 0.12, 0, W + 0.12, 0.24, D + 0.12, m.edge);
    box(0, H / 2, HD - 0.05, W - 0.5, H - 0.5, 0.2, m.baffle);

    // a driver: a shallow surround ring + a moving cone/dust-cap group on +z.
    const FZ = HD + 0.06; // baffle front plane
    const driver = (y, r, moving) => {
      // fixed surround (a short ring-ish disc a touch proud of the baffle)
      const surr = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.24, 20), m.surr);
      surr.rotation.x = Math.PI / 2; surr.position.set(0, y, FZ);
      surr.castShadow = true; g.add(surr);
      // cone: tapered inward, dust cap at the tip; grouped for animation
      const cg = new THREE.Group();
      cg.position.set(0, y, FZ + 0.02);
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.86, r * 0.42, 0.5, 20), m.cone);
      cone.rotation.x = -Math.PI / 2; cone.position.z = 0.18; cone.castShadow = true;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(r * 0.36, 12, 8), m.cap);
      cap.position.z = 0.34; cap.scale.z = 0.7;
      cg.add(cone, cap); g.add(cg);
      if (moving) this.woofers.push({ cone: cg, baseZ: cg.position.z });
    };
    driver(1.25, 0.8, true);  // big woofer (bumps)
    driver(2.5, 0.52, true);  // midrange (bumps)
    // tweeter: small static dome up top
    const tw = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), m.tweet);
    tw.position.set(0, 3.1, FZ + 0.06); tw.scale.z = 0.7; tw.castShadow = true; g.add(tw);

    scene.add(g);
  }

  // Resume the audio context and start looping (called from the user gesture in
  // main.js). Safe to call before the buffer has loaded.
  play() {
    if (!this.ready) { this._wantPlay = true; return; }
    const ctx = this.sound.context;
    if (ctx.state === 'suspended') ctx.resume();
    if (!this.sound.isPlaying) this.sound.play();
  }

  // Pause the memorial music (called when the game pauses). play() resumes it
  // from where it left off.
  pause() {
    if (this.sound && this.sound.isPlaying) this.sound.pause();
  }

  update(dt, player, bgm) {
    // --- beat: bass-band energy of the live signal, fast attack / slow decay ---
    let target = 0;
    if (this.analyser && this.sound.isPlaying) {
      try {
        const data = this.analyser.getFrequencyData();
        let s = 0; const n = 6; // bins 1..6 ≈ kick/bass
        for (let i = 1; i <= n; i++) s += data[i];
        target = s / n / 255;
      } catch { /* analyser not ready — fall back to the steady pulse */ }
    }
    const k = target > this.level ? dt * 22 : dt * 8;
    this.level += (target - this.level) * Math.min(1, k);
    const bass = THREE.MathUtils.clamp((this.level - 0.20) / 0.5, 0, 1);

    // The cones ALWAYS move — a steady ~140bpm kick (sharp attack, eased release)
    // that never rests, plus a small idle sway so there is visible motion even at
    // the bottom of each beat. The live bass energy rides on top, punching harder
    // when the track hits. Nothing here is gated on the audio, so it never stops.
    this.t += dt;
    const beat = this.t * (140 / 60);
    const frac = beat - Math.floor(beat);            // 0 → 1 within each beat
    const kick = (1 - frac) * (1 - frac);            // 1 → 0, snaps back each beat
    const idle = 0.12 * (0.5 + 0.5 * Math.sin(this.t * 5.5));
    const pump = THREE.MathUtils.clamp(idle + 0.9 * Math.max(kick, bass), 0, 1);
    for (const w of this.woofers) {
      w.cone.position.z = w.baseZ + pump * 0.42;  // big, obvious cone excursion
      w.cone.scale.setScalar(1 + pump * 0.35);
    }

    // --- duck the city's background music while the player is at the memorial ---
    if (bgm) {
      const d = Math.hypot(player.pos.x - MX, player.pos.z - MZ);
      const near = THREE.MathUtils.clamp((130 - d) / (130 - 70), 0, 1);
      bgm.volume = 0.35 * (1 - near);
    }
  }
}
