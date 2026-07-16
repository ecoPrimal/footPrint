import { dataSourceId, hexColorUnchecked } from '../../types/brands.js';
import { registerSource } from '../datasources.js';
import { PARCELS_TILE_URL } from '../../constants.js';

export function registerParcelSource(): void {
  registerSource({
    id: dataSourceId('parcels'),
    name: 'Parcel Boundaries',
    category: 'Property',
    color: hexColorUnchecked('#e74c3c'),
    type: 'tiles',
    tileUrl: PARCELS_TILE_URL,
    opacity: 0.55,
    attribution: 'Parcels &copy; Regrid',
  });
}
