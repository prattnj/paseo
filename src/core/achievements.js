// achievements.js — the achievement engine, pause-menu list, and unlock toast.
//
// One instance is built in main.js and update()d every active frame. It:
//   1. accumulates the running `stats` the achievement checks read (distance
//      driven/walked, top speed, distance from spawn, which car types you've
//      driven) from the live player/traffic each frame;
//   2. evaluates every not-yet-earned achievement's check() and, on the frame
//      one passes, grants it — awarding its XP ONCE and persisting it (the XP
//      may in turn level the player up, which pays coins — see levels.js);
//   3. renders the full list into the pause menu (the #overlay), honouring each
//      achievement's reveal style (visible / cryptic name / hidden);
//   4. pops a small toast when something is earned.
//
// All the tunable data (names, descriptions, rewards, reveal styles, and the
// check predicates) lives in economy.js — this file is only the machinery.

import { ACHIEVEMENTS } from './economy.js';

const KEY = 'nosh.achievements';
const MPS_TO_MPH = 2.23694;

export class Achievements {
  constructor(levels, coins, unlocks, world = {}) {
    this.levels = levels;
    this.coins = coins;
    this.unlocks = unlocks;
    // Live world handles the location/event checks read (peds for tank hits,
    // balls + their target zones for the soccer/football goals). All optional —
    // a check just fails safely if its handle is absent.
    this.world = world;
    this._mem = Object.create(null); // per-achievement scratch (dwell timers, sequences)
    this._elapsed = 0;               // seconds of active play, for timed checks
    this.earned = this._load(); // Set of earned ids

    // Running stats the checks read. Cumulative fields persist only in memory
    // for the session (they're for chasing goals, not a save-critical ledger).
    this.stats = {
      hasDriven: false,
      driveDist: 0,
      walkDist: 0,
      topSpeed: 0,
      distFromSpawn: 0,
      drivenTypes: new Set(),
    };
    this._spawn = null;      // captured on the first update
    this._wasInCar = false;  // edge-detect entering a car

    this._buildList();
    this._buildToast();
    this.refresh();
  }

  _load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return new Set(JSON.parse(raw));
    } catch {
      /* corrupt / unavailable — treat as none earned */
    }
    return new Set();
  }

  _save() {
    try {
      localStorage.setItem(KEY, JSON.stringify([...this.earned]));
    } catch {
      /* private-mode / quota — session progress still works */
    }
  }

  // ---- per-frame update ---------------------------------------------------
  update(dt, player) {
    const s = this.stats;
    this._elapsed += dt;
    if (!this._spawn) this._spawn = player.pos.clone();

    if (player.car) {
      s.hasDriven = true;
      const mph = Math.abs(player.driveSpeed) * MPS_TO_MPH;
      if (mph > s.topSpeed) s.topSpeed = mph;
      s.driveDist += Math.abs(player.driveSpeed) * dt;
      // record the type the moment we climb in
      if (!this._wasInCar) s.drivenTypes.add(player.car.type);
    } else {
      s.walkDist += Math.hypot(player.vel.x, player.vel.z) * dt;
    }
    this._wasInCar = !!player.car;

    s.distFromSpawn = Math.hypot(
      player.pos.x - this._spawn.x,
      player.pos.z - this._spawn.z,
    );

    // evaluate the remaining locked achievements. The context carries the live
    // world handles and, per achievement, a private `mem` scratch object + the
    // elapsed clock so stateful checks (dwell timers, base circuits) can persist.
    const ctx = {
      stats: s, player, coins: this.coins, unlocks: this.unlocks,
      dt, now: this._elapsed,
      peds: this.world.peds, balls: this.world.balls, zones: this.world.zones || [],
    };
    let changed = false;
    for (const a of ACHIEVEMENTS) {
      if (this.earned.has(a.id)) continue;
      ctx.mem = this._mem[a.id] || (this._mem[a.id] = {});
      let pass = false;
      try { pass = a.check(ctx); } catch { pass = false; }
      if (pass) { this._grant(a); changed = true; }
    }
    if (changed) this.refresh();
  }

  _grant(a) {
    this.earned.add(a.id);
    this._save();
    this.levels.add(a.xp); // grants XP (+ any level-up coin bonus & toast)
    this._toast(a);
  }

  // ---- pause-menu list ----------------------------------------------------
  _buildList() {
    const overlay = document.getElementById('overlay');
    const panel = document.createElement('div');
    panel.id = 'achievements';
    // Collapsed by default — the header toggles the list so pausing doesn't
    // dump every (including secret) achievement on screen at once.
    panel.innerHTML =
      `<h2><span class="ttl">ACHIEVEMENTS</span><span class="count"></span>` +
      `<span class="chev">▸</span></h2><div class="rows"></div>`;
    panel.querySelector('h2').addEventListener('click', () => panel.classList.toggle('open'));
    overlay.appendChild(panel);
    this.panel = panel;
    this.rowsEl = panel.querySelector('.rows');
    this.countEl = panel.querySelector('.count');
  }

  // Re-render the whole list (cheap — a handful of rows, only on pause/grant).
  refresh() {
    if (!this.rowsEl) return;
    const rows = ACHIEVEMENTS.map((a) => {
      const done = this.earned.has(a.id);
      // reveal rules apply only while still locked; earned shows everything.
      const showName = done || a.reveal !== 'hidden';
      const showDesc = done || a.reveal === 'visible';
      const name = showName ? a.name : '???';
      const desc = showDesc ? a.description : '???';
      const reward = done || a.reveal === 'visible' ? `+${a.xp}` : '+??';
      return `
        <div class="ach ${done ? 'done' : 'locked'}">
          <span class="mark">${done ? '✓' : '✗'}</span>
          <span class="body"><span class="name">${name}</span><span class="desc">${desc}</span></span>
          <span class="reward">${reward} <span class="xp">XP</span></span>
        </div>`;
    });
    this.rowsEl.innerHTML = rows.join('');
    this.countEl.textContent = `${this.earned.size}/${ACHIEVEMENTS.length}`;
  }

  // ---- toast --------------------------------------------------------------
  _buildToast() {
    const t = document.createElement('div');
    t.id = 'achToast';
    document.body.appendChild(t);
    this.toastEl = t;
  }

  _toast(a) {
    const t = this.toastEl;
    t.innerHTML = `
      <span class="badge">★</span>
      <span class="txt"><span class="hd">Achievement unlocked</span>
      <span class="nm">${a.name}</span></span>
      <span class="rw">+${a.xp} XP</span>`;
    t.classList.remove('show');
    void t.offsetWidth; // restart the animation
    t.classList.add('show');
  }
}
