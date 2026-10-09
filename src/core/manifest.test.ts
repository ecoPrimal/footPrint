// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearManifestRegistry,
  endpointKey,
  setEndpoint,
  registerKnownLocation,
  registerSourceManifest,
  getEndpoint,
  getKnownLocations,
  getMapViewDefaults,
  getSourceIdsByCapability,
  findKnownLocation,
  setMapViewDefaults,
  setManifestDefaultsInitializer,
  coversPoint,
  sourcesCoveringPoint,
  cspImgSrcHosts,
} from './manifest.js';
import { registerDefaultManifests } from './manifest-defaults.js';

describe('manifest registry', () => {
  beforeEach(() => {
    clearManifestRegistry();
    setManifestDefaultsInitializer(registerDefaultManifests);
  });

  it('lazy-loads default endpoints', () => {
    expect(getEndpoint(endpointKey('overpass'))).toContain('overpass-api.de');
  });

  it('allows runtime endpoint override', () => {
    setEndpoint(endpointKey('overpass'), 'https://custom.example/api/interpreter');
    expect(getEndpoint(endpointKey('overpass'))).toBe('https://custom.example/api/interpreter');
  });

  it('resolves discovery auto-enable sources from capabilities', () => {
    const ids = getSourceIdsByCapability('discovery:auto-enable');
    expect(ids).toContain('osm-buildings');
    expect(ids).toContain('parcels');
    expect(ids).not.toContain('osm-pipelines');
  });

  it('resolves utility conflict sources from capabilities', () => {
    const ids = getSourceIdsByCapability('intelligence:utility-conflict');
    expect(ids).toContain('osm-power');
    expect(ids).toContain('osm-pipelines');
    expect(ids).not.toContain('parcels');
  });

  it('registers known locations with corrected expected source IDs', () => {
    const downtown = findKnownLocation('el-downtown');
    expect(downtown?.expectedSources).toContain('lansing-zoning');
    expect(downtown?.expectedSources).not.toContain('zoning');

    const redCedar = findKnownLocation('red-cedar');
    expect(redCedar?.expectedSources).toContain('usgs-elevation');
    expect(redCedar?.expectedSources).not.toContain('elevation');

    const meridian = findKnownLocation('meridian-twp');
    expect(meridian?.expectedSources).toContain('nrcs-soils');
    expect(meridian?.expectedSources).not.toContain('soils');
  });

  it('supports extending known locations at runtime', () => {
    registerKnownLocation({
      id: 'austin-downtown',
      name: 'Austin Downtown',
      center: [30.2672, -97.7431],
      zoom: 17,
      description: 'Texas capital — OSM coverage',
      expectedSources: ['osm-buildings', 'parcels'],
    });
    expect(getKnownLocations().some((l) => l.id === 'austin-downtown')).toBe(true);
  });

  it('filters sources by coverage bounds', () => {
    const miRoads = sourcesCoveringPoint(42.7, -84.5);
    expect(miRoads.some((m) => m.id === 'mi-roads')).toBe(true);

    const outsideMi = sourcesCoveringPoint(30.0, -97.0);
    expect(outsideMi.some((m) => m.id === 'mi-roads')).toBe(false);
    expect(outsideMi.some((m) => m.id === 'osm-buildings')).toBe(true);
  });

  it('coversPoint checks bounds correctly', () => {
    const bounds = { south: 42.0, west: -85.0, north: 43.0, east: -84.0 };
    expect(coversPoint(bounds, 42.5, -84.5)).toBe(true);
    expect(coversPoint(bounds, 41.0, -84.5)).toBe(false);
  });

  it('map view defaults are configurable', () => {
    setMapViewDefaults({ center: [40.0, -74.0], zoom: 15 });
    expect(getMapViewDefaults().center).toEqual([40.0, -74.0]);
    expect(getMapViewDefaults().zoom).toBe(15);
  });

  it('registers custom source manifests', () => {
    registerSourceManifest({
      id: 'custom-layer',
      capabilities: ['discovery:auto-enable'],
    });
    expect(getSourceIdsByCapability('discovery:auto-enable')).toContain('custom-layer');
  });

  it('derives CSP img-src hosts from tile endpoints', () => {
    const hosts = cspImgSrcHosts();
    expect(hosts).toContain('https://*.arcgisonline.com');
    expect(hosts).toContain('https://*.tile.openstreetmap.org');
    expect(hosts).toContain('https://tiles.arcgis.com');
    expect(hosts).not.toContain('https://overpass-api.de');
  });
});
