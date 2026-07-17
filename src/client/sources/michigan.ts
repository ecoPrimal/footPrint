import * as L from 'leaflet';
import type { ArcGISFeatureResponse, MichiganRoadProperties } from '../../types/arcgis.js';
import { dataSourceId, hexColorUnchecked } from '../../types/brands.js';
import { registerSource } from '../datasources.js';
import { MI_FRAMEWORK_BASE, MI_ROADS_LAYER } from '../../constants.js';
import { proxyGet } from '../api.js';

export function registerMichiganSources(): void {
  registerSource({
    id: dataSourceId('mi-roads'),
    name: 'Road Centerlines',
    category: 'Michigan',
    color: hexColorUnchecked('#78909C'),
    minZoom: 15,
    fetch: async (bounds: L.LatLngBounds): Promise<ReadonlyArray<GeoJSON.Feature>> => {
      const bbox = [
        bounds.getWest(), bounds.getSouth(),
        bounds.getEast(), bounds.getNorth(),
      ].join(',');

      const params = new URLSearchParams({
        geometry: bbox,
        geometryType: 'esriGeometryEnvelope',
        spatialRel: 'esriSpatialRelIntersects',
        outFields: 'NME,LABEL',
        f: 'geojson',
        outSR: '4326',
        returnGeometry: 'true',
      });

      const url = `${MI_FRAMEWORK_BASE}/${String(MI_ROADS_LAYER)}/query?${params.toString()}`;
      const data = await proxyGet<ArcGISFeatureResponse>(url);
      return data.features ?? [];
    },
    style: () => ({
      color: '#78909C',
      weight: 1.5,
      opacity: 0.5,
      dashArray: '4 3',
    }),
    popupContent: (f) => {
      const p = (f.properties ?? {}) as MichiganRoadProperties;
      const name = p.NME ?? p.LABEL ?? 'Road';
      return `<b>${name}</b><br><i>MI Geographic Framework</i>`;
    },
  });
}
