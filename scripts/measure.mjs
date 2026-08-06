// Throwaway perf harness: loads the dev server, samples renderer.info + frame
// time at the title view, prints JSON. Used to compare BEFORE/AFTER the perf pass.
// Run: node scripts/measure.mjs   (dev server must be up on :5173)
import puppeteer from 'puppeteer-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = process.env.URL || 'http://localhost:5173';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=default', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=1280,800'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const warnings = [];
page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') warnings.push(m.type() + ': ' + m.text()); });
await page.goto(URL, { waitUntil: 'networkidle0', timeout: 60000 });
await page.waitForFunction('window.__game && window.__game.renderer', { timeout: 30000 });
// let a few frames render (shadow map refresh cadence is every 3rd active frame,
// but the title frame renders it once regardless)
await new Promise((r) => setTimeout(r, 1500));

const result = await page.evaluate(async () => {
  const r = window.__game.renderer;
  // sample renderer.info over a handful of rendered frames
  const info = r.info.render;
  const scene = window.__game.scene;
  let meshes = 0, instanced = 0, instances = 0;
  scene.traverse((o) => {
    if (o.isInstancedMesh) { instanced++; instances += o.count; }
    else if (o.isMesh) meshes++;
  });
  // frame time: average rAF delta over ~60 frames
  const times = [];
  let last = performance.now();
  await new Promise((resolve) => {
    let n = 0;
    function step() {
      const now = performance.now();
      times.push(now - last); last = now;
      if (++n < 60) requestAnimationFrame(step); else resolve();
    }
    requestAnimationFrame(step);
  });
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  return {
    drawCalls: info.calls,
    triangles: info.triangles,
    standaloneMeshes: meshes,
    instancedMeshes: instanced,
    totalInstances: instances,
    medianFrameMs: +median.toFixed(2),
  };
});

console.log(JSON.stringify({ ...result, warnings }, null, 2));
await browser.close();
