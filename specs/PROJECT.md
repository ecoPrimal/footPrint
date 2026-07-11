# FootPrint -- Project Specification

## What It Is

FootPrint is a home improvement planning tool that combines satellite/map views with CAD-like drawing, data overlays, and spatial intelligence. It lets a homeowner draw property lines, fences, utilities, and structures on a real map, then overlays public data (parcels, flood zones, zoning, soils, elevation) to support design decisions.

Built as a single-page web application with a Node.js backend. The frontend uses Leaflet for mapping, Geoman for drawing, and Turf.js for spatial computation. The backend proxies external data sources and manages project persistence.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Client (Browser)                               │
│                                                 │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐ │
│  │ Map/Draw │  │ Layers/UI │  │ Properties   │ │
│  └────┬─────┘  └─────┬─────┘  └──────┬───────┘ │
│       │              │               │          │
│  ┌────┴──────────────┴───────────────┴────────┐ │
│  │        Entity-Component System (ECS)       │ │
│  │  ┌────────┐  ┌─────────┐  ┌────────────┐  │ │
│  │  │ Store  │  │Commands │  │ Reactive   │  │ │
│  │  │(Result)│  │(Undo/   │  │ Graph      │  │ │
│  │  │(RefCell│  │ Redo)   │  │            │  │ │
│  │  │(Iter)  │  │         │  │            │  │ │
│  │  └────────┘  └─────────┘  └────────────┘  │ │
│  │                                            │ │
│  │  ┌────────────────────────────────────┐    │ │
│  │  │  Constraint Solver (Gauss-Newton)  │    │ │
│  │  └────────────────────────────────────┘    │ │
│  │                                            │ │
│  │  ┌────────────────────────────────────┐    │ │
│  │  │  RustScript Primitives             │    │ │
│  │  │  (zero-dependency, portable)       │    │ │
│  │  └────────────────────────────────────┘    │ │
│  └────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────┐
│  Server (Node.js / Express)                     │
│  - Project CRUD (JSON files)                    │
│  - Data source proxying + disk cache            │
│  - Overpass, Regrid, FEMA, USGS, NRCS, Zoning  │
└─────────────────────────────────────────────────┘
```

## Core Design Decisions

**Entity-Component System**: All domain objects (shapes, layers, dimensions, constraints, annotations) are entities with typed component maps. This decouples data from behavior and enables the command/undo system.

**Command Pipeline**: Every mutation flows through `Command.execute(store)` / `Command.undo(store)`. History stack enables full undo/redo. Batch commands for atomic multi-entity operations.

**Discriminated Entity Types**: `TypedEntity` is a union of `ShapeEntity | LayerEntity | DimensionEntity | ConstraintEntity | AnnotationEntity`. Narrowing on `entity.kind` guarantees component presence at the type level.

**Parametric Constraint Solver**: Damped Gauss-Newton iterative relaxation for geometric constraints. Active constraint types: fixed-distance, perpendicular, parallel, horizontal, vertical, coincident, point-on-line (7 active). Stubbed for future: tangent, symmetric, setback. Constraints drive geometry -- dimensions are not labels, they are parameters.

**RustScript Foundation**: The type system is built on Rust safety primitives (see [RUSTSCRIPT.md](RUSTSCRIPT.md)). This is not incidental -- it is the project's thesis that Rust's constraints improve code quality in any language.

## Data Sources

| Source | Data | Protocol |
|--------|------|----------|
| OpenStreetMap (Overpass) | Buildings, roads, utilities, land use | JSON API |
| Regrid | Parcel boundaries nationwide | ArcGIS Tile Service |
| FEMA NFHL | Flood hazard zones | ArcGIS REST |
| Lansing GIS | Zoning districts | ArcGIS REST |
| USGS EPQS | Elevation point queries | REST API |
| NRCS SDA | Soil types and properties | WMS |
| Michigan GIS | Geographic framework layers | ArcGIS REST |

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (strict mode, Rust-level constraints) |
| Map | Leaflet 1.9.4 |
| Drawing | Leaflet-Geoman 2.19.2 |
| Spatial | Turf.js 7.x |
| Bundler | Vite 6.x |
| Server | Express 5.x on Node.js |
| Type Safety | RustScript primitives (zero-dependency) |

## Project Goals

1. **Immediate**: Usable planning tool for residential property work (fencing, utilities, landscaping)
2. **Architectural**: Prove that Rust's safety patterns improve TypeScript code through constrained evolution
3. **Portable**: RustScript module is extractable as a standalone library for any TypeScript project
4. **Evolvable**: Each iteration raises the constraint floor; solid solutions evolve into robust agnostic solutions
