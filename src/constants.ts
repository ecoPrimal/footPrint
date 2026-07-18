/**
 * Shared constants for footPrint.
 *
 * Centralizes hardcoded values that were scattered across source files.
 * Conversion factors are named for clarity; API endpoints are grouped
 * so the proxy allowlist and the client-side references stay in sync.
 */

// ── Unit conversions ─────────────────────────────────

export const METERS_PER_DEGREE_LAT = 111_139;
export const FEET_PER_METER = 3.28084;
export const FEET_PER_MILE = 5_280;
export const SQ_FEET_PER_SQ_METER = 10.7639;
export const SQ_FEET_PER_ACRE = 43_560;
export const FEET_PER_DEGREE_LAT = METERS_PER_DEGREE_LAT * FEET_PER_METER;

// ── External service endpoints ───────────────────────

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
export const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
export const EPQS_BASE_URL = 'https://epqs.nationalmap.gov/v1/json';
export const NFHL_BASE_URL = 'https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer';
export const NRCS_WMS_URL = 'https://sdmdataaccess.sc.egov.usda.gov/Spatial/SDM.wms';

export const MI_FRAMEWORK_BASE = 'https://gisagocss.state.mi.us/arcgis/rest/services/OpenData/michigan_geographic_framework/MapServer';
export const ZONING_URL = 'https://gis2.cityofeastlansing.com/arcgis/rest/services/ZoningDistricts/FeatureServer/0';

// ── Basemap tile URLs ────────────────────────────────

export const BASEMAP_SATELLITE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
export const BASEMAP_STREET_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const BASEMAP_LABELS_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}';
export const PARCELS_TILE_URL = 'https://tiles.arcgis.com/tiles/KzeiCaQsMoeCfoCq/arcgis/rest/services/Regrid_Nationwide_Parcel_Boundaries_v1/MapServer/tile/{z}/{y}/{x}';

// ── ArcGIS layer IDs ────────────────────────────────

export const FEMA_FLOOD_ZONE_LAYER = 28;
export const MI_ROADS_LAYER = 14;

// ── Discovery tuning ─────────────────────────────────

export const DISCOVERY_BUFFER_RADIUS_M = 100;
export const DISCOVERY_MAX_FEATURE_SAMPLE = 50;
export const DISCOVERY_PROXIMITY_RADIUS_M = 500;
export const CONFLICT_BUFFER_M = 2;
export const GEOCODER_ZOOM = 18;

// ── Discovery scoring ────────────────────────────────

export const DISCOVERY_COUNT_WEIGHT = 0.3;
export const DISCOVERY_PROXIMITY_WEIGHT = 0.4;
export const DISCOVERY_CATEGORY_WEIGHT = 0.3;
export const DISCOVERY_DEFAULT_BOOST = 0.5;
export const DISCOVERY_COUNT_DIVISOR = 20;
export const DISCOVERY_NO_DATA_DISTANCE = 999;
export const PROXIMITY_UI_LIMIT = 8;
export const DISCOVERY_AUTO_ENABLE_IDS: readonly string[] = [
  'osm-buildings', 'osm-power', 'parcels', 'osm-fences',
  'osm-poles', 'osm-manholes', 'osm-hydrants',
];
export const CONFLICT_UTILITY_SOURCE_IDS: readonly string[] = [
  'osm-power', 'osm-pipelines', 'osm-water',
  'osm-manholes', 'osm-hydrants', 'osm-poles',
];
export const ELEVATION_SAMPLE_CAP = 20;

// ── Grid defaults ────────────────────────────────────

export const DEFAULT_GRID_SPACING_FT = 10;
export const GRID_MIN_ZOOM = 17;
export const GRID_COLOR = '#4FC3F7';
export const GRID_MAX_LINES = 500;

// ── Snap defaults ────────────────────────────────────

export const DEFAULT_SNAP_DISTANCE = 20;
export const SNAP_GRID_MAX_POINTS = 2500;
export const SNAP_SOURCE_LABEL_RADIUS_M = 50;
export const METERS_PER_FOOT = 0.3048;

// ── UI timing ────────────────────────────────────────

export const GEOCODER_ERROR_FLASH_MS = 1500;
export const SERVER_PORT = 3000;

// ── Application defaults ─────────────────────────────

export const DEFAULT_MAP_CENTER: readonly [number, number] = [42.7085, -84.5537];
export const DEFAULT_MAP_ZOOM = 18;
export const APP_VERSION = '2.0.0';
export const USER_AGENT = 'FootPrint-HomePlanner/2.0';

// ── Known locations (E2E tutorial + verification) ────
// Each location doubles as a user tutorial entry and an operator E2E harness.
// expectedSources lists the data source IDs that MUST return data at this location.

export interface KnownLocation {
  readonly id: string;
  readonly name: string;
  readonly center: readonly [number, number];
  readonly zoom: number;
  readonly description: string;
  readonly expectedSources: readonly string[];
}

export const KNOWN_LOCATIONS: readonly KnownLocation[] = [
  {
    id: 'msu-campus',
    name: 'MSU Campus',
    center: [42.7249, -84.4815],
    zoom: 17,
    description: 'Michigan State University — buildings, parcels, power infrastructure',
    expectedSources: ['osm-buildings', 'osm-power', 'parcels', 'osm-fences'],
  },
  {
    id: 'el-downtown',
    name: 'Downtown East Lansing',
    center: [42.7369, -84.4838],
    zoom: 18,
    description: 'East Lansing downtown — zoning, parcels, dense OSM coverage',
    expectedSources: ['osm-buildings', 'parcels', 'zoning'],
  },
  {
    id: 'red-cedar',
    name: 'Red Cedar River',
    center: [42.7271, -84.4747],
    zoom: 17,
    description: 'Red Cedar floodplain — FEMA flood zones, water features, terrain',
    expectedSources: ['fema-flood', 'osm-water', 'elevation'],
  },
  {
    id: 'meridian-twp',
    name: 'Meridian Township',
    center: [42.7120, -84.4230],
    zoom: 17,
    description: 'Suburban residential — parcels, soils, road network',
    expectedSources: ['parcels', 'soils', 'mi-roads'],
  },
  {
    id: 'haslett-farms',
    name: 'Haslett Agriculture',
    center: [42.7480, -84.3960],
    zoom: 16,
    description: 'Agricultural area — soil types, terrain contours, large parcels',
    expectedSources: ['soils', 'elevation', 'parcels'],
  },
];

// ── API paths ────────────────────────────────────────
// Deployment teams rewire these when backend services absorb the Express server.
// Each path is a single point of configuration for the entire client.

export const PROXY_PATH = '/ext';
export const PROJECTS_PATH = '/api/projects';
export const CACHE_PATH = '/api/cache';
export const AGENT_PATH = '/api/agent';
export const HEALTH_PATH = '/api/health';
export const WS_PATH = '/ws';

export const ALLOWED_HOSTS: readonly string[] = [
  'overpass-api.de',
  'hazards.fema.gov',
  'services1.arcgis.com',
  'services2.arcgis.com',
  'nominatim.openstreetmap.org',
  'epqs.nationalmap.gov',
  'sdmdataaccess.sc.egov.usda.gov',
  'gisagocss.state.mi.us',
  'gisp.mcgi.state.mi.us',
  'gis2.cityofeastlansing.com',
] as const;

// ── Cache TTLs (milliseconds) ────────────────────────

const DAY = 24 * 60 * 60 * 1000;
export const CACHE_TTLS = {
  default: 7 * DAY,
  fema: 1 * DAY,
  overpass: 3 * DAY,
  elevation: 30 * DAY,
  soils: 90 * DAY,
} as const;

// ── Timing & limits ──────────────────────────────────

export const DISCOVERY_DEBOUNCE_MS = 800;
export const REACTIVE_DEBOUNCE_MS = 16;
export const AGENT_RECONNECT_MS = 1000;
export const AGENT_RECONNECT_MAX_MS = 16_000;
export const AGENT_COMMAND_TIMEOUT_MS = 10_000;
export const UNDO_HISTORY_LIMIT = 200;
export const AGENT_LOG_LIMIT = 200;
export const TOAST_DURATION_MS = 2000;
export const JSON_BODY_LIMIT = '10mb';
export const SHUTDOWN_GRACE_MS = 5000;

// ── Terrain defaults ─────────────────────────────────

export const DEFAULT_CONTOUR_INTERVAL_FT = 5;
export const MAX_ELEVATION_CONCURRENT = 6;
export const ELEVATION_THROTTLE_MS = 50;
export const OVERPASS_TIMEOUT_S = 25;

// ── Solver tuning ────────────────────────────────────

export const SOLVER_MAX_ITERATIONS = 50;
export const SOLVER_TOLERANCE = 1e-8;
export const SOLVER_STEP_SIZE = 0.5;
export const SOLVER_DAMPING = 1e-4;
export const SOLVER_SATISFIED_THRESHOLD = SOLVER_TOLERANCE * 100;
export const SOLVER_DIST_EPSILON = 1e-12;
export const SOLVER_PIVOT_EPSILON = 1e-15;
