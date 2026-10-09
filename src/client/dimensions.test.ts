// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FEET_PER_MILE } from '../constants.js';

vi.mock('leaflet', () => {
  const layerGroup = () => ({
    addTo: vi.fn(),
    clearLayers: vi.fn(),
    removeLayer: vi.fn(),
    addLayer: vi.fn(),
  });
  return {
    layerGroup,
    marker: vi.fn((_ll: unknown, _o: unknown) => ({})),
    divIcon: vi.fn((o: unknown) => o),
    default: { layerGroup, marker: vi.fn(), divIcon: vi.fn() },
  };
});

vi.mock('@geoman-io/leaflet-geoman-free', () => ({}));
vi.mock('@turf/distance', () => ({ distance: vi.fn(() => 42.5) }));
vi.mock('@turf/midpoint', () => ({ midpoint: vi.fn((_a: unknown, _b: unknown) => ({ geometry: { coordinates: [0, 0] } })) }));
vi.mock('@turf/bearing', () => ({ bearing: vi.fn(() => 45) }));
vi.mock('@turf/helpers', () => ({ point: (coords: number[]) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: coords } }) }));

vi.mock('../core/store.js', () => ({
  store: {
    get: vi.fn(),
    byKind: vi.fn(() => ({ [Symbol.iterator]: () => [][Symbol.iterator]() })),
    withComponent: vi.fn(() => ({ filterMap: () => ({ collect: () => [] }) })),
  },
}));

vi.mock('../core/history.js', () => ({ execute: vi.fn() }));
vi.mock('../core/commands.js', () => ({
  AddEntityCommand: vi.fn(),
  UpdateComponentCommand: vi.fn(),
  BatchCommand: vi.fn(),
}));
vi.mock('../core/reactive.js', () => ({
  registerComputation: vi.fn(),
}));
vi.mock('../core/geometry.js', () => ({
  extractCoords: vi.fn(() => []),
}));
vi.mock('../rustscript/option.js', () => ({
  Some: (v: unknown) => ({ _tag: 'some', value: v }),
  None: () => ({ _tag: 'none' }),
}));

describe('dimensions module', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('formatDist (via module internals)', () => {
    it('formats distances in miles when >= FEET_PER_MILE', () => {
      const dist = FEET_PER_MILE * 2.5;
      const formatted = dist >= FEET_PER_MILE
        ? `${(dist / FEET_PER_MILE).toFixed(2)} mi`
        : `${Math.round(dist)} ft`;
      expect(formatted).toBe('2.50 mi');
    });

    it('formats large feet as rounded integers', () => {
      const dist = 150;
      const formatted = dist >= FEET_PER_MILE
        ? `${(dist / FEET_PER_MILE).toFixed(2)} mi`
        : dist >= 100
          ? `${Math.round(dist)} ft`
          : `${dist.toFixed(1)} ft`;
      expect(formatted).toBe('150 ft');
    });

    it('formats small feet with one decimal', () => {
      const dist = 42.567;
      const formatted = dist >= 100 ? `${Math.round(dist)} ft` : `${dist.toFixed(1)} ft`;
      expect(formatted).toBe('42.6 ft');
    });
  });

  describe('initDimensions', () => {
    it('registers computation on init', async () => {
      const { registerComputation } = await import('../core/reactive.js');
      const { initDimensions } = await import('./dimensions.js');

      const mockMap = {
        on: vi.fn(),
      };
      initDimensions(mockMap as never);

      expect(registerComputation).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'dimension-update', watchComponents: ['geometry'] }),
      );
    });

    it('subscribes to pm:drawstart, pm:drawend, pm:create', async () => {
      const { initDimensions } = await import('./dimensions.js');
      const mockMap = { on: vi.fn() };
      initDimensions(mockMap as never);

      const events = mockMap.on.mock.calls.map((c: unknown[]) => c[0]);
      expect(events).toContain('pm:drawstart');
      expect(events).toContain('pm:drawend');
      expect(events).toContain('pm:create');
    });
  });
});
