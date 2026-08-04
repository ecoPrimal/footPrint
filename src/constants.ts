// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Shared constants for footPrint.
 *
 * Conversion factors and tuning values remain here. Locality-specific values
 * (endpoints, known locations, map center, discovery source IDs) live in the
 * manifest registry and are re-exported here for backward compatibility.
 */

import './core/manifest-defaults.js';
import {
  endpointKey,
  getEndpoint,
  getKnownLocations,
  getMapViewDefaults,
  endpointHosts,
  type KnownLocation,
} from './core/manifest.js';

// Re-export registry types and API for runtime configuration
export type { KnownLocation, SourceManifest, CoverageBounds, EndpointKey, MapViewDefaults } from './core/manifest.js';
export {
  endpointKey,
  registerEndpoint,
  setEndpoint,
  getEndpoint,
  tryGetEndpoint,
  listEndpointKeys,
  endpointHosts,
  registerSourceManifest,
  unregisterSourceManifest,
  getSourceManifest,
  listSourceManifests,
  getSourceIdsByCapability,
  coversPoint,
  sourcesCoveringPoint,
  registerKnownLocation,
  unregisterKnownLocation,
  getKnownLocations,
  findKnownLocation,
  setMapViewDefaults,
  getMapViewDefaults,
  resolveMapViewDefaults,
  setMapViewResolver,
} from './core/manifest.js';

// ── Unit conversions ─────────────────────────────────

export const METERS_PER_DEGREE_LAT = 111_139;
export const FEET_PER_METER = 3.28084;
export const FEET_PER_MILE = 5_280;
export const SQ_FEET_PER_SQ_METER = 10.7639;
export const SQ_FEET_PER_ACRE = 43_560;
export const FEET_PER_DEGREE_LAT = METERS_PER_DEGREE_LAT * FEET_PER_METER;

// ── External service endpoints (registry-backed snapshots) ──

export const OVERPASS_URL = getEndpoint(endpointKey('overpass'));
export const NOMINATIM_SEARCH_URL = getEndpoint(endpointKey('nominatim'));
export const EPQS_BASE_URL = getEndpoint(endpointKey('epqs'));
export const NFHL_BASE_URL = getEndpoint(endpointKey('nfhl'));
export const NRCS_WMS_URL = getEndpoint(endpointKey('nrcs-wms'));

// ── Basemap tile URLs ────────────────────────────────

export const BASEMAP_SATELLITE_URL = getEndpoint(endpointKey('basemap-satellite'));
export const BASEMAP_STREET_URL = getEndpoint(endpointKey('basemap-street'));
export const BASEMAP_LABELS_URL = getEndpoint(endpointKey('basemap-labels'));
export const PARCELS_TILE_URL = getEndpoint(endpointKey('parcels-tiles'));

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

// ── Application defaults (registry-backed) ───────────

export const DEFAULT_MAP_CENTER: readonly [number, number] = getMapViewDefaults().center;
export const DEFAULT_MAP_ZOOM = getMapViewDefaults().zoom;
export const APP_VERSION = '2.0.0';
export const USER_AGENT = 'FootPrint-HomePlanner/2.0';

// ── Known locations (discoverable registry snapshot) ─

/** Snapshot of registered known locations at module load; use getKnownLocations() for live registry. */
export const KNOWN_LOCATIONS: readonly KnownLocation[] = getKnownLocations();

// ── API paths ────────────────────────────────────────
// Deployment teams rewire these when backend services absorb the Express server.
// Each path is a single point of configuration for the entire client.

export const PROXY_PATH = '/ext';
export const PROJECTS_PATH = '/api/projects';
export const CACHE_PATH = '/api/cache';
export const AGENT_PATH = '/api/agent';
export const HEALTH_PATH = '/api/health';
export const WS_PATH = '/ws';
export const AGENT_BRIDGE_PATH = '/ws/bridge';

export const ALLOWED_HOSTS: readonly string[] = [
  ...endpointHosts(),
  'services1.arcgis.com',
  'services2.arcgis.com',
  'gisp.mcgi.state.mi.us',
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
