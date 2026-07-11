import * as L from 'leaflet';
import { dataSourceId, hexColor } from '../../types/brands.js';
import { registerSource, getSource } from '../datasources.js';
import type { DataSourceState } from '../../types/source.js';

export function registerSoilsSource(): void {
  registerSource({
    id: dataSourceId('nrcs-soils'),
    name: 'Soil Map Units',
    category: 'Soils',
    color: hexColor('#8D6E63'),
    type: 'tiles',
    tileUrl: 'https://SDMDataAccess.sc.egov.usda.gov/Spatial/SDM.wms',
    opacity: 0.5,
    attribution: 'Soils &copy; NRCS SSURGO',
  });

  const src = getSource('nrcs-soils') as DataSourceState | undefined;
  if (src) {
    const wmsLayer = L.tileLayer.wms(
      'https://SDMDataAccess.sc.egov.usda.gov/Spatial/SDM.wms',
      {
        layers: 'mapunitpoly',
        format: 'image/png',
        transparent: true,
        version: '1.1.1',
        maxZoom: 20,
        opacity: 0.5,
        attribution: 'Soils &copy; NRCS SSURGO',
      } as L.WMSOptions,
    );
    (src as { layer: L.TileLayer }).layer = wmsLayer;
  }
}
