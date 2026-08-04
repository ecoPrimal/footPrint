// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as L from 'leaflet';
import { DEFAULT_GRID_SPACING_FT, GRID_MIN_ZOOM } from '../constants.js';

const polylineMock = vi.hoisted(() =>
  vi.fn((_latlngs: L.LatLngExpression[], _options?: L.PolylineOptions) => ({
    addTo: vi.fn(),
  })),
);

vi.mock('leaflet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('leaflet')>();
  return {
    ...actual,
    polyline: polylineMock,
  };
});

let grid: typeof import('./grid.js');

type MapHandler = () => void;

function createMockMap(zoom = GRID_MIN_ZOOM) {
  const handlers = new Map<string, MapHandler[]>();
  const bounds = L.latLngBounds(L.latLng(42.73, -84.55), L.latLng(42.74, -84.54));
  const addLayer = vi.fn();
  const removeLayer = vi.fn();
  const map = {
    on: vi.fn((event: string, handler: MapHandler) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    }),
    addLayer,
    removeLayer,
    getZoom: vi.fn(() => zoom),
    getBounds: vi.fn(() => bounds.pad(0.1)),
  } as unknown as L.Map;

  return { map, handlers, addLayer, removeLayer };
}

beforeEach(async () => {
  vi.resetModules();
  polylineMock.mockClear();
  grid = await import('./grid.js');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('grid spacing', () => {
  it('reports the default grid spacing in feet', () => {
    expect(grid.getGridSpacing()).toBe(DEFAULT_GRID_SPACING_FT);
  });
});

describe('toggleGrid', () => {
  it('toggles grid visibility and notifies listeners', () => {
    const { map, addLayer, removeLayer } = createMockMap();
    const onGridChange = vi.fn();
    grid.initGrid(map, onGridChange);

    expect(grid.isGridEnabled()).toBe(false);

    const enabled = grid.toggleGrid();
    expect(enabled).toBe(true);
    expect(grid.isGridEnabled()).toBe(true);
    expect(addLayer).toHaveBeenCalled();
    expect(onGridChange).toHaveBeenCalledWith(true, DEFAULT_GRID_SPACING_FT);

    const disabled = grid.toggleGrid();
    expect(disabled).toBe(false);
    expect(grid.isGridEnabled()).toBe(false);
    expect(removeLayer).toHaveBeenCalled();
    expect(onGridChange).toHaveBeenCalledWith(false, DEFAULT_GRID_SPACING_FT);
  });
});

describe('renderGrid', () => {
  it('draws grid lines when enabled at sufficient zoom', () => {
    const { map } = createMockMap(GRID_MIN_ZOOM);
    grid.initGrid(map);

    grid.toggleGrid();

    expect(polylineMock).toHaveBeenCalled();
  });

  it('skips drawing when zoom is below the minimum', () => {
    const { map, handlers } = createMockMap(GRID_MIN_ZOOM - 2);
    grid.initGrid(map);
    grid.toggleGrid();

    polylineMock.mockClear();
    for (const handler of handlers.get('moveend') ?? []) {
      handler();
    }

    expect(polylineMock).not.toHaveBeenCalled();
  });

  it('re-renders on map move when grid is enabled', () => {
    const { map, handlers } = createMockMap(GRID_MIN_ZOOM);
    grid.initGrid(map);
    grid.toggleGrid();
    polylineMock.mockClear();

    for (const handler of handlers.get('moveend') ?? []) {
      handler();
    }

    expect(polylineMock).toHaveBeenCalled();
  });
});
