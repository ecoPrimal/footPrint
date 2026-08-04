# Data Layer Primal Abstraction — Audit & Roadmap

**Date**: 2026-07-21 | **Wave**: 150t | **From**: eastGate footPrint audit

---

## Status Update (2026-08-03)

- **P1 Source Registry: Partially complete** — `src/core/manifest.ts` provides runtime endpoint registry, source capability manifests, and known location registry. Bootstrap pack in `manifest-defaults.ts`. Declarative JSON manifest not yet implemented.
- **P1 Municipality Discovery: Not started**
- URLs are now runtime-configurable via `getEndpoint(endpointKey(...))` — no longer hardcoded in source modules

---

## Current Architecture

footPrint's data layer has 3 concerns that collapse into 2 primals:

```
Client (sources/*.ts)             Server (server.ts)           Primals (target)
  │                                  │                           │
  ├─ 8 source modules               ├─ Proxy + allowlist        ├─ songBird drawbridge
  │   (15 registered sources)       │   (GET/POST, host check)  │   (proxy, routing, auth)
  ├─ datasources.ts registry        ├─ Disk cache (SHA-256)     ├─ nestGate CAS
  ├─ discover.ts auto-fetch         │   (TTL per source type)   │   (content-addressed cache)
  └─ terrain.ts DEM grid            └─ ALLOWED_HOSTS list       └─ coralReef (GPU compute)
```

### Source Module Inventory

| Module | Sources | API Protocol | Scope | Primal Path |
|--------|---------|-------------|-------|-------------|
| `osm.ts` | 5 (buildings, power, pipelines, fences, water) | Overpass QL POST | Global (OSM) | songBird drawbridge |
| `infrastructure.ts` | 4 (manholes, hydrants, streetlights, poles) | Overpass QL POST | Global (OSM) | songBird drawbridge |
| `fema.ts` | 1 (flood zones) | ArcGIS REST | US nationwide | songBird drawbridge |
| `parcels.ts` | 1 (parcel boundaries) | ArcGIS Tiles | US nationwide (Regrid) | songBird drawbridge |
| `soils.ts` | 1 (soil map units) | OGC WMS | US nationwide (NRCS) | songBird drawbridge |
| `usgs.ts` | 1 (elevation points) | REST JSON | US nationwide | songBird + coralReef batch |
| `michigan.ts` | 1 (road centerlines) | ArcGIS REST | Michigan only | songBird drawbridge |
| `zoning.ts` | 1 (zoning districts) | ArcGIS REST | East Lansing only | songBird drawbridge |
| **Total** | **15** | | | |

### Hardcoded Locality

Two source modules are municipality-specific:

1. **`zoning.ts`** — `ZONING_URL` points to `gis2.cityofeastlansing.com`. Other
   municipalities would need different ArcGIS endpoints. The zoning overlay API
   pattern is the same (ArcGIS REST query with bbox), but the URL, field names,
   and zone color mappings vary per city.

2. **`michigan.ts`** — `MI_FRAMEWORK_BASE` points to Michigan's GIS framework.
   Other states have their own GIS portals with different URLs and layer IDs.

Everything else (OSM, FEMA, Regrid, NRCS, USGS) is US-nationwide or global.

---

## Abstraction Opportunities

### 1. Source Definition Registry (P1)

**Current**: Sources are registered imperatively by calling `registerSource()` from
each source module. Each module hardcodes its API URL, query pattern, style, and
popup content.

**Target**: A declarative source definition format that can be:
- Loaded from a JSON/TOML manifest (not code)
- Extended per-municipality without code changes
- Cached in nestGate CAS as content-addressed source configs
- Validated by primalSpring scenarios

```typescript
// Target: declarative source definitions
interface SourceManifest {
  id: string;
  name: string;
  category: string;
  protocol: 'overpass' | 'arcgis-rest' | 'arcgis-tiles' | 'ogc-wms' | 'rest-json';
  endpoint: string;
  query_template?: string;       // with {bbox} placeholder
  fields?: string[];             // outFields for ArcGIS
  style: StyleSpec;
  popup_template: string;        // Mustache or template literal
  scope: 'global' | 'national' | 'state' | 'municipal';
  municipality?: string;         // for municipal-scoped sources
  min_zoom?: number;
}
```

### 2. Municipality Discovery (P1)

**Current**: footPrint's known locations are hardcoded in `constants.ts`. When a
user opens a new area, they get OSM/FEMA/USGS coverage but no municipal data
(zoning, local GIS layers) unless they happen to be in East Lansing.

**Target**: A municipality discovery system that:
- Detects which city/county the viewport is in (reverse geocode)
- Looks up available municipal data sources from a registry
- Auto-registers municipal sources on viewport move
- Falls back to state-level and national data when municipal data is unavailable

The registry would be a CAS-stored manifest per municipality:

```
nestGate CAS:
  family: footprint-municipalities
  /lansing-mi.json    → { zoning_url, parcel_url, ... }
  /ann-arbor-mi.json  → { zoning_url, ... }
  /portland-or.json   → { ... }
```

### 3. Preset Radii & Warm Cache (P2)

**Current**: Cache is purely reactive — data is fetched on demand when a source
is enabled and the viewport moves. Cache key is SHA-256 of URL+body, stored as
flat JSON files in `cache/`.

**Target**: Preset radii where data has been pre-fetched and cached:
- Known locations already define centers + expected sources
- Pre-warm cache for each known location at configurable radii (1km, 5km)
- Store warm cache in nestGate CAS (content-addressed, shared across gates)
- Discovery can indicate "cached" vs "live fetch needed" in the UI

### 4. Protocol Abstraction (P2)

**Current**: Each source module implements its own fetch pattern. There are 5
distinct API protocols, but each source module handles fetch/parse inline.

**Target**: Protocol handlers extracted to a shared layer:

| Protocol | Current Implementation | Shared Handler |
|----------|----------------------|----------------|
| Overpass QL | `queryOverpass()` in `osm.ts` | `OverpassHandler.query(ql, bounds)` |
| ArcGIS REST | Inline per-module | `ArcGISHandler.query(url, layer, fields, bounds)` |
| ArcGIS Tiles | `L.tileLayer()` directly | (no change — Leaflet handles) |
| OGC WMS | `L.tileLayer.wms()` directly | (no change — Leaflet handles) |
| REST JSON | Inline in `usgs.ts` | `RestHandler.batch(url_template, points)` |

### 5. Server Proxy → songBird Drawbridge (P2)

**Current**: The Express server proxies all external requests through `PROXY_PATH`
(`/ext`), validating against `ALLOWED_HOSTS` and applying per-source TTL caching.

**Target**: songBird drawbridge absorbs this responsibility:
- Allowlist → songBird's `SONGBIRD_DRAWBRIDGE_ROUTES` capability registry
- Cache → nestGate CAS with TTL metadata
- Rate limiting → songBird's built-in rate limiter
- The client `proxyUrl()` / `proxyPost()` calls rewire to songBird's endpoint
  by changing `PROXY_PATH` in `constants.ts`

### 6. Batch Elevation → coralReef GPU (P3)

**Current**: `usgs.ts` queries USGS EPQS one point at a time with throttling
(6 concurrent, 50ms delay). `terrain.ts` builds a DEM grid from these points.

**Target**: coralReef GPU batch processing:
- Upload viewport bounds + resolution to coralReef
- coralReef fetches DEM tiles from USGS 3DEP as rasters
- GPU-accelerated slope, aspect, contour computation
- Return pre-computed terrain grid to client

---

## Phasing

| Phase | Item | Dependency | Gate |
|-------|------|-----------|------|
| P1 | Source definition registry (JSON manifest) | None | footPrint |
| P1 | Municipality discovery (reverse geocode → source lookup) | Source registry | footPrint |
| P2 | Protocol handlers (shared fetch/parse) | Source registry | footPrint |
| P2 | Warm cache (preset radii pre-fetch) | nestGate CAS wiring | nestGate |
| P2 | songBird drawbridge absorption | songBird drawbridge ready | songBird |
| P3 | coralReef GPU terrain batch | coralReef GPU pipeline | coralReef |

---

## Files Affected

| File | Lines | Role | Action |
|------|-------|------|--------|
| `src/constants.ts` | 222 | Hardcoded URLs, locations | Extract source URLs to manifest |
| `src/client/datasources.ts` | 200 | Registry + fetch engine | Add manifest loader |
| `src/client/discover.ts` | 261 | Auto-discovery | Add municipality lookup |
| `src/client/sources/osm.ts` | 226 | 5 OSM sources | Extract to manifest entries |
| `src/client/sources/infrastructure.ts` | 111 | 4 infra sources | Extract to manifest entries |
| `src/client/sources/fema.ts` | 74 | Flood zones | Extract to manifest entry |
| `src/client/sources/zoning.ts` | 83 | East Lansing zoning | Make municipal-scoped |
| `src/client/sources/michigan.ts` | 47 | MI roads | Make state-scoped |
| `src/client/sources/usgs.ts` | 125 | Elevation + batch | Extract protocol handler |
| `src/client/sources/parcels.ts` | 16 | Parcel tiles | Extract to manifest entry |
| `src/client/sources/soils.ts` | 19 | Soil WMS | Extract to manifest entry |
| `src/server.ts` | 412 | Proxy + cache | → songBird drawbridge |

---

*Data flows through primals. Sources are discovered, not hardcoded. Municipalities are
content, not code. Cache is content-addressed, not file-hashed.*
