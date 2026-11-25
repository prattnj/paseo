// Portfolio bulletin boards: framed notice boards on two posts, scattered
// through the civic plaza to show off work / education / projects / photos.
//
// Each board is a hand-placed prop with a single flat, textured face — either
// a TEXT panel (heading + body lines drawn onto a canvas) or an IMAGE panel (a
// picture loaded from /public, with a drawn placeholder until you supply one).
// The frame + posts funnel through the shared GeoBatch (`g`); only the picture
// face is a standalone textured quad added to the scene (GeoBatch can't texture,
// and mergeStatic leaves textured meshes alone, so the face survives the merge).
//
// ─────────────────────────────────────────────────────────────────────────────
//  HOW TO CUSTOMIZE  — edit the PLAZA_BOARDS array at the bottom of this file.
//  The plaza is centred at about (x = 115, z = -115) and the open courtyard runs
//  roughly x 30..200, z -200..-30. Each entry is:
//
//    { x, z, deg, kind, ... }
//
//    x, z  – world position (metres) of the board's centre. Move these freely.
//    deg   – the direction the board's FACE points, in degrees:
//                 0 → faces +Z      90 → faces +X
//               180 → faces -Z     270 → faces -X
//            (increasing deg swings the face a quarter-turn each 90°.) The
//            plaza centre is at (115,-115), so to make a board face the centre,
//            point its face back toward that point.
//    kind  – 'text', 'big', 'resume', 'project', or 'image'.
//            'project' is a clickable project card: a `title` ribbon on top, a
//            picture (`src`, same as IMAGE boards) in the middle and a 1–2
//            sentence `description` below. `url` is OPTIONAL: give one and the
//            ribbon shows a ↗ mark and the player can press E standing in front
//            of it to open the link in a new tab; omit it for a project with no
//            website and the card is display-only (no arrow, no E prompt) and
//            gets a small "email for access / more details" plaque hung
//            between its posts.
//            Optional `accent` recolours the ribbon. Default size 3.4 × 2.8.
//            'big' is a minimalist board: just large text centred on a solid
//            board (no title ribbon or border). Give it `lines` (one string per
//            line) or a single `title`; optional `bg`/`color` recolour it.
//            'resume' is a polished portfolio card (used for the NW job/education
//            billboards): a coloured accent spine + header band, a `title`, a
//            `company` + `date` sub-line, and bullet `lines`. Pass `center: true`
//            for a centred card with no bullets (e.g. a degree). `accent` sets the
//            spine/header colour (hex number or CSS string).
//    w, h  – panel size in metres: w = width, h = height (defaults 3.0 × 2.0).
//            Make them bigger for a prominent board, or set h > w for a portrait
//            board. The frame, posts, mounting height and canvas resolution all
//            scale to whatever w/h you pick.
//
//  TEXT boards also take:
//    title – the heading (one short line).
//    lines – an array of body strings, one per line (you control the breaks).
//
//  IMAGE boards also take:
//    src          – path to your picture under /public, e.g. '/portfolio/me.jpg'.
//                   Leave it null/omitted to show the drawn placeholder for now.
//    caption      – caption text over the image. OMIT (or '') for a captionless
//                   image. Works over real photos and the placeholder alike.
//    captionPos   – 'bottom' (default) or 'top'.
//    captionBg    – caption band colour: a hex number (0x3c4a63) or CSS string.
//    captionColor – caption text colour (hex number or CSS string).
//    captionAlpha – 0..1 band opacity (default 1); lower to let the photo show
//                   through the band.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { PALETTE as P, SIDEWALK_H } from '../../core/palette.js';
import { key } from '../../core/keycap.js';

const FRAME = 0x5b4636;      // dark stained-wood frame
const FRAME_LT = 0x6f573c;   // lighter wood for the top cap
const POST = P.concreteDark; // stone-grey posts to match the plaza

// ── canvas → texture helpers ────────────────────────────────────────────────
// Pick a canvas resolution matching the panel's aspect so text/photos aren't
// stretched. Long side is 512px.
function canvasFor(w, h) {
  const aspect = w / h;
  const CW = aspect >= 1 ? 512 : Math.round(512 * aspect);
  const CH = aspect >= 1 ? Math.round(512 / aspect) : 512;
  const c = document.createElement('canvas');
  c.width = CW; c.height = CH;
  return c;
}

function texFromCanvas(c) {
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A text notice: cream board, inset border, a coloured title ribbon, body lines.
function textTexture(spec) {
  const { w = 3, h = 2, title = 'NOTICE', lines = [] } = spec;
  const c = canvasFor(w, h), x = c.getContext('2d'), W = c.width, H = c.height;
  x.fillStyle = '#f4efe0'; x.fillRect(0, 0, W, H);                 // cream board
  x.strokeStyle = '#c8bfa6'; x.lineWidth = 6;                      // inset border
  x.strokeRect(10, 10, W - 20, H - 20);
  // title ribbon
  const ribH = Math.round(H * 0.2);
  x.fillStyle = '#3c4a63'; x.fillRect(18, 18, W - 36, ribH);
  x.fillStyle = '#f4efe0';
  x.font = `bold ${Math.round(ribH * 0.56)}px Georgia, serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(title, W / 2, 18 + ribH / 2);
  // body lines
  x.fillStyle = '#33383f'; x.textAlign = 'left';
  const fs = Math.round(H * 0.075), lh = fs * 1.5;
  x.font = `${fs}px Georgia, serif`;
  let ly = 18 + ribH + lh * 0.9;
  for (const line of lines) { x.fillText(line, 34, ly); ly += lh; }
  return texFromCanvas(c);
}

// A minimalist notice: just large text, centred both ways, no ribbon or border.
// Give it `lines` (one string per line) or a single `title`; `bg`/`color` recolour
// the board and text (hex number or CSS string, like the caption options).
function bigTextTexture(spec) {
  const { w = 3, h = 2 } = spec;
  const lines = spec.lines?.length ? spec.lines : [spec.title ?? 'NOTICE'];
  const c = canvasFor(w, h), x = c.getContext('2d'), W = c.width, H = c.height;
  x.fillStyle = toCss(spec.bg, 0xf4efe0); x.fillRect(0, 0, W, H);   // solid board
  x.fillStyle = toCss(spec.color, 0x33383f);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  // size the type to the number of lines so it stays large but fits the board
  const fs = Math.round(H / (lines.length + 1.2));
  const lh = fs * 1.15;
  x.font = `bold ${fs}px Georgia, serif`;
  let ly = H / 2 - (lines.length - 1) * lh / 2;
  for (const line of lines) { x.fillText(line, W / 2, ly); ly += lh; }
  return texFromCanvas(c);
}

// A polished "resume card" board: a cream card with a coloured accent spine and
// header, a job/degree title, an institution + date sub-line, and either bullet
// `lines` (a job) or centred `lines` (`center: true`, e.g. a degree). Rendered at
// higher resolution than the plain text board so the smaller print stays crisp on
// a large billboard. Knobs (all optional): `accent` (spine/header colour), `title`
// (big heading), `company` (sub-line left), `date` (sub-line right), `center`.
function resumeTexture(spec) {
  const { w = 5, h = 3.2 } = spec;
  // hi-res canvas (long side 1024) so multi-line body text reads cleanly up close
  const aspect = w / h;
  const CW = aspect >= 1 ? 1024 : Math.round(1024 * aspect);
  const CH = aspect >= 1 ? Math.round(1024 / aspect) : 1024;
  const c = document.createElement('canvas');
  c.width = CW; c.height = CH;
  const x = c.getContext('2d'), W = CW, H = CH;
  const accent = toCss(spec.accent, 0x3c4a63);
  const cream = '#f6f2e8', ink = '#2b2f36', sub = '#6b7078';
  // set a font that fits `text` within `maxW`, shrinking from `px` if needed
  const fitFont = (text, maxW, px, style) => {
    let s = px;
    do { x.font = `${style} ${s}px Georgia, serif`; s -= 2; }
    while (x.measureText(text).width > maxW && s > 8);
  };

  // card body + fine outer keyline
  x.fillStyle = cream; x.fillRect(0, 0, W, H);
  x.strokeStyle = '#cabf9f'; x.lineWidth = Math.round(H * 0.012);
  x.strokeRect(x.lineWidth, x.lineWidth, W - x.lineWidth * 2, H - x.lineWidth * 2);

  const pad = Math.round(W * 0.06);
  const spineW = Math.round(W * 0.022);
  x.fillStyle = accent; x.fillRect(0, 0, spineW, H);        // left accent spine

  if (spec.center) {
    // centred "diploma" layout: title, then centred body lines, no bullets
    const lines = spec.lines ?? [];
    x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    x.fillStyle = ink; fitFont(spec.title ?? '', W - pad * 2, Math.round(H * 0.16), 'bold');
    x.fillText(spec.title ?? '', W / 2, H * 0.28);
    // accent rule under the title
    x.strokeStyle = accent; x.lineWidth = Math.round(H * 0.01);
    x.beginPath(); x.moveTo(W * 0.3, H * 0.36); x.lineTo(W * 0.7, H * 0.36); x.stroke();
    const bfs = Math.round(H * 0.088), blh = bfs * 1.55;
    x.font = `${bfs}px Georgia, serif`; x.fillStyle = ink;
    let ly = H * 0.52;
    for (const line of lines) { x.fillText(line, W / 2, ly); ly += blh; }
    return texFromCanvas(c);
  }

  // job layout: header band with title, sub-line (company + date), bullet lines
  const bandH = Math.round(H * 0.24);
  x.fillStyle = accent; x.fillRect(spineW, 0, W - spineW, bandH);
  x.fillStyle = cream; x.textAlign = 'left'; x.textBaseline = 'middle';
  fitFont(spec.title ?? '', W - pad - spineW, Math.round(bandH * 0.5), 'bold');
  x.fillText(spec.title ?? '', pad, bandH * 0.52);

  // sub-line: company (left, accent) and date (right, grey). Draw the date
  // first so we know its width, then fit the company into the space left of it.
  const subY = bandH + Math.round(H * 0.11);
  x.textBaseline = 'alphabetic';
  let dateW = 0;
  if (spec.date) {
    x.font = `${Math.round(H * 0.062)}px Georgia, serif`;
    dateW = x.measureText(spec.date).width;
    x.textAlign = 'right'; x.fillStyle = sub;
    x.fillText(spec.date, W - pad, subY);
    x.textAlign = 'left';
  }
  x.fillStyle = accent;
  fitFont(spec.company ?? '', W - pad * 2 - (dateW ? dateW + pad : 0), Math.round(H * 0.075), 'italic bold');
  x.fillText(spec.company ?? '', pad, subY);
  // thin divider under the sub-line
  x.strokeStyle = '#d9cfb2'; x.lineWidth = Math.round(H * 0.006);
  x.beginPath(); x.moveTo(pad, subY + H * 0.05); x.lineTo(W - pad, subY + H * 0.05); x.stroke();

  // bullet body — each `line` is a full sentence that we word-wrap to the card
  // width (with a hanging indent under its bullet) and then auto-fit vertically
  // so every word shows and no rows overlap, however long the bullets are.
  const bullets = spec.lines ?? [];
  const top = subY + H * 0.06, bottom = H - pad * 0.7;
  // greedily wrap `text` to `maxW` at the current font, returning visual rows
  const wrap = (text, maxW) => {
    const words = text.split(' '), rows = [];
    let cur = '';
    for (const wd of words) {
      const test = cur ? cur + ' ' + wd : wd;
      if (x.measureText(test).width > maxW && cur) { rows.push(cur); cur = wd; }
      else cur = test;
    }
    if (cur) rows.push(cur);
    return rows;
  };
  // shrink the body font until every wrapped row (plus a blank gap between
  // bullets) fits in the space below the divider
  let bfs = Math.round(H * 0.07);
  let wrapped, blh, gap;
  while (bfs > 8) {
    x.font = `${bfs}px Georgia, serif`;
    const indent = bfs * 1.2, textW = W - (pad + indent) - pad;
    wrapped = bullets.map(t => wrap(t, textW));
    blh = bfs * 1.28; gap = bfs * 0.5;
    const rows = wrapped.reduce((n, r) => n + r.length, 0);
    const need = rows * blh + gap * Math.max(0, bullets.length - 1);
    if (top + need <= bottom) break;
    bfs -= 2;
  }
  const indent = bfs * 1.2;
  let ly = top + bfs;                                          // baseline of first row
  for (const rows of wrapped) {
    x.fillStyle = accent; x.fillText('•', pad, ly);            // accent bullet marker
    x.fillStyle = ink;
    for (const row of rows) { x.fillText(row, pad + indent, ly); ly += blh; }
    ly += gap;                                                 // gap between bullets
  }
  return texFromCanvas(c);
}

// Accept a colour as either a hex number (like the palette, 0xrrggbb) or a raw
// CSS string ('#fff', 'tomato', 'rgba(...)'), returning a CSS string.
function toCss(color, fallback) {
  const c = color ?? fallback;
  return typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : c;
}

// Draw the optional caption band onto an image canvas. Omit `caption` (or leave
// it empty) for a captionless image. `captionPos` puts the band on 'top' or
// 'bottom' (default). `captionBg` / `captionColor` recolour it; `captionAlpha`
// (0..1) lets the photo show through the band.
function drawCaption(x, W, H, spec) {
  const cap = spec.caption;
  if (!cap) return;
  const bandH = Math.round(H * 0.18);
  const y0 = spec.captionPos === 'top' ? 0 : H - bandH;
  x.globalAlpha = spec.captionAlpha ?? 1;
  x.fillStyle = toCss(spec.captionBg, 0x1e2228);
  x.fillRect(0, y0, W, bandH);
  x.globalAlpha = 1;
  x.fillStyle = toCss(spec.captionColor, 0xf4efe0);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `bold ${Math.round(bandH * 0.5)}px Georgia, serif`;
  x.fillText(cap, W / 2, y0 + bandH / 2);
}

// A little drawn landscape, used as the placeholder photo when no `src` is set.
function drawPlaceholder(x, W, H) {
  const sky = x.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#8fc7e8'); sky.addColorStop(1, '#dceef7');
  x.fillStyle = sky; x.fillRect(0, 0, W, H);
  x.fillStyle = '#f4c542';                                         // sun
  x.beginPath(); x.arc(W * 0.76, H * 0.26, Math.min(W, H) * 0.12, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#6d9e5a';                                         // hills
  x.beginPath(); x.moveTo(0, H); x.lineTo(0, H * 0.62);
  x.lineTo(W * 0.4, H * 0.34); x.lineTo(W * 0.72, H * 0.66);
  x.lineTo(W, H * 0.5); x.lineTo(W, H); x.closePath(); x.fill();
  x.fillStyle = '#4e7d42';
  x.beginPath(); x.moveTo(0, H); x.lineTo(0, H * 0.78);
  x.lineTo(W * 0.5, H * 0.58); x.lineTo(W, H * 0.82); x.lineTo(W, H); x.closePath(); x.fill();
}

// Cover-fit an image onto the canvas (fill it, cropping the overflow), so photos
// of any aspect fill the board without distortion.
// `contain` = fit the whole image inside instead (no cropping; leaves bands).
function drawCover(x, img, W, H, contain = false) {
  const s = (contain ? Math.min : Math.max)(W / img.width, H / img.height);
  const dw = img.width * s, dh = img.height * s;
  x.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

// Greedily word-wrap `text` to `maxW` pixels at the context's current font,
// returning the visual rows.
function wrapText(x, text, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean), rows = [];
  let cur = '';
  for (const wd of words) {
    const test = cur ? cur + ' ' + wd : wd;
    if (x.measureText(test).width > maxW && cur) { rows.push(cur); cur = wd; }
    else cur = test;
  }
  if (cur) rows.push(cur);
  return rows;
}

// A project board's face: a coloured title ribbon across the top, a picture
// (`src`, or the drawn placeholder) in the middle, and a 1–2 sentence
// `description` word-wrapped and auto-fitted underneath. A small ↗ in the ribbon
// hints that the board is a link (press E in front of it — see the project-link
// section below). Hi-res canvas like the resume card so the small print stays
// crisp. Knobs: `title`, `description`, `src`, `accent` (ribbon colour).
function projectTexture(spec) {
  const { w = 3.4, h = 2.8, src = null } = spec;
  const aspect = w / h;
  const c = document.createElement('canvas');
  c.width = aspect >= 1 ? 1024 : Math.round(1024 * aspect);
  c.height = aspect >= 1 ? Math.round(1024 / aspect) : 1024;
  const x = c.getContext('2d'), W = c.width, H = c.height;
  const tex = texFromCanvas(c);
  const accent = toCss(spec.accent, 0x3c4a63);
  const cream = '#f6f2e8', ink = '#2b2f36';
  const pad = Math.round(Math.min(W, H) * 0.04);

  // card + title ribbon
  x.fillStyle = cream; x.fillRect(0, 0, W, H);
  const ribH = Math.round(H * 0.16);
  x.fillStyle = accent; x.fillRect(0, 0, W, ribH);
  x.fillStyle = cream; x.textBaseline = 'middle';
  // The ↗ "opens a link" mark only appears on cards that actually have a url.
  let arrowW = 0;
  if (spec.url) {
    x.font = `bold ${Math.round(ribH * 0.5)}px Georgia, serif`;
    x.textAlign = 'right';
    x.fillText('↗', W - pad, ribH / 2);
    arrowW = x.measureText('↗').width + pad;
  }
  const title = spec.title ?? 'PROJECT';
  let fs = Math.round(ribH * 0.56);
  do { x.font = `bold ${fs}px Georgia, serif`; fs -= 2; }
  while (x.measureText(title).width > W - pad * 2 - arrowW * 2 && fs > 8);
  x.textAlign = 'center';
  x.fillText(title, W / 2, ribH / 2);

  // picture box
  const px = pad, py = ribH + pad, pw = W - pad * 2, ph = Math.round(H * 0.56);
  const paintPicture = (img) => {
    x.save();
    x.beginPath(); x.rect(px, py, pw, ph); x.clip();
    x.translate(px, py);
    if (img && spec.fit === 'contain') {
      x.fillStyle = cream; x.fillRect(0, 0, pw, ph);   // bands blend into the card
      drawCover(x, img, pw, ph, true);
    } else if (img) drawCover(x, img, pw, ph);
    else drawPlaceholder(x, pw, ph);
    x.restore();
  };
  if (src) {
    x.fillStyle = '#c8bfa6'; x.fillRect(px, py, pw, ph);           // neutral until loaded
    const img = new Image();
    img.onload = () => { paintPicture(img); tex.needsUpdate = true; };
    img.onerror = () => { x.fillStyle = '#b04a3c'; x.fillRect(px, py, pw, ph); tex.needsUpdate = true; };
    img.src = src;
  } else {
    paintPicture(null);
  }

  // description: wrap + shrink until it fits the space under the picture
  const top = py + ph + pad, bottom = H - pad;
  const desc = spec.description ?? '';
  let dfs = Math.round(H * 0.06), rows, lh;
  while (true) {
    x.font = `${dfs}px Georgia, serif`;
    rows = wrapText(x, desc, W - pad * 2);
    lh = dfs * 1.3;
    if (rows.length * lh <= bottom - top || dfs <= 10) break;
    dfs -= 2;
  }
  x.fillStyle = ink; x.textAlign = 'center'; x.textBaseline = 'middle';
  let ly = (top + bottom) / 2 - (rows.length - 1) * lh / 2;
  for (const row of rows) { x.fillText(row, W / 2, ly); ly += lh; }
  return tex;
}

// An image board's face: a real photo (`spec.src`) or the drawn placeholder,
// with the optional caption band composited on top. Real photos load async — we
// return the texture immediately and repaint + flag needsUpdate once it arrives
// (the always-on render loop then shows it).
function imageTexture(spec) {
  const { w = 3, h = 2, src = null } = spec;
  const c = canvasFor(w, h), x = c.getContext('2d'), W = c.width, H = c.height;
  const tex = texFromCanvas(c);
  if (src) {
    x.fillStyle = '#c8bfa6'; x.fillRect(0, 0, W, H);               // neutral until loaded
    const img = new Image();
    img.onload = () => { drawCover(x, img, W, H); drawCaption(x, W, H, spec); tex.needsUpdate = true; };
    img.onerror = () => { x.fillStyle = '#b04a3c'; x.fillRect(0, 0, W, H); drawCaption(x, W, H, spec); tex.needsUpdate = true; };
    img.src = src;
  } else {
    drawPlaceholder(x, W, H); drawCaption(x, W, H, spec);
  }
  return tex;
}

// ── picket / arrow signs ─────────────────────────────────────────────────────
// A directional arrow sign: a solid arrow-shaped board (a rectangle with one
// pointed end) standing on two posts, pointing 'left' or 'right' relative to a
// viewer facing the sign. The posts are centred under the rectangular body.
//
// The board is a real extruded slab (plain Lambert, so mergeStatic folds it into
// the static batches) and its back is left blank. The front carries a single
// transparent textured quad — the arrow silhouette with a white border and the
// one-line label — sitting just proud of the slab (textured, so the merge leaves
// it alone). The posts funnel through the GeoBatch.

const STAKE = 0x6f573c;   // wood posts
const SIGN_T = 0.1;       // board thickness (m)
const POST_R = 0.07;      // post radius (m)

// The arrow outline in sign-local metres, origin at the centre of the
// rectangular body (so the posts sit symmetrically about x = 0).
function arrowOutline(w, h, dir) {
  const tip = Math.min(h * 0.75, w * 0.3);        // depth of the pointed head
  const sx = dir === 'left' ? -1 : 1;
  const ox = sx * tip / 2;                        // shift so the body is centred
  const pts = [
    [-w / 2, h / 2], [w / 2 - tip, h / 2], [w / 2, 0],
    [w / 2 - tip, -h / 2], [-w / 2, -h / 2],
  ].map(([px, py]) => [sx * px + ox, py]);
  return { pts, tip, bodyW: w - tip, ox };
}

const signMats = new Map();
function signMat(hex) {
  let m = signMats.get(hex);
  if (!m) signMats.set(hex, m = new THREE.MeshLambertMaterial({ color: hex, flatShading: true }));
  return m;
}

// Draw the front face: arrow silhouette (transparent outside), a white border
// stroked inside the edge, and the label on ONE line, auto-sized to fill the
// body (plus a little way into the head) without overflowing.
function arrowTexture(spec, outline) {
  const { w, h } = spec;
  const text = String(spec.text ?? spec.lines?.join(' ') ?? spec.title ?? '').trim();
  // hi-res canvas (long side 2048) so the label stays crisp up close
  const aspect = w / h;
  const c = document.createElement('canvas');
  c.width = aspect >= 1 ? 2048 : Math.round(2048 * aspect);
  c.height = aspect >= 1 ? Math.round(2048 / aspect) : 2048;
  const x = c.getContext('2d'), W = c.width, H = c.height;
  // sign-local metres → canvas pixels (the quad spans the outline's bounds)
  const { pts, tip, ox } = outline;
  const toPx = ([lx, ly]) => [(lx - ox + w / 2) / w * W, (h / 2 - ly) / h * H];
  x.beginPath();
  pts.map(toPx).forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
  x.closePath();
  x.fillStyle = toCss(spec.bg, 0xc23b3b);         // bold red by default
  x.fill();
  // border kept fully inside the silhouette: clip, then stroke at double width
  const bw = Math.round(H * 0.06);
  x.save(); x.clip();
  x.lineWidth = bw * 2; x.strokeStyle = toCss(spec.border, 0xffffff); x.stroke();
  x.restore();
  // label box: the rectangular body plus a little way into the head
  const right = spec.dir !== 'left';
  const tipPx = tip / w * W, pad = bw + H * 0.07, headIn = tipPx * 0.3;
  const x0 = right ? pad : tipPx - headIn;
  const x1 = right ? W - tipPx + headIn : W - pad;
  const boxW = x1 - x0, boxH = H - 2 * pad;
  const CAP = 0.72;                               // Georgia bold cap height / em
  const font = px => `bold ${px}px Georgia, serif`;
  x.font = font(100);
  const m = x.measureText(text);
  const tw = Math.max(1, m.width);
  // Size = the tightest of three limits, so short labels don't balloon:
  //  · width  — the line fits the label box horizontally
  //  · cap    — cap height at most MAX_CAP of the board height (long labels are
  //             width-bound and never reach this; short ones stop here)
  //  · ink    — half the cap height plus the real descender (j, p, g, y…)
  //             fits between the centre line and the inner edge of the border
  const MAX_CAP = 0.4;
  const desc = Math.max(0, m.actualBoundingBoxDescent || 0) / 100;   // per em
  const fs = Math.floor(Math.min(
    100 * boxW / tw,
    H * MAX_CAP / CAP,
    (boxH / 2) / (CAP / 2 + desc),
  ));
  x.font = font(fs);
  x.fillStyle = toCss(spec.color, 0xffffff);
  x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  x.fillText(text, (x0 + x1) / 2, H / 2 + fs * CAP / 2);
  return texFromCanvas(c);
}

function picketSign(g, col, scene, raw) {
  const spec = { w: 4.2, h: 1.0, dir: 'right', ...raw };
  const { x, z, deg = 0, w, h } = spec;
  const ry = deg * Math.PI / 180;
  const c = Math.cos(ry), s = Math.sin(ry);
  // sign-local (lx, lz) → world, rotating about +Y by ry
  const wx = (lx, lz) => x + lx * c + lz * s;
  const wz = (lx, lz) => z - lx * s + lz * c;
  const y = SIDEWALK_H;
  const cy = spec.cy ?? (1.1 + h / 2);            // board centre height above ground
  const outline = arrowOutline(w, h, spec.dir);

  // two posts, centred under the rectangular body, rising to just below the top
  const postDX = outline.bodyW * 0.3;
  const postH = cy + h / 2 - 0.08;
  for (const dx of [-postDX, postDX]) {
    g.cyl(wx(dx, 0), y, wz(dx, 0), POST_R, POST_R * 1.2, postH, STAKE, 8);
  }

  // one solid collider spanning the whole sign (posts + board, ground to top),
  // so the player can't slip between the posts or under the board
  const zBack = -POST_R, zFront = POST_R + 0.005 + SIGN_T;
  const cz = (zBack + zFront) / 2;
  col.add(wx(outline.ox, cz), 0, wz(outline.ox, cz),
    w, y + cy + h / 2, (zFront - zBack) + 0.2, ry);

  // the solid board, mounted on the posts' front face
  const shape = new THREE.Shape(outline.pts.map(([px, py]) => new THREE.Vector2(px, py)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: SIGN_T, bevelEnabled: false });
  const back = POST_R + 0.005;
  geo.translate(0, 0, back);
  const board = new THREE.Mesh(geo, signMat(spec.bg ?? 0xc23b3b));
  board.position.set(x, y + cy, z);
  board.rotation.y = ry;
  board.castShadow = true;
  board.receiveShadow = true;
  scene.add(board);

  // the printed front face, just proud of the board
  const tex = arrowTexture(spec, outline);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5 });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  const fz = back + SIGN_T + 0.004;
  face.position.set(wx(outline.ox, fz), y + cy, wz(outline.ox, fz));
  face.rotation.y = ry;
  face.userData.noMerge = true;
  scene.add(face);
}

// Build every picket sign in `signs` (defaults to PLAZA_PICKETS).
export function buildPickets(g, col, scene, signs = PLAZA_PICKETS) {
  for (const spec of signs) picketSign(g, col, scene, spec);
}

// ── one board ───────────────────────────────────────────────────────────────
function bulletinBoard(g, col, scene, spec) {
  const { x, z, deg = 0, kind = 'text' } = spec;
  const { w = kind === 'project' ? 3.4 : 3, h = kind === 'project' ? 2.8 : 2 } = spec;
  const ry = deg * Math.PI / 180;
  const c = Math.cos(ry), s = Math.sin(ry);
  const y = SIDEWALK_H;              // top of the plaza paving
  const postH = 1.2;                // clear space under the board
  const frameT = 0.18;              // board thickness
  const bw = w + 0.4, bh = h + 0.4; // frame slightly larger than the picture
  const cy = y + postH + bh / 2;    // board centre height

  // two posts at the board's left/right edges (local x = ±postDX, running full
  // height so the board reads as a mounted panel)
  const postDX = bw / 2 - 0.25;
  for (const dx of [-postDX, postDX]) {
    const px = x + dx * c, pz = z - dx * s;
    g.cyl(px, y, pz, 0.1, 0.13, postH + bh, POST, 8);
  }
  // the board slab (physical backing — the picture face sits just proud of it)
  g.boxB(x, y + postH, z, bw, bh, frameT, FRAME, ry);
  // a small top cap for a finished look
  g.boxB(x, y + postH + bh, z, bw + 0.2, 0.16, frameT + 0.2, FRAME_LT, ry);

  // the textured face: a flat quad pushed just in front of the slab, along the
  // board's outward normal (sin ry, 0, cos ry)
  const tex = kind === 'image' ? imageTexture(spec)
    : kind === 'big' ? bigTextTexture(spec)
    : kind === 'resume' ? resumeTexture(spec)
    : kind === 'project' ? projectTexture({ ...spec, w, h })
    : textTexture(spec);
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  const d = frameT / 2 + 0.03;
  face.position.set(x + s * d, cy, z + c * d);
  face.rotation.y = ry;
  face.userData.noMerge = true;     // keep the textured quad out of mergeStatic
  scene.add(face);

  // block the player out of the board's footprint
  col.add(x, 0, z, bw, y + postH + bh, frameT + 0.4, ry);

  // a project board with a link becomes an E-to-open hotspot; one without a link
  // gets a small "email for access" plaque hung between its posts instead
  if (kind === 'project' && spec.url) {
    PROJECT_LINKS.push({ x, z, s, c, halfW: bw / 2, url: spec.url, title: spec.title ?? 'project' });
    installLinkKey();
  } else if (kind === 'project') {
    accessPlaque(g, scene, x, z, ry, y, postH, postDX, frameT);
  }
}

// ── "email for access" plaque ───────────────────────────────────────────────
// A small one-line sign under a url-less project card. It's a wooden rail
// spanning the two posts (so it reads as attached, not floating) with a printed
// face slightly smaller than the rail. It sits inside the board's existing
// collider footprint, so it needs no collider of its own.
const PLAQUE_TEXT = 'email for access / more details';
const PLAQUE_H = 0.3;     // rail height (m)

function plaqueTexture(w, h) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = Math.max(32, Math.round(1024 * h / w));
  const x = c.getContext('2d'), W = c.width, H = c.height;
  x.fillStyle = '#f4efe0'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#33383f'; x.textAlign = 'center'; x.textBaseline = 'middle';
  let fs = Math.round(H * 0.6);
  do { x.font = `italic ${fs}px Georgia, serif`; fs -= 2; }
  while (x.measureText(PLAQUE_TEXT).width > W * 0.92 && fs > 8);
  x.fillText(PLAQUE_TEXT, W / 2, H / 2);
  return texFromCanvas(c);
}

function accessPlaque(g, scene, x, z, ry, y, postH, postDX, frameT) {
  const s = Math.sin(ry), c = Math.cos(ry);
  const railW = postDX * 2, railT = frameT * 0.6;
  const base = y + postH * 0.45;                    // rail bottom, mid-way up the gap
  g.boxB(x, base, z, railW, PLAQUE_H, railT, FRAME, ry);

  const fw = railW - 0.3, fh = PLAQUE_H - 0.08;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh),
    new THREE.MeshBasicMaterial({ map: plaqueTexture(fw, fh) }));
  const d = railT / 2 + 0.01;
  face.position.set(x + s * d, base + PLAQUE_H / 2, z + c * d);
  face.rotation.y = ry;
  face.userData.noMerge = true;
  scene.add(face);
}

// Build every board in `boards` (defaults to PLAZA_BOARDS).
export function buildBulletins(g, col, scene, boards = PLAZA_BOARDS) {
  for (const spec of boards) bulletinBoard(g, col, scene, spec);
}

// ── project links (press E) ─────────────────────────────────────────────────
// Each 'project' board with a `url` registers a hotspot: standing in front of
// its face (within LINK_REACH metres, roughly within its width) offers
// "E open <title>" in the HUD, and pressing E opens the url in a new tab.
//
// The tab is opened straight from the keydown handler, NOT from the frame loop:
// browsers only allow window.open inside a real user-input event, so opening it
// from requestAnimationFrame would be popup-blocked. updateProjectLinks (run
// each active frame from main.js) just decides which board, if any, is targeted.
const LINK_REACH = 4.5;   // max distance in front of the board face (m)
const PROJECT_LINKS = [];
let linkTarget = null;    // the hotspot currently offered, or null
let linkPlayer = null;    // for clearing held keys after the tab steals focus
let linkKeyInstalled = false;

function installLinkKey() {
  if (linkKeyInstalled) return;
  linkKeyInstalled = true;
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyE' || e.repeat || !linkTarget || !document.pointerLockElement) return;
    window.open(linkTarget.url, '_blank', 'noopener');
    // The new tab takes focus, so keyups for keys held right now go to it and
    // never reach us — drop them so the player doesn't walk off on return.
    linkPlayer?.keys.clear();
    linkTarget = null;
  });
}

// Pick the targeted board for this frame. `blocked` = something else owns E
// right now (driving, a car/store prompt, a dialog), so offer nothing.
export function updateProjectLinks(player, blocked) {
  linkPlayer = player;
  linkTarget = null;
  if (blocked || !PROJECT_LINKS.length) return;
  const px = player.pos.x, pz = player.pos.z;
  let best = Infinity;
  for (const L of PROJECT_LINKS) {
    const dx = px - L.x, dz = pz - L.z;
    const along = dx * L.s + dz * L.c;          // distance out along the face normal
    const lateral = dx * L.c - dz * L.s;        // offset across the board's width
    if (along < 0.2 || along > LINK_REACH || Math.abs(lateral) > L.halfW + 0.8) continue;
    if (along < best) { best = along; linkTarget = L; }
  }
}

// HUD hint for the targeted board ('' when none) — read by main.js.
export function projectLinkHint() {
  return linkTarget ? `${key('E')} open ${linkTarget.title}` : '';
}

// ── the boards themselves — EDIT ME ─────────────────────────────────────────
// Dummy content for now; swap the titles/lines/images for your real portfolio.
// See the header comment for the coordinate + `deg` conventions. Plaza centre
// is ~(115, -115); these all face roughly toward it.
export const PLAZA_BOARDS = [
  // ── NW resume billboards ─────────────────────────────────────────────────
  // Three large 'resume' cards tucked into the north-west corner of the plaza,
  // arranged in a shallow arc, each angled to face the plaza centre (~112, -112)
  // so a visitor walking in sees them face-on. KNOBS per card: x/z (position —
  // smaller x + more-negative z moves further toward the NW corner), deg (facing:
  // 0=+Z, 90=+X…), w/h (billboard size), accent (spine/header colour). Body text
  // word-wraps and auto-fits, so full sentences are fine. The 'resume' fields:
  // title, company, date, lines[] (bullet sentences), or center:true for a
  // centred card with no bullets (used for Education).
  { x: 41, z: -150, deg: 40, w: 6.2, h: 4.0, kind: 'resume', accent: 0x2f6f8f,
    title: 'Full Stack Developer',
    company: 'DHI Computing Service, Inc.', date: '6/2024 – Current',
    lines: [
      'Utilized C# and .NET to develop a variety of products for employees and end users of banks and credit unions nationwide.',
      'Took lead on a large project to integrate our new mobile app with our existing core functionality via REST API and microservices.',
      'Worked in a fast-paced environment with experienced developers to meet deadlines from management and clients.',
      'Collaborated with third party integrations (MX, Plaid, Shazam) to improve end user experience',
    ] },
  { x: 49, z: -154, deg: 10, w: 6.2, h: 4.0, kind: 'resume', accent: 0x8a5a2b,
    title: 'Teaching Assistant / Course Developer',
    company: 'Brigham Young University Computer Science Department', date: '8/2022 – 6/2024',
    lines: [
      'Guided students in mastering object-oriented programming, offering debugging techniques and coding best practices.',
      'Worked with other TAs to develop automated grading software that reduced labor costs by about 200 hours, or ~$3,600, per semester.',
      'Taught essential server-client concepts, including WebSocket programming and network communication.',
    ] },
  { x: 58, z: -154, deg: -5, w: 5.4, h: 3.6, kind: 'resume', accent: 0x0b2e63,
    center: true, title: 'Brigham Young University',
    lines: [
      'BS in Computer Science, 3.93 GPA',
      'Graduated in June 2024',
      'Emphasis on Software Engineering',
    ] },

  // welcome
  { x: 51, z: -120, deg: 290, w: 3.5, h: 1.5, kind: 'big',
    lines: ['Welcome to', 'Nosh City'] },
  { x: 51, z: -110, deg: 250, w: 4.0, h: 0.7, kind: 'big',
    lines: ['explore my portfolio', '+ play an open-world game!'] },

  // NE corner — a photo board with the caption on TOP, in plaza blue
  { x: 155, z: -155, deg: 315, w: 3.0, h: 2.0, kind: 'image',
    caption: 'A HOBBY PHOTO', captionPos: 'top', captionBg: 0x3c4a63, captionColor: 0xf4efe0
    /* , src: '/portfolio/hobby1.jpg' */ },

  // SW corner — a captionless photo board (omit `caption` for no band)
  { x: 75, z: -75, deg: 135, w: 3.0, h: 2.0, kind: 'image'
    /* , src: '/portfolio/hobby2.jpg' */ },

  // ── project cards (PLACEHOLDERS — move + fill in) ────────────────────────
  // Press E in front of one to open its `url` in a new tab; `url` is optional —
  // leave it off for a project with no website. `src` is an image under /public
  // (omit for the drawn placeholder); `accent` is the ribbon. The picture box
  // is ~2:1 — pictures crop to fill it unless `fit: 'contain'`, which shows the
  // whole image with cream side bands (used for the narrower screenshots).
  { x: 39, z: -97, deg: 120, kind: 'project', accent: 0x5e26bf,
    title: 'Map Arcade',
    description: 'A collection of simple web-based geography games, each one more fun than the last.',
    url: 'https://maparcade.com', src: '/portfolio/maparcade.png', fit: 'contain' },
  { x: 39, z: -89, deg: 120, kind: 'project', accent: 0x3b3b3b,
    title: 'Teaspoon',
    description: 'A play on TSP (traveling salesman problem). Determines the fastest route to visit several places via Google Maps.',
    src: '/portfolio/teaspoon.png', fit: 'contain' },
  { x: 39, z: -81, deg: 120, kind: 'project', accent: 0x52463b,
    title: 'UesfUL',
    description: 'A gear-cataloging tool for backpacking trips to make sure your pack is as light as possible!',
    src: '/portfolio/useful.png' },
  { x: 39, z: -73, deg: 120, kind: 'project', accent: 0x964900,
    title: 'Song Sort',
    description: 'How many random songs can you correctly place in a timeline? Multiple game modes available.',
    url: 'https://songsort.noahpratt.com', src: '/portfolio/songsort.png', fit: 'contain' },
  { x: 39, z: -65, deg: 120, kind: 'project', accent: 0x476b07,
    title: 'AI Soundboard',
    description: 'Add AI-generated sounds (or upload your own) to a custom soundboard.',
    src: '/portfolio/racket.png' },
  { x: 39, z: -57, deg: 120, kind: 'project', accent: 0x052538,
    title: 'Bank',
    description: 'A web version of the classic dice game. Vibe-coded in about 5 minutes, it could use some work.',
    url: 'https://bank.noahpratt.com', src: '/portfolio/bank.png', fit: 'contain' },

  { x: 50, z: -97, deg: 240, kind: 'project', accent: 0x121f1c,
    title: 'Music Metrics',
    description: 'Online tool to see stats about your Spotify listening that go deeper than Spotify Wrapped.',
    url: 'https://musicmetrics.app', src: '/portfolio/musicmetrics.png' },
  { x: 50, z: -89, deg: 240, kind: 'project', accent: 0x8a5a2b,
    title: 'Breadcrumbs',
    description: 'Web UI to visualize location history and stats based on an export of Google Maps Timeline data.',
    src: '/portfolio/breadcrumbs.png' },
  { x: 50, z: -81, deg: 240, kind: 'project', accent: 0x5e2cc9,
    title: 'Context',
    description: 'Web tool to see stats about my texting habits. Who texted me the most? Who responds fastest?',
    src: '/portfolio/context.png' },
  { x: 50, z: -73, deg: 240, kind: 'project', accent: 0x092e10,
    title: 'High Points',
    description: 'Online tool for people like myself who want to track US states visited, along with their high points.',
    url: 'https://highpoints.noahpratt.com', src: '/portfolio/highpoints.png', fit: 'contain' },
  { x: 50, z: -65, deg: 240, kind: 'project', accent: 0x090e2e,
    title: 'Garmin Stats',
    description: 'What can I say, I love personal stats. This one visualizes data gathered by my Garmin Fenix.',
    src: '/portfolio/garmin.png', fit: 'contain' },
  { x: 50, z: -57, deg: 240, kind: 'project', accent: 0x857e28,
    title: 'Sift',
    description: 'Online budgeting tool that \'sifts\' account transactions from a .csv file into custom categories.',
    src: '/portfolio/sift.png' },
];

// ── picket / arrow signs — EDIT ME ──────────────────────────────────────────
// One entry per sign. Add, remove or move them freely:
//
//   { x, z, deg, dir, text }
//
//   x, z   – world position (metres) of the point midway between the two posts.
//   deg    – which way the sign's FACE points (0 = +Z, 90 = +X, 180 = -Z, 270 = -X).
//   dir    – 'left' | 'right': which way the arrowhead points, seen from the front.
//   text   – the label, one or two words. Always one line; it auto-sizes to
//            fill the arrow without overflowing.
//   Optional: w, h (board size in metres, default 4.2 × 1.0), bg / color / border
//   (hex number or CSS string), cy (board centre height above the ground).
export const PLAZA_PICKETS = [
  // point the way in toward the boards from the plaza entrance
  { x: 46, z: -123, deg: 300, dir: 'left', text: 'work experience', bg: 0x3c4a63 },
  { x: 46, z: -107, deg: 230, dir: 'right',  text: 'projects' },
  // in plaza blue
  //{ x: 130, z: -60, deg: 180, dir: 'right', text: 'PLAY THE GAME', bg: 0x3c4a63 },
];
