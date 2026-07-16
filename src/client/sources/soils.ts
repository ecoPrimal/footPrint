import { dataSourceId, hexColorUnchecked } from '../../types/brands.js';
import { registerSource } from '../datasources.js';
import { NRCS_WMS_URL } from '../../constants.js';

export function registerSoilsSource(): void {
  registerSource({
    id: dataSourceId('nrcs-soils'),
    name: 'Soil Map Units',
    category: 'Soils',
    color: hexColorUnchecked('#8D6E63'),
    type: 'wms',
    wmsUrl: NRCS_WMS_URL,
    wmsLayers: 'mapunitpoly',
    wmsFormat: 'image/png',
    wmsVersion: '1.1.1',
    opacity: 0.5,
    attribution: 'Soils &copy; NRCS SSURGO',
  });
}
