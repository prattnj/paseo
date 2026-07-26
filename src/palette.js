// Shared colour palette and scale constants for the whole city build.
// Imported as `P` elsewhere: import { PALETTE as P } from './palette.js'.
export const PALETTE = {
  grass: 0x7ec850,
  grassDark: 0x6db24a,
  road: 0x62666e,
  dash: 0xe8eaec,
  sidewalk: 0xb9bec4,
  concrete: 0xcdd2d7,
  concreteDark: 0x9aa0a5,
  path: 0xd9cfb4,
  water: 0x4fb7e8,
  trunk: 0x8d6e63,
  leaf1: 0x4e9b47,
  leaf2: 0x3e7d3a,
  leaf3: 0x67ab3f,
  white: 0xf2f4f5,
  offwhite: 0xe4e1d6,
  window: 0xe8f1f6,
  lampWarm: 0xffcc66, // warm sodium glow for self-lit fixtures (tunnels, lamps)
  glass: 0x3f6d9e,
  glassDark: 0x2c4f77,
  doorDark: 0x4a4440,
  roofLight: 0xd8dbde,
  roofDark: 0x55585e,
  roofRed: 0xc0564a,
  bodies: [0xe04f43, 0x9ccc4e, 0xf4c542, 0xf39a3a, 0x4a90d9, 0x3aa7a3, 0xe07f9a, 0x8bc34a],
  // Neutral trims (window frames, balconies, string courses, pilasters) that
  // read as a contrasting accent against the bright apartment bodies.
  trims: [0xf2f4f5, 0xe4e1d6, 0xd8dbde, 0xcdd2d7, 0xc9bfa8],
  // Window glazing tints an apartment can draw with: cool daylight, warm
  // interior, and dark reflective — mixing these breaks up the uniform look.
  windowTints: [0xe8f1f6, 0xf3e6c6, 0x2c4f77],
  houseBodies: [0xf2f4f5, 0xf5e9d0, 0xa3c9e8, 0xf4c542, 0xcfe3cf, 0xe8b6a8],
  houseRoofs: [0xc0564a, 0x55585e, 0x8d6e63, 0x4a6b8a],
  awnings: [0xe04f43, 0x4a90d9, 0xf4c542, 0x3aa7a3, 0xe07f9a],
  towerBodies: [0xf2f4f5, 0xdde3e8, 0xc9d6d4, 0xe9e4d2],
  carBodies: [0xe04f43, 0x4a90d9, 0xf4c542, 0xf2f4f5, 0x3aa7a3, 0xf39a3a, 0x55585e],
  // construction site: churned dirt, wet mud, gravel, raw rock, rusty rebar,
  // machine yellow/orange and structural steel.
  dirt: 0x8a6d4a,
  dirtDark: 0x6f5636,
  dirtLight: 0x9d8054,
  mud: 0x4b3826,
  gravel: 0x9b948b,
  rock: 0x8c8882,
  rockDark: 0x6f6b65,
  rust: 0x9a5a34,
  constrYellow: 0xf2b600,
  constrOrange: 0xe4622a,
  steel: 0x565d67,
  // WW2-era manufacturing plant: weathered red brick in a few soot-graded
  // shades, grimy factory glazing, and charred/blown-out voids.
  brick: 0x9c4a38,
  brickDark: 0x6e3325,   // shadowed courses, plinths, buttress sides
  brickLight: 0xb35c44,  // sun-caught brick, corbel bands
  brickSoot: 0x4a352c,   // heavily soot-stained brick around the stacks
  factoryGlass: 0x33414d, // grimy multi-pane industrial glazing
  sootBlack: 0x1c1712,   // charred beams, blown-out window voids, burnt interior
  testRed: 0xff0000,
  testYellow: 0xffff00,
  testCyan: 0x00ffff,
  testDarkGray: 0x444444,
  testWhite: 0xffffff,
  testDarkGreen: 0x003311,
  testOrange: 0xdd9911,
};

// Ground-plane scale constants (render heights / widths).
export const SIDEWALK_H = 0.15;
export const INSET = 3; // sidewalk band width
