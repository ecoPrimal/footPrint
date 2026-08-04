// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VectorSourceDef } from '../../types/source.js';

vi.mock('../../core/manifest-defaults.js', () => ({}));
vi.mock('../../core/manifest.js', () => ({
  endpointKey: (k: string) => k,
  getEndpoint: (k: string) => k === 'nfhl' ? 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer' : '',
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

describe('fema source', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('registerFemaSource', () => {
    it('registers with correct metadata', async () => {
      const { registerSource } = await import('../datasources.js');
      const { registerFemaSource } = await import('./fema.js');
      registerFemaSource();

      expect(registerSource).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'fema-flood',
          name: 'Flood Zones',
          category: 'FEMA',
          minZoom: 13,
        }),
      );
    });

    it('style returns high fill opacity for SFHA zones', async () => {
      const { registerSource } = await import('../datasources.js');
      const { registerFemaSource } = await import('./fema.js');
      registerFemaSource();

      const call = vi.mocked(registerSource).mock.calls[0]![0] as VectorSourceDef;
      const feature = {
        type: 'Feature' as const,
        properties: { FLD_ZONE: 'AE', SFHA_TF: 'T' },
        geometry: { type: 'Polygon' as const, coordinates: [] },
      };
      const style = call.style!(feature);
      expect(style.fillOpacity).toBe(0.3);
      expect(style.color).toBe('#2471a3');
    });

    it('style returns low fill opacity for non-SFHA zones', async () => {
      const { registerSource } = await import('../datasources.js');
      const { registerFemaSource } = await import('./fema.js');
      registerFemaSource();

      const call = vi.mocked(registerSource).mock.calls[0]![0] as VectorSourceDef;
      const feature = {
        type: 'Feature' as const,
        properties: { FLD_ZONE: 'X', SFHA_TF: 'F' },
        geometry: { type: 'Polygon' as const, coordinates: [] },
      };
      const style = call.style!(feature);
      expect(style.fillOpacity).toBe(0.12);
      expect(style.color).toBe('#82e0aa');
    });

    it('popupContent includes zone and risk level', async () => {
      const { registerSource } = await import('../datasources.js');
      const { registerFemaSource } = await import('./fema.js');
      registerFemaSource();

      const call = vi.mocked(registerSource).mock.calls[0]![0] as VectorSourceDef;
      const feature = {
        type: 'Feature' as const,
        properties: { FLD_ZONE: 'AE', ZONE_SUBTY: 'Floodway', STATIC_BFE: 890, SFHA_TF: 'T' },
        geometry: { type: 'Polygon' as const, coordinates: [] },
      };
      const html = call.popupContent!(feature);
      expect(html).toContain('AE');
      expect(html).toContain('Floodway');
      expect(html).toContain('890');
      expect(html).toContain('High Risk (SFHA)');
    });
  });
});
