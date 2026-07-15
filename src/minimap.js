// HUD minimap (bottom-left): a stylized 2D map of the whole island drawn
// once from the same deterministic layout data the world is built from —
// coast bands (island.js), grid roads/blocks (layout.js) and the coastal
// parkway (parkway.js). Fixed north-up (screen up = -z, matching a top-down
// camera); only the player arrow moves, via a cheap CSS transform.
import { coastBands, HILL, POND, ISLETS } from './island.js';
import { buildRoads, buildBlocks } from './layout.js';
import { parkwayCenterR, parkwayCut, streetExtensions } from './parkway.js';

const SIZE = 200; // CSS pixels (canvas is drawn at 2x for crispness)
const PAD = 5;

// map palette (tuned from the world palette for top-down readability)
const M = {
  deep: '#3d7fa6',
  wade: '#4795c2',
  shoal: '#5db3d9',
  sand: '#d9cfb4',
  rock: '#8f887b',
  grass: '#74b94e',
  park: '#5da344',
  plaza: '#cdd2d7',
  road: '#62666e',
  pond: '#4fb7e8',
  hill: '#4e8f3c',
  bldg: '#c3c9cf',
};

export class Minimap {
  constructor(root, colliders) {
    this.root = root;
    this.arrow = root.querySelector('.arrow');
    const canvas = root.querySelector('canvas');
    canvas.width = SIZE * 2;
    canvas.height = SIZE * 2;

    const { N, R1, RC, R2 } = coastBands();
    // dry-sand outer edge = waterline (~73% across the sloping sand band)
    const WT = 0.73;
    const rWl = new Float32Array(N);
    let maxR = 0;
    for (let i = 0; i < N; i++) {
      rWl[i] = RC[i] + (R2[i] - RC[i]) * WT;
      if (rWl[i] > maxR) maxR = rWl[i];
    }
    // the offshore islets must fit on the panel too
    for (const il of ISLETS) maxR = Math.max(maxR, Math.hypot(il.x, il.z) + il.r);
    const s = (SIZE / 2 - PAD) / maxR; // px per meter (CSS px)
    this.s = s;
    this.c = SIZE / 2;

    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);
    const px = (x) => this.c + x * s;
    const pz = (z) => this.c + z * s;
    const thAt = (i) => -Math.PI + (2 * Math.PI * i) / N;

    // filled polygon following a per-sample polar radius
    const poly = (rAt, fill) => {
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const th = thAt(i % N), r = rAt(i % N);
        const x = px(r * Math.cos(th)), y = pz(r * Math.sin(th));
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };

    // ocean, wading slope, submerged sand, dry sand, rocky scarp, plateau
    ctx.fillStyle = M.deep;
    ctx.fillRect(0, 0, SIZE, SIZE);
    poly((i) => R2[i] + 45, M.wade);
    poly((i) => R2[i], M.shoal);
    poly((i) => rWl[i], M.sand);
    poly((i) => RC[i], M.rock);
    poly((i) => R1[i], M.grass);

    // offshore islets (sand ring + grass dome)
    for (const il of ISLETS) {
      for (const [rm, fill] of [[1, M.sand], [0.55, M.grass]]) {
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(px(il.x), pz(il.z), Math.max(il.r * rm * s, 1), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // park / plaza blocks
    for (const b of buildBlocks()) {
      const fill =
        b.type === 'park-central' || b.type === 'park' ? M.park :
        b.type === 'plaza' ? M.plaza : null;
      if (!fill) continue;
      ctx.fillStyle = fill;
      ctx.fillRect(px(b.x0), pz(b.z0), (b.x1 - b.x0) * s, (b.z1 - b.z0) * s);
    }

    // central-park hill (soft shaded knoll) + pond
    const g = ctx.createRadialGradient(px(HILL.x), pz(HILL.z), 0, px(HILL.x), pz(HILL.z), HILL.r * s);
    g.addColorStop(0, M.hill);
    g.addColorStop(1, 'rgba(78,143,60,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px(HILL.x), pz(HILL.z), HILL.r * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = M.pond;
    ctx.fillRect(px(POND.x - POND.a1), pz(POND.z - POND.a1), POND.a1 * 2 * s, POND.a1 * 2 * s);

    // grid roads (min 1px so the narrow streets stay visible)
    ctx.fillStyle = M.road;
    for (const r of buildRoads()) {
      const w = Math.max(r.width * s, 1);
      if (r.axis === 'x') ctx.fillRect(px(r.at) - w / 2, pz(r.from), w, (r.to - r.from) * s);
      else ctx.fillRect(px(r.from), pz(r.at) - w / 2, (r.to - r.from) * s, w);
    }

    // street extensions out to the parkway tees
    for (const e of streetExtensions()) {
      const w = Math.max(e.width * s, 1);
      if (e.axis === 'x') {
        const z0 = e.sgn * 636, z1 = e.sgn * e.L;
        ctx.fillRect(px(e.at) - w / 2, pz(Math.min(z0, z1)), w, Math.abs(z1 - z0) * s);
      } else {
        const x0 = e.sgn * 636, x1 = e.sgn * e.L;
        ctx.fillRect(px(Math.min(x0, x1)), pz(e.at) - w / 2, Math.abs(x1 - x0) * s, w);
      }
    }

    // building footprints, straight from the static collision boxes —
    // buildings are the tall chunky ones (trees/lamps/benches/rocks/cars
    // are thin, low or small; beach stairs are low steps)
    ctx.fillStyle = M.bldg;
    for (const b of colliders.boxes) {
      const w = b.maxX - b.minX, d = b.maxZ - b.minZ;
      if (b.maxY < 3.5 || b.minY > 2 || w < 3 || d < 3 || w * d < 18) continue;
      ctx.fillRect(px(b.minX), pz(b.minZ), Math.max(w * s, 0.7), Math.max(d * s, 0.7));
    }

    // coastal parkway ring (broken across the south inlet)
    ctx.strokeStyle = M.road;
    ctx.lineWidth = Math.max(12 * s, 1);
    ctx.lineCap = 'round';
    let open = false;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const th = thAt(i % N);
      if (parkwayCut(th)) { open = false; continue; }
      const r = parkwayCenterR(th);
      const x = px(r * Math.cos(th)), y = pz(r * Math.sin(th));
      open ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      open = true;
    }
    ctx.stroke();
  }

  update(player) {
    const lim = SIZE / 2 - 4;
    const mx = Math.max(-lim, Math.min(lim, player.pos.x * this.s));
    const my = Math.max(-lim, Math.min(lim, player.pos.z * this.s));
    // forward vector: walking = (-sin yaw, -cos yaw); driving = car heading
    const fx = player.car ? Math.sin(player.driveHeading) : -Math.sin(player.yaw);
    const fz = player.car ? Math.cos(player.driveHeading) : -Math.cos(player.yaw);
    const a = Math.atan2(fx, -fz); // 0 = screen up (-z), clockwise positive
    this.arrow.style.transform =
      `translate(${(this.c + mx).toFixed(1)}px, ${(this.c + my).toFixed(1)}px) rotate(${a.toFixed(3)}rad)`;
  }
}
