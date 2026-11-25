// avatar-icons.js — small 2D stylized icons for the wardrobe's option tiles.
//
// Each customizable option shows a preview tile (see wardrobe.js): shirts/pants
// render as a garment silhouette filled with the option colour, while skin, hair
// colour and hairstyle render as a little head showing that trait. These are flat
// inline SVGs (viewBox 0 0 48 48) so they scale crisply and cost nothing — and
// the garment tiles are deliberately a single filled shape, so a future "shirt
// design" can drop in as a patterned fill / image with no layout change.

function css(hex) {
  return '#' + hex.toString(16).padStart(6, '0');
}
const svg = (inner) => `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;

// Neutral defaults so a tile can foreground the ONE trait it's previewing (a hair
// tile uses a neutral skin, a skin tile uses neutral hair, etc.).
const NEUTRAL_SKIN = 0xecc19b;
const NEUTRAL_HAIR = 0x4a3527;

function shirtSVG(hex) {
  const c = css(hex);
  // a classic tee silhouette: collar dip, shoulders, sleeves, body
  const d = 'M18 9 Q24 13 30 9 L38 12 L44 20 L38 26 L34 23 L34 41 L14 41 L14 23 L10 26 L4 20 L10 12 Z';
  return svg(`<path d="${d}" fill="${c}" stroke="rgba(0,0,0,0.28)" stroke-width="0.8"/>`);
}

function pantsSVG(hex) {
  const c = css(hex);
  const d = 'M15 7 H33 L35 42 H25 L24 24 L23 42 H13 Z';
  return svg(`<path d="${d}" fill="${c}" stroke="rgba(0,0,0,0.28)" stroke-width="0.8"/>`);
}

// A head (face + neck) with a per-style hair shape. `hairHex === null` → bald.
// Draw order: hair-behind, neck, face, hair-in-front — so top/side hair reads as
// a fringe around the face.
function headSVG(skinHex, hairHex, style) {
  const skin = css(skinHex);
  const hair = hairHex == null ? null : css(hairHex);
  let back = '', front = '';
  if (hair) {
    switch (style) {
      case 'bald':
        break;
      case 'buzz':
        front = `<path d="M13.5 22 Q13.5 10 24 9.5 Q34.5 10 34.5 22 Q34.5 15 24 14.5 Q13.5 15 13.5 22 Z" fill="${hair}"/>`;
        break;
      case 'flattop':
        back = `<rect x="12.5" y="6" width="23" height="11" rx="1.5" fill="${hair}"/>`;
        break;
      case 'afro':
        back = `<circle cx="24" cy="17" r="14.5" fill="${hair}"/>`;
        break;
      case 'mohawk':
        front = `<rect x="21.5" y="4" width="5" height="13" rx="2" fill="${hair}"/>`;
        break;
      case 'ponytail':
        back = `<ellipse cx="24" cy="18" rx="12" ry="13" fill="${hair}"/>` +
               `<path d="M34 19 q7 3 6 15 q-1 4 -4 2 q1 -9 -4 -14 Z" fill="${hair}"/>`;
        break;
      case 'bun':
        back = `<ellipse cx="24" cy="18" rx="12" ry="12.5" fill="${hair}"/>`;
        front = `<circle cx="24" cy="6.5" r="4" fill="${hair}"/>`;
        break;
      case 'long':
        back = `<path d="M11 20 Q11 7 24 7 Q37 7 37 20 L37 39 Q32.5 37 32.5 30 L32.5 23 Q24 19 15.5 23 L15.5 30 Q15.5 37 11 39 Z" fill="${hair}"/>`;
        break;
      case 'short':
      default:
        back = `<ellipse cx="24" cy="18.5" rx="12" ry="12.5" fill="${hair}"/>`;
        break;
    }
  }
  const neck = `<rect x="20" y="30" width="8" height="8" rx="1.5" fill="${skin}"/>`;
  const face = `<ellipse cx="24" cy="22" rx="10.5" ry="12.5" fill="${skin}"/>`;
  return svg(`${back}${neck}${face}${front}`);
}

// Dispatch: build the tile SVG for one option of a given field.
export function tileIcon(fieldKey, opt) {
  switch (fieldKey) {
    case 'shirt': return shirtSVG(opt.hex);
    case 'pants': return pantsSVG(opt.hex);
    case 'skin': return headSVG(opt.hex, NEUTRAL_HAIR, 'short');
    case 'hair': return headSVG(NEUTRAL_SKIN, opt.hex, 'short');
    case 'style': return headSVG(NEUTRAL_SKIN, NEUTRAL_HAIR, opt.id);
    default: return svg('');
  }
}
