// levels.js — the player's XP + level meter (the RPG-style progression track).
//
// XP is *progression*, distinct from the coin *wallet* (coins.js): you earn XP
// by unlocking achievements, and each time your lifetime XP crosses a level
// threshold you level up — which pops a toast and pays out a coin bonus. That
// bonus is the game's ONLY coin income, so leveling feeds the vehicle paywall in
// unlocks.js. Like coins, lifetime XP is player state that must survive a reload
// (the world itself is deterministic and rebuilt every load), so it persists in
// localStorage.
//
// `this.xp` (lifetime XP earned) is the single source of truth; the current
// level and the progress toward the next are DERIVED from it via the escalating
// curve in economy.js (ECON.levels), so they can never drift. main.js builds one
// instance, hands it to Achievements (which calls add() on each unlock), and
// calls refresh() when the game pauses so the pause panel stays current. All
// XP/coin *amounts* live in economy.js.

import { ECON } from './economy.js';

const KEY = 'nosh.xp';

export class Levels {
  constructor(coins) {
    this.coins = coins;
    this.xp = this._load();

    // Top-right HUD pill: "Lv N" + a bar toward the next level. Built here so the
    // markup stays out of index.html's static shell (same pattern as coins.js).
    const el = document.createElement('div');
    el.id = 'level';
    el.innerHTML =
      `<span class="badge">Lv <span class="lv">1</span></span>` +
      `<span class="bar"><span class="fill"></span></span>`;
    this.el = el;
    this.lvEl = el.querySelector('.lv');
    this.fillEl = el.querySelector('.fill');

    // Wrap the level pill and the (already-built) coin pill into one top-right
    // cluster so they read as a single HUD group. coins.el is relocated out of
    // <body> into the wrapper, sitting to the right of the level pill.
    const wrap = document.createElement('div');
    wrap.id = 'hudTop';
    document.body.appendChild(wrap);
    wrap.appendChild(el);
    if (coins.el) wrap.appendChild(coins.el);

    this._buildPanel();
    this._buildToast();
    this.refresh();
  }

  _load() {
    const raw = localStorage.getItem(KEY);
    if (raw == null) return 0; // fresh save
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  _save() {
    try {
      localStorage.setItem(KEY, String(this.xp));
    } catch {
      // private-mode / quota — the in-memory total still works this session.
    }
  }

  // ---- curve math ---------------------------------------------------------
  // XP needed to advance FROM `level` to level+1 (escalating).
  _span(level) {
    const L = ECON.levels;
    return L.baseXP + L.stepXP * (level - 1);
  }

  // Coin bonus paid for REACHING `level` (level >= 2).
  _coinReward(level) {
    const L = ECON.levels;
    return L.coinBase + L.coinStep * (level - 2);
  }

  // Derive { level, into, span } from lifetime xp: the current level, how much
  // XP is banked into it, and how much that level spans.
  progress() {
    let level = 1;
    let remaining = this.xp;
    let span = this._span(level);
    while (remaining >= span) {
      remaining -= span;
      level += 1;
      span = this._span(level);
    }
    return { level, into: remaining, span };
  }

  /** Award XP. Pays a coin bonus + toasts for every level crossed. */
  add(n) {
    if (!(n > 0)) return;
    const before = this.progress().level;
    this.xp += Math.floor(n);
    this._save();
    const p = this.progress();
    this.refresh();

    // brief pop so the gain reads as a reward
    this.el.classList.remove('bump');
    void this.el.offsetWidth; // restart the CSS animation
    this.el.classList.add('bump');

    if (p.level > before) {
      let bonus = 0;
      for (let L = before + 1; L <= p.level; L++) bonus += Math.max(0, this._coinReward(L));
      if (bonus > 0) this.coins.add(bonus); // the wallet's only income
      this._toast(p.level, bonus);
    }
  }

  // ---- HUD pill + pause panel ---------------------------------------------
  refresh() {
    const p = this.progress();
    if (this.lvEl) this.lvEl.textContent = p.level;
    if (this.fillEl) this.fillEl.style.width = `${(100 * p.into / p.span).toFixed(1)}%`;
    this._renderPanel(p);
  }

  _buildPanel() {
    const overlay = document.getElementById('overlay');
    const panel = document.createElement('div');
    panel.id = 'lvlStats';
    panel.innerHTML =
      `<div class="lv"><span class="n">1</span><span class="k">LEVEL</span></div>` +
      `<div class="prog"><div class="bar"><div class="fill"></div></div>` +
      `<div class="xp">0 / 0 XP</div></div>` +
      `<div class="coins"><img src="/coin.svg" alt="coins" /><span class="n">0</span></div>`;
    overlay.appendChild(panel);
    this.panel = panel;
    this.pLv = panel.querySelector('.lv .n');
    this.pFill = panel.querySelector('.prog .fill');
    this.pXp = panel.querySelector('.xp');
    this.pCoins = panel.querySelector('.coins .n');
  }

  _renderPanel(p) {
    if (!this.panel) return;
    p = p || this.progress();
    this.pLv.textContent = p.level;
    this.pFill.style.width = `${(100 * p.into / p.span).toFixed(1)}%`;
    this.pXp.textContent =
      `${p.into.toLocaleString('en-US')} / ${p.span.toLocaleString('en-US')} XP`;
    this.pCoins.textContent = this.coins.balance.toLocaleString('en-US');
  }

  // ---- toast --------------------------------------------------------------
  _buildToast() {
    const t = document.createElement('div');
    t.id = 'lvlToast';
    document.body.appendChild(t);
    this.toastEl = t;
  }

  _toast(level, bonus) {
    const t = this.toastEl;
    t.innerHTML =
      `<span class="medal">Lv ${level}</span>` +
      `<span class="txt"><span class="hd">Level up</span>` +
      `<span class="nm">Reached Level ${level}</span></span>` +
      (bonus > 0 ? `<span class="rw">+${bonus} <img src="/coin.svg" alt="" /></span>` : '');
    t.classList.remove('show');
    void t.offsetWidth; // restart the animation
    t.classList.add('show');
  }
}
