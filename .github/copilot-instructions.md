# Paseo — Copilot instructions

Paseo is a browser walking/driving sim of a hand-authored low-poly island city,
built with **Vite** and **three.js** (`import * as THREE from 'three'`). There is
no framework, router, or test suite — it is a single ES-module bundle mounted in
`index.html` (`<script type="module" src="/src/main.js">`).

## Commands

- `npm install` — install dependencies.
- `npm run dev` — Vite dev server with HMR (primary workflow).
- `npm run build` — production build to `dist/`.
- `npm run preview` — serve the built `dist/`.

There is no linter or automated test suite. Verify changes by running `npm run dev`
and observing the scene. `main.js` exposes `window.__game = { player, traffic, peds,
groundHeight, nearestBeach }` as a console hook for manual debugging/testing.

## The one hard rule: determinism

**The city is hand-authored and must be identical on every load. `Math.random` is
banned anywhere in the project.** All "variety" (placement, colors, sizes, jitter)
comes from coordinate-seeded hashes in `src/util.js`:

- `hash(a,b,c)`, `frac(a,b,c)` → `[0,1)`, `range(lo,hi,a,b,c)`, `pick(arr,a,b,c)`.
- Seed from stable inputs (grid indices, world coordinates, block id) so the same
  spot always produces the same result.
- Caveat: `frac(seed,k,c)` values that differ **only** in `c` are correlated (2D
  scatter collapses onto a diagonal). Decorrelate a 2D pair with a nested hash,
  e.g. `frac(hash(seed,k,1),5)` / `frac(hash(seed,k,2),9)`.

## Architecture / data flow

Everything is assembled once in `src/main.js`: it creates the renderer, scene,
lights, a shared `Colliders` instance, builds the world, constructs the actors,
and runs a single `requestAnimationFrame` loop that calls `player.update`,
`traffic.update`, `peds.update`, updates the HUD, moves the shadow camera to
follow the player, and renders.

World geometry is **data-driven and layered**, each layer reading from the one
below:

- `src/layout.js` — the source of truth for the street grid. `GRID` centerlines,
  `roadWidth`, `DELETED` road segments, `REMOVED_CELLS` (cells swallowed by the
  sea), `SPECIALS` (hand-placed blocks like Central Park / City Hall), and
  `districtOf` (rule assigning a district type to each remaining cell). Exposes
  `buildRoads()`, `buildBlocks()`, `cellRect()`.
- `src/coast-data.js` — 720-sample traced coastline: `COAST[]` (plateau-edge
  radius per angle) and `SAND[]` (beach width). Consumed by `island.js` and
  `parkway.js`, which both use `N = 720` angular samples to stay aligned.
- `src/island.js` — builds the island terrain from the polar coastline (plateau →
  rocky scarp → sand beach → wading slope → sea floor). Exports the terrain query
  `groundHeight(x,z)` used everywhere for placement and physics, plus `nearestBeach`,
  `HILL`, `POND`, `ISLETS`, `coastBands`, and vertical constants (`TOP_Y`,
  `BEACH_Y`, `WATER_Y`).
- `src/parkway.js` — the curved coastal ring road that replaces the old square
  ring, hugging the plateau edge with authored pocket-park windows. Grid streets
  reaching the map edge are extended by `city.js` to tee into it.
- `src/city.js` — builds the entire static city into batched meshes from the
  layout + island + parkway data. Owns the color `PALETTE` (re-exported) and the
  `PARKED` car list. All placement is hash-driven.

Actors (`player.js`, `traffic.js`, `peds.js`) and the shared `character.js`
humanoid layer on top, all querying `groundHeight` and the shared colliders.
`src/minimap.js` redraws the same layout/island/parkway data top-down for the HUD.

## Rendering conventions

- **`src/geo.js` `GeoBatch`** is the batching layer for all static city geometry:
  it collects primitives (`box`, `boxB`, `prism`, `cyl`, `cone`, `ico`) and
  `build()`s them into a few `InstancedMesh`es (one per template) with per-instance
  colors. Prefer adding to a `GeoBatch` over creating standalone meshes for static
  parts. Instanced meshes set `frustumCulled = false` because instances span the
  whole city.
- Materials are `MeshLambertMaterial` with `flatShading: true` for the faceted
  low-poly look; `character.js` `mat(hex)` caches per-color materials.
- Colors are hex ints from the `PALETTE` in `city.js`; reuse those names rather
  than introducing new literals.

## Collision conventions (`src/collision.js`)

- `Colliders` is a spatial-hash box world. `add(cx, y, cz, sx, sy, sz, ry)` adds a
  box whose **base sits at `y`**. Only near-90° yaws collapse to an exact
  axis-aligned box; other yaws are stored as an OBB.
- **Rotation is snapped to 90° quarters unless stored as an OBB** — an arbitrarily
  rotated building must either be added as a single OBB or decomposed into small
  axis-aligned cells covering its footprint (see `beltBuilding` in `city.js`).
- `movePlayer(...)` resolves the player capsule against boxes + terrain with curb
  step-up, steep-rock climb refusal, and ground-stick; keep terrain queries going
  through `groundHeight`.

## Working in this codebase

- Coordinates are **meters**; the grid spans roughly -640..640 on both axes, with
  the island/coast extending further out.
- Each `src/*.js` file opens with a substantial header comment explaining its role
  and the geometry/physics reasoning — read it before editing that module.
- To change the city's shape, edit the **data** in `layout.js` / `coast-data.js`,
  not the builders. The layers downstream (`island`, `parkway`, `city`, `minimap`)
  all derive from that data and must stay consistent (e.g. removing a cell in
  `REMOVED_CELLS` usually pairs with `DELETED` road segments).
- `tmp-trace.py` referenced in comments is a throwaway tracing tool and is not
  committed; the traced output lives in `coast-data.js` / `sand-width.json`.
