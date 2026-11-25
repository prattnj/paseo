// economy.js — THE one place to tune every coin / XP amount in the game.
//
// Everything that costs or pays out lives here: the player's starting balance,
// what each vehicle costs to unlock, the XP-per-level curve, and the XP reward +
// reveal style of every achievement. Adjust the numbers in this file and nothing
// else — the wallet (coins.js), the unlock gate (unlocks.js), the level meter
// (levels.js) and the achievement engine (achievements.js) all read from here.
//
// Two separate tracks: COINS are the spendable wallet (unlock vehicles); XP is
// progression. Achievements pay XP; leveling up pays COINS — so leveling is the
// game's only coin source and feeds the vehicle paywall.
//
// ---- adding an achievement ------------------------------------------------
// Append an entry to ACHIEVEMENTS with:
//   id          stable unique key (also the localStorage marker) — never reuse
//   name        the fun title shown in the pause menu
//   description what the player did to earn it
//   xp          XP granted, once, the moment it's earned (scale with effort)
//   reveal      how it looks in the list BEFORE it's earned:
//                 'visible' — name + description both shown (a goal to chase)
//                 'name'    — name shown, description hidden as "???"
//                             (a cryptic hint: read the title and guess)
//                 'hidden'  — name AND description hidden as "???"
//                             (a secret; only revealed once earned)
//   check(c)    predicate run every frame; return true to award it. `c` is the
//               live context { stats, player, coins, unlocks }:
//                 stats.hasDriven          ever sat in any car
//                 stats.driveDist          metres driven (any car), cumulative
//                 stats.walkDist           metres travelled on foot, cumulative
//                 stats.topSpeed           best speed ever hit, mph
//                 stats.distFromSpawn      current distance from the spawn point
//                 stats.drivenTypes        Set of car types ever driven
//                 player.evt.airborne      # times a driven car went airborne
//                 player.evt.flips         # times the player flipped a car
//                 player.evt.drowns        # times the player went under water
//                 player.evt.tankHits      # pedestrians mown down in the tank
//                 player.inMud             on foot in the construction-site mud
//                 player.pos               live {x,y,z} (for location checks)
//                 coins.balance            current wallet
//                 unlocks.isUnlocked(type) 'tank' / 'dragster' bought?
//                 dt / now                 frame delta + elapsed active seconds
//                 mem                       a private per-achievement scratch
//                                           object — persist dwell timers, sets,
//                                           and sequence state across frames here
//                 balls.balls              live pushable soccer balls [{x,z,…}]
//                 zones                     BALL_ZONES target rects (goals/field)
//                 peds                      the pedestrian system
// Earned achievements are always shown in full regardless of `reveal`.

export const ECON = {
  // What the player starts with on a fresh save (localStorage empty).
  // Bump this temporarily if you want to test unlocks without grinding.
  startingCoins: 0,

  // Cost to permanently unlock driving each special vehicle. Any car type NOT
  // listed here is free to drive (normal traffic, trucks, police, fire trucks).
  unlockCost: {
    tank: 500,
    dragster: 750,
  },

  // ---- XP / leveling (see levels.js) --------------------------------------
  // The curve is ESCALATING: level N → N+1 costs `baseXP + stepXP*(N-1)` XP, so
  // early levels come fast and later ones stretch out. Each level-up pays a coin
  // bonus of `coinBase + coinStep*(level-2)` (so reaching L2 pays coinBase, L3
  // pays coinBase+coinStep, …) — the wallet's only income.
  levels: {
    baseXP: 100,   // XP to go from level 1 → 2
    stepXP: 50,    // each further level needs this much more XP than the last
    coinBase: 100, // coins paid on reaching level 2
    coinStep: 100, // extra coins paid per level beyond that
  },
};

// Friendly names for the special vehicles (used in the buy prompt / hint).
export const VEHICLE_NAMES = {
  tank: 'Tank',
  dragster: 'Dragster',
};

// ---- location anchors for the world-aware achievements --------------------
// Hand-authored world coordinates (metres), matching the builders in
// src/world. Adjust here if a landmark ever moves. Radii are generous so the
// check trips anywhere sensible "at" the spot, not on a single pixel.
const STORE_INSIDE_X = 3000;                   // Hansen's interior room is parked at x=4000, far off-map
const HILL_GAZEBO = { x: -241, z: -144 };      // gazebo on the central-park summit (island.js HILL)
const CATHEDRAL = { x: 500, z: -57.5 };        // church block (grid cell 12,7)
const MOSQUE = { x: 170, z: 500 };             // mosque block (grid cell 9,12)
const POO_MAN = { x: 145, z: 255 };            // statue in the NW quarter of cell 9,10
const SHIPWRECK = { x: 604, z: 820, deckY: -4 }; // NE-beach wreck; its deck sits well above the sand (~-6.5)
const MANSION_PORCH = { x0: -733, x1: -726, z0: -675, z1: -645 }; // portico terrace, east front of the manor
// three old-town blocks strung along z≈170 (grid cells 5–7, j=9)
const OLDTOWN_Z = [115, 225];
const OLDTOWN = [
  { id: 5, x0: -335, x1: -225 },
  { id: 6, x0: -225, x1: -115 },
  { id: 7, x0: -115, x1: 0 },
];
// baseball diamond: home plate (788,-18); a 90ft square opening to the NE. The
// circuit is home → 1st → 2nd → 3rd → home (bases[0] and bases[4] are home).
const BASES = [[788, -18], [815.43, -18], [815.43, -45.43], [788, -45.43], [788, -18]];

// small check helpers
const near = (p, x, z, r) => Math.hypot(p.pos.x - x, p.pos.z - z) < r;
const inRect = (x, z, r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

export const ACHIEVEMENTS = [
  // ==== visible: name + description shown up front (goals to chase) ====
  {
    id: 'first-drive', name: 'Hit the Road',
    description: 'Get behind the wheel of any car.',
    xp: 25, reveal: 'visible',
    check: (c) => c.stats.hasDriven,
  },
  {
    id: 'lead-foot', name: 'Lead Foot',
    description: 'Hit 50 mph.',
    xp: 40, reveal: 'visible',
    check: (c) => c.stats.topSpeed >= 50,
  },
  {
    id: 'sunday-driver', name: 'Sunday Driver',
    description: 'Drive a total of 5 km around town.',
    xp: 80, reveal: 'visible',
    check: (c) => c.stats.driveDist >= 5000,
  },
  {
    id: 'pavement-pounder', name: 'Pavement Pounder',
    description: 'Cover 2 km on foot.',
    xp: 60, reveal: 'visible',
    check: (c) => c.stats.walkDist >= 2000,
  },
  {
    id: 'hansens', name: 'Aisle Be Back',
    description: "Step inside Hansen's grocery.",
    xp: 40, reveal: 'visible',
    check: (c) => c.player.pos.x > STORE_INSIDE_X, // teleported into the far-off interior room
  },
  {
    id: 'two-faiths', name: 'Interfaith',
    description: 'Visit both the cathedral and the mosque.',
    xp: 80, reveal: 'visible',
    check: (c) => {
      const m = c.mem, p = c.player;
      if (near(p, CATHEDRAL.x, CATHEDRAL.z, 45)) m.cath = true;
      if (near(p, MOSQUE.x, MOSQUE.z, 45)) m.mosq = true;
      return !!(m.cath && m.mosq);
    },
  },
  {
    id: 'oldtown-two', name: 'Cobblestone Wanderer',
    description: 'Set foot in at least two blocks of old town.',
    xp: 60, reveal: 'visible',
    check: (c) => {
      const m = c.mem, p = c.player;
      if (!m.blocks) m.blocks = new Set();
      if (p.pos.z >= OLDTOWN_Z[0] && p.pos.z <= OLDTOWN_Z[1]) {
        for (const cell of OLDTOWN) if (p.pos.x >= cell.x0 && p.pos.x <= cell.x1) m.blocks.add(cell.id);
      }
      return m.blocks.size >= 2;
    },
  },
  {
    id: 'poo-respects', name: 'Duty Calls',
    description: 'Pay your respects at the Poo Man memorial for two minutes.',
    xp: 150, reveal: 'visible',
    check: (c) => {
      const m = c.mem;
      m.t = near(c.player, POO_MAN.x, POO_MAN.z, 20) ? (m.t || 0) + c.dt : 0;
      return m.t >= 120;
    },
  },
  {
    id: 'both-firetrucks', name: 'Two-Alarm Fire',
    description: 'Drive both fire trucks.',
    xp: 90, reveal: 'visible',
    check: (c) => c.stats.drivenTypes.has('ladder') && c.stats.drivenTypes.has('pumper'),
  },
  {
    id: 'both-pitches', name: 'Home and Away',
    description: 'Score a goal at both neighbourhood soccer pitches.',
    xp: 150, reveal: 'visible',
    check: (c) => {
      if (!c.balls) return false;
      const m = c.mem;
      if (!m.fields) m.fields = new Set();
      for (const b of c.balls.balls)
        for (const z of c.zones)
          if (z.type === 'goal' && inRect(b.x, b.z, z)) m.fields.add(z.field);
      return m.fields.size >= 2;
    },
  },

  // ==== cryptic: fun name shown, the "how" is left to the player ====
  {
    id: 'redline', name: 'Redline',
    description: 'Reach a blistering 150 mph.',
    xp: 250, reveal: 'name',
    check: (c) => c.stats.topSpeed >= 150,
  },
  {
    id: 'dukes', name: 'Dukes of Hazzard',
    description: 'Launch a car clean off the ground.',
    xp: 120, reveal: 'name',
    check: (c) => c.player.evt.airborne >= 1,
  },
  {
    id: 'sleep-fishes', name: 'Sleep with the Fishes',
    description: 'Take a swim you won’t walk away from.',
    xp: 50, reveal: 'name',
    check: (c) => c.player.evt.drowns >= 1,
  },
  {
    id: 'long-arm', name: 'Long Arm of the Law',
    description: 'Commandeer a police cruiser.',
    xp: 75, reveal: 'name',
    check: (c) => c.stats.drivenTypes.has('police'),
  },
  {
    id: 'hill-gazebo', name: 'King of the Hill',
    description: 'Reach the gazebo atop the central-park hill.',
    xp: 70, reveal: 'name',
    // the hill is solid terrain — being within 8m of its centre means you're up
    // on the narrow summit, not standing inside the slope.
    check: (c) => near(c.player, HILL_GAZEBO.x, HILL_GAZEBO.z, 8),
  },
  {
    id: 'shipwreck-deck', name: 'Upper Decker',
    description: 'Climb onto the deck of the beached shipwreck.',
    xp: 70, reveal: 'name',
    check: (c) => near(c.player, SHIPWRECK.x, SHIPWRECK.z, 20) && c.player.pos.y > SHIPWRECK.deckY,
  },
  {
    id: 'tank-ped', name: 'Tiananmen Square',
    description: 'Run down a pedestrian in the tank.',
    xp: 90, reveal: 'name',
    check: (c) => c.player.evt.tankHits >= 1,
  },
  {
    id: 'home-run', name: 'Home Run',
    description: 'Round all the bases in under 20 seconds.',
    xp: 130, reveal: 'name',
    check: (c) => {
      const m = c.mem, p = c.player;
      if (p.car) { m.i = 0; return false; }        // on foot only
      if (!m.i) m.i = 0;
      if (m.i > 0 && c.now - m.t0 > 20) m.i = 0;    // ran out of time — start over
      const b = BASES[m.i];
      if (Math.hypot(p.pos.x - b[0], p.pos.z - b[1]) < 4) {
        if (m.i === 0) m.t0 = c.now;                // clock starts as you leave home
        m.i++;
        if (m.i >= BASES.length) { m.i = 0; return c.now - m.t0 <= 20; }
      }
      return false;
    },
  },
  {
    id: 'manor-porch', name: 'Squatter\'s Rights',
    description: 'Hang out on the manor porch for 30 seconds.',
    xp: 100, reveal: 'name',
    check: (c) => {
      const m = c.mem;
      m.t = inRect(c.player.pos.x, c.player.pos.z, MANSION_PORCH) ? (m.t || 0) + c.dt : 0;
      return m.t >= 30;
    },
  },

  // ==== fully hidden secret ====
  {
    id: 'wrong-football', name: 'Wrong Kind of Football',
    description: 'Boot a soccer ball onto the football field.',
    xp: 120, reveal: 'hidden',
    check: (c) => !!c.balls && c.balls.balls.some((b) =>
      c.zones.some((z) => z.type === 'field' && z.tag === 'football' && inRect(b.x, b.z, z))),
  },
];
