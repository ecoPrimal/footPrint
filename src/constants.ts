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

// ── Application defaults ─────────────────────────────

export const DEFAULT_MAP_CENTER: readonly [number, number] = [42.7085, -84.5537];
export const DEFAULT_MAP_ZOOM = 18;
export const USER_AGENT = 'FootPrint-HomePlanner/2.0';

// ── API paths ────────────────────────────────────────
// Deployment teams rewire these when backend services absorb the Express server.
// Each path is a single point of configuration for the entire client.

export const PROXY_PATH = '/ext';
export const PROJECTS_PATH = '/api/projects';
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
