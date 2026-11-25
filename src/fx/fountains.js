// Falling water for every wet fountain. The stone basins are static geometry
// (built in blocks/props.js `fountain`); the moving water is this live layer,
// hung over each registered fountain after the static merge so the merge never
// touches it.
//
// The water reads as continuous streams, not a mist of dots:
//   * a central jet — a fat tapered translucent column standing out of the
//     upper basin, the classic fountain plume;
//   * an overflow curtain — a continuous drooping sheet of water spilling off
//     the whole upper bowl rim into the lower pool (a lathe, so it wraps the
//     fountain with no gaps), just sheer enough to see the stone through it;
//   * a few droplets crowning the jet, for a little live sparkle.
// Every stream of every fountain is baked into ONE merged mesh (a single draw
// call for the whole city) whose shared water material scrolls a soft streak
// texture along the flow each frame, so the still tubes read as moving water.
// The handful of droplets ride fixed ballistic arcs in one small Points cloud.
// All parameters are seeded from coordinate hashes — identical on every load,
// no Math.random (see CLAUDE.md).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { frac, hash } from '../core/util.js';

const G = 9.0;          // gentle gravity for the crown droplets (m/s²)
const NOZZLE_Y = 2.85;  // droplet launch height, just above the upper basin
const RIM_R = 1.5;      // upper bowl rim radius the curtain pours from
const RIM_Y = 2.6;      // upper bowl rim height
const POOL_R = 1.5;     // curtain drops straight down (same radius) into the pool
const POOL_Y = 0.9;     // lower pool surface
const CROWN = 5;        // crown droplets per fountain

// A soft vertical streak texture: bright core fading at the edges, repeated up
// the length so scrolling it reads as flowing water.
function flowTexture() {
  const W = 32, H = 64;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  // across (u): bright centre → translucent edges, gives the tube a rounded,
  // glassy highlight instead of a flat band.
  const g = x.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0.0, 'rgba(200,230,255,0.05)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.85)');
  g.addColorStop(1.0, 'rgba(200,230,255,0.05)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // along (v): a couple of brighter ripples so motion is visible when scrolled.
  for (const yy of [0.28, 0.72]) {
    const r = x.createLinearGradient(0, (yy - 0.12) * H, 0, (yy + 0.12) * H);
    r.addColorStop(0, 'rgba(255,255,255,0)');
    r.addColorStop(0.5, 'rgba(255,255,255,0.5)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = r; x.fillRect(0, (yy - 0.12) * H, W, 0.24 * H);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function dropTexture() {
  const s = 48;
  const c = document.createElement('canvas'); c.width = c.height = s;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.5, 'rgba(215,238,255,0.5)');
  g.addColorStop(1.0, 'rgba(190,225,255,0.0)');
  x.fillStyle = g; x.beginPath(); x.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2); x.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// The overflow curtain for one fountain: a straight vertical profile (rim → pool)
// revolved a full turn, so a seamless sheet of water drops straight down off the
// whole bowl rim into the pool with no gaps. The lathe's v runs top→bottom, the
// opposite of the jet cylinder's, so we flip it — then the shared scrolling flow
// texture runs *downward* on the curtain too, matching the jet.
function curtainGeo(x, z, fy = 0) {
  const profile = [new THREE.Vector2(RIM_R, RIM_Y), new THREE.Vector2(POOL_R, POOL_Y)];
  const geo = new THREE.LatheGeometry(profile, 48);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  geo.translate(x, fy, z);
  return geo;
}

export class Fountains {
  // fountains: [{ x, z }] — the wet fountains registered during the static build.
  constructor(scene, fountains) {
    this.t = 0;
    this.streamMat = null;
    this.drops = [];
    if (!fountains || !fountains.length) { this.streams = this.points = null; return; }

    const tubes = [];
    for (let f = 0; f < fountains.length; f++) {
      // `y` (default 0) lets a fountain sit on a raised plinth (e.g. the mosque
      // şadırvan): every stream height is measured from this base.
      const { x, z, y: fy = 0 } = fountains[f];

      // central jet: a tapered vertical column standing out of the upper basin.
      // A cone gives the plume its narrowing top; a thin cylinder base fills the
      // throat so it doesn't look pinched where it leaves the water.
      const jetTop = 4.5, jetBase = 2.7;
      const jet = new THREE.CylinderGeometry(0.12, 0.42, jetTop - jetBase, 12, 1, false);
      jet.translate(x, (jetBase + jetTop) / 2 + fy, z);
      tubes.push(jet);

      // overflow curtain: one continuous drooping sheet wrapping the whole bowl.
      tubes.push(curtainGeo(x, z, fy));

      // crown droplets: a few flecks arcing off the top of the jet.
      for (let k = 0; k < CROWN; k++) {
        const seed = hash(f * 131 + 17, k);
        const th = frac(seed, 1) * Math.PI * 2;
        const vy = 1.6 + frac(seed, 2) * 1.2;      // pops just above the jet crown
        const vr = 0.5 + frac(seed, 3) * 0.7;
        const Tf = (vy + Math.sqrt(vy * vy + 2 * G * (jetTop - POOL_Y))) / G;
        this.drops.push({
          cx: x, cz: z, cos: Math.cos(th), sin: Math.sin(th),
          y0: jetTop - 0.2 + fy, vy, vr, r0: 0.1, Tf, off: frac(seed, 4) * Tf,
        });
      }
    }

    // --- one merged stream mesh, one scrolling water material ---
    const geo = mergeGeometries(tubes, false);
    for (const t of tubes) t.dispose();
    this.streamMat = new THREE.MeshBasicMaterial({
      map: flowTexture(), color: 0x66c2f2,
      transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide,
    });
    this.streamMat.map.repeat.set(1, 3);
    this.streams = new THREE.Mesh(geo, this.streamMat);
    this.streams.frustumCulled = false;
    this.streams.userData.noMerge = true; // animated material: keep out of mergeStatic
    scene.add(this.streams);

    // --- the few crown droplets, one small additive Points cloud ---
    const n = this.drops.length;
    this.pos = new Float32Array(n * 3);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    pg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const pmat = new THREE.PointsMaterial({
      map: dropTexture(), size: 0.22, sizeAttenuation: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      color: 0xe4f4ff,
    });
    this.points = new THREE.Points(pg, pmat);
    this.points.frustumCulled = false;
    this.points.userData.noMerge = true;
    this.writeDrops();
    scene.add(this.points);
  }

  writeDrops() {
    const p = this.pos;
    for (let k = 0; k < this.drops.length; k++) {
      const d = this.drops[k];
      const tau = (this.t + d.off) % d.Tf;
      const r = d.r0 + d.vr * tau;
      const y = d.y0 + d.vy * tau - 0.5 * G * tau * tau;
      p[k * 3] = d.cx + r * d.cos;
      p[k * 3 + 1] = y;
      p[k * 3 + 2] = d.cz + r * d.sin;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }

  update(dt) {
    if (!this.streams) return;
    this.t += dt;
    this.streamMat.map.offset.y = (this.t * 0.9) % 1; // scroll the flow downward
    this.writeDrops();
  }
}
