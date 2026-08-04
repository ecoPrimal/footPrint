// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as L from 'leaflet';
import { DEFAULT_SNAP_CONFIG, type SnapConfig } from '../types/snap.js';
import { SNAP_SOURCE_LABEL_RADIUS_M } from '../constants.js';
import { dataSourceId, hexColorUnchecked } from '../types/brands.js';
import type { DataSourceState } from '../types/source.js';

const snapGroupAddLayer = vi.hoisted(() => vi.fn());

vi.mock('leaflet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('leaflet')>();
  return {
    ...actual,
    layerGroup: vi.fn(() => ({
      addTo: vi.fn(),
      clearLayers: vi.fn(),
      addLayer: snapGroupAddLayer,
    })),
  };
});

vi.mock('./datasources.js', () => ({
  getAllSources: vi.fn(() => ({})),
}));

import { getAllSources } from './datasources.js';

let snap: typeof import('./snap.js');

type MapHandler = (...args: unknown[]) => void;

function createMockMap() {
  const handlers = new Map<string, MapHandler[]>();
  const pm = { setGlobalOptions: vi.fn() };
  const bounds = L.latLngBounds(L.latLng(42.73, -84.55), L.latLng(42.74, -84.54));
  const addLayer = vi.fn();
  const map = {
    pm,
    on: vi.fn((event: string, handler: MapHandler) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    }),
    addLayer,
    getBounds: vi.fn(() => bounds),
  } as unknown as L.Map;

  return { map, handlers, pm, bounds, addLayer };
}

function vectorSource(id: string, name: string, features: GeoJSON.Feature[], enabled = true): DataSourceState {
  const geoLayer = L.geoJSON({ type: 'FeatureCollection', features } as GeoJSON.FeatureCollection);
  return {
    id: dataSourceId(id),
    name,
    category: 'Test',
    color: hexColorUnchecked('#3388ff'),
    type: 'vector',
    enabled,
    loading: false,
    featureCount: features.length,
    layer: geoLayer,
    lastBounds: null,
    error: null,
  };
}

beforeEach(async () => {
  vi.resetModules();
  snapGroupAddLayer.mockClear();
  vi.mocked(getAllSources).mockReturnValue({});
  snap = await import('./snap.js');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('snap configuration', () => {
  it('initializes with default snap options on the map', () => {
    const { map, pm } = createMockMap();
    snap.initSnap(map);

    expect(pm.setGlobalOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        snappable: DEFAULT_SNAP_CONFIG.enabled,
        snapDistance: DEFAULT_SNAP_CONFIG.snapDistance,
        snapVertex: DEFAULT_SNAP_CONFIG.snapToVertices,
        snapMiddle: DEFAULT_SNAP_CONFIG.snapToMidpoints,
      }),
    );
  });

  it('toggles snap enabled state', () => {
    const { map } = createMockMap();
    snap.initSnap(map);

    expect(snap.getSnapConfig().enabled).toBe(true);
    expect(snap.toggleSnap()).toBe(false);
    expect(snap.getSnapConfig().enabled).toBe(false);
    expect(snap.toggleSnap()).toBe(true);
  });

  it('updates geoman options when snap is disabled', () => {
    const { map, pm } = createMockMap();
    snap.initSnap(map);
    pm.setGlobalOptions.mockClear();

    snap.setSnapEnabled(false);

    expect(pm.setGlobalOptions).toHaveBeenCalledWith({ snappable: false });
  });
});

describe('rebuildSnapIndex', () => {
  it('indexes enabled vector features for snapping', () => {
    const { map } = createMockMap();
    const nearPoint: GeoJSON.Feature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [-84.545, 42.735] },
    };
    vi.mocked(getAllSources).mockReturnValue({
      parcels: vectorSource('parcels', 'Parcels', [nearPoint]),
    });

    snap.initSnap(map);
    expect(snapGroupAddLayer.mock.calls.length).toBeGreaterThan(0);
  });

  it('adds grid snap points when snap-to-grid is enabled', () => {
    const { map } = createMockMap();
    snap.initSnap(map);
    snapGroupAddLayer.mockClear();

    const config = snap.getSnapConfig() as SnapConfig;
    config.snapToGrid = true;
    config.snapToFeatures = false;

    snap.rebuildSnapIndex();
    expect(snapGroupAddLayer.mock.calls.length).toBeGreaterThan(0);
  });
});

describe('snap distance and prioritization', () => {
  it('labels snap with the nearest enabled source name', () => {
    const { map, handlers } = createMockMap();
    const snapLatLng = L.latLng(42.735, -84.545);

    const nearFeature: GeoJSON.Feature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [-84.545, 42.735] },
    };
    const farFeature: GeoJSON.Feature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [-84.5, 42.8] },
    };

    vi.mocked(getAllSources).mockReturnValue({
      near: vectorSource('near', 'Near Source', [nearFeature]),
      far: vectorSource('far', 'Far Source', [farFeature]),
    });

    const onSnapChange = vi.fn();
    snap.initSnap(map, onSnapChange);

    const snapHandlers = handlers.get('pm:snap') ?? [];
    expect(snapHandlers.length).toBeGreaterThan(0);
    snapHandlers[0]!({ snapLatLng });

    expect(onSnapChange).toHaveBeenCalledWith('Near Source');
  });

  it('prefers vertex distance over farther sources', () => {
    const { map, handlers } = createMockMap();
    const vertex = L.latLng(42.7351, -84.5451);

    const lineFeature: GeoJSON.Feature = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [-84.545, 42.735],
          [-84.544, 42.736],
        ],
      },
    };
    const distantPoint: GeoJSON.Feature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [-84.54, 42.74] },
    };

    vi.mocked(getAllSources).mockReturnValue({
      line: vectorSource('line', 'Edge Source', [lineFeature]),
      point: vectorSource('point', 'Distant Source', [distantPoint]),
    });

    const onSnapChange = vi.fn();
    snap.initSnap(map, onSnapChange);
    (handlers.get('pm:snap') ?? [])[0]!({ snapLatLng: vertex });

    expect(onSnapChange).toHaveBeenCalledWith('Edge Source');
  });

  it('returns generic label when no source is within the snap radius', () => {
    const { map, handlers } = createMockMap();
    const awayFromSources = L.latLng(40.0, -90.0);

    vi.mocked(getAllSources).mockReturnValue({
      remote: vectorSource('remote', 'Remote', [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [-84.2, 42.9] },
        },
      ]),
    });

    const onSnapChange = vi.fn();
    snap.initSnap(map, onSnapChange);
    (handlers.get('pm:snap') ?? [])[0]!({ snapLatLng: awayFromSources });

    expect(onSnapChange).toHaveBeenCalledWith('Feature');
    expect(SNAP_SOURCE_LABEL_RADIUS_M).toBeGreaterThan(0);
  });

  it('clears snap info on unsnap', () => {
    const { map, handlers } = createMockMap();
    const onSnapChange = vi.fn();
    snap.initSnap(map, onSnapChange);

    (handlers.get('pm:unsnap') ?? [])[0]!();
    expect(onSnapChange).toHaveBeenCalledWith(null);
  });
});
