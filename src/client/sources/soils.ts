import * as L from 'leaflet';
import { dataSourceId, hexColorUnchecked } from '../../types/brands.js';
import { registerSource, getSource } from '../datasources.js';
import type { DataSourceState } from '../../types/source.js';
import { NRCS_WMS_URL } from '../../constants.js';

const SOILS_ATTRIBUTION = 'Soils &copy; NRCS SSURGO';

export function registerSoilsSource(): void {
  registerSource({
    id: dataSourceId('nrcs-soils'),
    name: 'Soil Map Units',
    category: 'Soils',
    color: hexColorUnchecked('#8D6E63'),
    type: 'tiles',
    tileUrl: NRCS_WMS_URL,
    opacity: 0.5,
    attribution: SOILS_ATTRIBUTION,
  });

  const src = getSource('nrcs-soils') as DataSourceState | undefined;
  if (src) {
    const wmsLayer = L.tileLayer.wms(NRCS_WMS_URL, {
      layers: 'mapunitpoly',
      format: 'image/png',
      transparent: true,
      version: '1.1.1',
      maxZoom: 20,
      opacity: 0.5,
      attribution: SOILS_ATTRIBUTION,
    } as L.WMSOptions);
    (src as { layer: L.TileLayer }).layer = wmsLayer;
  }
}
