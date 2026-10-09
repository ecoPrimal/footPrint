// SPDX-License-Identifier: AGPL-3.0-or-later
import * as L from 'leaflet';
import type { ArcGISFeatureResponse, FemaFloodProperties } from '../../types/arcgis.js';
import { dataSourceId, hexColorUnchecked } from '../../types/brands.js';
import { registerSource } from '../datasources.js';
import { endpointKey, getEndpoint } from '../../core/manifest.js';
import { FEMA_FLOOD_ZONE_LAYER } from '../../constants.js';
import { proxyGet } from '../api.js';
import { escHtml } from '../html.js';

function femaProps(f: GeoJSON.Feature): FemaFloodProperties {
  return f.properties ?? {};
}

const ZONE_COLORS: Readonly<Record<string, string>> = {
  A: '#1a5276',
  AE: '#2471a3',
  AH: '#2e86c1',
  AO: '#3498db',
  V: '#0b3d5e',
  VE: '#154360',
  X: '#82e0aa',
  D: '#d4ac0d',
};

export function registerFemaSource(): void {
  registerSource({
    id: dataSourceId('fema-flood'),
    name: 'Flood Zones',
    category: 'FEMA',
    color: hexColorUnchecked('#2471a3'),
    minZoom: 13,
    fetch: async (bounds: L.LatLngBounds): Promise<readonly GeoJSON.Feature[]> => {
      const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(',');

      const params = new URLSearchParams({
        geometry: bbox,
        geometryType: 'esriGeometryEnvelope',
        spatialRel: 'esriSpatialRelIntersects',
        outFields: 'FLD_ZONE,ZONE_SUBTY,STATIC_BFE,SFHA_TF',
        f: 'geojson',
        outSR: '4326',
        returnGeometry: 'true',
      });

      const url = `${getEndpoint(endpointKey('nfhl'))}/${String(FEMA_FLOOD_ZONE_LAYER)}/query?${params.toString()}`;
      const data = await proxyGet<ArcGISFeatureResponse>(url);
      return data.features ?? [];
    },
    style: (feature) => {
      const p = feature ? femaProps(feature as GeoJSON.Feature) : ({} as FemaFloodProperties);
      const zone = p.FLD_ZONE ?? 'X';
      const baseColor = ZONE_COLORS[zone] ?? '#95a5a6';
      const isSFHA = p.SFHA_TF === 'T';
      return {
        color: baseColor,
        weight: 1,
        opacity: 0.7,
        fillColor: baseColor,
        fillOpacity: isSFHA ? 0.3 : 0.12,
      };
    },
    popupContent: (f) => {
      const p = femaProps(f);
      let html = `<b>FEMA Flood Zone: ${escHtml(p.FLD_ZONE ?? 'Unknown')}</b>`;
      if (p.ZONE_SUBTY) html += `<br>Subtype: ${escHtml(p.ZONE_SUBTY)}`;
      if (p.STATIC_BFE != null) html += `<br>Base Flood Elev: ${String(p.STATIC_BFE)} ft`;
      const risk = p.SFHA_TF === 'T' ? 'High Risk (SFHA)' : 'Lower Risk';
      html += `<br>Risk: ${risk}`;
      return html;
    },
  });
}
