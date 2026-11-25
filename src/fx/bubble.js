// A friendly floating "chat" speech bubble that hovers over a character's head.
// Like the arena's midfield crest, it's a 2D decal — a rounded white bubble with
// a tail and three grey "…" dots drawn once onto a canvas and mapped onto a
// single flat quad: one node, one draw call, and perfectly smooth curves at no
// geometry cost. Every bubble bobs and billboards to face the player each frame
// (tagged noMerge so mergeStatic leaves them alone for the animation). One shared
// texture/material/geometry backs them all — only the transforms differ.
//
// Shared by the grocery store workers (store.js) and the stationary attraction
// greeters (peds.js); updateBubbles() is pumped once per frame from main.js.
import * as THREE from 'three';

const bubbles = [];        // [{ mesh, y0, phase }]
let bubbleT = 0;           // bob clock
let bubbleMat = null, bubbleGeo = null;

function bubbleTexture() {
  const W = 512, H = 400;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const bx = 26, by = 22, bw = W - 52, bh = 288, r = 96, cx = W / 2;
  // soft drop shadow so the pure-white bubble reads against the light interior
  x.shadowColor = 'rgba(40,50,60,0.30)'; x.shadowBlur = 22; x.shadowOffsetY = 8;
  x.fillStyle = '#ffffff';
  x.beginPath(); x.roundRect(bx, by, bw, bh, r); x.fill();          // rounded body
  x.beginPath();                                                    // tail toward the head
  x.moveTo(cx - 46, by + bh - 6); x.lineTo(cx + 46, by + bh - 6); x.lineTo(cx, H - 18); x.closePath(); x.fill();
  x.shadowColor = 'transparent'; x.shadowBlur = 0;                  // dots: crisp, no shadow
  x.fillStyle = '#8a9099';
  for (const dx of [-96, 0, 96]) { x.beginPath(); x.arc(cx + dx, by + bh / 2, 27, 0, Math.PI * 2); x.fill(); }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8; tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Add a bubble hovering at (x, yBase, z). yBase is the resting centre height;
// the bubble bobs gently around it and turns to face the player.
export function makeBubble(scene, x, yBase, z) {
  const H = 1.05;
  if (!bubbleGeo) bubbleGeo = new THREE.PlaneGeometry(H * 512 / 400, H);
  if (!bubbleMat) bubbleMat = new THREE.MeshBasicMaterial({ map: bubbleTexture(), transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(bubbleGeo, bubbleMat);
  mesh.position.set(x, yBase, z);
  mesh.userData.noMerge = true;
  mesh.renderOrder = 3;
  scene.add(mesh);
  bubbles.push({ mesh, y0: yBase, phase: bubbles.length * 1.7 }); // desync the bobbing
  return mesh;
}

// Bob every bubble and turn each to face the player. Pumped once per frame.
export function updateBubbles(player, dt) {
  bubbleT += dt;
  for (const b of bubbles) {
    const m = b.mesh;
    m.position.y = b.y0 + Math.sin(bubbleT * 2 + b.phase) * 0.1;
    m.rotation.y = Math.atan2(player.pos.x - m.position.x, player.pos.z - m.position.z);
  }
}
