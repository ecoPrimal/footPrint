// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as L from 'leaflet';
import { dataSourceId, hexColorUnchecked } from '../types/brands.js';
import type { SourceRegistry } from '../types/source.js';

let ds: typeof import('./datasources.js');

const testColor = hexColorUnchecked('#3388ff');

const sampleFeature: GeoJSON.Feature = {
  type: 'Feature',
  properties: { name: 'Test' },
  geometry: { type: 'Point', coordinates: [-84.545, 42.735] },
};

function createMockMap(options?: { zoom?: number; bounds?: L.LatLngBounds }) {
  const bounds = options?.bounds ?? L.latLngBounds(L.latLng(42.73, -84.55), L.latLng(42.74, -84.54));
  const addLayer = vi.fn();
  const removeLayer = vi.fn();
  const map = {
    addLayer,
    removeLayer,
    getZoom: vi.fn(() => options?.zoom ?? 18),
    getBounds: vi.fn(() => bounds),
  } as unknown as L.Map;
  return { map, bounds, addLayer, removeLayer };
}

function vectorDef(id: string, fetch = vi.fn().mockResolvedValue([sampleFeature])) {
  return {
    id: dataSourceId(id),
    name: `Source ${id}`,
    category: 'Test',
    color: testColor,
    fetch,
  };
}

beforeEach(async () => {
  vi.resetModules();
  ds = await import('./datasources.js');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('registerSource', () => {
  it('registers a vector source with disabled defaults', () => {
    const state = ds.registerSource(vectorDef('vec-1'));

    expect(state.id).toBe(dataSourceId('vec-1'));
    expect(state.type).toBe('vector');
    expect(state.enabled).toBe(false);
    expect(state.loading).toBe(false);
    expect(state.featureCount).toBe(0);
    expect(state.error).toBeNull();
    expect(ds.getAllSources()['vec-1']).toBe(state);
  });

  it('registers tile and WMS sources', () => {
    const tile = ds.registerSource({
      id: dataSourceId('tile-1'),
      name: 'Tiles',
      category: 'Test',
      color: testColor,
      type: 'tiles',
      tileUrl: 'https://example.com/{z}/{x}/{y}.png',
    });
    const wms = ds.registerSource({
      id: dataSourceId('wms-1'),
      name: 'WMS',
      category: 'Test',
      color: testColor,
      type: 'wms',
      wmsUrl: 'https://example.com/wms',
      wmsLayers: 'layer0',
    });

    expect(tile.type).toBe('tiles');
    expect(wms.type).toBe('wms');
    expect(ds.getAllSources()['tile-1']).toBe(tile);
    expect(ds.getAllSources()['wms-1']).toBe(wms);
  });

  it('notifies the update callback on registration', () => {
    const { map } = createMockMap();
    const onUpdate = vi.fn();
    ds.initDataSources(map, onUpdate);

    ds.registerSource(vectorDef('notify-1'));

    expect(onUpdate).toHaveBeenCalled();
    const registry = onUpdate.mock.calls.at(-1)?.[0] as SourceRegistry;
    expect(registry['notify-1']).toBeDefined();
  });
});

describe('enableSource / toggleSource', () => {
  it('enables a vector source, adds layer to map, and fetches data', async () => {
    const fetchFn = vi.fn().mockResolvedValue([sampleFeature]);
    const { map, addLayer } = createMockMap();
    const onUpdate = vi.fn();
    ds.initDataSources(map, onUpdate);
    const state = ds.registerSource(vectorDef('enable-vec', fetchFn));

    await ds.enableSource('enable-vec');

    expect(state.enabled).toBe(true);
    expect(addLayer).toHaveBeenCalledWith(state.layer);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(state.featureCount).toBe(1);
    expect(state.loading).toBe(false);
  });

  it('disables an enabled source and removes its layer', async () => {
    const { map, removeLayer } = createMockMap();
    ds.initDataSources(map, vi.fn());
    ds.registerSource(vectorDef('toggle-1', vi.fn().mockResolvedValue([])));

    await ds.toggleSource('toggle-1');
    expect(ds.getAllSources()['toggle-1']!.enabled).toBe(true);

    await ds.toggleSource('toggle-1');
    expect(ds.getAllSources()['toggle-1']!.enabled).toBe(false);
    expect(removeLayer).toHaveBeenCalled();
  });

  it('does not fetch tile sources on enable', async () => {
    const { map } = createMockMap();
    ds.initDataSources(map, vi.fn());
    const tile = ds.registerSource({
      id: dataSourceId('tile-only'),
      name: 'Tiles',
      category: 'Test',
      color: testColor,
      type: 'tiles',
      tileUrl: 'https://example.com/{z}/{x}/{y}.png',
    });

    await ds.enableSource('tile-only');

    expect(tile.enabled).toBe(true);
    expect(tile.featureCount).toBe(0);
  });
});

describe('fetchSource', () => {
  it('skips fetch when zoom is below minZoom and sets an error', async () => {
    const fetchFn = vi.fn().mockResolvedValue([sampleFeature]);
    const { map } = createMockMap({ zoom: 10 });
    ds.initDataSources(map, vi.fn());
    ds.registerSource({ ...vectorDef('minzoom', fetchFn), minZoom: 15 });

    await ds.enableSource('minzoom');
    await ds.fetchSource('minzoom');

    expect(fetchFn).not.toHaveBeenCalled();
    expect(ds.getAllSources()['minzoom']!.error).toContain('Zoom in to level 15');
  });

  it('deduplicates fetch for unchanged bounds when features are loaded', async () => {
    const fetchFn = vi.fn().mockResolvedValue([sampleFeature]);
    const { map, bounds } = createMockMap();
    ds.initDataSources(map, vi.fn());
    ds.registerSource(vectorDef('dedup', fetchFn));
    await ds.enableSource('dedup');

    expect(fetchFn).toHaveBeenCalledTimes(1);

    await ds.fetchSource('dedup', bounds);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('records fetch errors on the source state', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'));
    const { map } = createMockMap();
    ds.initDataSources(map, vi.fn());
    ds.registerSource(vectorDef('err', fetchFn));
    await ds.enableSource('err');

    expect(ds.getAllSources()['err']!.error).toBe('network down');
    expect(ds.getAllSources()['err']!.loading).toBe(false);
  });

  it('fetchAllEnabled fetches every enabled vector source', async () => {
    const fetchA = vi.fn().mockResolvedValue([sampleFeature]);
    const fetchB = vi.fn().mockResolvedValue([sampleFeature]);
    const { map } = createMockMap();
    ds.initDataSources(map, vi.fn());
    ds.registerSource(vectorDef('all-a', fetchA));
    ds.registerSource(vectorDef('all-b', fetchB));
    ds.registerSource({
      id: dataSourceId('all-tile'),
      name: 'Tiles',
      category: 'Test',
      color: testColor,
      type: 'tiles',
      tileUrl: 'https://example.com/{z}/{x}/{y}.png',
    });

    await ds.enableSource('all-a');
    await ds.enableSource('all-b');
    await ds.enableSource('all-tile');

    fetchA.mockClear();
    fetchB.mockClear();

    const shiftedBounds = L.latLngBounds(L.latLng(42.75, -84.56), L.latLng(42.76, -84.55));
    await ds.fetchAllEnabled(shiftedBounds);

    expect(fetchA).toHaveBeenCalledTimes(1);
    expect(fetchB).toHaveBeenCalledTimes(1);
  });
});
