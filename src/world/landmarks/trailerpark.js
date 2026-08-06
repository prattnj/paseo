// Trailer park, sitting in the empty plateau pocket at ~(715, -170) — the
// unbuilt grid cell (14,6), a gap between the lower-class suburbB blocks. Like
// arena.js / prison.js / manor.js this is a hand-placed WORLD-COORDINATE
// feature, not a CITY grid entry: the cell is a REMOVED_CELLS gap, so nothing
// in layout.js / city.js owns it.
//
// Layout (north = -z): two DIRT paths run north-south through the pocket and
// are joined by an east-west connector across the north, so the roads form a
// loop (and both drop south onto the z=-115 street). Each N-S path has a row of
// single-wide mobile homes down BOTH sides (four rows), and a short row also
// lines the north connector. Every trailer is the same size (a 4x12 single-
// wide) and is turned the same 45° off the road, for a consistent herringbone.
// Bodies, roofs, skirting, awnings and details vary per-trailer (seeded, never
// random). A few homes have a car parked just off their road (parallel to it,
// so it sits in the yard rather than clipping the angled home), and trash
// mounds are strewn across the whole park. A dense forest fills everything
// around the homes — yards, gaps, edges — kept off the roads/connector by a
// keep-out; a second, radially-clipped fill carpets the coastal grass from the
// park's east edge out to the plateau edge.
//
// The two roads open south onto the existing z=-115 street so you can drive
// straight in. Everything is deterministic (no Math.random). The whole pocket
// is well inside the plateau edge (R1 ~ 785-796 here); the built footprint is
// inset from the far NE corner, which alone falls onto the scarp.
import { PALETTE as P } from '../../core/palette.js';
import { plateauEdgeR } from '../island.js';
import { hash, frac, pick } from '../../core/util.js';
import { tree, scatterTrees, trashCluster, parkedCar } from '../blocks/props.js';

// ---- footprint ----------------------------------------------------------
// The developed rectangle (inset from the cell so the coastal scarp at the
// NE corner and the flanking bay-walks are left clear); forest fills it and
// the trailers/roads sit inside.
// (Everything is shifted 2m west of the first pass to keep the forest off the
// west bay-walk sidewalk at x~671.5; WEST_KEEP below is the belt-and-braces
// tree cutoff.)
const X_W = 669, X_E = 754;   // west / east extent
const Z_N = -226, Z_S = -124; // north / south extent (park interior + north loop)
const WEST_KEEP = 674;        // trees must stay east of here (clear of the sidewalk)

// Two north-south dirt roads joined by an east-west connector across the north,
// so the park reads as a loop. Each N-S road carries a row of trailers on both
// sides; a short row of homes also lines the north connector.
const ROADS = [691, 731];     // N-S road centre x
const ROAD_W = 6;             // dirt path width
const ROAD_ZN = -213, ROAD_ZS = -121; // N-S roads run from the connector to the z=-115 street
const CONN_Z = -210;                  // east-west connector centreline
const CONN_X0 = 688, CONN_X1 = 734;   // connector spans between (and into) the two roads

// Four trailer rows: {x centre, front} where `front` (+1 / -1) is the local-x
// side that faces its road (where the door, windows and driveway go).
const ROWS = [
  { x: 679, front: +1, road: 691 }, // west of road 0, faces east
  { x: 703, front: -1, road: 691 }, // east of road 0, faces west
  { x: 719, front: +1, road: 731 }, // west of road 1, faces east
  { x: 743, front: -1, road: 731 }, // east of road 1, faces west
];

// Extra homes lining the north connector; fronts (-1) face roughly south onto
// it. Kept clear of the two N-S road corridors and the west sidewalk.
const NORTH = [682, 704, 719, 741];
const NORTH_Z = -219;

const N_PER_ROW = 8;              // trailers per N-S row (dense)
const ANGLE = Math.PI / 4;       // 45° lean off the road, identical for every trailer

// ---- one single-wide mobile home ----------------------------------------
const TW = 4, TL = 12, TH = 2.6, SKIRT = 0.55; // width / length / wall / skirt

// Worn pastel bodies, faded metal roofs, and grubby skirting tones.
const BODY = [0xe8e4d8, 0xd9d2c0, 0xcfd8d0, 0xd0dce4, 0xe4d8c8, 0xc8c2b4, 0xdcc9b0, 0xb9c4bd];
const ROOF = [0xd8dbde, 0xb7bcc2, 0x9aa0a5, 0x8fa0a8, 0xc9bfa8];
const SKIRTC = [P.concreteDark, 0x8a7a5c, 0x9aa0a5, 0x736452];

// (x,z) = trailer centre, ry = lean, `front` = local-x side facing the road.
function trailer(g, col, x, z, ry, seed, front) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const at = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];
  const y0 = SKIRT;                       // floor top / body base
  const body = pick(BODY, seed, 1);
  const roof = pick(ROOF, seed, 2);

  g.boxB(x, 0, z, TW - 0.2, SKIRT, TL - 0.2, pick(SKIRTC, seed, 3), ry); // skirting
  g.boxB(x, y0, z, TW, TH, TL, body, ry);                                // body

  // roof: flat metal cap or a low gable (ridge running along the length, so
  // the prism template's local-X ridge is turned an extra 90° past the body).
  if (hash(seed, 4) % 3 === 0) {
    g.boxB(x, y0 + TH, z, TW + 0.5, 0.24, TL + 0.5, roof, ry);
  } else {
    g.prism(x, y0 + TH, z, TL + 0.6, 0.85, TW + 0.5, roof, ry + Math.PI / 2);
  }
  col.add(x, 0, z, TW, y0 + TH + 0.9, TL, ry);

  // front (road-facing) wall: two windows, a door near one end, porch step,
  // and — on some homes — a coloured awning over the door.
  const fx = front * (TW / 2);
  for (const dz of [-TL / 4, TL / 4]) {
    const [wx, wz] = at(fx + front * 0.05, dz);
    g.box(wx, y0 + 1.45, wz, 0.12, 1.0, 1.5, P.window, ry);
  }
  const dEnd = hash(seed, 5) % 2 ? 1 : -1;
  const dz0 = dEnd * (TL / 2 - 2.2);
  const [dxp, dzp] = at(fx + front * 0.07, dz0);
  g.box(dxp, y0 + 1.05, dzp, 0.16, 2.0, 1.0, P.doorDark, ry);
  const [sx, sz] = at(fx + front * 0.7, dz0);
  g.boxB(sx, 0, sz, 1.5, 0.5, 1.2, P.concreteDark, ry);   // porch step
  if (hash(seed, 6) % 2) {
    const [ax, az] = at(fx + front * 0.8, dz0);
    g.box(ax, y0 + 2.25, az, 1.7, 0.12, 2.0, pick(P.awnings, seed, 7), ry);
  }

  // a small window centred on each end wall
  for (const eSign of [-1, 1]) {
    const [ex, ez] = at(0, eSign * (TL / 2 + 0.05));
    g.box(ex, y0 + 1.45, ez, 1.5, 0.9, 0.12, P.window, ry);
  }

  // occasional rooftop A/C box or a bottled-gas tank against the back wall
  if (hash(seed, 8) % 2) {
    const [cx2, cz2] = at(0, dEnd * -2);
    g.boxB(cx2, y0 + TH + 0.24, cz2, 1.1, 0.5, 1.1, P.roofDark, ry);
  } else {
    const [gx, gz] = at(-front * (TW / 2 + 0.6), TL / 2 - 2.5);
    g.cyl(gx, 0, gz, 0.35, 0.35, 1.1, P.offwhite);
  }
}

// ---- entry --------------------------------------------------------------
export function buildTrailerPark(g, col, scene) {
  // dirt roads: two N-S strips down to the street, joined by an E-W connector
  // across the north so the two roads form a loop.
  const rz = (ROAD_ZN + ROAD_ZS) / 2, rlen = ROAD_ZS - ROAD_ZN;
  for (const rx of ROADS) g.boxB(rx, 0, rz, ROAD_W, 0.06, rlen, P.dirt);
  g.boxB((CONN_X0 + CONN_X1) / 2, 0, CONN_Z, CONN_X1 - CONN_X0, 0.06, ROAD_W, P.dirt);

  const cars = [];      // car spots (their colliders come later, from traffic.js)
  const trailers = [];  // trailer centres, for the strewn-trash keep-out
  // Place one trailer plus its optional car, seeded by its position. `road` is
  // the x of the N-S road it fronts (a few homes park a car beside it); pass
  // `road === null` for the north-connector homes, which park along that road.
  const place = (x, z, front, road) => {
    const seed = hash(9200 + Math.round(x), Math.round(z));
    trailer(g, col, x, z, ANGLE, seed, front);
    trailers.push([x, z]);
    // a few homes get a car parked just off their road, parallel to it (so it
    // sits clearly in the yard rather than clipping the angled home)
    if (hash(seed, 21) % 4 === 0) {
      let carx, carz, cry;
      if (road !== null) { carx = road - front * (ROAD_W / 2 + 1.4); carz = z; cry = 0; }
      else { carx = x; carz = CONN_Z - (ROAD_W / 2 + 2.5); cry = Math.PI / 2; }
      parkedCar(g, col, carx, carz, cry, hash(seed, 22));
      cars.push([carx, carz]);
    }
  };

  // four rows down the two N-S roads, evenly spaced in z, all leaning ANGLE
  const z0 = -200, z1 = -130, step = (z1 - z0) / (N_PER_ROW - 1);
  for (const row of ROWS)
    for (let k = 0; k < N_PER_ROW; k++) place(row.x, z0 + k * step, row.front, row.road);

  // extra homes lining the north connector
  for (const nx of NORTH) place(nx, NORTH_Z, -1, null);

  // ---- keep-outs (roads, connector, parked cars, west sidewalk) ----------
  const onRoad = (px, pz) => pz <= ROAD_ZS && pz >= ROAD_ZN - 1
    && ROADS.some((rx) => Math.abs(px - rx) < ROAD_W / 2 + 1.2);
  const onConn = (px, pz) => Math.abs(pz - CONN_Z) < ROAD_W / 2 + 1.2
    && px > CONN_X0 - 1.2 && px < CONN_X1 + 1.2;
  const nearCar = (px, pz) => cars.some(([cx, cz]) => Math.hypot(px - cx, pz - cz) < 3.4);
  const c = Math.cos(ANGLE), s = Math.sin(ANGLE);
  const inTrailer = (px, pz, m) => trailers.some(([tx, tz]) => {
    const ox = px - tx, oz = pz - tz;          // world offset -> trailer-local
    return Math.abs(ox * c - oz * s) < TW / 2 + m && Math.abs(ox * s + oz * c) < TL / 2 + m;
  });

  // ---- trash strewn across the park --------------------------------------
  // a jittered grid of trash mounds filling the yards, gaps and roadsides,
  // skipping the roads/connector, the homes themselves and the parked cars.
  let ti = 0;
  for (let gx = X_W + 4; gx < X_E; gx += 7)
    for (let gz = Z_N + 4; gz < Z_S; gz += 7) {
      const px = gx + (frac(7700, ti, 1) - 0.5) * 5.5;
      const pz = gz + (frac(7700, ti, 2) - 0.5) * 5.5;
      ti++;
      if (hash(7701, ti) % 5 === 0) continue;                       // leave gaps
      if (px < WEST_KEEP || onRoad(px, pz) || onConn(px, pz)) continue;
      if (inTrailer(px, pz, 0.6) || nearCar(px, pz)) continue;
      trashCluster(g, col, px, pz, hash(7702, ti), 0.6 + frac(7703, ti) * 0.7);
    }

  // ---- dense forest over the park ----------------------------------------
  // everything but the roads, the connector, the parked cars and the west
  // bay-walk sidewalk (trees dodge the trailers/trash via their colliders)
  scatterTrees(g, col, { x0: X_W, z0: Z_N, x1: X_E, z1: Z_S }, 4231, 2.8, 0.8, 1.3,
    (px, pz) => px < WEST_KEEP || onRoad(px, pz) || onConn(px, pz) || nearCar(px, pz));

  // ---- coastal forest east of the park -----------------------------------
  // carpet the leftover grass out to the plateau edge; the radial clip keeps
  // trees off the scarp/beach below the grass.
  const offPlateau = (px, pz) => Math.hypot(px, pz) > plateauEdgeR(Math.atan2(pz, px)) - 1.5;
  scatterTrees(g, col, { x0: 750, z0: -230, x1: 795, z1: -125 }, 5150, 4.2, 0.8, 1.4,
    (px, pz) => offPlateau(px, pz));

  // ---- forest east of the prison & north of the trailer park -------------
  // fill the big removed-cell grass wedge (grid cells 14,4 / 14,5 plus the
  // strip east of the prison's building wing) out to the coast, at the same
  // density. Keep-outs: the plateau edge and the prison's fenced L footprint
  // (numbers from prison.js — WX/NZ/MZ/SZ/BEX/YEX, with a fence margin).
  const inPrison = (px, pz) =>
    (px > 562 && px < 629 && pz > -438 && pz < -285) ||   // building wing + fence
    (px > 562 && px < 673 && pz > -291 && pz < -232);     // yard foot + fence
  scatterTrees(g, col, { x0: 628, z0: -440, x1: 795, z1: -232 }, 6180, 4.2, 0.8, 1.4,
    (px, pz) => offPlateau(px, pz) || inPrison(px, pz));
}
