// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Manifest-driven source registration — discovers registrars at runtime
 * based on endpoint availability from the manifest registry.
 */

import { endpointKey, tryGetEndpoint, type EndpointKey } from '../core/manifest.js';
import { registerOSMSources } from './sources/osm.js';
import { registerParcelSource } from './sources/parcels.js';
import { registerFemaSource } from './sources/fema.js';
import { registerZoningSource } from './sources/zoning.js';
import { registerUSGSSource } from './sources/usgs.js';
import { registerSoilsSource } from './sources/soils.js';
import { registerMichiganSources } from './sources/michigan.js';
import { registerInfrastructureSources } from './sources/infrastructure.js';

interface SourceRegistrarEntry {
  readonly register: () => void;
  readonly endpointKeys: readonly EndpointKey[];
}

const SOURCE_REGISTRARS: readonly SourceRegistrarEntry[] = [
  { register: registerOSMSources, endpointKeys: [endpointKey('overpass')] },
  { register: registerParcelSource, endpointKeys: [endpointKey('parcels-tiles')] },
  { register: registerFemaSource, endpointKeys: [endpointKey('nfhl')] },
  { register: registerZoningSource, endpointKeys: [endpointKey('zoning')] },
  { register: registerUSGSSource, endpointKeys: [endpointKey('epqs')] },
  { register: registerSoilsSource, endpointKeys: [endpointKey('nrcs-wms')] },
  { register: registerMichiganSources, endpointKeys: [endpointKey('mi-framework')] },
  { register: registerInfrastructureSources, endpointKeys: [endpointKey('overpass')] },
];

function endpointsAvailable(keys: readonly EndpointKey[]): boolean {
  return keys.every((key) => tryGetEndpoint(key) !== undefined);
}

/** Register all data sources whose manifest endpoints are satisfied. */
export function registerAllSources(): void {
  for (const entry of SOURCE_REGISTRARS) {
    if (endpointsAvailable(entry.endpointKeys)) {
      entry.register();
    }
  }
}

/** @alias registerAllSources */
export const registerSourcesFromManifest = registerAllSources;
