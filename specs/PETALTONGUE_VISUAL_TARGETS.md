# petalTongue Visual Targets — footPrint Parity

**Date**: 2026-07-11
**Source**: footPrint (TypeScript/Leaflet validation layer)
**Target**: petalTongue (Rust/Axum NUCLEUS composition)
**Gate owner**: flockGate (WAN-accessible, LAN HPC data)

---

## Purpose

footPrint is the validation layer — a working GIS planner in TypeScript that proves
the visual and functional patterns. petalTongue's evolution toward NUCLEUS hosting
means it must achieve visual parity with footPrint, then exceed it with sovereign
backend capabilities (nestGate CAS, rootPulse provenance, mesh federation).

This document maps each footPrint visual capability to its petalTongue equivalent.

---

## Visual Target Matrix

### VT-1: Map Engine

| footPrint | petalTongue Target |
|-----------|-------------------|
| Leaflet 1.9.4 (JS, CDN) | Leaflet served from petalTongue static assets |
| Satellite + Street base layers | Same (ESRI World Imagery, OSM tiles) |
| Road label overlay | Same |
| Layer control (Leaflet.control.layers) | Same |
| Default center: 42.7085, -84.5537 (Lansing) | Configurable per-gate via manifest |

### VT-2: Drawing Tools

| footPrint | petalTongue Target |
|-----------|-------------------|
| Leaflet-Geoman 2.19 (draw/edit) | Same library, served from NUCLEUS |
| Shape types: polygon, polyline, rectangle, circle, marker, circlemarker | Same |
| Shape metadata (_fpMeta → ECS components) | Entities stored in nestGate CAS |
| Color per-shape, per-layer | Same |

### VT-3: Layer System

| footPrint | petalTongue Target |
|-----------|-------------------|
| 5 default layers (Property, Fencing, Landscaping, Utilities, Notes) | Same defaults + custom |
| Layer visibility toggle | Same |
| Layer color/style | Same |
| Custom layer creation | Same |
| Layer delete with confirmation | Same |

### VT-4: Data Source Overlays

| footPrint (8 sources) | petalTongue Target |
|-----------------------|-------------------|
| OSM/Overpass (buildings, power, pipes, fences, water) | Same via proxy → songBird drawbridge |
| Regrid parcel tiles | Same |
| FEMA flood zones | Same |
| Lansing zoning | Same |
| USGS elevation | Same + batch via HPC |
| NRCS soils | Same |
| Michigan GIS | Same |
| Infrastructure (manholes, hydrants, poles) | Same |
| Smart auto-fetch on pan/zoom | Same |
| Property boundary auto-enable | Same |

### VT-5: Measurement & Dimensions

| footPrint | petalTongue Target |
|-----------|-------------------|
| Interactive measure mode (click-to-measure) | Same |
| Geodesic calculations (Turf.js → WASM?) | Turf.js or Rust geo crate compiled to WASM |
| Imperial units (feet, acres) | Configurable unit system |
| Parametric dimensions on edges | Same (entities stored in CAS) |
| Click dimension to set constraint | Same |

### VT-6: Parametric Constraint Solver

| footPrint | petalTongue Target |
|-----------|-------------------|
| Gauss-Newton iterative solver | Same algorithm, Rust port (nalgebra) |
| Constraint types: fixed-distance, parallel, perpendicular, horizontal, vertical, coincident | Same + point-on-line, tangent, symmetric, setback |
| Damped step (λ=1e-4) | Same |
| Batch command updates | Same (via nestGate transactions) |

### VT-7: Intelligence Layer

| footPrint | petalTongue Target |
|-----------|-------------------|
| Proximity analysis (nearest features per source) | Same + mesh-federated data |
| Conflict detection (2m buffer intersection) | Same |
| Elevation at vertices (USGS batch) | Same + HPC-accelerated DEM processing |
| Compass bearing to nearest features | Same |
| Alert markers (⚠) on map | Same |

### VT-8: Project Persistence

| footPrint | petalTongue Target |
|-----------|-------------------|
| JSON files in `projects/` | nestGate CAS (content-addressed, provenance-traced) |
| Save/Load/New/Delete via REST | nestGate JSON-RPC + HTTP API |
| GeoJSON round-trip serialization | Same format, CAS-backed |
| ECS entity serialization | Serialized entities → nestGate families |

### VT-9: Snap & Grid

| footPrint | petalTongue Target |
|-----------|-------------------|
| Vertex snapping | Same |
| Grid overlay (engineering grid) | Same |
| Grid spacing configurable | Same |
| Snap status in status bar | Same |

### VT-10: Status Bar

| footPrint | petalTongue Target |
|-----------|-------------------|
| Lat/Lng cursor position | Same |
| Zoom level | Same |
| Scale indicator | Same |
| Snap status | Same |
| Grid status | Same |
| Elevation at cursor | Same |

### VT-11: UI Theme & Layout

| footPrint | petalTongue Target |
|-----------|-------------------|
| Dark theme (satellite-optimized) | Same dark theme |
| Header toolbar (search, save, load, grid, snap, measure) | Same |
| Left sidebar (layers + data sources + discovery) | Same |
| Right sidebar (shape properties) | Same |
| Modal overlay (load project list) | Same |
| Agent panel (bottom, collapsible) | Replaced by mesh coordination panel |

### VT-12: Agent / AI Bridge

| footPrint | petalTongue Target |
|-----------|-------------------|
| WebSocket to Express server | WebSocket to petalTongue Axum server |
| Shadow state (ECS snapshot over WS) | nestGate CAS live subscription |
| REST command API (POST action) | nestGate JSON-RPC `coord.command` |
| Agent panel UI | Overwatch coordination panel |

---

## Primal Evolution Path

### Phase 1: Visual Parity (footPrint → petalTongue)
petalTongue serves the same UI (Leaflet + Geoman + Turf.js) from its Axum
static file server. The HTML/CSS/JS is the same — petalTongue replaces Express,
not the frontend. Data persistence moves from JSON files to nestGate CAS.

### Phase 2: Backend Sovereignty (petalTongue + nestGate + songBird)
- Project data stored in nestGate CAS with rootPulse provenance
- Data source proxying through songBird drawbridge (rate-limited, cached)
- Mesh federation: share project data across gates
- bearDog TLS termination (no Caddy dependency)

### Phase 3: Compute Integration (barraCuda + coralReef)
- DEM processing on HPC (southGate/strandGate) via mesh dispatch
- Terrain analysis via coralReef GPU shaders
- Batch elevation queries via LAN compute, not USGS rate-limited API
- Soil analysis acceleration

### Phase 4: Full Primal Composition
- footPrint server logic → Rust primal (Axum, typed IPC, health.liveness)
- RustScript modules → native Rust (compile-time enforcement replaces runtime)
- ECS store → Rust ECS with compile-time component safety
- Constraint solver → nalgebra (f64, sparse matrices)
- GeoJSON processing → geo crate (zero-copy, SIMD where available)

---

## sporePrint Parallel

Just as sporePrint serves the ecosystem's public documentation (301 pages, Zola),
petalTongue will serve the ecosystem's interactive tools. footPrint is the first
interactive tool — a GIS planner that validates the full rendering + data + persistence
pipeline before petalTongue absorbs it.

| sporePrint | petalTongue |
|------------|------------|
| Static content (Zola HTML) | Interactive apps (Leaflet, Geoman, Turf.js) |
| Served from Caddy file_server | Served from Axum with live API |
| Content from markdown | Content from user drawing + data overlays |
| primals.eco | live.primals.eco |
| Read-only | Read-write |

---

*footPrint validates. petalTongue absorbs. Primals evolve.*
