# FootPrint — Home Improvement Planning Tool

A map-based home improvement planner with satellite imagery and CAD-like drawing overlays. Built for planning outdoor work (fencing, landscaping, property boundaries, utilities) on a real satellite view of your property.

## Properties

- **Primary:** 4422 Southgate, Lansing, MI
- **Adjacent (also owned):** 641 Samantha Ave, Lansing, MI
- **Default map center:** 42.7085, -84.5537 (zoom 18)

## Quick Start

```bash
npm install
npm start
# Open http://localhost:3000
```

For development with auto-reload on server changes:

```bash
npm run dev
```

## Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Map engine | Leaflet 1.9.4 | Interactive map with pan/zoom |
| Satellite tiles | ESRI World Imagery | Free satellite imagery, no API key |
| Street tiles | OpenStreetMap | Street map base layer |
| Drawing tools | Leaflet-Geoman 2.19 | Draw/edit lines, polygons, rectangles, circles, markers |
| Measurement | Turf.js 7.x | Geodesic distance, area, and perimeter calculations |
| Server | Express 5 | Static file hosting + project file CRUD API |
| Frontend | Vanilla JS (ES modules) | No build step, no framework |

## Architecture

```
footPrint/
├── server.js              Express server (static hosting + REST API + proxy)
├── package.json           Dependencies and scripts
├── projects/              Saved project JSON files
├── cache/                 Cached external API responses (auto-managed)
├── public/
│   ├── index.html         App shell: toolbar, sidebar, map, properties panel
│   ├── css/
│   │   └── app.css        Dark theme, layout, component styles
│   └── js/
│       ├── app.js         Bootstrap: wires all modules together
│       ├── map.js         Leaflet init, tile layers, geocoder (Nominatim)
│       ├── layers.js      Layer CRUD, visibility, serialization/deserialization
│       ├── drawing.js     Geoman integration, shape metadata, selection
│       ├── properties.js  Right sidebar: edit label, notes, status, color
│       ├── measurement.js Turf.js measurements, interactive measure mode
│       ├── storage.js     Save/load projects via /api/projects REST endpoints
│       ├── datasources.js Data source registry, fetch orchestration, overlays
│       ├── autofetch.js   Smart auto-fetch on pan/zoom and property boundary draw
│       └── sources/
│           ├── osm.js     OpenStreetMap/Overpass: buildings, power, pipes, fences, water
│           ├── parcels.js Regrid parcel boundary tile overlay
│           ├── fema.js    FEMA flood zone query and styled overlay
│           └── zoning.js  Lansing zoning district polygons
└── README.md
```

### Module Dependency Graph

```
app.js (entry)
  ├── map.js           (no deps — initializes Leaflet)
  ├── layers.js        (depends on Leaflet L.featureGroup)
  ├── drawing.js       (imports from layers.js)
  ├── properties.js    (imports from drawing.js, measurement.js)
  ├── measurement.js   (depends on Turf.js global)
  ├── storage.js       (imports from layers.js, drawing.js)
  ├── datasources.js   (source registry, manages L.geoJSON / L.tileLayer overlays)
  ├── autofetch.js     (imports from datasources.js, listens to map events)
  └── sources/
      ├── osm.js       (imports from datasources.js, queries Overpass via /api/proxy)
      ├── parcels.js   (imports from datasources.js, direct tile URL)
      ├── fema.js      (imports from datasources.js, queries FEMA via /api/proxy)
      └── zoning.js    (imports from datasources.js, queries ArcGIS via /api/proxy)
```

### Server API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | List all saved project names |
| GET | `/api/projects/:name` | Load a project by name |
| POST | `/api/projects/:name` | Save/overwrite a project |
| DELETE | `/api/projects/:name` | Delete a project |
| GET | `/api/proxy?url=<encoded>` | Proxy GET to an allowed external API |
| POST | `/api/proxy?url=<encoded>` | Proxy POST (Overpass) to an allowed external API |
| DELETE | `/api/cache` | Clear all cached API responses |

Project files are stored as `projects/<name>.json` on disk.

### Proxy and Cache

External API calls from the browser go through `/api/proxy` to avoid CORS issues. The server:
- Validates the target URL against an allowlist of hosts (Overpass, FEMA, ArcGIS)
- Hashes the request URL + body to produce a cache key
- Stores responses in `cache/<hash>.json` with TTL-based expiry
- TTLs: Overpass 3 days, FEMA 1 day, other 7 days
- Clear all cached data via `DELETE /api/cache`

### Project File Format

```json
{
  "name": "my-yard-plan",
  "savedAt": "2026-03-21T...",
  "layers": {
    "property": {
      "name": "Property Boundary",
      "color": "#e74c3c",
      "features": [
        {
          "type": "Feature",
          "geometry": { "type": "Polygon", "coordinates": [...] },
          "properties": {
            "label": "Lot boundary",
            "notes": "Verified with survey",
            "status": "complete",
            "color": "#e74c3c",
            "createdAt": "2026-03-21T..."
          }
        }
      ]
    },
    "fencing": { ... }
  }
}
```

### Default Layers

| Layer | Color | Intended Use |
|-------|-------|-------------|
| Property Boundary | #e74c3c (red) | Lot lines, easements |
| Fencing | #8B4513 (brown) | Fence lines, gates |
| Landscaping | #27ae60 (green) | Garden beds, trees, hardscape |
| Utilities | #f1c40f (yellow) | Outdoor electrical, water, gas |
| Notes | #3498db (blue) | General annotations |

Custom layers can be added at runtime.

## UI Controls

- **Address search:** Type an address and press Enter — uses OpenStreetMap Nominatim geocoder
- **Drawing tools:** Leaflet-Geoman toolbar on the left side of the map (line, polygon, rectangle, circle, marker)
- **Layers:** Left sidebar — click a layer name to make it active (new shapes go there), toggle eye icon for visibility
- **Properties:** Click any shape to open the right sidebar — edit label, notes, status, color
- **Measure mode:** Click "Measure" in toolbar, click points on the map, right-click to finish. Shows distances in feet and area in sq ft/acres
- **Save/Load:** Toolbar buttons — saves to server as JSON files in `projects/`

## Measurements

All measurements use geodesic calculations (Turf.js) and display in imperial units:
- Length: feet (or miles for > 5280 ft)
- Area: square feet (or acres for > 43,560 sq ft)

## Data Sources

Toggle external data overlays from the **Data Sources** panel in the left sidebar. Sources auto-refresh when you pan/zoom the map. Drawing a property boundary auto-enables key sources.

| Source | Category | API | What It Shows | Min Zoom |
|--------|----------|-----|--------------|----------|
| Buildings | OpenStreetMap | Overpass API | Building footprints from OSM | 15 |
| Power Lines | OpenStreetMap | Overpass API | Power lines, poles, transformers | 14 |
| Pipelines | OpenStreetMap | Overpass API | Gas, water, sewer pipelines | 14 |
| Fences | OpenStreetMap | Overpass API | Fences, walls, hedges | 16 |
| Water Features | OpenStreetMap | Overpass API | Streams, ponds, waterways | 14 |
| Parcel Boundaries | Property | Regrid ArcGIS tiles | Nationwide parcel lines (raster) | -- |
| Flood Zones | FEMA | NFHL MapServer | Flood hazard zones (A, AE, X, etc.) | 13 |
| Zoning Districts | Lansing | ArcGIS FeatureServer | Zoning polygons (historic/pre-FBC) | 13 |

### API Endpoints Used

| Service | URL | Notes |
|---------|-----|-------|
| Overpass API | `https://overpass-api.de/api/interpreter` | Free, rate-limited, queried via POST through proxy |
| Regrid Parcels | `https://tiles.arcgis.com/.../Regrid_Nationwide_Parcel_Boundaries_v1/MapServer` | Free tile layer, no proxy needed |
| FEMA NFHL | `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28` | Free, queried via GET through proxy |
| Lansing Zoning | `https://services1.arcgis.com/.../Zoning/FeatureServer/0` | Free, historic data (pre-Form Based Code) |

### Smart Auto-Fetch

- **On pan/zoom:** All enabled vector sources re-fetch for the new viewport (debounced 800ms)
- **On property boundary draw:** When you draw a shape on the Property Boundary layer, buildings, power lines, parcels, and fences auto-enable and fetch for that area

## Future Roadmap

These features are planned for future iterations:

1. **Indoor floor plans** — Upload floor plan images, position/scale them on the map, draw wiring and plumbing overlays on separate layers
2. **Snapping and grid** — Snap to grid, snap to other shapes, alignment guides
3. **Cost estimation** — Add material/labor cost fields per shape, calculate project totals
4. **Timeline/scheduling** — Assign dates to shapes, view a project timeline
5. **3D/AR visualization** — Integrate with three.js or AR.js for spatial visualization
6. **Sharing** — Export as PNG/PDF, share project files with contractors
7. **Undo/redo** — Full command history
8. **Shape labels on map** — Show labels directly on the map as overlays
9. **Import GeoJSON/KML** — Load existing survey or GIS data
10. **Multiple property support** — Switch between 4422 Southgate and 641 Samantha in the UI

## AI Continuity Notes

This section is for future AI coding sessions picking up this project.

### Key Decisions Made
- CDN-loaded Leaflet, Geoman, and Turf (no bundler needed). Leaflet and Geoman are globals (`L`, `L.pm`), Turf is global (`turf`).
- ES modules for app code (`type: "module"` in package.json, `<script type="module">` in HTML).
- Express 5 with top-level await for server setup.
- Shape metadata stored as `shape._fpMeta` on each Leaflet layer object.
- User drawing layers are Leaflet `FeatureGroup` instances managed by `layers.js`.
- Data source overlays are **separate** from user layers -- managed by `datasources.js` as read-only `L.geoJSON` or `L.tileLayer` instances. They are not saved in project files.
- Server-side proxy (`/api/proxy`) with host allowlist and disk-based cache avoids CORS issues and reduces API load.
- Dark UI theme designed to work with satellite imagery.

### How to Extend

**Add a new default drawing layer:** Edit the `DEFAULT_LAYERS` array in `layers.js`.

**Add a new shape property:** Add the field to `_fpMeta` initialization in `drawing.js`, add UI in `properties.js`, and ensure it round-trips in `layers.js` serialization.

**Add a new tool/mode:** Follow the pattern in `measurement.js` -- toggle a mode, bind map events, clean up on toggle-off.

**Add a new data source:** Create a file in `public/js/sources/`, import `registerSource` from `datasources.js`, and call it with a config object:
```js
import { registerSource } from '../datasources.js';
export function registerMySource() {
  registerSource({
    id: 'my-source',
    name: 'My Data',
    category: 'Custom',
    color: '#ff0000',
    minZoom: 14,
    fetch: async (bounds) => {
      // Return array of GeoJSON features
      const resp = await fetch(`/api/proxy?url=${encodeURIComponent(someUrl)}`);
      const data = await resp.json();
      return data.features || [];
    },
  });
}
```
Then import and call it in `app.js` alongside the other `register*()` calls.

**Add an allowed proxy host:** Add the hostname to the `ALLOWED_HOSTS` array in `server.js`.

**Change cache TTL:** Edit the `CACHE_TTL` object in `server.js`. Add pattern-based TTL logic in `ttlForUrl()`.

**Change map center/zoom:** Edit `DEFAULT_CENTER` and `DEFAULT_ZOOM` in `map.js`.

**Add indoor floor plans:** Create an image overlay layer type in `layers.js` using `L.imageOverlay`, allow positioning/scaling, then draw on it like any other layer.
