import * as L from 'leaflet';
import type { ArcGISFeatureResponse, ZoningProperties } from '../../types/arcgis.js';
import { dataSourceId, hexColor } from '../../types/brands.js';
import { registerSource } from '../datasources.js';

const ZONING_URL = 'https://services1.arcgis.com/pNPbgWy7hpfFGWoZ/arcgis/rest/services/Zoning/FeatureServer/0';

const ZONE_CATEGORY_COLORS: Readonly<Record<string, string>> = {
  'R': '#66bb6a',
  'A': '#43a047',
  'B': '#42a5f5',
  'C': '#5c6bc0',
  'D': '#ab47bc',
  'F': '#26c6da',
  'G': '#9ccc65',
  'H': '#78909c',
  'I': '#ff7043',
  'M': '#ef5350',
  'O': '#29b6f6',
  'P': '#8d6e63',
  'S': '#ffa726',
};

function zoneColor(zoneCode: string | undefined): string {
  if (!zoneCode) return '#95a5a6';
  const prefix = zoneCode.charAt(0).toUpperCase();
  return ZONE_CATEGORY_COLORS[prefix] ?? '#95a5a6';
}

export function registerZoningSource(): void {
  registerSource({
    id: dataSourceId('lansing-zoning'),
    name: 'Zoning Districts',
    category: 'Lansing',
    color: hexColor('#ab47bc'),
    minZoom: 13,
    fetch: async (bounds: L.LatLngBounds): Promise<ReadonlyArray<GeoJSON.Feature>> => {
      const bbox = [
        bounds.getWest(), bounds.getSouth(),
        bounds.getEast(), bounds.getNorth(),
      ].join(',');

      const params = new URLSearchParams({
        geometry: bbox,
        geometryType: 'esriGeometryEnvelope',
        spatialRel: 'esriSpatialRelIntersects',
        outFields: '*',
        f: 'geojson',
        outSR: '4326',
        returnGeometry: 'true',
      });

      const url = `${ZONING_URL}/query?${params.toString()}`;
      const resp = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
      if (!resp.ok) throw new Error(`Zoning: ${String(resp.status)}`);
      const data = (await resp.json()) as ArcGISFeatureResponse;
      return data.features ?? [];
    },
    style: (feature) => {
      const p = (feature?.properties ?? {}) as ZoningProperties;
      const zone = p.ZONING ?? p.Zone ?? '';
      return {
        color: zoneColor(zone),
        weight: 1.5,
        opacity: 0.7,
        fillColor: zoneColor(zone),
        fillOpacity: 0.15,
      };
    },
    popupContent: (f) => {
      const p = (f.properties ?? {}) as ZoningProperties;
      const zone = p.ZONING ?? p.Zone ?? p.ZONE_CODE ?? 'Unknown';
      const desc = p.ZONING_DES ?? p.Description ?? p.ZONE_DESC ?? '';
      let html = `<b>Zoning: ${zone}</b>`;
      if (desc) html += `<br>${desc}`;
      html += `<br><i style="opacity:0.6">Note: historic / pre-FBC data</i>`;
      return html;
    },
  });
}
