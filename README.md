# footPrint

GIS home improvement planner — satellite map overlays, CAD-like drawing tools, and parametric constraint solving for property planning.

**footPrint is a [protist](../../infra/wateringHole/handoffs/FRAGO_PROTISTS_CATEGORY_136b.md)** — a browser-based product served BY ecoPrimals primals, not a primal itself. The Express backend disappears into a primal composition.

## Stack

| Layer | Technology |
|-------|-----------|
| Map | Leaflet + ESRI satellite tiles + OSM |
| Drawing | @geoman-io/leaflet-geoman-free |
| Geometry | @turf/* sub-packages (area, distance, centroid, buffer, bearing, ...) |
| Bundler | Vite 6 (TypeScript, code-split, sourcemaps) |
| Server | Express 5 (proxy + project CRUD — disappears into primals) |
| Types | TypeScript 5.8 strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| Safety | RustScript — 11 zero-dep modules encoding Rust safety primitives |
| License | AGPL-3.0-or-later (scyBorg triple-license) |

## Architecture

```
Browser (Vite)
  └─ src/client/app.ts
       ├── Leaflet + Geoman + Turf (npm imports)
       ├── ECS: entity → store → commands → history → renderer
       ├── Gauss-Newton constraint solver (7 active constraint types)
       ├── Data source overlays (8 source modules, 15 sources)
       ├── Intelligence (proximity, conflicts, elevation)
       ├── Terrain (DEM grid, contours, slope/aspect)
       ├── Discovery (auto-enables sources on property draw)
       ├── petalTongue bridge (JSON-RPC over WebSocket)
       ├── nestGate CAS client (dual-write project persistence)
       ├── Interactive tutorial (11-step guided walkthrough)
       └── Agent bridge (WebSocket state sync)

Express (:3000) — src/server.ts [DISAPPEARS]
  ├── Project CRUD      → absorbed by nestGate CAS
  ├── Proxy + cache     → absorbed by songBird drawbridge
  ├── CAS proxy (/api/cas/*) → absorbed when nestGate is direct
  └── Agent REST + WS   → absorbed by agent bridge primal
      (deep per-variant field validation via protocol.ts)
```

### ECS (Entity-Component System)

All mutations go through the command pipeline with full undo/redo:

- **Entities**: shape, layer, dimension, constraint, annotation
- **Commands**: Add, Remove, Update, Move, Batch
- **History**: bounded undo/redo stack with `Owned<Command>`

### Constraint Solver

Gauss-Newton iterative solver with Levenberg-Marquardt damping (7 active types):

- Fixed distance, parallel, perpendicular, horizontal, vertical, coincident, point-on-line
- Stubs: tangent, symmetric, setback
- 50 max iterations, 1e-8 tolerance, 0.5 step size
- Dense J^T·J linear system with partial-pivot Gauss elimination
- Pure math engine extracted to `src/core/solver.ts` (testable without ECS)

### RustScript

11 zero-dep TypeScript modules encoding Rust safety primitives (`src/rustscript/`). This is a control experiment validating why primals are pure Rust — 17/20 constraints enforceable, but 3 cannot be expressed (lifetimes, Send/Sync, zero-cost). Domain-specific branded types (EntityId, HexColor, etc.) live in the consuming application at `src/types/brands.ts`.

Modules: Result, Option, RefCell, exhaustive, Brand (types.ts), Owned, Iter, RustVec, Cow, channel

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

Open `http://localhost:5173/footprint/` — the map loads centered on East Lansing, MI.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (Express + Vite concurrent) |
| `npm run dev:server` | Express only (tsx watch) |
| `npm run dev:client` | Vite only |
| `npm run build` | Production build (`dist/client/` + `dist/server.js`) |
| `npm start` | Run production server (`node dist/server.js`) |
| `npm run start:dev` | Run server via tsx (no build needed) |
| `npm run typecheck` | TypeScript strict check |
| `npm run lint` | ESLint (strict TypeScript rules) |
| `npm run lint:fix` | ESLint autofix |
| `npm run format:check` | Prettier format check |
| `npm run format` | Prettier format |
| `npm test` | Run Vitest test suite |
| `npm run test:watch` | Watch mode |
| `npm run test:coverage` | Test coverage report |
| `npm run check` | typecheck + lint combined |

## Deployment

See `deploy/README.md` for Express server deployment on sporeGate (systemd + Caddy).

## Inter-Primal Wiring

footPrint connects to the ecosystem through two client-side bridges:

| Bridge | Module | Protocol | Purpose |
|--------|--------|----------|---------|
| petalTongue | `src/client/petal-tongue.ts` | JSON-RPC 2.0 over WebSocket (`/ws`) | Scene rendering, agent queries, capabilities |
| nestGate CAS | `src/client/nestgate-cas.ts` | REST via server proxy (`/api/cas/*`) | Content-addressed project persistence |

Projects are dual-written: local filesystem (Express) + nestGate CAS (best-effort). When the Express server is absorbed, CAS becomes the sole persistence layer.

## Primal Composition Target

footPrint's Express server is replaced by primal services:

| Express Endpoint | Protocol | Client Constant |
|-----------------|----------|-----------------|
| Project CRUD (`/api/projects/*`) | nestGate CAS persistence | `PROJECTS_PATH` |
| CAS proxy (`/api/cas/*`) | nestGate CAS (BLAKE3 content-addressed) | — |
| Proxy + cache (`/ext`) | songBird drawbridge routing | `PROXY_PATH` |
| Agent REST (`/api/agent/*`) | Agent bridge | `AGENT_PATH` |
| Agent WebSocket (`/ws/bridge`) | WebSocket bridge | `AGENT_BRIDGE_PATH` |
| petalTongue WebSocket (`/ws`) | JSON-RPC bridge | `WS_PATH` |
| Cache clear (`/api/cache`) | Admin | `CACHE_PATH` |
| Health check (`/api/health`) | Monitoring | `HEALTH_PATH` |
| Static files | cellMembrane / Axum | — |

The browser frontend stays TypeScript unchanged. All backend calls go through `src/client/api.ts` — change the constants in `src/constants.ts` and the client rewires automatically. See `specs/PETALTONGUE_VISUAL_TARGETS.md` for the 12 visual target areas.
