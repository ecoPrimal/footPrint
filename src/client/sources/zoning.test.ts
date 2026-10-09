// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VectorSourceDef } from '../../types/source.js';

vi.mock('../../core/manifest-defaults.js', () => ({}));
vi.mock('../../core/manifest.js', () => ({
  endpointKey: (k: string) => k,
  getEndpoint: (k: string) => k === 'zoning' ? 'https://gis.example.com/zoning/MapServer/0' : '',
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
  proxyGet: vi.fn(),
}));

vi.mock('../datasources.js', () => ({
  registerSource: vi.fn(),
}));

vi.mock('leaflet', () => ({}));

describe('zoning source', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('registerZoningSource', () => {
    it('registers with correct metadata', async () => {
      const { registerSource } = await import('../datasources.js');
      const { registerZoningSource } = await import('./zoning.js');
      registerZoningSource();

      expect(registerSource).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'lansing-zoning',
          name: 'Zoning Districts',
          category: 'Lansing',
          minZoom: 13,
        }),
      );
    });

    it('style returns green for residential (R) zones', async () => {
      const { registerSource } = await import('../datasources.js');
      const { registerZoningSource } = await import('./zoning.js');
      registerZoningSource();

      const call = vi.mocked(registerSource).mock.calls[0]![0] as VectorSourceDef;
      const feature = {
        type: 'Feature' as const,
        properties: { ZONING: 'R-1' },
        geometry: { type: 'Polygon' as const, coordinates: [] },
      };
      const style = call.style!(feature);
      expect(style.color).toBe('#66bb6a');
    });

    it('style returns purple for commercial (C) zones', async () => {
      const { registerSource } = await import('../datasources.js');
      const { registerZoningSource } = await import('./zoning.js');
      registerZoningSource();

      const call = vi.mocked(registerSource).mock.calls[0]![0] as VectorSourceDef;
      const feature = {
        type: 'Feature' as const,
        properties: { ZONING: 'C-2' },
        geometry: { type: 'Polygon' as const, coordinates: [] },
      };
      const style = call.style!(feature);
      expect(style.color).toBe('#5c6bc0');
    });

    it('style returns fallback gray for unknown zone prefix', async () => {
      const { registerSource } = await import('../datasources.js');
      const { registerZoningSource } = await import('./zoning.js');
      registerZoningSource();

      const call = vi.mocked(registerSource).mock.calls[0]![0] as VectorSourceDef;
      const feature = {
        type: 'Feature' as const,
        properties: { ZONING: 'X-9' },
        geometry: { type: 'Polygon' as const, coordinates: [] },
      };
      const style = call.style!(feature);
      expect(style.color).toBe('#95a5a6');
    });

    it('popupContent renders zone and description', async () => {
      const { registerSource } = await import('../datasources.js');
      const { registerZoningSource } = await import('./zoning.js');
      registerZoningSource();

      const call = vi.mocked(registerSource).mock.calls[0]![0] as VectorSourceDef;
      const feature = {
        type: 'Feature' as const,
        properties: { ZONING: 'R-1', ZONING_DES: 'Single Family Residential' },
        geometry: { type: 'Polygon' as const, coordinates: [] },
      };
      const html = call.popupContent!(feature);
      expect(html).toContain('R-1');
      expect(html).toContain('Single Family Residential');
    });

    it('popupContent falls back to Zone/Description fields', async () => {
      const { registerSource } = await import('../datasources.js');
      const { registerZoningSource } = await import('./zoning.js');
      registerZoningSource();

      const call = vi.mocked(registerSource).mock.calls[0]![0] as VectorSourceDef;
      const feature = {
        type: 'Feature' as const,
        properties: { Zone: 'B-3', Description: 'Commercial' },
        geometry: { type: 'Polygon' as const, coordinates: [] },
      };
      const html = call.popupContent!(feature);
      expect(html).toContain('B-3');
      expect(html).toContain('Commercial');
    });
  });
});
