// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  clearManifestRegistry,
  endpointKey,
  registerEndpoint,
  setManifestDefaultsInitializer,
} from '../core/manifest.js';
import { registerDefaultManifests } from '../core/manifest-defaults.js';

vi.mock('./sources/osm.js', () => ({ registerOSMSources: vi.fn() }));
vi.mock('./sources/parcels.js', () => ({ registerParcelSource: vi.fn() }));
vi.mock('./sources/fema.js', () => ({ registerFemaSource: vi.fn() }));
vi.mock('./sources/zoning.js', () => ({ registerZoningSource: vi.fn() }));
vi.mock('./sources/usgs.js', () => ({ registerUSGSSource: vi.fn() }));
vi.mock('./sources/soils.js', () => ({ registerSoilsSource: vi.fn() }));
vi.mock('./sources/michigan.js', () => ({ registerMichiganSources: vi.fn() }));
vi.mock('./sources/infrastructure.js', () => ({ registerInfrastructureSources: vi.fn() }));

import { registerOSMSources } from './sources/osm.js';
import { registerParcelSource } from './sources/parcels.js';
import { registerZoningSource } from './sources/zoning.js';
import { registerAllSources } from './source-registry.js';

beforeEach(() => {
  clearManifestRegistry();
  setManifestDefaultsInitializer(registerDefaultManifests);
  vi.mocked(registerOSMSources).mockClear();
  vi.mocked(registerParcelSource).mockClear();
  vi.mocked(registerZoningSource).mockClear();
});

describe('registerAllSources', () => {
  it('registers all source bundles when default Michigan endpoints are available', () => {
    registerAllSources();

    expect(registerOSMSources).toHaveBeenCalledTimes(1);
    expect(registerParcelSource).toHaveBeenCalledTimes(1);
    expect(registerZoningSource).toHaveBeenCalledTimes(1);
  });

  it('skips registrars whose endpoints are missing', () => {
    clearManifestRegistry();
    setManifestDefaultsInitializer(() => {
      registerEndpoint(endpointKey('overpass'), 'https://example.com/overpass');
    });

    registerAllSources();

    expect(registerOSMSources).toHaveBeenCalledTimes(1);
    expect(registerZoningSource).not.toHaveBeenCalled();
    expect(registerParcelSource).not.toHaveBeenCalled();
  });
});
