# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Paseo (title screen: "NOSH CITY") is a browser walking/driving sim of a
hand-authored low-poly island city, built with **Vite** and **three.js**
(`import * as THREE from 'three'`). There is no framework, router, or test
suite — it is a single ES-module bundle mounted in `index.html`
(`<script type="module" src="/src/main.js">`).

## Commands

- `npm install` — install dependencies.
- `npm run dev` — Vite dev server with HMR (primary workflow).
- `npm run build` — production build to `dist/`.
- `npm run preview` — serve the built `dist/`.

There is no linter or automated test suite. Verify changes by running
`npm run dev` and observing the scene. `main.js` exposes
`window.__game = { player, traffic, peds, pooManHero, groundHeight, nearestBeach,
renderer, scene, camera }` as a console hook for manual debugging. `player.js`
logs the player's `x/z/th` to the console every second — use it to capture
waypoints when authoring routes. `vite.config.js` allows the `*.noahpratt.com`
hosts for remote dev/preview. `scripts/measure.mjs` is a headless
puppeteer-core harness that loads the dev server and prints draw calls,
triangles, and node counts — use it to check a change didn't regress rendering
cost (`node scripts/measure.mjs`, dev server must be up).

## The one hard rule: determinism

**The city is hand-authored and must be identical on every load. `Math.random`
is banned anywhere in the project.** All "variety" (placement, colors, sizes,
jitter) comes from coordinate-seeded hashes in `src/core/util.js`:

- `hash(a,b,c)`, `frac(a,b,c)` → `[0,1)`, `pick(arr,a,b,c)`.
- Seed from stable inputs (grid indices, world coordinates, block id) so the
  same spot always produces the same result.
- Caveat: `frac(seed,k,c)` values that differ **only** in `c` are correlated (2D
  scatter collapses onto a diagonal). Decorrelate a 2D pair with a nested hash,
  e.g. `frac(hash(seed,k,1),5)` / `frac(hash(seed,k,2),9)`.

## Architecture / data flow

`src/` is organized into layers by folder:

- `src/main.js` — the single entry point (`index.html` loads `/src/main.js`).
- `src/core/` — engine utilities, no world knowledge: `geo.js` (the `GeoBatch`
  instancing layer), `merge.js` (static-mesh merger), `collision.js`, `curve.js`,
  `util.js` (the determinism hashes), `palette.js` (colors), `minimap.js`,
  `settings.js` (persisted player preferences + the pause-menu Settings panel;
  add a setting as a row in its `SETTINGS` schema and handle the key in
  `main.js` `applySetting`).
- `src/world/` — the hand-authored static world: `layout.js`, `coast-data.js`,
  `island.js`, `parkway.js`, `paths.js`, `city.js`, `balls.js`.
  - `src/world/blocks/` — per-grid-cell block builders + shared helpers (below).
  - `src/world/landmarks/` — one-off hand-placed set pieces dispatched from
    `city.js`: `arena`, `prison`, `trailerpark`, `manor`, `hedgerow`, `baseball`,
    `roman-ruins`, `flatiron`, `dragstrip`, `factory`, `foodtrucks`, `store`,
    `garden`, `tank`, `shipwreck`, `lighthouse`, `forest`. Add a landmark by
    creating the file and calling its builder from `buildCity` in `city.js`.
- `src/actors/` — the moving/animated entities: `player.js`, `traffic.js`,
  `peds.js`, and the shared `character.js` humanoid.
- `src/fx/` — ambient animated extras: `poo-man-hero.js`, `speakers.js`.

Everything is assembled once in `src/main.js`: it creates the renderer, scene,
lights, a shared `Colliders` instance, builds the world, runs `mergeStatic` to
collapse the static meshes (see Rendering conventions), constructs the actors,
spawns balls from `BALL_SPAWNS`, and runs a single `requestAnimationFrame` loop
that updates the player/traffic/peds/balls, the HUD, and the shadow camera, then
renders.

World geometry is **data-driven and layered**, each layer reading from the one
below:

- `src/world/layout.js` — source of truth for the street grid: `GRID` centerlines,
  `roadWidth`, `DELETED` road segments, `REMOVED_CELLS` (cells swallowed by the
  sea / outside the parkway), `SPECIALS` (hand-placed blocks), and `districtOf`
  (assigns a district type to each remaining cell). Exposes `buildRoads()`,
  `buildBlocks()`, `cellRect()`.
- `src/world/coast-data.js` — 720-sample traced coastline: `COAST[]`
  (plateau-edge radius per angle) and `SAND[]` (beach width). Consumed by
  `island.js` and `parkway.js`, which both use `N = 720` angular samples to stay
  aligned.
- `src/world/island.js` — builds island terrain from the polar coastline (plateau →
  rocky scarp → sand beach → wading slope → sea floor). Exports the terrain
  query `groundHeight(x,z)` used everywhere for placement and physics, plus
  `nearestBeach`, `HILL`, `POND`, `ISLETS`, and vertical constants (`TOP_Y`,
  `BEACH_Y`, `WATER_Y`).
- `src/world/parkway.js` — the curved coastal ring road hugging the plateau edge
  with authored pocket-park windows. The grid stops short of it everywhere (via
  `REMOVED_CELLS`) so the two road networks never intersect.
- `src/world/city.js` — orchestrates the static build into batched meshes,
  dispatching per-block builders via a `CITY` map and owning the `PARKED` car
  list.
- `src/world/blocks/` — the per-cell block builders and their shared helpers (this
  was formerly the monolithic `buildings.js`). One file per block type
  (`downtown.js`, `apartments.js`, `suburb-a.js`, `mosque.js`, …) plus three
  shared modules and a barrel:
  - `blocks/props.js` — small placeable props/furniture (`tree`, `bench`,
    `lamp`, `flowerBed`, `parkedCar`, `kiosk`, …), also shared with the
    parkway/paths builders.
  - `blocks/pieces.js` — reusable multi-part building archetypes (`apartment`,
    `tower`, `house`/`house2`, `shop`, `bigBuilding`, `column`/`archHeader`).
  - `blocks/kit.js` — block scaffolding & site work (`slabAndSidewalk`,
    `parkingLotAt`, `cornerLamps`, `streetTrees`, `wallSign`, `ironFence`).
  - `blocks/index.js` — barrel re-exporting the public API that `city.js`
    dispatches (and `landmarks/`/`actors/traffic.js` consume). Add a new block
    type by creating `blocks/<type>.js` and re-exporting its builder here.
- `src/core/palette.js` — the shared color `PALETTE` (imported as `P`) and scale
  constants (`SIDEWALK_H`, `INSET`, …). **Colors live here, not in `city.js`.**
- `src/core/curve.js` — shared "rounded polyline" route helpers (`buildCurve`,
  `sampleTs`, `ribbon`, `TURN_R`) for any authored route through the world.
- `src/world/paths.js` — hand-placed dirt paths through parks/grass, using the
  same waypoint routing as the parkway.
- `src/world/balls.js` — large pushable soccer balls (kinematic, outside the
  static collider world); `BALL_SPAWNS` is filled by the city builder and read in
  `main.js`.

Actors (`actors/player.js`, `actors/traffic.js`, `actors/peds.js`) and the
shared `actors/character.js` humanoid layer on top, all querying `groundHeight`
and the shared colliders. `src/core/minimap.js` redraws the same
layout/island/parkway data top-down for the HUD.

## Rendering conventions

The frame's real bottleneck is **node count** (per-object matrix + frustum +
draw-call cost), not raw triangles — the scene is low-poly but sprawling. Three
mechanisms keep node count down; prefer them over standalone meshes:

- **`src/core/geo.js` `GeoBatch`** is the batching layer for all static city
  geometry: it collects primitives (`box`, `boxB`, `prism`, `cyl`, `cone`,
  `ico`) and `build()`s them into a few `InstancedMesh`es (one per template)
  with per-instance colors. Prefer adding to a `GeoBatch` over standalone meshes
  for static parts. Instanced meshes set `frustumCulled = false` because
  instances span the whole city. `box`/`boxB` take a trailing `caster` flag —
  pass `false` for flat ground decals (roads, lane dashes, crosswalk stripes,
  sidewalks) so they are split into a **non-shadow-casting** InstancedMesh and
  never render into the sun's 4096² shadow map (they only receive shadows).
- **`src/core/merge.js` `mergeStatic(scene)`** runs once in `main.js` after every
  static builder and *before* any actor/animated object is added. It bakes the
  ~1600 loose landmark/terrain `THREE.Mesh` nodes into a few merged meshes per
  material (bucketed by a coarse spatial cell so they still frustum-cull),
  collapsing draw calls in both the main and shadow passes with pixel-identical
  output. Only opaque, untextured Lambert/Basic meshes are touched; transparent
  (water), textured, multi-material, and instanced meshes, and anything tagged
  `mesh.userData.noMerge`, are left alone. A landmark can therefore just add
  plain meshes and rely on the merge — but funnelling through `GeoBatch` is still
  cheaper when the primitive fits.
- **Merged rigid bodies** — `actors/traffic.js` `mergeCar` and `actors/character.js`
  `mergeBoxes` bake a car / a humanoid's non-moving parts into ONE
  vertex-coloured mesh (only the humanoid's four swinging limbs stay separate),
  so ~1500 cars and ~250 peds are ~1 node each + limbs instead of thousands of
  boxes. Parked cars also toggle `castShadow` off while stationary
  (`setCarShadow`).

- Materials are `MeshLambertMaterial` with `flatShading: true` for the faceted
  low-poly look; `actors/character.js` `mat(hex)` caches per-color materials.
  Merged meshes use one shared `vertexColors: true` material — visually identical
  under `flatShading`.
- Use named colors from `core/palette.js` `PALETTE` rather than new hex literals.

## Collision conventions (`src/core/collision.js`)

- `Colliders` is a spatial-hash box world. `add(cx, y, cz, sx, sy, sz, ry)` adds
  a box whose **base sits at `y`**. Only near-90° yaws collapse to an exact
  axis-aligned box; other yaws are stored as an OBB.
- **Rotation is snapped to 90° quarters unless stored as an OBB** — an
  arbitrarily rotated building must either be added as a single OBB or decomposed
  into small axis-aligned cells covering its footprint.
- `movePlayer(...)` resolves the player capsule against boxes + terrain with curb
  step-up, steep-rock climb refusal, and ground-stick; keep terrain queries going
  through `groundHeight`.

## Working in this codebase

- Coordinates are **meters**; grid lines span -885..885 on both axes, but only
  cells inside the coastal parkway are built (`REMOVED_CELLS`), so the developed
  city is a rounded blob. Every built grid block is a uniform 100x100 square;
  streets are 10m wide except the x=0/z=0 central avenues, which are 20m.
- Each source file opens with a substantial header comment explaining its
  role and the geometry/physics reasoning — read it before editing that module.
- To change the city's shape, edit the **data** in `world/layout.js` /
  `world/coast-data.js`, not the builders. Downstream layers (`island`,
  `parkway`, `city`, `minimap`) all derive from that data and must stay
  consistent (e.g. removing a cell in `REMOVED_CELLS` usually pairs with
  `DELETED` road segments).
