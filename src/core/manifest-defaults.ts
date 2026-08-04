// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Default manifest bootstrap — Michigan/East Lansing deployment pack.
 *
 * Other localities extend at runtime via registerKnownLocation, registerEndpoint,
 * and registerSourceManifest without modifying this file.
 */

import {
  endpointKey,
  registerEndpointIfAbsent,
  registerKnownLocation,
  registerSourceManifest,
  applyMapViewDefaultsIfUnset,
  setManifestDefaultsInitializer,
  type CoverageBounds,
} from './manifest.js';

/** Approximate Michigan state bounds for regional sources. */
export const MICHIGAN_COVERAGE: CoverageBounds = {
  south: 41.5,
  west: -90.5,
  north: 48.5,
  east: -82.0,
};

/** East Lansing / Lansing metro for city-specific sources. */
export const LANSING_METRO_COVERAGE: CoverageBounds = {
  south: 42.6,
  west: -84.7,
  north: 42.8,
  east: -84.3,
};

export function registerDefaultManifests(): void {
  // ── External service endpoints ───────────────────
  registerEndpointIfAbsent(endpointKey('overpass'), 'https://overpass-api.de/api/interpreter');
  registerEndpointIfAbsent(endpointKey('nominatim'), 'https://nominatim.openstreetmap.org/search');
  registerEndpointIfAbsent(endpointKey('epqs'), 'https://epqs.nationalmap.gov/v1/json');
  registerEndpointIfAbsent(
    endpointKey('nfhl'),
    'https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer',
  );
  registerEndpointIfAbsent(endpointKey('nrcs-wms'), 'https://sdmdataaccess.sc.egov.usda.gov/Spatial/SDM.wms');
  registerEndpointIfAbsent(
    endpointKey('mi-framework'),
    'https://gisagocss.state.mi.us/arcgis/rest/services/OpenData/michigan_geographic_framework/MapServer',
  );
  registerEndpointIfAbsent(endpointKey('mi-gisp'), 'https://gisp.mcgi.state.mi.us/arcgis/rest/services');
  registerEndpointIfAbsent(
    endpointKey('zoning'),
    'https://gis2.cityofeastlansing.com/arcgis/rest/services/ZoningDistricts/FeatureServer/0',
  );
  registerEndpointIfAbsent(
    endpointKey('basemap-satellite'),
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  );
  registerEndpointIfAbsent(endpointKey('basemap-street'), 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
  registerEndpointIfAbsent(
    endpointKey('basemap-labels'),
    'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
  );
  registerEndpointIfAbsent(
    endpointKey('parcels-tiles'),
    'https://tiles.arcgis.com/tiles/KzeiCaQsMoeCfoCq/arcgis/rest/services/Regrid_Nationwide_Parcel_Boundaries_v1/MapServer/tile/{z}/{y}/{x}',
  );

  // ── Map defaults (East Lansing — overridable at runtime) ──
  applyMapViewDefaultsIfUnset({
    center: [42.7085, -84.5537],
    zoom: 18,
  });

  // ── Source capability manifests ──────────────────
  const autoEnable = ['discovery:auto-enable'] as const;
  const utilityConflict = ['intelligence:utility-conflict'] as const;

  registerSourceManifest({
    id: 'osm-buildings',
    capabilities: [...autoEnable],
    endpointKeys: [endpointKey('overpass')],
  });
  registerSourceManifest({
    id: 'osm-power',
    capabilities: [...autoEnable, ...utilityConflict],
    endpointKeys: [endpointKey('overpass')],
  });
  registerSourceManifest({
    id: 'osm-pipelines',
    capabilities: [...utilityConflict],
    endpointKeys: [endpointKey('overpass')],
  });
  registerSourceManifest({
    id: 'osm-fences',
    capabilities: [...autoEnable],
    endpointKeys: [endpointKey('overpass')],
  });
  registerSourceManifest({
    id: 'osm-water',
    capabilities: [...utilityConflict],
    endpointKeys: [endpointKey('overpass')],
  });
  registerSourceManifest({
    id: 'osm-manholes',
    capabilities: [...autoEnable, ...utilityConflict],
    endpointKeys: [endpointKey('overpass')],
  });
  registerSourceManifest({
    id: 'osm-hydrants',
    capabilities: [...autoEnable, ...utilityConflict],
    endpointKeys: [endpointKey('overpass')],
  });
  registerSourceManifest({
    id: 'osm-poles',
    capabilities: [...autoEnable, ...utilityConflict],
    endpointKeys: [endpointKey('overpass')],
  });
  registerSourceManifest({
    id: 'parcels',
    capabilities: [...autoEnable],
    endpointKeys: [endpointKey('parcels-tiles')],
  });
  registerSourceManifest({
    id: 'fema-flood',
    capabilities: [],
    endpointKeys: [endpointKey('nfhl')],
  });
  registerSourceManifest({
    id: 'lansing-zoning',
    capabilities: [],
    coverage: LANSING_METRO_COVERAGE,
    endpointKeys: [endpointKey('zoning')],
  });
  registerSourceManifest({
    id: 'usgs-elevation',
    capabilities: [],
    endpointKeys: [endpointKey('epqs')],
  });
  registerSourceManifest({
    id: 'nrcs-soils',
    capabilities: [],
    endpointKeys: [endpointKey('nrcs-wms')],
  });
  registerSourceManifest({
    id: 'mi-roads',
    capabilities: [],
    coverage: MICHIGAN_COVERAGE,
    endpointKeys: [endpointKey('mi-framework')],
  });

  // ── Known locations (tutorial + E2E harness) ─────
  registerKnownLocation({
    id: 'msu-campus',
    name: 'MSU Campus',
    center: [42.7249, -84.4815],
    zoom: 17,
    description: 'Michigan State University — buildings, parcels, power infrastructure',
    expectedSources: ['osm-buildings', 'osm-power', 'parcels', 'osm-fences'],
  });
  registerKnownLocation({
    id: 'el-downtown',
    name: 'Downtown East Lansing',
    center: [42.7369, -84.4838],
    zoom: 18,
    description: 'East Lansing downtown — zoning, parcels, dense OSM coverage',
    expectedSources: ['osm-buildings', 'parcels', 'lansing-zoning'],
  });
  registerKnownLocation({
    id: 'red-cedar',
    name: 'Red Cedar River',
    center: [42.7271, -84.4747],
    zoom: 17,
    description: 'Red Cedar floodplain — FEMA flood zones, water features, terrain',
    expectedSources: ['fema-flood', 'osm-water', 'usgs-elevation'],
  });
  registerKnownLocation({
    id: 'meridian-twp',
    name: 'Meridian Township',
    center: [42.712, -84.423],
    zoom: 17,
    description: 'Suburban residential — parcels, soils, road network',
    expectedSources: ['parcels', 'nrcs-soils', 'mi-roads'],
  });
  registerKnownLocation({
    id: 'haslett-farms',
    name: 'Haslett Agriculture',
    center: [42.748, -84.396],
    zoom: 16,
    description: 'Agricultural area — soil types, terrain contours, large parcels',
    expectedSources: ['nrcs-soils', 'usgs-elevation', 'parcels'],
  });
  registerKnownLocation({
    id: 'john-bean-building',
    name: 'John Bean Building (Lansing Scuffle)',
    center: [42.7184, -84.544],
    zoom: 17,
    description: '1305 S Cedar St — 464K SF industrial, solarpunk sovereign campus target',
    expectedSources: ['osm-buildings', 'parcels', 'mi-roads'],
  });
}

setManifestDefaultsInitializer(registerDefaultManifests);
