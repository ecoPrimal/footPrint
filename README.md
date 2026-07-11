# footPrint

GIS home improvement planner — satellite map overlays, CAD-like drawing tools, and parametric constraint solving for property planning.

**footPrint is a [protist](../../infra/wateringHole/handoffs/FRAGO_PROTISTS_CATEGORY_136b.md)** — a browser-based product served BY ecoPrimals primals, not a primal itself. The Express backend disappears into a primal composition (petalTongue + nestGate + songBird).

## Stack

| Layer | Technology |
|-------|-----------|
| Map | Leaflet + ESRI satellite tiles + OSM |
| Drawing | @geoman-io/leaflet-geoman-free |
| Geometry | @turf/turf (geodesic area, length, distance) |
| Bundler | Vite 6 (TypeScript, code-split, sourcemaps) |
| Server | Express 5 (proxy + project CRUD — disappears into primals) |
| Types | TypeScript 5.8 strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| Safety | RustScript — 12 zero-dep modules encoding Rust safety primitives |
| License | AGPL-3.0-or-later (scyBorg triple-license) |

## Architecture

```
Browser (Vite)
  └─ src/client/app.ts
       ├── Leaflet + Geoman + Turf (npm imports)
       ├── ECS: entity → store → commands → history → renderer
       ├── Gauss-Newton constraint solver (6 active constraint types)
       ├── Data source overlays (8 source modules)
       ├── Intelligence (proximity, conflicts, elevation)
       ├── Terrain (DEM grid, contours, slope/aspect)
       └── Agent bridge (WebSocket state sync)

Express (:3000) — src/server.ts [DISAPPEARS]
  ├── Project CRUD → nestGate CAS
  ├── Proxy + cache → songBird drawbridge
  └── Agent REST + WebSocket → songBird/nestGate
```

### ECS (Entity-Component System)

All mutations go through the command pipeline with full undo/redo:

- **Entities**: shape, layer, dimension, constraint, annotation
- **Commands**: Add, Remove, Update, Move, Batch
- **History**: bounded undo/redo stack with `Owned<Command>`

### Constraint Solver

Gauss-Newton iterative solver with Levenberg-Marquardt damping (7 active types):

- Fixed distance, parallel, perpendicular, horizontal, vertical, coincident, point-on-line
- 50 max iterations, 1e-8 tolerance, 0.5 step size
- Dense J^T·J linear system with partial-pivot Gauss elimination

### RustScript

12 zero-dep TypeScript modules encoding Rust safety primitives. This is a control experiment validating why primals are pure Rust — 17/20 constraints enforceable, but 3 cannot be expressed (lifetimes, Send/Sync, zero-cost).

Modules: Result, Option, RefCell, exhaustive, Brand/newtype, Owned, Iter, RustVec, Cow, channel

### Data Sources

| Source | API | Category |
|--------|-----|----------|
| Buildings, power, pipelines, fences, water | Overpass (OSM) | OpenStreetMap |
| Manholes, hydrants, street lights, poles | Overpass (OSM) | Infrastructure |
| Parcels | Regrid tiles | Property |
| Flood zones | FEMA NFHL ArcGIS | FEMA |
| Zoning districts | City of East Lansing ArcGIS | Lansing |
| Elevation | USGS 3DEP EPQS | USGS |
| Soils | NRCS SSURGO WMS | Soils |
| Road centerlines | Michigan GIS Framework | Michigan |

All external requests are proxied through the server's allowlisted proxy with disk caching.

## Quick Start

```bash
npm install
npm run dev          # Concurrent Express + Vite dev server
```

Open `http://localhost:5173` — the map loads centered on East Lansing, MI.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (Express + Vite) |
| `npm run build` | Production build (dist/client/) |
| `npm run typecheck` | TypeScript strict check |
| `npm run lint` | ESLint (strict TypeScript rules) |
| `npm run format:check` | Prettier format check |
| `npm test` | Run Vitest test suite |
| `npm run test:coverage` | Test coverage report |
| `npm run check` | typecheck + lint combined |

## Primal Composition Target

footPrint's Express server is replaced by three primals:

| Express Endpoint | Absorbing Primal | Protocol |
|-----------------|-------------------|----------|
| Project CRUD (`/api/projects/*`) | **nestGate** | CAS persistence |
| Proxy + cache (`/api/proxy`) | **songBird** | Drawbridge routing |
| Agent WebSocket (`/ws`) | **songBird** | Drawbridge WebSocket |
| Static files | **petalTongue** | Axum static server |

The browser frontend stays TypeScript unchanged. See `specs/PETALTONGUE_VISUAL_TARGETS.md` for the 12 visual target areas.
