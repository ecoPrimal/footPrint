// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../core/manifest-defaults.js', () => ({}));
vi.mock('../../core/manifest.js', () => ({
  endpointKey: (k: string) => k,
  getEndpoint: (k: string) => k === 'epqs' ? 'https://epqs.national.gov/v1/json' : '',
  setManifestDefaultsInitializer: vi.fn(),
  registerEndpoint: vi.fn(),
  registerSourceManifest: vi.fn(),
  cspImgSrcHosts: vi.fn(() => []),
  getMapViewDefaults: () => ({ center: [42.73, -84.48], zoom: 14 }),
  getKnownLocations: () => [],
  endpointHosts: () => [],
  setEndpoint: vi.fn(),
  tryGetEndpoint: vi.fn(() => undefined),
  listEndpointKeys: () => [],
}));

vi.mock('../api.js', () => ({
  proxyUrl: (url: string) => `/proxy?url=${encodeURIComponent(url)}`,
}));

vi.mock('../datasources.js', () => ({
  registerSource: vi.fn(),
}));

vi.mock('leaflet', () => ({
  divIcon: vi.fn((opts: Record<string, unknown>) => opts),
  marker: vi.fn((latlng: unknown, opts: unknown) => ({ latlng, opts })),
}));

describe('usgs source', () => {
  let batchElevation: typeof import('./usgs.js')['batchElevation'];

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    const mod = await import('./usgs.js');
    batchElevation = mod.batchElevation;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('batchElevation', () => {
    it('fetches elevation for each point and returns results', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ value: 892.5 }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ value: 901.2 }) });
      vi.stubGlobal('fetch', mockFetch);

      const result = await batchElevation([
        { lat: 42.73, lng: -84.55 },
        { lat: 42.74, lng: -84.54 },
      ]);

      expect(result).toHaveLength(2);
      expect(result[0]!.elevation).toBe(892.5);
      expect(result[1]!.elevation).toBe(901.2);
    });

    it('returns null elevation on fetch failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));

      const result = await batchElevation([{ lat: 42.73, lng: -84.55 }]);

      expect(result).toHaveLength(1);
      expect(result[0]!.elevation).toBeNull();
    });

    it('returns null elevation on non-ok response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

      const result = await batchElevation([{ lat: 42.73, lng: -84.55 }]);

      expect(result[0]!.elevation).toBeNull();
    });

    it('returns null when value is not a number', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ value: 'N/A' }),
      }));

      const result = await batchElevation([{ lat: 42.73, lng: -84.55 }]);

      expect(result[0]!.elevation).toBeNull();
    });
  });

  describe('registerUSGSSource', () => {
    it('registers with correct id and category', async () => {
      const { registerSource } = await import('../datasources.js');
      const { registerUSGSSource } = await import('./usgs.js');
      registerUSGSSource();

      expect(registerSource).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'usgs-elevation',
          name: 'Elevation Points',
          category: 'USGS',
          minZoom: 16,
        }),
      );
    });
  });
});
