// Hand-authored city layout. Everything here is explicit, fixed data —
// the city is identical on every load.
//
// Coordinates are meters. The city spans -640..640 on both axes.
// Grid "lines" are road centerlines; blocks live between them.

export const GRID = [-640, -500, -380, -260, -140, 0, 140, 260, 380, 500, 640];

export function roadWidth(c) {
  if (Math.abs(c) === 640) return 14; // ring road
  if (c === 0) return 18;             // main avenues
  return 10;
}

// Road segments deleted to break up the pure grid.
// Each entry: { axis: 'x'|'z', at: centerline, from, to }
//  axis 'x' means a north-south road at x = at, spanning z in [from, to].
export const DELETED = [
  // Central Park superblock interior roads (park spans x[-380,-140], z[-260,0])
  { axis: 'x', at: -260, from: -260, to: 0 },
  { axis: 'z', at: -140, from: -380, to: -140 },
  // Industrial superblock (SE)
  { axis: 'x', at: 500, from: 380, to: 500 },
  // East side variety
  { axis: 'z', at: -380, from: 500, to: 640 },
  // Segments swallowed by the traced coastline (both flanking cells removed;
  // derived from REMOVED_CELLS below by tmp-trace.py)
  { axis: 'z', at: -500, from: 140, to: 260 },
  { axis: 'x', at: -500, from: 260, to: 380 },
  { axis: 'x', at: -500, from: 380, to: 500 },
  { axis: 'x', at: -500, from: 500, to: 640 },
  { axis: 'z', at: -500, from: 500, to: 640 },
  { axis: 'x', at: -380, from: 260, to: 380 },
  { axis: 'x', at: -380, from: 380, to: 500 },
  { axis: 'x', at: -380, from: 500, to: 640 },
  { axis: 'z', at: -380, from: 500, to: 640 },
  { axis: 'z', at: -260, from: -640, to: -500 },
  { axis: 'x', at: -260, from: 140, to: 260 },
  { axis: 'x', at: -260, from: 260, to: 380 },
  { axis: 'x', at: -260, from: 380, to: 500 },
  { axis: 'x', at: -260, from: 500, to: 640 },
  { axis: 'x', at: -140, from: 260, to: 380 },
  { axis: 'x', at: -140, from: 380, to: 500 },
  { axis: 'x', at: -140, from: 500, to: 640 },
  { axis: 'x', at: 140, from: -640, to: -500 },
  { axis: 'x', at: 260, from: -640, to: -500 },
  { axis: 'z', at: 260, from: -380, to: -260 },
  { axis: 'z', at: 260, from: -260, to: -140 },
  { axis: 'x', at: 380, from: -640, to: -500 },
  { axis: 'z', at: 380, from: -640, to: -500 },
  { axis: 'z', at: 380, from: -500, to: -380 },
  { axis: 'z', at: 380, from: -380, to: -260 },
  { axis: 'z', at: 380, from: -260, to: -140 },
  { axis: 'z', at: 380, from: -140, to: 0 },
  { axis: 'x', at: 500, from: -640, to: -500 },
  { axis: 'z', at: 500, from: -640, to: -500 },
  { axis: 'z', at: 500, from: -500, to: -380 },
  { axis: 'z', at: 500, from: -380, to: -260 },
  { axis: 'z', at: 500, from: -260, to: -140 },
  { axis: 'z', at: 500, from: -140, to: 0 },
];

// Grid cells swallowed by the sea (the traced coast passes within 15m of
// them) — no blocks are built there; the leftover land is green belt.
export const REMOVED_CELLS = new Set([
  '0,2', '0,3', '0,7', '0,8', '0,9',
  '1,7', '1,8', '1,9',
  '2,6', '2,7', '2,8', '2,9',
  '3,6', '3,7', '3,8', '3,9',
  '4,7', '4,8', '4,9',
  '5,0', '6,0', '6,1', '7,0', '8,0',
  '9,0', '9,1', '9,2', '9,9',
]);

function isDeleted(axis, at, from, to) {
  return DELETED.some(
    (d) => d.axis === axis && d.at === at && from >= d.from - 0.5 && to <= d.to + 0.5
  );
}

// Build the list of road segments: { axis, at, from, to, width }
export function buildRoads() {
  const roads = [];
  for (const at of GRID) {
    // the old ±640 ring road is replaced by the coastal parkway (parkway.js)
    if (Math.abs(at) === 640) continue;
    for (let j = 0; j < GRID.length - 1; j++) {
      const from = GRID[j], to = GRID[j + 1];
      if (!isDeleted('x', at, from, to)) {
        roads.push({ axis: 'x', at, from, to, width: roadWidth(at) });
      }
      if (!isDeleted('z', at, from, to)) {
        roads.push({ axis: 'z', at, from, to, width: roadWidth(at) });
      }
    }
  }
  return roads;
}

// ---- blocks -------------------------------------------------------------
// A block: { x0, z0, x1, z1, type, id }
// Special (hand-placed) blocks are listed first and override the district rule.

const SPECIALS = [
  // Central Park superblock (covers 2x2 grid cells; interior roads deleted above)
  { ix0: 2, iz0: 3, ix1: 4, iz1: 5, type: 'park-central' },
  { ix0: 5, iz0: 4, ix1: 6, iz1: 5, type: 'plaza' },        // x 0..140, z -140..0
  { ix0: 6, iz0: 4, ix1: 7, iz1: 5, type: 'cityhall' },     // x 140..260, z -140..0
  { ix0: 4, iz0: 5, ix1: 5, iz1: 6, type: 'firestation' },  // x -140..0, z 0..140
  { ix0: 1, iz0: 5, ix1: 2, iz1: 6, type: 'church' },       // old town
  { ix0: 7, iz0: 2, ix1: 8, iz1: 3, type: 'park' },         // NE pocket park
  { ix0: 1, iz0: 6, ix1: 2, iz1: 7, type: 'park' },         // SW pocket park (by the green belt)
  { ix0: 8, iz0: 8, ix1: 10, iz1: 9, type: 'industrial-big' }, // SE superblock (road deleted)
];

function districtOf(cx, cz) {
  if (Math.abs(cx) <= 210 && Math.abs(cz) <= 210) return 'downtown';
  if (cz < -300) return 'apartments';
  if (cz > 300 && cx < 0) return 'suburb';
  if (cz > 300 && cx >= 0) return 'industrial';
  if (cx < -300) return 'oldtown';
  if (cx > 300) return 'mixed';
  return 'midrise';
}

export function cellRect(ix0, iz0, ix1, iz1) {
  const x0 = GRID[ix0] + roadWidth(GRID[ix0]) / 2;
  const x1 = GRID[ix1] - roadWidth(GRID[ix1]) / 2;
  const z0 = GRID[iz0] + roadWidth(GRID[iz0]) / 2;
  const z1 = GRID[iz1] - roadWidth(GRID[iz1]) / 2;
  return { x0, z0, x1, z1 };
}

export function buildBlocks() {
  const blocks = [];
  const covered = new Set();

  let id = 0;
  for (const s of SPECIALS) {
    const r = cellRect(s.ix0, s.iz0, s.ix1, s.iz1);
    blocks.push({ ...r, type: s.type, id: id++ });
    for (let i = s.ix0; i < s.ix1; i++)
      for (let j = s.iz0; j < s.iz1; j++) covered.add(i + ',' + j);
  }

  for (let i = 0; i < GRID.length - 1; i++) {
    for (let j = 0; j < GRID.length - 1; j++) {
      if (covered.has(i + ',' + j) || REMOVED_CELLS.has(i + ',' + j)) continue;
      const r = cellRect(i, j, i + 1, j + 1);
      const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      blocks.push({ ...r, type: districtOf(cx, cz), id: id++ });
    }
  }
  return blocks;
}
