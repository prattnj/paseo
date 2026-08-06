// HUD minimap (bottom-left): a true top-down photo of the world. Rather than
// re-drawing the layout in 2D (which always drifts from the real geometry and
// misses hand-placed features like the arena, mansion, drag strip and woods),
// we point an orthographic camera straight down at the finished scene and
// render it once into the panel. The result literally IS the world from a
// bird's-eye view. Fixed north-up (screen up = -z); only the player arrow moves,
// via a cheap CSS transform. Re-rendering is one-time — the static city never
// changes — so this costs nothing per frame.
import * as THREE from 'three';
import { coastBands, ISLETS } from '../world/island.js';

const SIZE = 400; // CSS pixels
const PAD = 8;    // world inset so the coast doesn't touch the panel border
const DPR = 2;    // supersample factor for a crisp map
const OCEAN = 0x3d7fa6;

export class Minimap {
  constructor(root, renderer, scene) {
    this.root = root;
    this.arrow = root.querySelector('.arrow');
    const canvas = root.querySelector('canvas');
    const TEX = SIZE * DPR;
    canvas.width = TEX;
    canvas.height = TEX;

    // ---- frame the whole island (plateau coast + offshore islets) ----
    const { N, R2, RC } = coastBands();
    const WT = 0.73; // waterline sits ~73% across the sloping sand band
    let maxR = 0;
    for (let i = 0; i < N; i++) {
      const rWl = RC[i] + (R2[i] - RC[i]) * WT;
      if (rWl > maxR) maxR = rWl;
    }
    for (const il of ISLETS) maxR = Math.max(maxR, Math.hypot(il.x, il.z) + il.r);

    this.s = (SIZE / 2 - PAD) / maxR; // CSS px per world metre
    this.c = SIZE / 2;

    // ---- top-down orthographic render of the real scene ----
    const half = (SIZE / 2) / this.s; // world half-extent that fills the panel edge
    const cam = new THREE.OrthographicCamera(-half, half, half, -half, 1, 4000);
    cam.position.set(0, 2000, 0);
    cam.up.set(0, 0, -1);        // screen up = world -z (north-up)
    cam.lookAt(0, 0, 0);

    const rt = new THREE.WebGLRenderTarget(TEX, TEX);
    const prevTarget = renderer.getRenderTarget();
    const prevFog = scene.fog;
    scene.fog = null;            // the world fog fades everything past ~900m; kill it for the map
    renderer.setRenderTarget(rt);
    renderer.setClearColor(OCEAN, 1);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.setRenderTarget(prevTarget);
    scene.fog = prevFog;

    // ---- blit the render target onto the 2D panel canvas (GL is bottom-up) ----
    const buf = new Uint8Array(TEX * TEX * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, TEX, TEX, buf);
    rt.dispose();
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(TEX, TEX);
    const out = img.data;
    // brighten: the world's sun/fog reads a touch dark top-down, so lift each
    // channel through a precomputed curve (gain + small floor lift).
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) lut[i] = Math.min(255, Math.round(i * 1.2 + 12));
    const row = TEX * 4;
    for (let y = 0; y < TEX; y++) {
      const src = (TEX - 1 - y) * row; // flip vertically (GL is bottom-up)
      const dst = y * row;
      for (let i = 0; i < row; i += 4) {
        out[dst + i] = lut[buf[src + i]];
        out[dst + i + 1] = lut[buf[src + i + 1]];
        out[dst + i + 2] = lut[buf[src + i + 2]];
        out[dst + i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
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
