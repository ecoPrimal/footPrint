// SPDX-License-Identifier: AGPL-3.0-or-later
import { dataSourceId, hexColorUnchecked } from '../../types/brands.js';
import { registerSource } from '../datasources.js';
import { endpointKey, getEndpoint } from '../../core/manifest.js';

export function registerParcelSource(): void {
  registerSource({
    id: dataSourceId('parcels'),
    name: 'Parcel Boundaries',
    category: 'Property',
    color: hexColorUnchecked('#e74c3c'),
    type: 'tiles',
    tileUrl: getEndpoint(endpointKey('parcels-tiles')),
    opacity: 0.55,
    attribution: 'Parcels &copy; Regrid',
  });
}
