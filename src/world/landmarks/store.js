// Hansen's grocery — the one block you can walk INSIDE of.
//
// The store's EXTERIOR is an ordinary hand-authored block (grid cell 8,4): a
// standalone store with a "Hansen's" sign, a glazed storefront and an open,
// light-filled doorway, fronted by a big parking lot that runs right up to the
// grid street (with driveway curb-cuts), the leftover lawn packed with trees.
//
// The store's INTERIOR is a second, fully self-contained room parked far
// off-map (IX, IZ below), well beyond the island so the terrain / drowning /
// fog / shadow logic never touches it. Because it shares the one Colliders
// world and lives in the same scene, walking + physics + lighting all just work
// there with no special cases.
//
// You don't teleport by touching the door — you walk up to it, a "Press E to
// enter" hint appears, and pressing E fades the screen to black and straight
// back in on the far side. Same to leave. Each doorway is only a panel of light
// (a self-lit glow box), so neither side ever reveals the other.
//
// updateStore(player, dt) runs every frame from main.js: it drives the hint,
// the E press, and the fade-and-teleport transition.
import * as THREE from 'three';
import { PALETTE as P, SIDEWALK_H } from '../../core/palette.js';
import { hash, pick } from '../../core/util.js';
import { makeHumanoid, mat } from '../../actors/character.js';
import { slabAndSidewalk, parkingLotAt, makeTextTexture, cornerLamps, wallScoring } from '../blocks/kit.js';
import { tree, planter, scatterTrees } from '../blocks/props.js';
import { openWardrobe, wardrobeOpen } from '../../core/wardrobe.js';
import { key } from '../../core/keycap.js';
import { makeBubble } from '../../fx/bubble.js';

// ---- palette -------------------------------------------------------------
const HANSEN_GREEN = 0x3f9d57;   // friendly storefront green (sign band, canopy)
const DOOR_WOOD = 0x2f7d43;      // solid green door slab
const DOOR_FRAME = 0x6b4a2f;     // brown door trim
const KNOB = 0xd9b45a;           // brass knob
const WALL_COLOR = 0xeef2f0;     // interior wall
const FLOOR_TILE = 0xe9edf1;     // light checkerboard tile
const FLOOR_DARK = 0x2f343b;     // dark checkerboard tile (base slab)
const CEIL_COLOR = 0xf4f6f7;     // interior ceiling
const DOG_BODY = 0xa85a2a;       // lean red-brown dog
const DOG_DARK = 0x7a3d18;       // muzzle / ears
const DOG_LEG = 0x8f4a20;        // legs
const KICK = 0x6b6f75;           // gondola base kick
const CARCASS = 0x9aa1a9;        // gondola central spine
const SHELF_BOARD = 0xc4c9cf;    // shelf boards
const COUNTER = 0x8a6b45;        // wood counters
const COUNTER_TOP = 0x6f5636;    // darker counter surface
// Bright grocery "product" colours stacked on the shelves.
const PRODUCT = [0xe04f43, 0xf4c542, 0x4a90d9, 0x3aa7a3, 0xe07f9a, 0x9ccc4e, 0xf39a3a, 0xf2f4f5, 0xc0564a, 0x8bc34a, 0xd98cc0, 0x5a9bd4];

// ---- interior anchor (far off-map) --------------------------------------
const IX = 4000, IZ = 0;         // interior room centre, way out past the sea
const FLOOR_Y = 0.2;             // interior floor top (safely above the waterline)
const ROOM_W = 20, ROOM_D = 30, WALL_H = 7;

// ---- doorway / transition state (filled in during the build) ------------
const HINT_R = 3.0, HINT2 = HINT_R * HINT_R;
const FADE_S = 0.42;             // matches the #fade CSS opacity transition
let EXT_DOOR = null, INT_DOOR = null;   // { x, z } hint centres
let EXT_SPAWN = null, INT_SPAWN = null; // { x, y, z, yaw }
let STYLIST = null;                     // { x, z } front-left cashier: the wardrobe NPC
const STYLIST_APRON = 0x8e6bd6;         // her distinct grape apron, so she stands out
const STYLIST_R = 3.0, STYLIST2 = STYLIST_R * STYLIST_R;
let trans = null;                // in-progress fade: { spawn, t, teleported }
let ePrev = false;               // KeyE edge detection
let qPrev = false;               // KeyQ edge detection (dialog "decline")
let dlg = null;                  // stylist conversation: { phase:'ask'|'bye', t }
let curHint = '';                // current doorway hint text (read by main.js)
let inside = false;              // true while the player is in the interior room (read by main.js for the store's music)

// ===========================================================================
// EXTERIOR — the block builder (dispatched from city.js CITY map)
// ===========================================================================
export function buildGrocery(g, col, b, seed, scene) {
  const r = slabAndSidewalk(g, col, b, P.grass); // grassy lot for the landscaping
  const cx = r.cx;                                // 60
  const gy = SIDEWALK_H + 0.03;                   // lawn/pad top

  // --- store shell, tucked to the back (-z), facing the forecourt (+z) ---
  const SW = 46, SD = 22, SH = 8;
  const scz = r.z0 + 1 + SD / 2;   // centre z; back wall ~1m off the block edge
  const frontZ = scz + SD / 2;     // the +z face that carries the storefront
  buildStoreShell(g, col, scene, cx, scz, SW, SD, SH, gy, frontZ);

  // --- forecourt parking lot: runs from the store out to the front street ---
  const lot = { x0: 27, x1: 93, z0: frontZ + 2, z1: r.z1 - 1 };
  // keep a clear walking lane from the storefront: no cars in the aisle
  // directly ahead of the door (x≈cx) nor within ~11 m of it in z.
  const nearDoor = (px, pz) => Math.abs(px - cx) < 9 && pz < frontZ + 13;
  parkingLotAt(g, col, (lot.x0 + lot.x1) / 2, (lot.z0 + lot.z1) / 2,
    lot.x1 - lot.x0, lot.z1 - lot.z0, gy, hash(seed, 2),
    0, null, 14, undefined, undefined, nearDoor);
  // driveway curb-cuts stitching the lot to the E-W street just south (z=-335)
  for (const dx of [-16, 16]) g.boxB(cx + dx, SIDEWALK_H + 0.02, r.z1 + 1.5, 10, 0.02, 7, P.road);

  // --- landscaping: entrance planters + the lawn packed with trees ---
  planter(g, col, cx - 6, frontZ + 2.4);
  planter(g, col, cx + 6, frontZ + 2.4);
  const inLot = (px, pz) => px > lot.x0 - 1.5 && px < lot.x1 + 1.5 && pz > lot.z0 - 1.5 && pz < lot.z1 + 1.5;
  const inStore = (px, pz) => px > cx - SW / 2 - 2 && px < cx + SW / 2 + 2 && pz > scz - SD / 2 - 2 && pz < frontZ + 2;
  scatterTrees(g, col, r, hash(seed, 9), 4.4, 0.6, 1.0, (px, pz) => inLot(px, pz) || inStore(px, pz));
  cornerLamps(g, col, b);

  // --- build the matching interior once, then wire up the doorways ---
  buildInterior(g, col, scene);
  EXT_DOOR = { x: cx, z: frontZ };
  EXT_SPAWN = { x: cx, y: gy + 0.3, z: frontZ + 3.4, yaw: Math.PI }; // step out toward the lot
}

// Solid store box + parapet + rooftop units + a "Hansen's" sign, a glazed
// storefront, and a glowing open doorway on the +z (front) face. The shell is
// deliberately solid: the doorway is a light panel, not a hole.
function buildStoreShell(g, col, scene, cx, cz, w, d, h, gy, frontZ) {
  g.boxB(cx, gy, cz, w, h, d, P.offwhite);                       // main mass
  col.add(cx, 0, cz, w, h + 0.5, d);                            // solid collider
  // coursing lines on the blank side + back walls (the busy front is left clear)
  const wsOpt = { hex: P.concreteDark, rows: 4, margin: 1.2, lineW: 0.12 };
  wallScoring(g, cx - w / 2, gy, cz, 'z', d, h, -1, wsOpt);
  wallScoring(g, cx + w / 2, gy, cz, 'z', d, h, +1, wsOpt);
  wallScoring(g, cx, gy, cz - d / 2, 'x', w, h, -1, wsOpt);
  g.boxB(cx, gy + h, cz, w + 0.5, 0.8, d + 0.5, P.roofLight);    // parapet
  for (const sx of [-1, 0, 1]) g.boxB(cx + sx * w * 0.28, gy + h + 0.8, cz - 2, 3, 1.4, 3, P.concreteDark); // roof units

  // friendly "Hansen's" sign on a green fascia band across the storefront top
  const textW = w - 10;
  const { tex, physH } = makeTextTexture("Hansen's", textW, '#2f8f4e', '#fdfdf4');
  const bandH = physH + 0.8;
  const bandY = gy + h - bandH / 2 - 0.5;
  g.box(cx, bandY, frontZ + 0.15, w - 2, bandH, 0.4, HANSEN_GREEN);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(textW, physH), new THREE.MeshBasicMaterial({ map: tex }));
  sign.position.set(cx, bandY, frontZ + 0.36);
  scene.add(sign);

  // glazed storefront in two panes flanking the central doorway (so the door
  // isn't hidden behind the glass), plus pilasters
  const glassHalf = (w - 6) / 2, doorGap = 1.4;
  for (const sgn of [-1, 1]) {
    const inner = sgn * doorGap, outer = sgn * glassHalf;
    g.box(cx + (inner + outer) / 2, gy + 2.0, frontZ + 0.08, Math.abs(outer - inner), 3.4, 0.3, P.glassDark);
  }
  const np = Math.floor((w - 6) / 6);
  for (let i = 0; i <= np; i++) {
    const px = cx - (w - 6) / 2 + i * (w - 6) / np;
    if (Math.abs(px - cx) < 1.2) continue; // leave the doorway clear
    g.box(px, gy + 2.0, frontZ + 0.2, 0.7, h - 2.4, 0.5, P.offwhite);
  }

  // a normal-sized solid green wood door on the front face (the shell behind it
  // is a solid collider, so you stop at the door and can't clip through it)
  woodDoor(g, cx, gy, frontZ, 1);
  g.box(cx, gy + 3.1, frontZ + 1.6, 6, 0.35, 3.0, HANSEN_GREEN); // entrance canopy above
}

// A small solid green wood door with a brown frame and a brass knob, mounted on
// a wall surface at z = `s` and protruding outward in the `dir` (+z/-z)
// direction only — so it never poke past the wall into the player's side.
function woodDoor(g, x, floorY, s, dir) {
  const dw = 1.1, dh = 2.2;
  g.box(x, floorY + dh / 2, s + dir * 0.02, dw + 0.24, dh + 0.18, 0.06, DOOR_FRAME); // trim
  g.box(x, floorY + dh / 2, s + dir * 0.06, dw, dh, 0.1, DOOR_WOOD);                 // slab
  g.box(x - dir * (dw / 2 - 0.16), floorY + 1.05, s + dir * 0.14, 0.09, 0.09, 0.06, KNOB); // knob
}

// ===========================================================================
// INTERIOR — a self-contained room far off-map, built into the same batch
// ===========================================================================
function buildInterior(g, col, scene) {
  const x0 = IX - ROOM_W / 2, x1 = IX + ROOM_W / 2;
  const z0 = IZ - ROOM_D / 2, z1 = IZ + ROOM_D / 2;
  const wt = 0.4; // wall thickness

  // floor: a dark base slab (collider top sits at FLOOR_Y) with light tiles laid
  // over the alternating squares, so it reads as one big checkerboard.
  g.boxB(IX, -0.6, IZ, ROOM_W, 0.6 + FLOOR_Y, ROOM_D, FLOOR_DARK);
  col.add(IX, 0, IZ, ROOM_W, FLOOR_Y, ROOM_D);
  const TILE = 2, nx = Math.round(ROOM_W / TILE), nz = Math.round(ROOM_D / TILE);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    if ((i + j) % 2 === 0) continue;   // dark base shows through on these squares
    const tx = x0 + (i + 0.5) * TILE, tz = z0 + (j + 0.5) * TILE;
    g.boxB(tx, FLOOR_Y - 0.03, tz, TILE, 0.06, TILE, FLOOR_TILE); // sits ~2cm proud
  }
  // the ceiling seals out the sky
  g.boxB(IX, FLOOR_Y + WALL_H, IZ, ROOM_W + wt, 0.3, ROOM_D + wt, CEIL_COLOR);

  // four solid walls (the -z wall carries the exit doorway)
  const wall = (x, z, sx, sz) => { g.boxB(x, FLOOR_Y, z, sx, WALL_H, sz, WALL_COLOR); col.add(x, FLOOR_Y, z, sx, WALL_H, sz); };
  wall(IX, z0, ROOM_W + wt, wt);
  wall(IX, z1, ROOM_W + wt, wt);
  wall(x0, IZ, wt, ROOM_D);
  wall(x1, IZ, wt, ROOM_D);

  // fluorescent ceiling strips — self-lit so the room reads bright indoors
  for (let zi = -1; zi <= 1; zi++) g.glowBox(IX, FLOOR_Y + WALL_H - 0.25, IZ + zi * 8, ROOM_W - 8, 0.1, 1.2, 0xffffff);

  // exit door on the -z wall: same green wood door, facing into the room (+z)
  woodDoor(g, IX, FLOOR_Y, z0 + 0.2, 1);

  // decorative (non-functional) bluish windows set into the walls
  decoWindows(g, x0, x1, z1);

  // ---- side counters: two long counters against each side wall, each with a
  // worker behind. They run nearly wall-to-wall so there's no way around the
  // ends to slip behind them. ----
  sideCounters(g, col, scene, x0 + 2.0, +1, z0, z1);  // left wall, workers face +x
  sideCounters(g, col, scene, x1 - 2.0, -1, z0, z1);  // right wall, workers face -x

  // ---- aisles: double-sided gondola shelving down the middle ----
  for (const cz of [-8, -4, 0, 4, 8]) gondola(g, col, IX, cz, 11);

  // ---- back service/deli counter with one worker (unchanged) ----
  const bcz = z1 - 2;
  g.boxB(IX, FLOOR_Y, bcz, 12, 1.1, 1.4, COUNTER);
  col.add(IX, FLOOR_Y, bcz, 12, 1.1, 1.4);
  g.boxB(IX, FLOOR_Y + 1.1, bcz, 12, 0.12, 1.4, COUNTER_TOP);              // counter top
  g.box(IX, FLOOR_Y + 4.6, z1 - 0.35, 10, 1.6, 0.2, 0x24303a);            // wall menu board
  worker(scene, IX, bcz + 0.9, Math.PI, 0xf2f4f5, hash(3));               // deli worker, faces the aisles

  INT_DOOR = { x: IX, z: z0 };
  INT_SPAWN = { x: IX, y: FLOOR_Y + 0.15, z: z0 + 3.4, yaw: Math.PI };    // just inside, facing the aisles

  buildDog(scene, IX, z1 - 5);   // the store dog, waiting at the back of the store
}

// ===========================================================================
// DOG — a lean red-brown pup that trots after you and wags his tail.
// He's confined to the interior and, past the open front hall, keeps to the
// aisle lanes: he threads the walkable comb (horizontal lanes joined by the
// side cross-aisles) rather than clipping straight through the gondolas.
// ===========================================================================
let dog = null; // { group, tail, legs:[…], x, z, heading, phase, wag }

// A blocky low-poly dog built facing local +z, standing on the floor (its group
// origin sits on FLOOR_Y). Legs and tail are pivots so they can swing/wag.
function buildDog(scene, x, z) {
  const G = new THREE.Group();
  // The dog is an animated actor but is built during the static city pass (before
  // mergeStatic). Tag every part noMerge so the merger doesn't bake his meshes
  // into frozen static geometry and gut his pivot groups — that would leave him
  // stuck at his spawn spot, unable to trot after you.
  const box = (w, h, d, hex, px, py, pz) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(hex));
    m.position.set(px, py, pz); m.castShadow = true; m.userData.noMerge = true; G.add(m); return m;
  };

  box(0.38, 0.4, 1.15, DOG_BODY, 0, 0.7, 0);      // lean body
  box(0.3, 0.34, 0.28, DOG_BODY, 0, 0.66, 0.64);  // slim chest/neck
  box(0.3, 0.32, 0.32, DOG_BODY, 0, 0.9, 0.68);   // head
  box(0.16, 0.15, 0.34, DOG_DARK, 0, 0.82, 0.96); // narrow snout
  box(0.05, 0.05, 0.05, 0x151515, 0, 0.85, 1.15); // nose
  for (const sx of [-1, 1]) {
    const ear = box(0.09, 0.46, 0.07, DOG_DARK, sx * 0.16, 0.8, 0.58); // long ear hanging down beside the head
    ear.rotation.z = sx * 0.22;                             // splayed outward at the bottom, so it flops rather than stands
    box(0.05, 0.05, 0.05, 0x151515, sx * 0.08, 0.94, 0.85); // eyes
  }

  // four legs — pivots at the hips so they can swing when trotting
  const leg = (px, pz) => {
    const p = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.56, 0.11), mat(DOG_LEG));
    m.position.y = -0.28; m.castShadow = true; m.userData.noMerge = true;
    p.add(m); p.position.set(px, 0.56, pz); G.add(p); return p;
  };
  const legs = [leg(-0.13, 0.4), leg(0.13, 0.4), leg(-0.13, -0.4), leg(0.13, -0.4)];

  // tail — pivot at the rump, raised up, wags side to side
  const tail = new THREE.Group();
  const tm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.5), mat(DOG_BODY));
  tm.position.z = -0.25; tm.castShadow = true; tm.userData.noMerge = true;
  tail.add(tm);
  tail.position.set(0, 0.8, -0.52);
  tail.rotation.x = -0.7; // angled up
  G.add(tail);

  G.position.set(x, FLOOR_Y, z);
  scene.add(G);
  dog = { group: G, tail, legs, x, z, heading: Math.PI, phase: 0, wag: 0 };
}

// ---- walkable lane network (interior coords) ----------------------------
// z below FRONT_Z is the open front hall (no gondolas) — free roaming there.
// Past it, the walkable floor is a comb: horizontal aisle lanes at Z_LANES,
// joined at each end by the side cross-aisles (rails) at IX ± RAIL_DX.
const FRONT_Z = -9;                // z < this is the open front hall (clear of the first gondola row at z=-8)
const Z_LANES = [-6, -2, 2, 6, 10.5]; // aisle-lane centres (between gondola rows)
const RAIL_DX = 6.4;               // side cross-aisles at IX ± this
const LANE_TOL = 1.2;              // z tolerance for being "on" a lane
const nearestLane = (z) => Z_LANES.reduce((a, b) => Math.abs(b - z) < Math.abs(a - z) ? b : a);

// Immediate corridor waypoint [x,z] the dog should steer toward to reach the
// player without cutting through shelving. Manhattan routing on the comb:
// get onto a side rail, run along it to the player's lane (or the front mouth),
// then turn off toward the player. Recomputed every frame, so the dog just
// chases the first leg each time and progresses corridor by corridor.
function dogWaypoint(tx, tz) {
  const dogFront = dog.z <= FRONT_Z, plFront = tz <= FRONT_Z;
  if (dogFront && plFront) return [tx, tz];             // open hall → straight

  const dogLane = nearestLane(dog.z), plLane = nearestLane(tz);
  const dogOnLane = !dogFront && Math.abs(dog.z - dogLane) <= LANE_TOL;
  const plOnLane = !plFront && Math.abs(tz - plLane) <= LANE_TOL;
  if (dogOnLane && plOnLane && dogLane === plLane) return [tx, dogLane]; // same aisle

  const railX = IX + (dog.x >= IX ? RAIL_DX : -RAIL_DX);
  const rowZ = dogFront ? dog.z : (dogOnLane ? dogLane : dog.z);
  if (Math.abs(dog.x - railX) > 0.4) return [railX, rowZ];   // 1. slide onto the rail

  const rungZ = plFront ? FRONT_Z - 1 : plLane;
  if (Math.abs(dog.z - rungZ) > 0.4) return [railX, rungZ];  // 2. run the rail to the rung
  return plFront ? [tx, tz] : [tx, plLane];                  // 3. turn off toward the player
}

// Per-frame dog behaviour: route toward the player through the aisle lanes,
// keeping a polite distance; turn to face the way he's heading (or the player
// when parked), bob the legs while moving, and wag the tail — faster when close
// and happy. Only active while the player is inside the interior room.
function updateDog(p, dt) {
  if (!dog) return;
  const inside = Math.abs(p.x - IX) < ROOM_W && Math.abs(p.z - IZ) < ROOM_D;

  const distP = Math.hypot(p.x - dog.x, p.z - dog.z);
  const STOP = 1.7, SPEED = 3.2;
  let moving = 0, faceX = p.x - dog.x, faceZ = p.z - dog.z;

  if (inside && distP > STOP) {
    const [wx, wz] = dogWaypoint(p.x, p.z);   // next corridor waypoint
    const wdx = wx - dog.x, wdz = wz - dog.z, wd = Math.hypot(wdx, wdz);
    if (wd > 1e-3) {
      const step = Math.min(SPEED * dt, wd);
      dog.x += (wdx / wd) * step;
      dog.z += (wdz / wd) * step;
      moving = Math.min(1, step / (SPEED * dt));
      faceX = wdx; faceZ = wdz;               // face the way he's trotting
    }
  }

  if (inside) {
    const want = Math.atan2(faceX, faceZ);    // turn smoothly toward heading/player
    let da = ((want - dog.heading + Math.PI) % (2 * Math.PI)) - Math.PI;
    if (da < -Math.PI) da += 2 * Math.PI;
    dog.heading += da * Math.min(1, 8 * dt);
  }

  dog.group.position.set(dog.x, FLOOR_Y, dog.z);
  dog.group.rotation.y = dog.heading;
  const dist = distP;

  // leg trot bob (only while actually moving)
  dog.phase += dt * (6 + moving * 8);
  const swing = Math.sin(dog.phase) * 0.7 * moving;
  dog.legs[0].rotation.x = swing;   dog.legs[3].rotation.x = swing;   // diagonal pairs
  dog.legs[1].rotation.x = -swing;  dog.legs[2].rotation.x = -swing;

  // tail wag — always wagging, faster when close (excited to see you)
  const happy = inside ? (dist < 5 ? 1 : 0.5) : 0.35;
  dog.wag += dt * (8 + happy * 12);
  dog.tail.rotation.y = Math.sin(dog.wag) * 0.6 * (0.5 + happy);
}

// Two counters running the length of a side wall at x = `cxCounter`, offset a
// little into the room, with a cashier standing in the sealed strip behind each.
// `faceDir` is +1 for the left wall (workers face +x) or -1 for the right.
function sideCounters(g, col, scene, cxCounter, faceDir, z0, z1) {
  const halfDepth = 0.7;             // counter thickness in x
  const ry = faceDir > 0 ? Math.PI / 2 : -Math.PI / 2; // face the room centre
  const wx = cxCounter - faceDir * (halfDepth + 0.4);  // worker stands behind (toward the wall)
  // two segments, together spanning z0+0.4 .. z1-0.4 with only a hairline seam
  const segs = [[z0 + 0.4, IZ - 0.2], [IZ + 0.2, z1 - 0.4]];
  for (let i = 0; i < segs.length; i++) {
    const [za, zb] = segs[i], len = zb - za, cz = (za + zb) / 2;
    g.boxB(cxCounter, FLOOR_Y, cz, halfDepth * 2, 1.0, len, COUNTER);
    col.add(cxCounter, FLOOR_Y, cz, halfDepth * 2, 1.0, len);
    g.boxB(cxCounter, FLOOR_Y + 1.0, cz, halfDepth * 2 + 0.16, 0.1, len, COUNTER_TOP); // overhang top
    g.boxB(cxCounter + faceDir * 0.2, FLOOR_Y + 1.1, cz - len * 0.3, 0.5, 0.4, 0.6, 0x2a2f36); // register
    // Every side-counter worker stands 4m toward the entrance (-z) of their
    // segment and gets a floating speech-bubble. The front-left cashier (left
    // wall, first segment nearest the entrance) is the wardrobe stylist: a
    // distinct apron + a recorded anchor in front of her counter so updateStore
    // can offer the "Press E to talk" prompt there, opening the wardrobe
    // conversation. The others' bubbles are just friendly for now — you can't
    // talk to them yet.
    const stylist = faceDir > 0 && i === 0;
    const wz = cz - 4;
    worker(scene, wx, wz, ry, stylist ? STYLIST_APRON : HANSEN_GREEN, hash(Math.round(cxCounter), i));
    makeBubble(scene, wx + faceDir * 0.5, FLOOR_Y + 2.55, wz);
    if (stylist) STYLIST = { x: cxCounter + faceDir * (halfDepth + 1.2), z: wz };
  }
}

// A double-sided gondola: open shelving (base kick + central spine + shelf
// boards cantilevering to each side) stocked with bright product in varying
// widths/heights/colours, with the odd gap for realism. Every layer is buried
// ~5cm into the one below so no faces are coplanar (no z-fighting), and the
// products sit ON the open boards so they're actually visible. Deterministic.
//
// The spine spans the full `len` and is the outermost element at each aisle
// end, forming a clean vertical end cap; every other layer (kick, boards,
// signage) is recessed `END_INSET` at both ends so no end faces are coplanar
// with the spine (which would z-fight at the aisle caps).
function gondola(g, col, cx, cz, len) {
  const H = 1.9;
  const END_INSET = 0.12, ilen = len - 2 * END_INSET;             // recessed length for non-spine layers
  col.add(cx, FLOOR_Y, cz, len, H, 1.4);                          // solid footprint (collision only)
  g.boxB(cx, FLOOR_Y, cz, ilen, 0.18, 1.2, KICK);                 // base kick (recessed ends)
  g.boxB(cx, FLOOR_Y + 0.12, cz, len, H - 0.12, 0.25, CARCASS);   // central back-to-back spine (full length: the end cap)
  g.boxB(cx, FLOOR_Y + H - 0.06, cz, ilen, 0.32, 0.35, 0x3f6d9e); // top signage strip (recessed ends, wider than spine)
  const tiers = [0.32, 0.8, 1.28];
  const step = 0.55, n = Math.max(2, Math.round(ilen / step)), sp = ilen / n; // span the recessed boards
  for (const sz of [-1, 1]) {
    for (const ty of tiers) {
      g.boxB(cx, FLOOR_Y + ty, cz + sz * 0.4, ilen, 0.05, 0.6, SHELF_BOARD); // shelf board (recessed ends; inner edge buried in spine)
      for (let i = 0; i < n; i++) {
        const px = cx - ilen / 2 + (i + 0.5) * sp;
        const s = hash(Math.round(px * 17), Math.round(cz * 11) + sz * 3, Math.round(ty * 100));
        if (s % 9 === 0) continue;                                // occasional empty facing
        const ph = 0.28 + (s % 5) * 0.05;                         // varying height
        const pw = sp * (0.62 + ((s >> 3) % 3) * 0.12);           // varying width
        const c = PRODUCT[(s >> 6) % PRODUCT.length];
        g.boxB(px, FLOOR_Y + ty, cz + sz * 0.42, pw, ph, 0.34, c); // sits on the board, faces out
      }
    }
  }
}

// Decorative-only bluish "windows" — flat framed panels sitting proud of the
// interior walls (not real openings). Placed on the two side walls and the
// back wall, clear of the door and the deli menu board.
const WIN_GLASS = 0x8fb9dc, WIN_FRAME = 0xf4f6f7;
function decoWindow(g, x, y, z, along, faceDir, w, h) {
  if (along === 'z') { // wall runs along z (side wall): panel spans w in z, thin in x
    g.box(x + faceDir * 0.02, y, z, 0.06, h + 0.3, w + 0.3, WIN_FRAME);
    g.box(x + faceDir * 0.06, y, z, 0.05, h, w, WIN_GLASS);
    g.box(x + faceDir * 0.08, y, z, 0.04, h, 0.06, WIN_FRAME); // mullion
  } else {             // wall runs along x (back wall): panel spans w in x, thin in z
    g.box(x, y, z + faceDir * 0.02, w + 0.3, h + 0.3, 0.06, WIN_FRAME);
    g.box(x, y, z + faceDir * 0.06, w, h, 0.05, WIN_GLASS);
    g.box(x, y, z + faceDir * 0.08, 0.06, h, 0.04, WIN_FRAME); // mullion
  }
}
function decoWindows(g, x0, x1, z1) {
  const y = FLOOR_Y + 2.5;
  for (const z of [-8, 0, 8]) {
    decoWindow(g, x0 + 0.2, y, IZ + z, 'z', 1, 2.4, 1.6);   // left wall, faces +x
    decoWindow(g, x1 - 0.2, y, IZ + z, 'z', -1, 2.4, 1.6);  // right wall, faces -x
  }
  for (const dx of [-7.5, 7.5]) decoWindow(g, IX + dx, y, z1 - 0.2, 'x', -1, 2.2, 1.6); // back wall
}

// A static store worker (no walk animation), aproned in `shirt`.
function worker(scene, x, z, ry, shirt, seed) {
  const h = makeHumanoid({ shirt, pants: 0x33414d, hair: pick([0x2b1d12, 0x5d4037, 0x1a1a1a, 0x8a6a3a], seed, 5) });
  h.group.position.set(x, FLOOR_Y, z);
  h.group.rotation.y = ry;
  scene.add(h.group);
}

// ===========================================================================
// STYLIST CONVERSATION — a small RPG-style bottom dialog box.
// Talking to the front-left cashier opens this instead of the wardrobe directly:
// she asks whether you'd like to change your appearance, and you answer from the
// keyboard — E to step into the studio (opens the wardrobe), Q to politely
// decline (she signs off, then the box dismisses). The box is a plain DOM
// overlay (CSS lives in index.html under #dialog); main.js freezes the player
// while it's up (storeDialogOpen) so it reads as a conversation, not a pause.
// ===========================================================================
let dlgEl = null, dlgSay = null, dlgOpts = null; // built lazily on first talk
const BYE_S = 2.0;                                // how long the sign-off lingers

// True while the stylist conversation box is up — read by main.js to freeze the
// player (no movement/mouse-look) so it plays as a conversation.
export function storeDialogOpen() { return !!dlg; }

function ensureDialogDom() {
  if (dlgEl) return;
  dlgEl = document.createElement('div');
  dlgEl.id = 'dialog';
  dlgEl.innerHTML = `
    <div class="box">
      <div class="who">Hansen's Stylist</div>
      <div class="say"></div>
      <div class="opts"></div>
    </div>`;
  document.body.appendChild(dlgEl);
  dlgSay = dlgEl.querySelector('.say');
  dlgOpts = dlgEl.querySelector('.opts');
}

// Open the conversation: she asks, and the two keyboard choices are shown.
function openDialog() {
  ensureDialogDom();
  dlg = { phase: 'ask', t: 0 };
  dlgSay.textContent = 'Would you like to change your appearance?';
  dlgOpts.innerHTML =
    `<span class="opt">${key('E')} Yes, let's go</span>` +
    `<span class="opt">${key('Q')} No thanks</span>`;
  dlgEl.classList.add('show');
  curHint = '';
}

// Decline: swap to a brief parting line that dismisses itself after BYE_S.
function sayGoodbye() {
  dlg = { phase: 'bye', t: BYE_S };
  dlgSay.textContent = 'No worries — come back anytime!';
  dlgOpts.innerHTML = '';
}

function closeDialog() {
  dlg = null;
  if (dlgEl) dlgEl.classList.remove('show');
  curHint = '';
}

// ===========================================================================
// per-frame hint + E-to-enter fade transition (called from main.js)
// ===========================================================================
function fadeEl() { return document.getElementById('fade'); }
function near(p, door) { const dx = p.x - door.x, dz = p.z - door.z; return dx * dx + dz * dz < HINT2; }
function nearR(p, c, r2) { const dx = p.x - c.x, dz = p.z - c.z; return dx * dx + dz * dz < r2; }

// Current doorway/stylist hint as an HTML string with keycap markup ('' when
// none) — read by the main-loop HUD code, which assigns it via innerHTML.
export function storeHint() { return curHint; }

// True while the player stands inside the interior room — read by main.js to
// crossfade the city bgm out and Hansen's store song in. Flips exactly at the
// full-black teleport, so the music swaps on the visual cut.
export function inStore() { return inside; }

export function updateStore(player, dt) {
  if (!EXT_DOOR) return; // grocery not built yet

  updateDog(player.pos, dt); // the store dog trots + wags every frame

  // (worker bubbles bob + billboard via the shared fx/bubble.js pump in main.js)

  // advance an in-progress fade transition (input + hint suppressed meanwhile)
  if (trans) {
    curHint = '';
    trans.t -= dt;
    if (trans.t <= 0) {
      if (!trans.teleported) {
        player.teleport(trans.spawn);   // swap sides at full black
        inside = trans.spawn === INT_SPAWN; // the music crossfade keys off this, so it swaps exactly at the visual cut
        trans.teleported = true;
        trans.t = FADE_S;
        fadeEl().style.opacity = '0';   // CSS eases us back in
      } else {
        trans = null;                   // fade-in done
      }
    }
    ePrev = player.keys.has('KeyE');
    qPrev = player.keys.has('KeyQ');
    return;
  }

  const p = player.pos;
  const eEdge = player.keys.has('KeyE') && !ePrev;
  const qEdge = player.keys.has('KeyQ') && !qPrev;
  ePrev = player.keys.has('KeyE');
  qPrev = player.keys.has('KeyQ');

  // While the stylist conversation is up it owns all input (the player is frozen
  // by main.js): E steps into the studio, Q declines. The sign-off then lingers
  // for a beat before dismissing itself (any key skips it).
  if (dlg) {
    curHint = '';
    if (dlg.phase === 'ask') {
      if (eEdge) { closeDialog(); openWardrobe(); }
      else if (qEdge) sayGoodbye();
    } else {
      dlg.t -= dt;
      if (dlg.t <= 0 || eEdge || qEdge) closeDialog();
    }
    return;
  }

  if (near(p, EXT_DOOR)) {
    curHint = `Press ${key('E')} to enter`;
    if (eEdge) startTransition(INT_SPAWN);
  } else if (near(p, INT_DOOR)) {
    curHint = `Press ${key('E')} to exit`;
    if (eEdge) startTransition(EXT_SPAWN);
  } else if (STYLIST && nearR(p, STYLIST, STYLIST2)) {
    // the front-left cashier: talk to her to open the wardrobe conversation
    if (eEdge) openDialog();
    else curHint = wardrobeOpen() ? '' : `Press ${key('E')} to talk`;
  } else {
    curHint = '';
  }
}

function startTransition(spawn) {
  trans = { spawn, t: FADE_S, teleported: false };
  curHint = '';
  fadeEl().style.opacity = '1'; // fade to black; teleport fires when fully dark
}
