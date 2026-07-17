import * as L from 'leaflet';
import type { ArcGISFeatureResponse, ZoningProperties } from '../../types/arcgis.js';
import { dataSourceId, hexColorUnchecked } from '../../types/brands.js';
import { registerSource } from '../datasources.js';
import { ZONING_URL } from '../../constants.js';
import { proxyGet } from '../api.js';
import { escHtml } from '../html.js';

function zoningProps(f: GeoJSON.Feature): ZoningProperties {
  return (f.properties ?? {}) as ZoningProperties;
}

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
    color: hexColorUnchecked('#ab47bc'),
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
      const data = await proxyGet<ArcGISFeatureResponse>(url);
      return data.features ?? [];
    },
    style: (feature) => {
      const p = feature ? zoningProps(feature) : {} as ZoningProperties;
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
      const p = zoningProps(f);
      const zone = p.ZONING ?? p.Zone ?? p.ZONE_CODE ?? 'Unknown';
      const desc = p.ZONING_DES ?? p.Description ?? p.ZONE_DESC ?? '';
      let html = `<b>Zoning: ${escHtml(zone)}</b>`;
      if (desc) html += `<br>${escHtml(desc)}`;
      html += `<br><i style="opacity:0.6">Note: historic / pre-FBC data</i>`;
      return html;
    },
  });
}
