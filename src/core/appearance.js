// appearance.js — the player's customizable look (shirt / pants / skin / hair)
//
// This is the single catalog the wardrobe menu and the player both read from, so
// the swatches you click and the character that actually gets built can never
// drift apart. A "look" is stored as small integer INDICES into the palettes
// below (not raw hex), so it's compact, forward-compatible, and trivially
// persisted in localStorage — the player's look is the one piece of avatar state
// that must survive a reload, just like coins/unlocks.
//
// The wardrobe cashier in Hansen's (see store.js) opens the menu; player.js
// rebuilds its humanoid from lookToHumanoid() whenever a swatch changes.
//
// Index 0 of every list is the game's original default character, so a fresh
// save (no stored look) looks exactly like it always did.

// Each entry is { name, hex }. Names are shown as tooltips in the wardrobe.
export const SHIRTS = [
  { name: 'Crimson', hex: 0xe04f43 },   // 0 — the original player shirt
  { name: 'Ocean', hex: 0x4a90d9 },
  { name: 'Teal', hex: 0x3aa7a3 },
  { name: 'Leaf', hex: 0x6faf4b },
  { name: 'Sun', hex: 0xf4c542 },
  { name: 'Tangerine', hex: 0xf39a3a },
  { name: 'Rose', hex: 0xe07f9a },
  { name: 'Grape', hex: 0x8e6bd6 },
  { name: 'Slate', hex: 0x51606b },
  { name: 'Ink', hex: 0x2b3038 },
  { name: 'Cloud', hex: 0xf2f4f5 },
  { name: 'Cocoa', hex: 0x6b4a2f },
];

export const PANTS = [
  { name: 'Charcoal', hex: 0x37474f },  // 0 — the original player pants
  { name: 'Denim', hex: 0x3b5b86 },
  { name: 'Khaki', hex: 0xb59a6a },
  { name: 'Olive', hex: 0x5f6a3a },
  { name: 'Sand', hex: 0xd9c39a },
  { name: 'Burgundy', hex: 0x7a2f3a },
  { name: 'Forest', hex: 0x2f5d3a },
  { name: 'Plum', hex: 0x4a3550 },
  { name: 'Black', hex: 0x1c2126 },
  { name: 'White', hex: 0xe9edf1 },
];

// A spread of skin tones from fair to deep.
export const SKINS = [
  { name: 'Fair', hex: 0xf0c8a0 },      // 0 — the original character skin
  { name: 'Light', hex: 0xf4d3b0 },
  { name: 'Peach', hex: 0xecb98a },
  { name: 'Tan', hex: 0xd9a273 },
  { name: 'Olive', hex: 0xc08a5a },
  { name: 'Bronze', hex: 0xa66a3c },
  { name: 'Umber', hex: 0x7f4a28 },
  { name: 'Ebony', hex: 0x5a331c },
];

export const HAIRS = [
  { name: 'Brown', hex: 0x5d4037 },     // 0 — the original character hair
  { name: 'Black', hex: 0x1a1a1a },
  { name: 'Chestnut', hex: 0x7a4a26 },
  { name: 'Auburn', hex: 0x8a3b1e },
  { name: 'Blond', hex: 0xd9b45a },
  { name: 'Sandy', hex: 0xc9a06a },
  { name: 'Grey', hex: 0x9aa1a9 },
  { name: 'Snow', hex: 0xe6e8ea },
  { name: 'Ginger', hex: 0xd06a2a },
  { name: 'Punk', hex: 0x4a90d9 },      // just for fun
];

// Hairstyles map to geometry variants built in character.js. `id` is what the
// humanoid builder switches on.
export const HAIR_STYLES = [
  { name: 'Short', id: 'short' },       // 0 — the original single hair box
  { name: 'Buzz', id: 'buzz' },
  { name: 'Flat Top', id: 'flattop' },
  { name: 'Afro', id: 'afro' },
  { name: 'Mohawk', id: 'mohawk' },
  { name: 'Ponytail', id: 'ponytail' },
  { name: 'Top Knot', id: 'bun' },
  { name: 'Long', id: 'long' },
  { name: 'Bald', id: 'bald' },
];

// A look is five indices. Index 0 across the board == the original character.
export const DEFAULT_LOOK = { shirt: 0, pants: 0, skin: 0, hair: 0, style: 0 };

// The five customizable fields, described once so the wardrobe UI can build
// every row from data instead of five near-identical hand-written blocks.
export const FIELDS = [
  { key: 'shirt', label: 'Shirt', list: SHIRTS, kind: 'color' },
  { key: 'pants', label: 'Pants', list: PANTS, kind: 'color' },
  { key: 'skin', label: 'Skin', list: SKINS, kind: 'color' },
  { key: 'style', label: 'Hairstyle', list: HAIR_STYLES, kind: 'style' },
  { key: 'hair', label: 'Hair color', list: HAIRS, kind: 'color' },
];

const KEY = 'nosh.look';

// Clamp every index into range so a stale/corrupt save (or a shrunk palette in a
// future build) can never index past the end of a list.
function sanitize(look) {
  const clamp = (v, n) => (Number.isInteger(v) && v >= 0 && v < n ? v : 0);
  return {
    shirt: clamp(look.shirt, SHIRTS.length),
    pants: clamp(look.pants, PANTS.length),
    skin: clamp(look.skin, SKINS.length),
    hair: clamp(look.hair, HAIRS.length),
    style: clamp(look.style, HAIR_STYLES.length),
  };
}

export function loadLook() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return sanitize({ ...DEFAULT_LOOK, ...JSON.parse(raw) });
  } catch {
    // corrupt / unavailable — fall back to the default character
  }
  return { ...DEFAULT_LOOK };
}

export function saveLook(look) {
  try {
    localStorage.setItem(KEY, JSON.stringify(sanitize(look)));
  } catch {
    // private-mode / quota — the in-memory look still applies this session.
  }
}

// Turn a look (indices) into the options object makeHumanoid() expects (hex +
// hairstyle id).
export function lookToHumanoid(look) {
  const l = sanitize(look);
  return {
    shirt: SHIRTS[l.shirt].hex,
    pants: PANTS[l.pants].hex,
    skin: SKINS[l.skin].hex,
    hair: HAIRS[l.hair].hex,
    hairStyle: HAIR_STYLES[l.style].id,
  };
}
