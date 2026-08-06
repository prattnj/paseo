// Hand-authored city layout. Everything here is explicit, fixed data —
// the city is identical on every load.
//
// Coordinates are meters. Grid lines span -885..885 on both axes. Every
// block (the buildable area between curbs) is a uniform 100x100 square:
// grid lines sit 110m apart (100 + 5 + 5 curb halves) except on either
// side of the x=0/z=0 avenues, which sit 115m apart (100 + 5 + 10, since
// the avenue is twice as wide). The grid is a full square of potential
// cells, but only the cells that fit inside the coastal parkway are built;
// outer cells that would reach the parkway are listed in REMOVED_CELLS, so
// the built city is a rounded blob that follows the island out to (but
// never across) the parkway. Grid "lines" are road centerlines; blocks
// live between them.

export const GRID = [
  -885, -775, -665, -555, -445, -335, -225, -115, 0,
  115, 225, 335, 445, 555, 665, 775, 885, 995
];

export function roadWidth(c) {
  return c === 0 ? 20 : 10; // main avenues are twice as wide as ordinary streets
}

// Outer grid boundary — no road is drawn on this line itself; the coastal
// parkway (parkway.js) is the outermost road.
export const EDGE = GRID[GRID.length - 1];

// Road segments deleted to break up the pure grid. Only hand-authored
// superblock interiors live here now; road segments whose BOTH flanking
// cells are removed (coast-swallowed / beyond-the-city gaps) are dropped
// automatically by buildRoads() below.
// Each entry: { axis: 'x'|'z', at: centerline, from, to }
//  axis 'x' means a north-south road at x = at, spanning z in [from, to].
export const DELETED = [
  // Central Park superblock interior roads (park spans x[-335,-115], z[-225,0])
  { axis: 'x', at: -225, from: -225, to: 0 },
  { axis: 'z', at: -115, from: -335, to: -115 },
  // Plaza superblock interior roads (plaza spans x[0,225], z[-225,0])
  { axis: 'x', at: 115, from: -225, to: 0 },
  { axis: 'z', at: -115, from: 0, to: 225 },
  // Construction superblock interior roads (spans x[445,665], z[335,555])
  { axis: 'x', at: 555, from: 335, to: 555 },
  { axis: 'z', at: 445, from: 445, to: 665 },
];

// Grid cells NOT built (no block): the sea-swallowed inner cells plus every
// outer cell that would reach the coastal parkway. Generated to keep each
// built cell safely inside the parkway; see the header note. Indexed
// (i,j) = (x cell, z cell), 0..15 on each axis.
export const REMOVED_CELLS = new Set([
  '0,0', '1,0', '2,0', '3,0', '4,0', '5,0', '6,0', '7,0', '8,0', '9,0', '10,0', '11,0', '12,0', '13,0', '14,0', '15,0', '16,0',
  '0,1', '1,1', '6,1', '7,1', '8,1', '9,1', '10,1', '11,1', '12,1', '13,1', '14,1', '15,1', '16,1',
  '0,2', '1,2', '7,2', '8,2', '9,2', '10,2', '11,2', '12,2', '13,2', '14,2', '15,2', '16,2',
  '0,3', '1,3', '8,3', '9,3', '10,3', '11,3', '12,3', '13,3', '14,3', '15,3', '16,3',
  '0,4', '1,4', '2,4', '13,4', '14,4', '15,4', '16,4',
  '0,5', '1,5', '2,5', '13,5', '14,5', '15,5', '16,5',
  '0,6', '1,6', '2,6', '14,6', '15,6', '16,6',
  '0,7', '1,7', '15,7', '16,7',
  '0,8', '16,8',
  '0,9', '16,9',
  '0,10', '1,10', '2,10', '3,10', '4,10', '5,10', '6,10', '7,10', '16,10',
  '0,11', '1,11', '2,11', '3,11', '4,11', '5,11', '6,11', '7,11', '16,11',
  '0,12', '1,12', '2,12', '3,12', '4,12', '5,12', '6,12', '7,12', '14,12', '15,12', '16,12',
  '0,13', '1,13', '2,13', '3,13', '4,13', '5,13', '6,13', '7,13', '13,13', '14,13', '15,13', '16,13',
  '0,14', '1,14', '2,14', '3,14', '4,14', '5,14', '6,14', '7,14', '12,14', '13,14', '14,14', '15,14', '16,14',
  '0,15', '1,15', '2,15', '3,15', '4,15', '5,15', '6,15', '7,15', '8,15', '9,15', '10,15', '11,15', '12,15', '13,15', '14,15', '15,15', '16,15',
  '0,16', '1,16', '2,16', '3,16', '4,16', '5,16', '6,16', '7,16', '8,16', '9,16', '10,16', '11,16', '12,16', '13,16', '14,16', '15,16', '16,16',
]);

const cellIdx = (v) => GRID.indexOf(v);
const isRemoved = (i, j) => i < 0 || j < 0 || i >= GRID.length - 1 || j >= GRID.length - 1
  || REMOVED_CELLS.has(i + ',' + j);

function isDeleted(axis, at, from, to) {
  if (DELETED.some((d) => d.axis === axis && d.at === at && from >= d.from - 0.5 && to <= d.to + 0.5)) {
    return true;
  }
  // drop a segment whose BOTH flanking cells are absent (sea / beyond-city
  // gaps): nothing to serve, and it must never poke out toward the parkway.
  const m = cellIdx(at), j = cellIdx(from);
  if (m < 0 || j < 0) return false;
  return axis === 'x'
    ? isRemoved(m - 1, j) && isRemoved(m, j)   // west & east of the N-S line
    : isRemoved(j, m - 1) && isRemoved(j, m);  // north & south of the E-W line
}

// Build the list of road segments: { axis, at, from, to, width }
export function buildRoads() {
  const roads = [];
  for (const at of GRID) {
    if (Math.abs(at) === EDGE) continue;
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
// Block CONTENT (which cell is what, and how it's built) now lives in the
// CITY map in city.js, keyed by grid index. layout.js only owns the grid
// geometry: cellRect turns cell indices into a world rectangle.

export function cellRect(ix0, iz0, ix1, iz1) {
  const x0 = GRID[ix0] + roadWidth(GRID[ix0]) / 2;
  const x1 = GRID[ix1] - roadWidth(GRID[ix1]) / 2;
  const z0 = GRID[iz0] + roadWidth(GRID[iz0]) / 2;
  const z1 = GRID[iz1] - roadWidth(GRID[iz1]) / 2;
  return { x0, z0, x1, z1 };
}

// Grid cell (i, j) containing (x, z), or null if the point is on a road, off
// the grid entirely, or inside a removed (unbuilt/sea) cell.
export function gridCellAt(x, z) {
  const i = GRID.findIndex((v, idx) => idx < GRID.length - 1 && x >= GRID[idx] && x < GRID[idx + 1]);
  const j = GRID.findIndex((v, idx) => idx < GRID.length - 1 && z >= GRID[idx] && z < GRID[idx + 1]);
  if (i < 0 || j < 0 || REMOVED_CELLS.has(i + ',' + j)) return null;
  const { x0, z0, x1, z1 } = cellRect(i, j, i + 1, j + 1);
  if (x < x0 || x > x1 || z < z0 || z > z1) return null; // in the road/curb gap
  return { i, j };
}
