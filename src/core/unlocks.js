// unlocks.js — which special vehicles the player has bought the right to drive.
//
// The tank and the two Top Fuel dragsters are ordinary drivable "cars" in the
// traffic system (type 'tank' / 'dragster'); this module is the paywall in
// front of them. A type that has a price in ECON.unlockCost is locked until
// purchased; every other car type is free. Purchases are permanent and, like
// coins, persist in localStorage so the garage stays unlocked across reloads.
//
// The actual "press E → confirm → pay" flow lives in player.js (it owns car
// proximity + key input); this module just answers "is this type locked?",
// "what does it cost?", and performs the coin charge on purchase.

import { ECON } from './economy.js';

const KEY = 'nosh.unlocks';

export class Unlocks {
  constructor() {
    this.owned = this._load(); // Set of unlocked type strings
  }

  _load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return new Set(JSON.parse(raw));
    } catch {
      // corrupt / unavailable — start with nothing unlocked
    }
    return new Set();
  }

  _save() {
    try {
      localStorage.setItem(KEY, JSON.stringify([...this.owned]));
    } catch {
      // private-mode / quota — the in-memory set still works this session.
    }
  }

  /** Does this car type need to be bought before it can be driven? */
  isLocked(type) {
    return type in ECON.unlockCost && !this.owned.has(type);
  }

  isUnlocked(type) {
    return !this.isLocked(type);
  }

  /** Coin price of a type (0 if it was never a paid unlock). */
  cost(type) {
    return ECON.unlockCost[type] || 0;
  }

  /**
   * Attempt to buy the right to drive `type`, charging `coins`.
   * Returns true if it's now unlocked (either just purchased or already owned),
   * false if the player couldn't afford it.
   */
  purchase(type, coins) {
    if (!this.isLocked(type)) return true;
    if (!coins.spend(this.cost(type))) return false;
    this.owned.add(type);
    this._save();
    return true;
  }
}
