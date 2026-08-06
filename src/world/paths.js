// Hand-placed dirt paths through parks/grass — same waypoint routing as the
// coastal parkway (parkway.js), just a flat decorative strip with no curbs,
// colliders, or dashes. To add or reshape a path, walk to each point
// in-game (player.js logs x/z/th to the console every second) and list the
// waypoints below, in order; corners round the same way the parkway's do
// (see TURN_R in curve.js).
import { buildCurve, sampleTs, ribbon } from '../core/curve.js';

const PATH_W = 5; // dirt path width

// Each path: a name + ordered [x, z] waypoints in world meters, plus an
// optional per-path `turnR` (falls back to TURN_R). Two points make a
// straight line — add more points between them to route the path.
const PATHS = [
  {
    name: 'perimeter',
    points: [
      [-265, -873],
      [-261, -884],
      [-281, -900],
      [-313, -918],
      [-348, -939],
      [-387, -954],
      [-423, -959],
      [-463, -958],
      [-500, -948],
      [-534, -922],
      [-562, -898],
      [-599, -878],
      [-639, -870],
      [-672, -851],
      [-698, -822],
      [-710, -780],
      [-730, -745],
      [-768, -724],
      [-781, -681],
      [-796, -660],
      [-785, -627],
      [-757, -585],
      [-723, -555],
      [-696, -530],
      [-687, -500],
      [-684, -470],
      [-684, -441],
      [-686, -425],
      [-689, -415],
      [-647, -342],
      [-644, -306],
      [-639, -250],
      [-650, -208],
      [-666, -180],
      [-690, -151],
      [-710, -117],
      [-744, -93],
      [-777, -73],
      [-811, -55],
      [-833, -24],
      [-836, 9],
      [-843, 50],
      [-840, 90],
      [-817, 120],
      [-797, 157],
      [-794, 192],
      [-803, 232],
      [-821, 269],
      [-852, 300],
      [-891, 326],
      [-921, 346],
      [-951, 372],
      [-964, 402],
      [-930, 416],
    ],
  },
  {
    name: 'perimeter2',
    points: [
      [-202, 231],
      [-200, 237],
      [-190, 240],
      [-156, 253],
      [-145, 285],
      [-105, 276],
      [-72, 289],
      [-49, 320],
      [-34, 361],
      [-31, 402],
      [-23, 445],
      [-13, 445],
    ],
  },
  {
    name: 'perimeter3',
    points: [
      [452, 775],
      [471, 773],
      [503, 750],
      [536, 729],
      [560, 695],
      [586, 671],
      [594, 629],
      [630, 590],
      [655, 582],
      [680, 568],
      [690, 535],
      [714, 513],
      [754, 497],
      [800, 498],
      [836, 500],
      [866, 485],
      [883, 470],
      [885, 451],
    ],
  },
  {
    name: 'perimeter4',
    points: [
      [657, -440],
      [680, -473],
      [691, -513],
      [674, -548],
      [649, -576],
      [609, -590],
      [573, -590],
      [529, -584],
      [496, -572],
      [456, -559],
      [415, -557],
      [377, -545],
      [343, -525],
      [306, -521],
      [269, -512],
      [238, -490],
      [199, -494],
      [133, -463],
      [123, -463],
    ],
  },
];

export function buildPaths(scene, P) {
  for (const path of PATHS) buildPath(scene, P, path);
}

function buildPath(scene, P, path) {
  if (path.points.length < 2) return;
  const curve = buildCurve(path.points, path.turnR);
  const ts = sampleTs(curve);
  ribbon(scene, curve, ts, -PATH_W / 2, PATH_W / 2, 0.025, P.path);
}
