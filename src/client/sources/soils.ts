// SPDX-License-Identifier: AGPL-3.0-or-later
import { dataSourceId, hexColorUnchecked } from '../../types/brands.js';
import { registerSource } from '../datasources.js';
import { endpointKey, getEndpoint } from '../../core/manifest.js';

export function registerSoilsSource(): void {
  registerSource({
    id: dataSourceId('nrcs-soils'),
    name: 'Soil Map Units',
    category: 'Soils',
    color: hexColorUnchecked('#8D6E63'),
    type: 'wms',
    wmsUrl: getEndpoint(endpointKey('nrcs-wms')),
    wmsLayers: 'mapunitpoly',
    wmsFormat: 'image/png',
    wmsVersion: '1.1.1',
    opacity: 0.5,
    attribution: 'Soils &copy; NRCS SSURGO',
  });
}
