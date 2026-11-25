// coins.js — the player's coin wallet.
//
// A tiny persistence + HUD layer for the game's soft currency. Coins are the
// one piece of *player* state that must survive a reload (the world itself is
// deterministic and rebuilt from scratch every load), so they live in
// localStorage rather than in any of the world/actor modules.
//
// The balance is the single source of truth; every mutation funnels through
// add()/spend() so the number, the localStorage mirror, and the top-right HUD
// readout can never drift apart. main.js constructs one Coins instance and
// hands it to whatever wants to award or charge coins. All coin *amounts*
// (including the starting balance) live in economy.js.

import { ECON } from './economy.js';

const KEY = 'nosh.coins';

export class Coins {
  constructor() {
    this.balance = this._load();

    // Top-right indicator: the coin clipart + the running total. Built once
    // here so the HUD markup stays out of index.html's static shell.
    const el = document.createElement('div');
    el.id = 'coins';
    el.innerHTML = `<img src="/coin.svg" alt="coins" /><span class="num">0</span>`;
    document.body.appendChild(el);
    this.el = el;
    this.numEl = el.querySelector('.num');

    this._render();
  }

  _load() {
    const raw = localStorage.getItem(KEY);
    if (raw == null) return ECON.startingCoins; // fresh save
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : ECON.startingCoins;
  }

  _save() {
    try {
      localStorage.setItem(KEY, String(this.balance));
    } catch {
      // private-mode / quota — the in-memory balance still works this session.
    }
  }

  _render() {
    this.numEl.textContent = this.balance.toLocaleString('en-US');
  }

  /** Award coins. Returns the new balance. */
  add(n) {
    if (!(n > 0)) return this.balance;
    this.balance += Math.floor(n);
    this._save();
    this._render();
    // brief pop so a pickup reads as a reward
    this.el.classList.remove('bump');
    void this.el.offsetWidth; // restart the CSS animation
    this.el.classList.add('bump');
    return this.balance;
  }

  /** True if the player can afford `n`. */
  canAfford(n) {
    return this.balance >= n;
  }

  /** Charge coins if affordable. Returns true on success. */
  spend(n) {
    n = Math.floor(n);
    if (n <= 0 || this.balance < n) return false;
    this.balance -= n;
    this._save();
    this._render();
    return true;
  }
}
