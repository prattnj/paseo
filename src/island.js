// The city sits on an island. The coastline is a deterministic polar curve
// (single-valued radius per angle -> star-shaped, so the plateau top can be
// triangulated as a fan) traced EXACTLY from the reference silhouette
// (src/coast-data.js): a broad rounded mass with a big NE lobe, an east
// bulge, a north notch, west bumps and a long hook arm curling around a
// deep SSW inlet that bites into the street grid (the swallowed cells /
// road segments are removed in layout.js; the coastal parkway simply hugs
// the coast through the resulting green belts). A few tiny offshore islets
// match the picture too.
//
// Vertical profile, outside-in: water plane -> deep sea floor -> wading
// slope -> wide sloping sand beach (crosses the waterline) -> rocky scarp
// (steep riser / boulder tread / steep riser, no flat vertical faces) ->
// grass plateau (y~0, where the whole city lives). Boulders cover the
// scarp and occasional staircases bridge it down onto the sand.
import * as THREE from 'three';
import { mat } from './character.js';
import { hash, frac } from './util.js';
import { COAST, SAND } from './coast-data.js';

export const TOP_Y = -0.06;       // plateau surface (city ground level)
export const BEACH_Y = -6.06;     // sand surface at the cliff base
export const WATER_Y = -6.6;      // waterline crosses the sloping beach
export const SEAFLOOR_Y = -11.0;  // deep floor past the wading slope

const BEACH_OUT = -6.8;           // sand surface at the outer beach edge
const WADE_W = 45;                // width of the underwater slope past the sand

// walkable heights (feet level sits 0.06 above the visual surface)
const TOP_WALK = 0;

const N = 720; // coastline samples (matches COAST/SAND in coast-data.js)

// Decorative offshore islets (unreachable — the player drowns long before
// reaching one), positions/sizes traced from the reference picture: a green
// islet off the north notch, tiny ones west and south, and a bare sand bar
// near the hook mouth.
export const ISLETS = [
  { x: -94, z: -1003, r: 39 },
  { x: -1146, z: 492, r: 13.5 },
  { x: 196, z: 1037, r: 13.5 },
  { x: -711, z: 894, r: 15.6, sand: true },
];

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Precomputed lookup tables for the coast profile. R1 comes straight from
// the traced reference outline (coast-data.js, already floored so the coast
// never pinches the surviving city blocks). Outside-in per sample:
//   R1  plateau edge (grass, y=0)
//   RA  foot of the upper rock riser (start of the boulder tread)
//   RB  lip of the lower rock riser (end of the tread, height T1)
//   RC  foot of the lower riser = start of the sand beach (BEACH_Y)
//   R2  outer edge of the sand (BEACH_OUT), then the wading slope
// Both risers are steeper than 1.05 m/m so the player physics refuses to
// climb them (collision.js blockClimb) — stairs are the only way back up.
const R1 = new Float32Array(N);
const RA = new Float32Array(N);
const RB = new Float32Array(N);
const RC = new Float32Array(N);
const T1 = new Float32Array(N);
const R2 = new Float32Array(N);
// Coast obliquity per sample: where the coastline runs nearly radially
// (the inlet's west wall, cape flanks) a band that is W meters wide
// RADIALLY is only W/ob meters wide measured ACROSS the coast curve. All
// scarp bands scale by ob so their true width — and therefore the true
// riser slopes and rock coverage — stay constant along the whole coast.
const OB = new Float32Array(N);
{
  const dth = (2 * Math.PI) / N;
  for (let i = 0; i < N; i++) {
    const a = (i + N - 1) % N, b = (i + 1) % N;
    const dr = (COAST[b] - COAST[a]) / (2 * dth); // m per radian
    OB[i] = Math.min(6, Math.hypot(1, dr / COAST[i]));
  }
  // light smoothing so band widths don't jitter sample to sample
  for (let pass = 0; pass < 3; pass++) {
    const src = Float32Array.from(OB);
    for (let i = 0; i < N; i++) {
      const a = (i + N - 1) % N, b = (i + 1) % N;
      OB[i] = (src[a] + 2 * src[i] + src[b]) / 4;
    }
  }
}
for (let i = 0; i < N; i++) {
  R1[i] = COAST[i];
  T1[i] = -2.8 - frac(7101, i) * 0.7;
  RA[i] = R1[i] + (2.2 + frac(7102, i) * 0.4) * OB[i];
  RB[i] = RA[i] + (4.0 + frac(7103, i) * 2.0) * OB[i];
  RC[i] = RB[i] + (2.0 + frac(7104, i) * 0.4) * OB[i];
  // beach width follows the picture's sand band (wide spit along the hook);
  // the RC fallback also scales by obliquity so oblique stretches keep a
  // real (true-width) beach past the rocks
  R2[i] = Math.max(R1[i] + Math.min(Math.max(SAND[i] * 1.3 + 10, 42), 185), RC[i] + 20 * OB[i]);
}

function lookup(tab, th) {
  const f = ((th + Math.PI) / (2 * Math.PI)) * N;
  const i = Math.floor(f) % N;
  const j = (i + 1) % N;
  const t = f - Math.floor(f);
  return tab[i] * (1 - t) + tab[j] * t;
}

// Plateau edge radius at coast angle th — the grass ends and the scarp
// begins here. The coastal parkway (parkway.js) offsets inward from this.
export function plateauEdgeR(th) {
  return lookup(R1, th);
}

// Coast obliquity at angle th (>=1; see OB above). parkway.js scales its
// inland clearance by this so the road keeps a TRUE gap from the cliff edge
// even where the coastline runs nearly radially (the inlet's west wall).
export function coastObliquity(th) {
  return lookup(OB, th);
}

// Coast band tables for the HUD minimap: per-sample (th = -PI..PI, N samples)
// plateau edge, sand start and sand outer radii. Read-only.
export function coastBands() {
  return { N, R1, RC, R2 };
}

// ---- central-park hill ------------------------------------------------
// A big forested hill covering most of Central Park, slightly taller than
// the tallest downtown tower (~69m). The footprint is as wide as the park
// allows (2m off the SW lawn edges, clear of the pond in the NE corner) and
// the profile is near-linear with softened base/summit, keeping the max
// gradient ~1.0 m/m — just under the climb limit (1.05), so the flanks are
// walkable everywhere and the spiral staircase is the scenic option.
export const HILL = { x: -288, z: -168, r: 85, top: 8, h: 72.5 };

// near-linear profile: 1 at the summit plateau edge, 0 at the rim. A small
// smoothstep share rounds the summit shoulder and the base toe; more would
// push the midsection over the walkable-slope limit.
const HILL_BLEND = 0.14;
function hillProf(t) {
  if (t <= 0) return 1;
  if (t >= 1) return 0;
  return 1 - ((1 - HILL_BLEND) * t + HILL_BLEND * t * t * (3 - 2 * t));
}

// inverse of hillProf (monotonic) via bisection: f in (0,1) -> t
function hillProfInv(f) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (hillProf(mid) > f) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function hillHeight(x, z) {
  const dx = x - HILL.x, dz = z - HILL.z;
  if (dx < -HILL.r || dx > HILL.r || dz < -HILL.r || dz > HILL.r) return 0;
  const d = Math.hypot(dx, dz);
  if (d >= HILL.r) return 0;
  const t = Math.max((d - HILL.top) / (HILL.r - HILL.top), 0);
  return HILL.h * hillProf(t);
}

// Central-park pond bowl. Static so the island plateau fan can be carved
// under it at build time. MUST match buildPark in city.js, which imports
// these values (derived from the park-central block [-375,-145]x[-255,-9],
// inset 3: center cx+iw*0.3 / cz+id*0.28, rad = min(iw,id)*0.14).
export const POND = { x: -192.8, z: -64.8, a1: 31.36, a0: 35.36 };

function pondDepth(x, z) {
  const d = Math.max(Math.abs(x - POND.x), Math.abs(z - POND.z));
  if (d >= POND.a0) return 0;
  // slightly BELOW the shore/floor collider tops (-0.03 / -0.25) so the
  // player always stands on the boxes: box support is exempt from the
  // steep-terrain climb block, letting you wade back out over the rim
  return d < POND.a1 ? -0.35 : -0.1;
}

// Walkable ground height at (x, z): plateau, rocky scarp (riser / tread /
// riser), sloping beach, wading slope, or deep sea floor. Surfaces slope
// linearly between the radius bands and match the rendered mesh.
export function groundHeight(x, z) {
  const r = Math.hypot(x, z);
  if (r < 290) return TOP_WALK + hillHeight(x, z) + pondDepth(x, z); // fast path: min coast radius is ~308 (inlet head)
  const th = Math.atan2(z, x);
  const r1 = lookup(R1, th);
  if (r <= r1) return TOP_WALK;
  const t1 = lookup(T1, th) + 0.06;
  const ra = lookup(RA, th);
  if (r <= ra) {
    const t = (r - r1) / (ra - r1);
    return TOP_WALK + t * (t1 - TOP_WALK);
  }
  const rb = lookup(RB, th);
  if (r <= rb) return t1;
  const rc = lookup(RC, th);
  if (r <= rc) {
    const t = (r - rb) / (rc - rb);
    return t1 + t * ((BEACH_Y + 0.06) - t1);
  }
  const r2 = lookup(R2, th);
  if (r <= r2) {
    const t = (r - rc) / (r2 - rc);
    return (BEACH_Y + 0.06) + t * (BEACH_OUT - BEACH_Y);
  }
  if (r <= r2 + WADE_W) {
    const t = (r - r2) / WADE_W;
    return (BEACH_OUT + 0.06) + t * (SEAFLOOR_Y - BEACH_OUT);
  }
  return SEAFLOOR_Y + 0.06;
}

// Closest dry-sand spot to (x, z) — used to respawn a submerged player on
// the beach nearest where they went under. The waterline sits ~73% of the
// way down the sloping beach, so 35% out is comfortably dry.
export function nearestBeach(x, z) {
  const th = Math.atan2(z, x);
  const rc = lookup(RC, th);
  const r = rc + (lookup(R2, th) - rc) * 0.35;
  const bx = Math.cos(th) * r, bz = Math.sin(th) * r;
  return { x: bx, y: groundHeight(bx, bz), z: bz };
}

// True when (x, z) is on the grass plateau (safe respawn ground).
export function onLand(x, z) {
  const r = Math.hypot(x, z);
  if (r < 290) return true;
  return r <= lookup(R1, Math.atan2(z, x)) - 2;
}

// ---- geometry -------------------------------------------------------------
const COL_GRASS = new THREE.Color(0x6db24a);
// subtle per-patch variation for the plateau top (low-poly faceted lawn)
const COL_GRASSES = [
  new THREE.Color(0x6db24a),
  new THREE.Color(0x66a944),
  new THREE.Color(0x74b951),
  new THREE.Color(0x70b64e),
  new THREE.Color(0x69ae47),
];
const COL_ROCKS = [
  new THREE.Color(0x8a8377),
  new THREE.Color(0x99917f),
  new THREE.Color(0x776f60),
];
const COL_TREAD = new THREE.Color(0x8f887b);
const COL_SAND = new THREE.Color(0xd9cfb4);
const COL_SAND_WET = new THREE.Color(0xb8a98c);
const COL_DEEP = new THREE.Color(0x4a5a60);
const COL_WATER = new THREE.Color(0x4fb7e8);

// Staircases down the cliff: 14 spots spread around the traced coast,
// snapped to near-axis directions (so the axis-aligned steps hug the cliff).
const STAIR_THS = [
  -2.915, -2.609, -2.016, -Math.PI / 2, -1.126, -0.532, -0.227,
  0.227, 0.532, 1.126, Math.PI / 2, 2.016, 2.35, 2.915,
];
const STEP_RISE = 0.4;
const STEP_RUN = 0.62;
const STEP_COUNT = 16;
const STAIR_W = 4;

function stairAxis(th) {
  const c = Math.cos(th), s = Math.sin(th);
  return Math.abs(c) > Math.abs(s)
    ? [Math.sign(c), 0]
    : [0, Math.sign(s)];
}

function nearStair(th) {
  return STAIR_THS.some((s) => Math.abs(angDiff(th, s)) < 0.028);
}
export { nearStair };

const _stairGeo = new Map();
function stairBox(scene, colliders, cx, cz, sx, sy, sz, topY, color) {
  const k = sx + 'x' + sy + 'x' + sz;
  if (!_stairGeo.has(k)) _stairGeo.set(k, new THREE.BoxGeometry(sx, sy, sz));
  const m = new THREE.Mesh(_stairGeo.get(k), mat(color));
  m.position.set(cx, topY - sy / 2, cz);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  colliders.add(cx, topY - sy, cz, sx, sy, sz);
}

function buildStairs(scene, colliders) {
  for (const th of STAIR_THS) {
    const r1 = lookup(R1, th);
    const scarpW = lookup(RC, th) - r1; // rocky band the bridge must span
    const sx = Math.cos(th) * r1, sz = Math.sin(th) * r1;
    const [ux, uz] = stairAxis(th);
    const boxAt = (along, lat, alongSize, top, height) => {
      const cx = sx + ux * along, cz = sz + uz * along;
      const w = ux ? alongSize : STAIR_W + lat;
      const d = ux ? STAIR_W + lat : alongSize;
      stairBox(scene, colliders, cx, cz, w, height, d, top, 0xb5b0a6);
    };
    // landing + solid pier bridging the plateau edge and the rocky scarp;
    // at oblique coast angles the axis-aligned run crosses the scarp at a
    // slant, so stretch the pier by the obliquity factor
    const obliq = Math.max(Math.abs(ux * Math.cos(th) + uz * Math.sin(th)), 0.55);
    const bw = scarpW / obliq + 0.6;
    boxAt((bw - 2.5) / 2, 0.6, bw + 2.5, -0.02, 7.18);
    // steps down onto the sand past the rocks
    for (let k = 1; k <= STEP_COUNT; k++) {
      const top = -0.02 - STEP_RISE * k;
      boxAt(bw + STEP_RUN * (k - 1) + STEP_RUN / 2, 0, STEP_RUN + 0.03, top, top + 7.1);
    }
  }
}

// Sunbathers and beach umbrellas scattered over the dry sand: one merged
// vertex-colored mesh (a couple hundred boxes/cones), deterministic spots
// keyed off the coastline sample index. Bodies get a low step-over collider;
// umbrella poles get a thin solid one.
function buildBeachLife(scene, colliders) {
  const pos = [], col = [];
  const tri = (a, b, c, color) => {
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let k = 0; k < 3; k++) col.push(color.r, color.g, color.b);
  };
  // y-rotated box: center (x,y,z), size (w,h,d), rotation ry
  const box = (x, y, z, w, h, d, ry, color) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    const pt = (lx, ly, lz) => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const v = [
      pt(-hw, -hh, -hd), pt(hw, -hh, -hd), pt(hw, -hh, hd), pt(-hw, -hh, hd),
      pt(-hw, hh, -hd), pt(hw, hh, -hd), pt(hw, hh, hd), pt(-hw, hh, hd),
    ];
    const q = (a, b2, c2, d2) => { tri(v[a], v[b2], v[c2], color); tri(v[a], v[c2], v[d2], color); };
    q(4, 5, 6, 7); q(1, 0, 3, 2); q(0, 1, 5, 4); q(2, 3, 7, 6); q(1, 2, 6, 5); q(3, 0, 4, 7);
  };
  // umbrella canopy: 8-segment cone fan
  const cone = (x, y, z, r, h, color) => {
    for (let k = 0; k < 8; k++) {
      const a0 = (2 * Math.PI * k) / 8, a1 = (2 * Math.PI * (k + 1)) / 8;
      const p0 = [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r];
      const p1 = [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r];
      tri([x, y + h, z], p1, p0, color);
      tri([x, y, z], p0, p1, color); // underside
    }
  };
  const TOWELS = [0xe8654f, 0x4f9fe8, 0xf2c14e, 0x7bc47f, 0xe884c9, 0x6fd8d3].map((h) => new THREE.Color(h));
  const SHIRTS = [0xc0392b, 0x2980b9, 0x27ae60, 0x8e44ad, 0xd35400, 0x16a085].map((h) => new THREE.Color(h));
  const PANTS = [0x2c3e50, 0x5d4037, 0x34495e, 0x7f8c8d].map((h) => new THREE.Color(h));
  const SKIN = [0xe8b88a, 0xc68955, 0x8d5a2b, 0xf0cfa0].map((h) => new THREE.Color(h));
  const CANOPY = [0xe74c3c, 0xf39c12, 0x1abc9c, 0x3498db, 0xef7fb2].map((h) => new THREE.Color(h));
  const HAIR = new THREE.Color(0x4a3320);

  for (let i = 0; i < N; i += 4) {
    const hk = hash(9301, i);
    if (hk % 9 > 2) continue; // ~1 cluster per 12 degrees on average
    const th = -Math.PI + (2 * Math.PI * i) / N;
    if (STAIR_THS.some((s) => Math.abs(angDiff(th, s)) < 0.045)) continue;
    const rc = lookup(RC, th), r2 = lookup(R2, th);
    const dryW = (r2 - rc) * 0.6 - 3; // stay clear of the waterline & rocks
    if (dryW < 8) continue;
    const rMid = rc + 3 + frac(hk, 3) * dryW;
    const x = Math.cos(th) * rMid, z = Math.sin(th) * rMid;
    const y = groundHeight(x, z) - 0.06; // sand surface
    const ry = frac(hk, 4) * Math.PI * 2;
    const kind = hash(hk, 5) % 3; // 0 towel+person, 1 +umbrella, 2 umbrella only
    if (kind !== 2) {
      const towel = TOWELS[hash(hk, 6) % TOWELS.length];
      const shirt = SHIRTS[hash(hk, 7) % SHIRTS.length];
      const pants = PANTS[hash(hk, 8) % PANTS.length];
      const skin = SKIN[hash(hk, 9) % SKIN.length];
      box(x, y + 0.025, z, 2.0, 0.05, 1.0, ry, towel);
      const c = Math.cos(ry), s = Math.sin(ry);
      const at = (lx, ly, lz, w, h, d, color) =>
        box(x + lx * c + lz * s, y + ly, z - lx * s + lz * c, w, h, d, ry, color);
      at(0.05, 0.16, 0, 0.62, 0.22, 0.46, shirt);      // torso
      at(0.72, 0.14, 0, 0.30, 0.18, 0.30, skin);       // head
      at(0.82, 0.26, 0, 0.16, 0.08, 0.32, HAIR);       // hair
      at(-0.62, 0.12, 0, 0.72, 0.14, 0.40, pants);     // legs
      at(-1.06, 0.10, 0.12, 0.18, 0.10, 0.14, skin);   // feet
      at(-1.06, 0.10, -0.12, 0.18, 0.10, 0.14, skin);
      at(0.1, 0.12, 0.32, 0.5, 0.12, 0.14, skin);      // arms out on the towel
      at(0.1, 0.12, -0.32, 0.5, 0.12, 0.14, skin);
      // low collider: step over/onto the towel like a curb
      colliders.add(x, y, z, 2.0, 0.3, 1.0, ry);
    }
    if (kind !== 0) {
      const off = kind === 1 ? 1.5 : 0;
      const ux = Math.cos(ry + Math.PI / 2), uz = -Math.sin(ry + Math.PI / 2);
      const px = x + ux * off, pz = z + uz * off;
      const py = groundHeight(px, pz) - 0.06;
      const canopy = CANOPY[hash(hk, 10) % CANOPY.length];
      box(px, py + 0.85, pz, 0.07, 1.7, 0.07, 0, new THREE.Color(0xdad4c8));
      cone(px, py + 1.45, pz, 1.25, 0.55, canopy);
      colliders.add(px, py, pz, 0.14, 1.7, 0.14);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.name = 'beachLife';
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
}

// Low-poly boulders covering the scarp: bands on the tread shelf and at the
// base on the sand (with colliders), plus rocks embedded in both riser faces
// (visual only — the faces themselves already refuse the player, and giving
// face rocks colliders would hand out stepping stones back up the scarp).
// Collider tops stay within jump reach of the local ground for the same
// reason. All boulders share one InstancedMesh so draw calls stay flat.
function buildRocks(scene, colliders) {
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const cols = [
    new THREE.Color(0x8a8377),
    new THREE.Color(0x9a938a),
    new THREE.Color(0x757064),
  ];
  const items = [];
  // rBand(th): the band radius evaluated at the rock's ACTUAL angle. Using
  // the sample-i radius with a staggered angle strands rocks up to ~100m off
  // the scarp where the coast radius changes steeply (inlet mouth, capes) —
  // some used to land on the parkway asphalt.
  const drop = (i, seed0, rBand, sMax, opts = {}) => {
    const seed = seed0 + (opts.sub || 0) * 131; // distinct stream per repeat
    const h = hash(seed, i);
    const f = (k) => frac(hash(seed, i, k), 5); // nested: plain c-variants correlate
    const th = -Math.PI + (2 * Math.PI * (i + f(6))) / N; // stagger off the sample columns
    if (nearStair(th)) return;
    const r = rBand(th);
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    const s = 0.9 + f(1) * sMax;
    const sy = s * (0.6 + f(2) * 0.5);
    const gy = groundHeight(x, z) - 0.06;
    // sink tall rocks so no more than ~1.7m sticks out of the ground
    const y = opts.embed ? gy - sy * 0.1 : gy + Math.min(sy * 0.55, 1.7 - sy);
    items.push({
      x, y, z, sy,
      sx: s, sz: s * (0.8 + f(3) * 0.5),
      ry: f(4) * Math.PI, ci: h % 3,
    });
    if (!opts.embed) {
      colliders.add(x, gy, z, s * 1.5, Math.min(sy * 1.35, 1.05), (s * (0.8 + f(3) * 0.5)) * 1.5);
    }
  };
  for (let i = 0; i < N; i += 1) {
    // oblique stretches cover several true meters of coast per sample —
    // repeat each drop so rock density per meter of shoreline stays even
    const rep = Math.max(1, Math.min(6, Math.round(OB[i])));
    for (let sub = 0; sub < rep; sub++) {
      // tread shelf band
      if (hash(9001 + sub * 131, i) % 6 !== 0) {
        const t = 0.2 + frac(9007 + sub * 131, i) * 0.6;
        drop(i, 9010, (th) => lookup(RA, th) + (lookup(RB, th) - lookup(RA, th)) * t, 1.3, { sub });
      }
      // base-of-scarp band on the sand
      if (hash(9002 + sub * 131, i) % 3 !== 0) {
        drop(i, 9020, (th) => lookup(RC, th) + 0.8 + frac(9008 + sub * 131, i) * 2.6, 1.5, { sub });
      }
      // rocks jutting out of the upper riser face — two staggered rows per
      // column so the cliff reads as boulders, not bare rock
      if (hash(9003 + sub * 131, i) % 6 !== 0) {
        const t = 0.12 + frac(9009 + sub * 131, i) * 0.35;
        drop(i, 9030, (th) => lookup(R1, th) + (lookup(RA, th) - lookup(R1, th)) * t, 1.7, { embed: true, sub });
      }
      if (hash(9005 + sub * 131, i) % 6 !== 0) {
        const t = 0.55 + frac(9012 + sub * 131, i) * 0.38;
        drop(i, 9050, (th) => lookup(R1, th) + (lookup(RA, th) - lookup(R1, th)) * t, 1.7, { embed: true, sub });
      }
      // rocks jutting out of the lower riser face (two rows)
      if (hash(9004 + sub * 131, i) % 6 !== 0) {
        const t = 0.12 + frac(9011 + sub * 131, i) * 0.35;
        drop(i, 9040, (th) => lookup(RB, th) + (lookup(RC, th) - lookup(RB, th)) * t, 1.7, { embed: true, sub });
      }
      if (hash(9006 + sub * 131, i) % 6 !== 0) {
        const t = 0.55 + frac(9013 + sub * 131, i) * 0.38;
        drop(i, 9060, (th) => lookup(RB, th) + (lookup(RC, th) - lookup(RB, th)) * t, 1.7, { embed: true, sub });
      }
    }
  }
  const mesh = new THREE.InstancedMesh(
    geo,
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    items.length
  );
  const m4 = new THREE.Matrix4();
  const p = new THREE.Vector3(), sc = new THREE.Vector3();
  const q = new THREE.Quaternion(), e = new THREE.Euler();
  items.forEach((it, k) => {
    e.set(0, it.ry, 0);
    q.setFromEuler(e);
    p.set(it.x, it.y, it.z);
    sc.set(it.sx, it.sy, it.sz);
    m4.compose(p, q, sc);
    mesh.setMatrixAt(k, m4);
    mesh.setColorAt(k, cols[it.ci]);
  });
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
}

// The central-park hill: faceted grass cone, a spiral staircase winding all
// the way around it, and a gazebo on the flat summit dome.
function buildHill(scene, colliders) {
  const SEG = 44;
  const pos = [], col = [];
  const tri = (a, b, c, color) => {
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let k = 0; k < 3; k++) col.push(color.r, color.g, color.b);
  };
  const quad = (a, b, c, d, color) => { tri(a, b, c, color); tri(a, c, d, color); };
  const rings = [0, 0.07, 0.15, 0.24, 0.34, 0.44, 0.54, 0.64, 0.73, 0.82, 0.9, 0.96, 1];
  const pt = (s, t) => {
    const a = (2 * Math.PI * s) / SEG;
    const r = HILL.top + t * (HILL.r - HILL.top);
    return [
      HILL.x + Math.cos(a) * r,
      TOP_Y + HILL.h * hillProf(t),
      HILL.z + Math.sin(a) * r,
    ];
  };
  for (let s = 0; s < SEG; s++) {
    const s2 = s + 1;
    const shade = (k) => COL_GRASSES[hash(8801 + k, ((s + k * 29) >> 1)) % COL_GRASSES.length];
    tri([HILL.x, TOP_Y + HILL.h, HILL.z], pt(s2, 0), pt(s, 0), shade(0));
    for (let k = 0; k < rings.length - 1; k++) {
      quad(pt(s, rings[k]), pt(s2, rings[k]), pt(s2, rings[k + 1]), pt(s, rings[k + 1]), shade(k + 1));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);

  // spiral staircase: steps root into the flank (tall boxes) and wind
  // counterclockwise from the base entry (facing the park center) to the top
  const RISE = 0.34, RUN = 1.0;
  const surfR = (h) =>
    HILL.top + hillProfInv(Math.min(Math.max(h / HILL.h, 0), 1)) * (HILL.r - HILL.top);
  const steps = [];
  let phi = Math.atan2(-245 - HILL.z, -350 - HILL.x); // enter from the SW lawn corner (clear of the pond)
  for (let k = 0; ; k++) {
    const top = 0.17 + (k + 1) * RISE;
    const r = surfR(top) + 0.5;
    steps.push({
      x: HILL.x + Math.cos(phi) * r,
      z: HILL.z + Math.sin(phi) * r,
      top,
      ry: -phi - Math.PI / 2, // local +x tangential (OBB convention)
    });
    if (top >= HILL.h - 0.05) break;
    phi += RUN / Math.max(r, 6);
  }
  const SW = 2.4, SD = 1.7, SH = 4.5; // radial width, tangential depth, root depth
  const stepMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(SD, SH, SW),
    new THREE.MeshLambertMaterial({ color: 0xb5b0a6 }),
    steps.length
  );
  const m4 = new THREE.Matrix4();
  const v3 = new THREE.Vector3(), sc1 = new THREE.Vector3(1, 1, 1);
  const qt = new THREE.Quaternion(), eu = new THREE.Euler();
  steps.forEach((s, k) => {
    eu.set(0, s.ry, 0);
    qt.setFromEuler(eu);
    v3.set(s.x, s.top - SH / 2, s.z);
    m4.compose(v3, qt, sc1);
    stepMesh.setMatrixAt(k, m4);
    colliders.add(s.x, s.top - SH, s.z, SD, SH, SW, s.ry);
  });
  stepMesh.castShadow = stepMesh.receiveShadow = true;
  scene.add(stepMesh);

  // forest: hash-scattered trees all over the flanks (clear of the stairs),
  // sitting on the hill surface — trunks + ico or cone canopies, instanced
  {
    const LEAFS = [0x4e9b47, 0x3e7d3a, 0x67ab3f];
    const icoT = [], coneT = [];
    for (let k = 0; k < 130; k++) {
      const a = frac(hash(9301, k, 1), 5) * Math.PI * 2;
      const t = 0.12 + Math.sqrt(frac(hash(9301, k, 2), 9)) * 0.85;
      const r = HILL.top + t * (HILL.r - HILL.top);
      const x = HILL.x + Math.cos(a) * r;
      const z = HILL.z + Math.sin(a) * r;
      if (steps.some((s) => Math.hypot(x - s.x, z - s.z) < 3.4)) continue;
      const gy = TOP_Y + HILL.h * hillProf(t);
      const s = 0.85 + frac(9301, k, 3) * 0.8;
      const kind = hash(9301, k, 4) % 3;
      (kind === 1 ? coneT : icoT).push({ x, z, gy, s, c: LEAFS[kind] });
      colliders.add(x, gy, z, 0.7, 2.2 * s, 0.7);
    }
    const m4t = new THREE.Matrix4();
    const v3t = new THREE.Vector3(), sct = new THREE.Vector3();
    const qId = new THREE.Quaternion();
    const build = (list, geoC, yOf) => {
      if (!list.length) return;
      const trunk = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.22, 0.3, 1.7, 6), mat(0x8d6e63), list.length);
      const can = new THREE.InstancedMesh(geoC, new THREE.MeshLambertMaterial(), list.length);
      list.forEach((tr, i) => {
        sct.set(tr.s, tr.s, tr.s);
        v3t.set(tr.x, tr.gy + 0.85 * tr.s, tr.z);
        m4t.compose(v3t, qId, sct);
        trunk.setMatrixAt(i, m4t);
        v3t.set(tr.x, tr.gy + yOf * tr.s, tr.z);
        m4t.compose(v3t, qId, sct);
        can.setMatrixAt(i, m4t);
        can.setColorAt(i, new THREE.Color(tr.c));
      });
      trunk.castShadow = trunk.receiveShadow = true;
      can.castShadow = can.receiveShadow = true;
      scene.add(trunk, can);
    };
    build(icoT, new THREE.IcosahedronGeometry(1.6, 0), 2.9);
    build(coneT, new THREE.ConeGeometry(1.5, 3.6, 7), 3.1);
  }

  // gazebo on the summit: square deck, corner posts, red pyramid roof
  const deckTop = HILL.h + 0.35;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(8, 0.4, 8), mat(0xd8d3c8));
  deck.position.set(HILL.x, deckTop - 0.2, HILL.z);
  deck.castShadow = deck.receiveShadow = true;
  scene.add(deck);
  colliders.add(HILL.x, deckTop - 0.4, HILL.z, 8, 0.4, 8);
  for (const px of [-3.4, 3.4]) {
    for (const pz of [-3.4, 3.4]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.32, 2.7, 0.32), mat(0xf4f1e8));
      post.position.set(HILL.x + px, deckTop + 1.35, HILL.z + pz);
      post.castShadow = post.receiveShadow = true;
      scene.add(post);
      colliders.add(HILL.x + px, deckTop, HILL.z + pz, 0.32, 2.7, 0.32);
    }
  }
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(6.4, 2.6, 4, 1, false, Math.PI / 4),
    mat(0xc84b3c)
  );
  roof.position.set(HILL.x, deckTop + 2.7 + 1.3, HILL.z);
  roof.castShadow = roof.receiveShadow = true;
  scene.add(roof);
  colliders.add(HILL.x, deckTop + 2.7, HILL.z, 8.4, 1.2, 8.4);
}

// Offshore islets: each is a low-poly mound rising from the seafloor —
// underwater sand skirt, dry sand ring, faceted grass dome, a few rocks and
// tiny trees on the bigger ones. Purely scenic; no colliders.
function buildIslets(scene) {
  const pos = [];
  const col = [];
  const tri = (a, b, c, color) => {
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let k = 0; k < 3; k++) col.push(color.r, color.g, color.b);
  };
  const quad = (a, b, c, d, color) => { tri(a, b, c, color); tri(a, c, d, color); };

  ISLETS.forEach((s, si) => {
    const M = 12;
    const wob = [];
    for (let m = 0; m < M; m++) wob.push(0.78 + 0.44 * frac(hash(9200, si), m, 1));
    const P = (m, rm, y) => {
      const a = (2 * Math.PI * m) / M;
      const w = wob[m % M];
      return [s.x + Math.cos(a) * s.r * rm * w, y, s.z + Math.sin(a) * s.r * rm * w];
    };
    const top = WATER_Y + 0.9 + s.r * 0.05;
    const grassEdge = WATER_Y + 0.55;
    const sandEdge = WATER_Y + 0.22;
    // bare sand-bar islets have no grass dome — the whole top is dry sand
    const grass = s.sand ? COL_SAND : COL_GRASSES[hash(9301, si) % COL_GRASSES.length];
    for (let m = 0; m < M; m++) {
      const n = (m + 1) % M;
      tri([s.x, top, s.z], P(n, 0.55, grassEdge), P(m, 0.55, grassEdge), grass);
      quad(P(m, 0.55, grassEdge), P(n, 0.55, grassEdge), P(n, 0.9, sandEdge), P(m, 0.9, sandEdge), COL_SAND);
      quad(P(m, 0.9, sandEdge), P(n, 0.9, sandEdge), P(n, 1.6, SEAFLOOR_Y + 0.2), P(m, 1.6, SEAFLOOR_Y + 0.2), COL_SAND_WET);
    }
    // rocks on the sand ring
    const nR = 1 + (hash(9410, si) % 2);
    for (let k = 0; k < nR; k++) {
      const a = frac(hash(9420, si), k, 1) * Math.PI * 2;
      const rr = 0.6 + frac(hash(9421, si), k, 2) * 0.8;
      const rock = new THREE.Mesh(
        new THREE.IcosahedronGeometry(rr, 0),
        mat(COL_ROCKS[hash(9422 + si, k) % 3].getHex())
      );
      rock.position.set(
        s.x + Math.cos(a) * s.r * 0.72, WATER_Y + 0.25,
        s.z + Math.sin(a) * s.r * 0.72
      );
      rock.receiveShadow = true;
      scene.add(rock);
    }
    // tiny trees on the grass dome (bigger green islets only)
    if (s.r >= 16 && !s.sand) {
      const nT = 2 + (hash(9430, si) % 2);
      for (let k = 0; k < nT; k++) {
        const a = frac(hash(9440, si), k, 1) * Math.PI * 2;
        const t = 0.15 + frac(hash(9441, si), k, 2) * 0.5; // fraction of the grass radius
        const x = s.x + Math.cos(a) * s.r * 0.55 * t;
        const z = s.z + Math.sin(a) * s.r * 0.55 * t;
        const gy = top + (grassEdge - top) * t;
        const h = 2.4 + frac(hash(9442, si), k, 3) * 1.4;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.1, 5), mat(0x8d6e63));
        trunk.position.set(x, gy + 0.55, z);
        const can = new THREE.Mesh(new THREE.ConeGeometry(h * 0.42, h, 6), mat(0x4e8f4a));
        can.position.set(x, gy + 1.0 + h / 2, z);
        trunk.castShadow = can.castShadow = true;
        scene.add(trunk, can);
      }
    }
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.receiveShadow = true;
  scene.add(mesh);
}

export function buildIsland(scene, colliders) {
  const pos = [];
  const col = [];
  const tri = (a, b, c, color) => {
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let k = 0; k < 3; k++) col.push(color.r, color.g, color.b);
  };
  const quad = (a, b, c, d, color) => { tri(a, b, c, color); tri(a, c, d, color); };

  const pt = (i, r, y) => {
    const th = -Math.PI + (2 * Math.PI * i) / N;
    return [Math.cos(th) * r, y, Math.sin(th) * r];
  };

  // radial interval where sample ray i passes through the pond carve square
  // (slightly expanded; the leftover jagged rim hides under the shore boxes)
  const PH = POND.a1 + 0.6;
  const pondRay = (idx) => {
    const th = -Math.PI + (2 * Math.PI * idx) / N;
    let lo = 0, hi = Infinity;
    for (const [comp, pc] of [[Math.cos(th), POND.x], [Math.sin(th), POND.z]]) {
      if (Math.abs(comp) < 1e-9) { if (Math.abs(pc) > PH) return null; continue; }
      const r1 = (pc - PH) / comp, r2 = (pc + PH) / comp;
      lo = Math.max(lo, Math.min(r1, r2)); hi = Math.min(hi, Math.max(r1, r2));
    }
    return lo < hi && hi > 0 ? [Math.max(lo, 0), hi] : null;
  };
  const clampR = (v, a, b) => Math.max(a, Math.min(b, v));
  // band quad between rays i/j and radii a..b, carved around the pond
  const bandQuad = (i, j, ai, aj, bi, bj, color) => {
    const hi_ = pondRay(i), hj = pondRay(j);
    if (!hi_ && !hj) {
      quad(pt(i, ai, TOP_Y), pt(j, aj, TOP_Y), pt(j, bj, TOP_Y), pt(i, bi, TOP_Y), color);
      return;
    }
    const si = hi_ ?? hj, sj = hj ?? hi_;
    const p0i = clampR(si[0], ai, bi), p1i = clampR(si[1], ai, bi);
    const p0j = clampR(sj[0], aj, bj), p1j = clampR(sj[1], aj, bj);
    if (p0i - ai > 0.01 || p0j - aj > 0.01) {
      quad(pt(i, ai, TOP_Y), pt(j, aj, TOP_Y), pt(j, p0j, TOP_Y), pt(i, p0i, TOP_Y), color);
    }
    if (bi - p1i > 0.01 || bj - p1j > 0.01) {
      quad(pt(i, p1i, TOP_Y), pt(j, p1j, TOP_Y), pt(j, bj, TOP_Y), pt(i, bi, TOP_Y), color);
    }
  };

  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const ri1 = R1[i], rj1 = R1[j];
    const ria = RA[i], rja = RA[j];
    const rib = RB[i], rjb = RB[j];
    const ric = RC[i], rjc = RC[j];
    const ri2 = R2[i], rj2 = R2[j];
    const ti = T1[i], tj = T1[j];
    const rockA = COL_ROCKS[hash(7301, i) % 3];
    const rockB = COL_ROCKS[hash(7302, i) % 3];
    // plateau top: concentric faceted rings with slight per-patch shade
    // variation instead of one flat green fan (still perfectly flat)
    {
      const RINGS = [0.24, 0.46, 0.66, 0.83, 1];
      const gShade = (k) => COL_GRASSES[hash(7405 + k, (i + k * 37) >> 3) % COL_GRASSES.length];
      const R0i = ri1 * RINGS[0], R0j = rj1 * RINGS[0];
      const h0i = pondRay(i), h0j = pondRay(j);
      if (!h0i && !h0j) {
        tri([0, TOP_Y, 0], pt(j, R0j, TOP_Y), pt(i, R0i, TOP_Y), gShade(0));
      } else {
        // carve the central fan triangle around the pond as well
        const si = h0i ?? h0j, sj = h0j ?? h0i;
        const q0i = clampR(si[0], 0, R0i), q0j = clampR(sj[0], 0, R0j);
        const q1i = clampR(si[1], 0, R0i), q1j = clampR(sj[1], 0, R0j);
        if (q0i > 0.01 || q0j > 0.01) {
          tri([0, TOP_Y, 0], pt(j, q0j, TOP_Y), pt(i, q0i, TOP_Y), gShade(0));
        }
        if (R0i - q1i > 0.01 || R0j - q1j > 0.01) {
          quad(pt(i, q1i, TOP_Y), pt(j, q1j, TOP_Y), pt(j, R0j, TOP_Y), pt(i, R0i, TOP_Y), gShade(0));
        }
      }
      for (let k = 0; k < RINGS.length - 1; k++) {
        bandQuad(i, j, ri1 * RINGS[k], rj1 * RINGS[k], ri1 * RINGS[k + 1], rj1 * RINGS[k + 1], gShade(k + 1));
      }
    }
    // upper rock riser: split at a mid-ridge for two-tone faceting; the mesh
    // stays flush with groundHeight so nothing can stand inside the rock
    {
      const mi = (ri1 + ria) / 2, mj = (rj1 + rja) / 2;
      const myi = (TOP_Y + ti) / 2, myj = (TOP_Y + tj) / 2;
      quad(pt(i, ri1, TOP_Y), pt(j, rj1, TOP_Y), pt(j, mj, myj), pt(i, mi, myi), rockA);
      quad(pt(i, mi, myi), pt(j, mj, myj), pt(j, rja, tj), pt(i, ria, ti), rockB);
    }
    // boulder tread shelf
    quad(pt(i, ria, ti), pt(j, rja, tj), pt(j, rjb, tj), pt(i, rib, ti), COL_TREAD);
    // lower rock riser down to the sand (also flush with groundHeight)
    {
      const mi = (rib + ric) / 2, mj = (rjb + rjc) / 2;
      const myi = (ti + BEACH_Y) / 2, myj = (tj + BEACH_Y) / 2;
      quad(pt(i, rib, ti), pt(j, rjb, tj), pt(j, mj, myj), pt(i, mi, myi), rockB);
      quad(pt(i, mi, myi), pt(j, mj, myj), pt(j, rjc, BEACH_Y), pt(i, ric, BEACH_Y), rockA);
    }
    // wide sloping beach (crosses the waterline)
    quad(pt(i, ric, BEACH_Y), pt(j, rjc, BEACH_Y), pt(j, rj2, BEACH_OUT), pt(i, ri2, BEACH_OUT), COL_SAND);
    // wading slope down to the deep floor
    quad(pt(i, ri2, BEACH_OUT), pt(j, rj2, BEACH_OUT), pt(j, rj2 + WADE_W, SEAFLOOR_Y), pt(i, ri2 + WADE_W, SEAFLOOR_Y), COL_SAND_WET);
    // deep flat floor out to the horizon
    quad(pt(i, ri2 + WADE_W, SEAFLOOR_Y), pt(j, rj2 + WADE_W, SEAFLOOR_Y), pt(j, 2100, SEAFLOOR_Y), pt(i, 2100, SEAFLOOR_Y), COL_DEEP);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ vertexColors: true })
  );
  mesh.receiveShadow = true;
  scene.add(mesh);

  // water: a partially-transparent polar ring whose inner edge follows the
  // coast a hair seaward of the true sand/waterline intersection, so the
  // flat surface never grazes the sloping sand (no polygonOffset needed —
  // slope-scaled offsets made the waterline visually migrate with distance)
  {
    const wt = (WATER_Y - BEACH_Y) / (BEACH_OUT - BEACH_Y); // ~0.73 across the sand
    const wpos = new Float32Array((N + 1) * 6);
    const wnrm = new Float32Array((N + 1) * 6);
    for (let k = 0; k <= N; k++) {
      const i = k % N;
      const th = -Math.PI + (2 * Math.PI * k) / N;
      const c = Math.cos(th), s = Math.sin(th);
      const rIn = RC[i] + (R2[i] - RC[i]) * wt + 0.4; // 0.4m seaward → ~6mm deep at the edge
      wpos.set([c * rIn, WATER_Y, s * rIn, c * 2200, WATER_Y, s * 2200], k * 6);
      wnrm.set([0, 1, 0, 0, 1, 0], k * 6);
    }
    const widx = [];
    for (let k = 0; k < N; k++) {
      const a = k * 2;
      widx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); // CCW seen from above
    }
    const wgeo = new THREE.BufferGeometry();
    wgeo.setAttribute('position', new THREE.BufferAttribute(wpos, 3));
    wgeo.setAttribute('normal', new THREE.BufferAttribute(wnrm, 3));
    wgeo.setIndex(widx);
    const water = new THREE.Mesh(
      wgeo,
      new THREE.MeshLambertMaterial({
        color: COL_WATER,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
    );
    scene.add(water);
  }

  buildRocks(scene, colliders);
  buildStairs(scene, colliders);
  buildHill(scene, colliders);
  buildBeachLife(scene, colliders);
  buildIslets(scene);

  return mesh;
}
