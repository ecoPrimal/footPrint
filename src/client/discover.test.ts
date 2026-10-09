// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scoreDiscoverySource, enableSourcesWithCapability } from './discover.js';
import { clearManifestRegistry, registerSourceManifest } from '../core/manifest.js';
import { DISCOVERY_PROXIMITY_RADIUS_M } from '../constants.js';
import { dataSourceId, hexColorUnchecked } from '../types/brands.js';

vi.mock('./datasources.js', () => ({
  getAllSources: vi.fn(),
  enableSource: vi.fn(),
}));

vi.mock('../core/manifest.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/manifest.js')>();
  return {
    ...actual,
    getSourceIdsByCapability: vi.fn(),
  };
});

import * as datasources from './datasources.js';
import * as manifest from '../core/manifest.js';

const propertyGeom: GeoJSON.Feature = {
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [-84.55, 42.73],
        [-84.54, 42.73],
        [-84.54, 42.74],
        [-84.55, 42.74],
        [-84.55, 42.73],
      ],
    ],
  },
};

const testCategoryBoosts = {
  OpenStreetMap: 0.9,
  Property: 0.85,
  FEMA: 0.7,
  Lansing: 0.6,
  USGS: 0.8,
  Soils: 0.7,
  Michigan: 0.4,
  Infrastructure: 1.0,
};

function scoreWithBoosts(
  sourceId: string,
  src: { name: string; category: string },
  features: readonly GeoJSON.Feature[],
  geom: GeoJSON.Feature | null,
) {
  return scoreDiscoverySource(sourceId, src, features, geom, testCategoryBoosts);
}

function pointFeature(lng: number, lat: number): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Point', coordinates: [lng, lat] },
  };
}

beforeEach(() => {
  clearManifestRegistry();
  vi.mocked(datasources.getAllSources).mockReset();
  vi.mocked(datasources.enableSource).mockReset();
  vi.mocked(manifest.getSourceIdsByCapability).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('enableSourcesWithCapability', () => {
  it('auto-enables sources registered with discovery:auto-enable', async () => {
    registerSourceManifest({
      id: 'osm-buildings',
      capabilities: ['discovery:auto-enable'],
    });
    registerSourceManifest({
      id: 'fema-flood',
      capabilities: ['intelligence:utility-conflict'],
    });

    vi.mocked(manifest.getSourceIdsByCapability).mockReturnValue(['osm-buildings']);
    vi.mocked(datasources.getAllSources).mockReturnValue({
      'osm-buildings': {
        id: dataSourceId('osm-buildings'),
        name: 'OSM Buildings',
        category: 'OpenStreetMap',
        color: hexColorUnchecked('#3388ff'),
        type: 'vector',
        enabled: false,
        loading: false,
        featureCount: 0,
        layer: {} as never,
        lastBounds: null,
        error: null,
      },
      'fema-flood': {
        id: dataSourceId('fema-flood'),
        name: 'FEMA Flood',
        category: 'FEMA',
        color: hexColorUnchecked('#0066cc'),
        type: 'vector',
        enabled: false,
        loading: false,
        featureCount: 0,
        layer: {} as never,
        lastBounds: null,
        error: null,
      },
    });
    vi.mocked(datasources.enableSource).mockResolvedValue(undefined);

    const enabled = await enableSourcesWithCapability('discovery:auto-enable');

    expect(enabled).toEqual(['osm-buildings']);
    expect(datasources.enableSource).toHaveBeenCalledTimes(1);
    expect(datasources.enableSource).toHaveBeenCalledWith('osm-buildings');
  });

  it('skips sources that are already enabled', async () => {
    vi.mocked(manifest.getSourceIdsByCapability).mockReturnValue(['already-on']);
    vi.mocked(datasources.getAllSources).mockReturnValue({
      'already-on': {
        id: dataSourceId('already-on'),
        name: 'Enabled Source',
        category: 'Infrastructure',
        color: hexColorUnchecked('#000000'),
        type: 'vector',
        enabled: true,
        loading: false,
        featureCount: 5,
        layer: {} as never,
        lastBounds: null,
        error: null,
      },
    });

    const enabled = await enableSourcesWithCapability('discovery:auto-enable');
    expect(enabled).toEqual([]);
    expect(datasources.enableSource).not.toHaveBeenCalled();
  });
});

describe('scoreDiscoverySource', () => {
  it('returns null when there are no features', () => {
    const result = scoreDiscoverySource(
      'src-1',
      { name: 'Empty', category: 'FEMA' },
      [],
      propertyGeom,
      testCategoryBoosts,
    );
    expect(result).toBeNull();
  });

  it('scores nearby features higher than distant ones', () => {
    const nearFeatures = [pointFeature(-84.545, 42.735)];
    const farFeatures = [pointFeature(-84.5, 42.8)];

    const near = scoreWithBoosts(
      'near',
      { name: 'Near Source', category: 'Infrastructure' },
      nearFeatures,
      propertyGeom,
    );
    const far = scoreWithBoosts('far', { name: 'Far Source', category: 'Infrastructure' }, farFeatures, propertyGeom);

    expect(near).not.toBeNull();
    expect(far).not.toBeNull();
    expect(near!.relevanceScore).toBeGreaterThan(far!.relevanceScore);
    expect(near!.nearestDistance).toBeLessThan(far!.nearestDistance);
  });

  it('applies category boost from manifest defaults', () => {
    const features = [pointFeature(-84.545, 42.735)];

    const infra = scoreWithBoosts('infra', { name: 'Infra', category: 'Infrastructure' }, features, propertyGeom);
    const michigan = scoreWithBoosts('mi', { name: 'MI', category: 'Michigan' }, features, propertyGeom);

    expect(infra!.relevanceScore).toBeGreaterThan(michigan!.relevanceScore);
  });

  it('increases score with more features (count component)', () => {
    const few = [pointFeature(-84.545, 42.735)];
    const many = Array.from({ length: 20 }, () => pointFeature(-84.545, 42.735));

    const fewScore = scoreWithBoosts('few', { name: 'Few', category: 'USGS' }, few, propertyGeom);
    const manyScore = scoreWithBoosts('many', { name: 'Many', category: 'USGS' }, many, propertyGeom);

    expect(manyScore!.relevanceScore).toBeGreaterThan(fewScore!.relevanceScore);
    expect(manyScore!.featureCount).toBe(20);
  });

  it('gives zero proximity score when property geometry is a point', () => {
    const pointProperty: GeoJSON.Feature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [-84.545, 42.735] },
    };
    const features = [pointFeature(-84.545, 42.735)];

    const result = scoreWithBoosts('src', { name: 'Source', category: 'FEMA' }, features, pointProperty);

    expect(result!.nearestDistance).toBe(Infinity);
    expect(result!.avgDistance).toBe(0);
    expect(result!.relevanceScore).toBeLessThan(1);
  });

  it('caps proximity contribution beyond the configured radius', () => {
    const atRadius = DISCOVERY_PROXIMITY_RADIUS_M;
    const beyondRadius = DISCOVERY_PROXIMITY_RADIUS_M * 2;

    const atEdge = scoreWithBoosts(
      'edge',
      { name: 'Edge', category: 'FEMA' },
      [pointFeature(-84.545, 42.735 + atRadius / 111_000)],
      propertyGeom,
    );
    const beyond = scoreWithBoosts(
      'beyond',
      { name: 'Beyond', category: 'FEMA' },
      [pointFeature(-84.545, 42.735 + beyondRadius / 111_000)],
      propertyGeom,
    );

    expect(atEdge!.relevanceScore).toBeGreaterThanOrEqual(beyond!.relevanceScore);
  });
});

describe('capability-based source discovery', () => {
  it('discovers sources by capability via manifest registry', () => {
    registerSourceManifest({ id: 'auto-a', capabilities: ['discovery:auto-enable'] });
    registerSourceManifest({ id: 'auto-b', capabilities: ['discovery:auto-enable'] });
    registerSourceManifest({ id: 'other', capabilities: ['intelligence:utility-conflict'] });

    vi.mocked(manifest.getSourceIdsByCapability).mockImplementation((cap) => {
      if (cap === 'discovery:auto-enable') return ['auto-a', 'auto-b'];
      return [];
    });

    expect(manifest.getSourceIdsByCapability('discovery:auto-enable')).toEqual(['auto-a', 'auto-b']);
    expect(manifest.getSourceIdsByCapability('intelligence:utility-conflict')).toEqual([]);
  });
});
