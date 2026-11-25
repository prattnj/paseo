// wardrobe.js — the full-screen "change your look" menu run by the first cashier
// on the left in Hansen's (see store.js for the E-to-talk trigger).
//
// This is a screen of its own, not an overlay on the store: an opaque studio
// backdrop with a large, slowly-rotating live 3D model of your character on the
// left and the option rows on the right. Each option is a preview tile (garment
// silhouette or a little head — see avatar-icons.js) so you can read every choice
// before picking it, and the choices for future richer designs drop straight in.
//
// The 3D preview is rendered by its OWN small WebGLRenderer into a dedicated
// scene, completely independent of the city — so the menu never shows the world
// behind it, and framing/lighting are tuned just for a portrait.
//
// Pointer-lock coordination: gameplay runs under pointer lock (mouse-look), but
// clicking tiles needs a free cursor, so opening the wardrobe releases the lock.
// main.js checks wardrobeOpen() in its pointerlockchange handler so that release
// is NOT treated as a pause; closing calls the relock callback main.js hands us.
// The look is applied to the real player (and persisted) on close.

import * as THREE from 'three';
import { FIELDS, lookToHumanoid } from './appearance.js';
import { makeHumanoid } from '../actors/character.js';
import { tileIcon } from './avatar-icons.js';

let _player = null;      // the Player whose look we're editing
let _relock = null;      // main.js's acquireLock, called on close to resume play
let _root = null;        // the #wardrobe screen element
let _rowsEl = null;      // container the field rows are built into
let _open = false;
let _look = null;        // the working look while the menu is open

// ---- dedicated 3D preview (own renderer/scene/camera) --------------------
let _pr = null;          // preview WebGLRenderer
let _pscene = null, _pcam = null;
let _pcanvas = null;     // the canvas the preview renders into
let _pfigure = null;     // the current preview humanoid group
let _spin = 0;           // turntable angle
let _raf = 0;            // preview render-loop handle

export function wardrobeOpen() {
  return _open;
}

// Build the screen DOM + the preview renderer once, and wire up the player and
// the relock callback. Called from main.js after the player exists.
export function initWardrobe(player, relock) {
  _player = player;
  _relock = relock;
  if (_root) return; // already built

  _root = document.createElement('div');
  _root.id = 'wardrobe';
  _root.tabIndex = -1;
  _root.innerHTML = `
    <div class="wrap">
      <div class="stage">
        <div class="stagehd">Your Character</div>
        <canvas class="model"></canvas>
        <button class="done" type="button">Done</button>
      </div>
      <div class="controls">
        <div class="hd">
          <div class="title">Wardrobe</div>
          <div class="sub">Hansen's &mdash; dress how you like</div>
        </div>
        <div class="rows"></div>
      </div>
    </div>`;
  document.body.appendChild(_root);
  _rowsEl = _root.querySelector('.rows');
  _pcanvas = _root.querySelector('canvas.model');

  buildRows();
  initPreview();

  _root.querySelector('.done').addEventListener('click', (e) => {
    e.stopPropagation();
    closeWardrobe();
  });
  _root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); closeWardrobe(); }
  });
}

// One row per customizable field: a label plus a single, never-wrapping strip of
// preview tiles that scrolls horizontally. Prev/next arrows flank the strip and
// appear only when the options overflow the row. Each tile carries the option's
// stylized icon and its name; the selected one gets `.sel`.
function buildRows() {
  _rowsEl.innerHTML = '';
  for (const field of FIELDS) {
    const row = document.createElement('div');
    row.className = 'row';
    row.dataset.key = field.key;
    row.innerHTML = `<div class="lbl">${field.label}</div>`;

    const strip = document.createElement('div');
    strip.className = 'strip';

    const prev = document.createElement('button');
    prev.type = 'button'; prev.className = 'arrow prev'; prev.innerHTML = '&#8249;';
    const next = document.createElement('button');
    next.type = 'button'; next.className = 'arrow next'; next.innerHTML = '&#8250;';

    const tiles = document.createElement('div');
    tiles.className = 'tiles';
    field.list.forEach((opt, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tile';
      b.dataset.i = String(i);
      b.title = opt.name;
      b.innerHTML = `<span class="art">${tileIcon(field.key, opt)}</span><span class="nm">${opt.name}</span>`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        select(field.key, i);
      });
      tiles.appendChild(b);
    });

    prev.addEventListener('click', (e) => { e.stopPropagation(); scrollTiles(tiles, -1); });
    next.addEventListener('click', (e) => { e.stopPropagation(); scrollTiles(tiles, 1); });
    tiles.addEventListener('scroll', () => syncArrows(tiles, prev, next));

    strip.append(prev, tiles, next);
    row.appendChild(strip);
    _rowsEl.appendChild(row);
  }
}

// Scroll a tile strip by most of its visible width (dir: -1 back / +1 forward).
function scrollTiles(tiles, dir) {
  tiles.scrollBy({ left: dir * tiles.clientWidth * 0.8, behavior: 'smooth' });
}

// Show an arrow only when there's more to scroll that way; hidden (but keeping
// its slot) otherwise, so every row stays vertically aligned.
function syncArrows(tiles, prev, next) {
  const max = tiles.scrollWidth - tiles.clientWidth;
  const overflow = max > 1;
  prev.classList.toggle('hide', !overflow || tiles.scrollLeft <= 1);
  next.classList.toggle('hide', !overflow || tiles.scrollLeft >= max - 1);
}

// Recompute every row's arrows — called once the screen is shown and laid out
// (clientWidth is only meaningful then).
function syncAllArrows() {
  for (const strip of _rowsEl.querySelectorAll('.strip')) {
    syncArrows(strip.querySelector('.tiles'), strip.querySelector('.prev'), strip.querySelector('.next'));
  }
}

// Apply a choice to the working look, refresh the 3D model + the highlights.
function select(key, i) {
  if (!_look) return;
  _look = { ..._look, [key]: i };
  rebuildFigure();
  refresh();
}

// Sync every row's highlight to the working look.
function refresh() {
  if (!_look) return;
  for (const row of _rowsEl.querySelectorAll('.row')) {
    const cur = _look[row.dataset.key];
    for (const b of row.querySelectorAll('.tile')) {
      b.classList.toggle('sel', Number(b.dataset.i) === cur);
    }
  }
}

// ---- 3D preview ----------------------------------------------------------
function initPreview() {
  _pr = new THREE.WebGLRenderer({ canvas: _pcanvas, antialias: true, alpha: true });
  _pr.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  _pscene = new THREE.Scene();
  _pscene.add(new THREE.HemisphereLight(0xffffff, 0x6b7280, 1.15));
  const key = new THREE.DirectionalLight(0xfff3dc, 1.5);
  key.position.set(2, 4, 3);
  _pscene.add(key);
  _pcam = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  _pcam.position.set(0, 1.0, 3.7);
  _pcam.lookAt(0, 0.95, 0);
}

// Replace the preview humanoid with one built from the working look.
function rebuildFigure() {
  if (_pfigure) {
    _pscene.remove(_pfigure);
    _pfigure.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); // materials are shared/cached
  }
  _pfigure = makeHumanoid(lookToHumanoid(_look)).group;
  _pfigure.rotation.y = _spin;
  _pscene.add(_pfigure);
}

function sizePreview() {
  const w = _pcanvas.clientWidth || 360, h = _pcanvas.clientHeight || 520;
  _pr.setSize(w, h, false);
  _pcam.aspect = w / h;
  _pcam.updateProjectionMatrix();
}

function startLoop() {
  const step = () => {
    _spin += 0.008;
    if (_pfigure) _pfigure.rotation.y = _spin;
    _pr.render(_pscene, _pcam);
    _raf = requestAnimationFrame(step);
  };
  _raf = requestAnimationFrame(step);
}

function stopLoop() {
  if (_raf) cancelAnimationFrame(_raf);
  _raf = 0;
}

// ---- open / close --------------------------------------------------------
export function openWardrobe() {
  if (!_root || _open) return;
  _open = true;                 // set BEFORE releasing the lock so main.js's
  document.exitPointerLock();   // pointerlockchange handler knows not to pause

  _look = { ..._player.look };  // start from what you walked in wearing
  _root.classList.add('show');  // display the screen (so the canvas can be sized)
  _spin = 0;
  sizePreview();
  rebuildFigure();
  refresh();
  syncAllArrows();       // now that the screen is laid out, show arrows where needed
  // bring each row's current selection into view
  for (const b of _rowsEl.querySelectorAll('.tile.sel')) {
    b.scrollIntoView({ inline: 'center', block: 'nearest' });
  }
  startLoop();
  _root.focus?.();
}

export function closeWardrobe() {
  if (!_open) return;
  _open = false;
  stopLoop();
  _root.classList.remove('show');
  if (_look) _player.setAppearance(_look); // apply to the real character + persist
  if (_relock) _relock();                  // re-acquire pointer lock → resume play
}
