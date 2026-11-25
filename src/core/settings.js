// settings.js — player preferences (audio / graphics / controls / HUD) and the
// pause-menu Settings panel that edits them.
//
// Like coins/xp/look, settings are *player* state, so they persist in
// localStorage (the world itself stays deterministic and is untouched by any of
// this). The module owns three things:
//
//   1. SETTINGS — the schema: each entry's default, type and UI metadata. Add a
//      setting by adding a row here and handling its key in main.js's apply().
//   2. Settings — the store: get/set, persistence, and change listeners. Every
//      mutation goes through set() so the UI, storage and the live game agree.
//   3. buildSettingsMenu() — the panel inside #overlay. The pause screen gets a
//      "Settings" button; opening it swaps the overlay's normal contents for the
//      panel (CSS: #overlay.settings-open), ESC / Back swaps them back.
//
// Nothing here runs per frame. Settings are applied once on load and then only
// when a value changes, so the menu itself costs nothing at runtime — and most
// options exist precisely to let slower machines claw frames back.

const KEY = 'nosh.settings';

// type: 'range' → slider (min/max/step, fmt = readout), 'select' → segmented
// buttons (opts: [value, label]), 'toggle' → on/off switch.
export const SETTINGS = [
  { section: 'Audio' },
  { key: 'masterVol', label: 'Master volume', type: 'range', def: 1, min: 0, max: 1, step: 0.05, fmt: pct },
  { key: 'musicVol', label: 'Music', type: 'range', def: 1, min: 0, max: 1, step: 0.05, fmt: pct,
    hint: 'City soundtrack and the store song' },
  { key: 'worldVol', label: 'Memorial speakers', type: 'range', def: 1, min: 0, max: 1, step: 0.05, fmt: pct,
    hint: 'The positional music at the Poo Man memorial' },

  { section: 'Graphics' },
  { key: 'renderScale', label: 'Render resolution', type: 'select', def: 1,
    opts: [[0.5, '50%'], [0.7, '70%'], [0.85, '85%'], [1, '100%']],
    hint: 'Lower renders fewer pixels — the biggest FPS boost on slow GPUs' },
  { key: 'shadows', label: 'Shadows', type: 'select', def: 'high',
    opts: [['off', 'Off'], ['low', 'Low'], ['high', 'High'], ['ultra', 'Ultra']],
    hint: 'Low = softer map, refreshed less often · Ultra = smoothest moving shadows' },
  { key: 'fpsCap', label: 'Frame rate limit', type: 'select', def: 0,
    opts: [[30, '30'], [60, '60'], [120, '120'], [0, 'Unlimited']],
    hint: 'Cap the frame rate to save battery and keep fans quiet' },
  { key: 'fov', label: 'Field of view', type: 'range', def: 72, min: 55, max: 100, step: 1, fmt: (v) => `${v}°` },
  { key: 'boostFov', label: 'Boost zoom effect', type: 'toggle', def: true,
    hint: 'Widen the view while boosting' },

  { section: 'Controls' },
  { key: 'mouseSens', label: 'Mouse sensitivity', type: 'range', def: 1, min: 0.2, max: 3, step: 0.05,
    fmt: (v) => `${v.toFixed(2)}×` },
  { key: 'invertY', label: 'Invert mouse Y', type: 'toggle', def: false },

  { section: 'HUD' },
  { key: 'showMinimap', label: 'Minimap', type: 'toggle', def: true },
  { key: 'showFps', label: 'FPS counter', type: 'toggle', def: true },
];

function pct(v) { return `${Math.round(v * 100)}%`; }

const ROWS = SETTINGS.filter((s) => s.key);
const DEFAULTS = Object.fromEntries(ROWS.map((s) => [s.key, s.def]));

export class Settings {
  constructor() {
    this.values = { ...DEFAULTS, ...this._load() };
    this._listeners = [];
  }

  get(k) { return this.values[k]; }

  set(k, v) {
    if (this.values[k] === v) return;
    this.values[k] = v;
    this._save();
    for (const fn of this._listeners) fn(k, v, this.values);
  }

  reset() {
    for (const k of Object.keys(DEFAULTS)) this.set(k, DEFAULTS[k]);
  }

  // fn(key, value, allValues) on every change.
  onChange(fn) { this._listeners.push(fn); }

  _load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
      const out = {};
      // keep only known keys whose stored type still matches the default's
      for (const s of ROWS) {
        if (!(s.key in raw) || typeof raw[s.key] !== typeof s.def) continue;
        if (s.type === 'select' && !s.opts.some(([v]) => v === raw[s.key])) continue;
        if (s.type === 'range') raw[s.key] = Math.min(s.max, Math.max(s.min, raw[s.key]));
        out[s.key] = raw[s.key];
      }
      return out;
    } catch { return {}; }
  }

  _save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.values)); } catch { /* private mode etc. */ }
  }
}

// ---- the panel ------------------------------------------------------------
// opts.onOpen / opts.onClose let main.js preview the music while the panel is up
// (the game is otherwise silent while paused, so a volume slider would be mute).
export function buildSettingsMenu(settings, opts = {}) {
  const overlay = document.getElementById('overlay');
  const playBtn = document.getElementById('playBtn');

  // "Settings" button directly under Play / Resume
  const openBtn = document.createElement('button');
  openBtn.id = 'settingsBtn';
  openBtn.type = 'button';
  openBtn.textContent = 'Settings';
  playBtn.insertAdjacentElement('afterend', openBtn);

  const panel = document.createElement('div');
  panel.id = 'settings';
  const body = document.createElement('div');
  body.className = 'body';
  const rowsByKey = {};

  for (const s of SETTINGS) {
    if (s.section) {
      const h = document.createElement('h3');
      h.textContent = s.section;
      body.appendChild(h);
      continue;
    }
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML =
      `<div class="lbl"><span class="name"></span>${s.hint ? '<span class="hint"></span>' : ''}</div>` +
      `<div class="ctl"></div>`;
    row.querySelector('.name').textContent = s.label;
    if (s.hint) row.querySelector('.hint').textContent = s.hint;
    const ctl = row.querySelector('.ctl');
    let sync;

    if (s.type === 'range') {
      const input = document.createElement('input');
      input.type = 'range';
      input.min = s.min; input.max = s.max; input.step = s.step;
      const out = document.createElement('span');
      out.className = 'val';
      input.addEventListener('input', () => settings.set(s.key, Number(input.value)));
      ctl.append(input, out);
      sync = (v) => {
        input.value = v;
        out.textContent = s.fmt ? s.fmt(v) : v;
        input.style.setProperty('--p', `${(100 * (v - s.min) / (s.max - s.min)).toFixed(1)}%`);
      };
    } else if (s.type === 'select') {
      const seg = document.createElement('div');
      seg.className = 'seg';
      const btns = s.opts.map(([v, lbl]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = lbl;
        b.addEventListener('click', () => settings.set(s.key, v));
        seg.appendChild(b);
        return [v, b];
      });
      ctl.appendChild(seg);
      sync = (v) => { for (const [bv, b] of btns) b.classList.toggle('on', bv === v); };
    } else {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tog';
      b.setAttribute('role', 'switch');
      b.addEventListener('click', () => settings.set(s.key, !settings.get(s.key)));
      ctl.appendChild(b);
      sync = (v) => { b.classList.toggle('on', v); b.setAttribute('aria-checked', String(v)); };
    }
    sync(settings.get(s.key));
    rowsByKey[s.key] = sync;
    body.appendChild(row);
  }

  const foot = document.createElement('div');
  foot.className = 'foot';
  foot.innerHTML =
    `<button type="button" class="reset">Reset to defaults</button>` +
    `<button type="button" class="back">Back</button>`;

  const head = document.createElement('h2');
  head.textContent = 'SETTINGS';
  panel.append(head, body, foot);
  overlay.appendChild(panel);

  settings.onChange((k, v) => { if (rowsByKey[k]) rowsByKey[k](v); });

  const open = () => {
    overlay.classList.add('settings-open');
    body.scrollTop = 0;
    if (opts.onOpen) opts.onOpen();
  };
  const close = () => {
    if (!overlay.classList.contains('settings-open')) return;
    overlay.classList.remove('settings-open');
    if (opts.onClose) opts.onClose();
    openBtn.focus({ preventScroll: true });
  };
  openBtn.addEventListener('click', (e) => { e.stopPropagation(); open(); });
  foot.querySelector('.back').addEventListener('click', close);
  foot.querySelector('.reset').addEventListener('click', () => settings.reset());
  // ESC while paused closes the panel (the pointer is already unlocked, so the
  // browser doesn't consume this ESC for pointer-lock exit).
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('settings-open')) close();
  });

  return { open, close, isOpen: () => overlay.classList.contains('settings-open') };
}
