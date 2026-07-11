import { dataSourceId, hexColor } from '../../types/brands.js';
import { registerSource } from '../datasources.js';

export function registerParcelSource(): void {
  registerSource({
    id: dataSourceId('parcels'),
    name: 'Parcel Boundaries',
    category: 'Property',
    color: hexColor('#e74c3c'),
    type: 'tiles',
    tileUrl: 'https://tiles.arcgis.com/tiles/KzeiCaQsMoeCfoCq/arcgis/rest/services/Regrid_Nationwide_Parcel_Boundaries_v1/MapServer/tile/{z}/{y}/{x}',
    opacity: 0.55,
    attribution: 'Parcels &copy; Regrid',
  });
}
