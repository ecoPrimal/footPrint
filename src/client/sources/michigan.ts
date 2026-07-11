import * as L from 'leaflet';
import type { ArcGISFeatureResponse } from '../../types/arcgis.js';
import { dataSourceId, hexColor } from '../../types/brands.js';
import { registerSource } from '../datasources.js';

const MI_FRAMEWORK_BASE =
  'https://gisagocss.state.mi.us/arcgis/rest/services/OpenData/michigan_geographic_framework/MapServer';
const ROADS_LAYER = 14;

export function registerMichiganSources(): void {
  registerSource({
    id: dataSourceId('mi-roads'),
    name: 'Road Centerlines',
    category: 'Michigan',
    color: hexColor('#78909C'),
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

      const url = `${MI_FRAMEWORK_BASE}/${String(ROADS_LAYER)}/query?${params.toString()}`;
      const resp = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
      if (!resp.ok) throw new Error(`MI Roads: ${String(resp.status)}`);
      const data = (await resp.json()) as ArcGISFeatureResponse;
      return data.features ?? [];
    },
    style: () => ({
      color: '#78909C',
      weight: 1.5,
      opacity: 0.5,
      dashArray: '4 3',
    }),
    popupContent: (f) => {
      const p = (f.properties ?? {}) as Record<string, string | undefined>;
      const name = p['NME'] ?? p['LABEL'] ?? 'Road';
      return `<b>${name}</b><br><i>MI Geographic Framework</i>`;
    },
  });
}
