import * as L from 'leaflet';
import type { ArcGISFeatureResponse, FemaFloodProperties } from '../../types/arcgis.js';
import { dataSourceId, hexColor } from '../../types/brands.js';
import { registerSource } from '../datasources.js';

const NFHL_BASE = 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer';
const FLOOD_ZONE_LAYER = 28;

const ZONE_COLORS: Readonly<Record<string, string>> = {
  'A':  '#1a5276',
  'AE': '#2471a3',
  'AH': '#2e86c1',
  'AO': '#3498db',
  'V':  '#0b3d5e',
  'VE': '#154360',
  'X':  '#82e0aa',
  'D':  '#d4ac0d',
};

export function registerFemaSource(): void {
  registerSource({
    id: dataSourceId('fema-flood'),
    name: 'Flood Zones',
    category: 'FEMA',
    color: hexColor('#2471a3'),
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
        outFields: 'FLD_ZONE,ZONE_SUBTY,STATIC_BFE,SFHA_TF',
        f: 'geojson',
        outSR: '4326',
        returnGeometry: 'true',
      });

      const url = `${NFHL_BASE}/${String(FLOOD_ZONE_LAYER)}/query?${params.toString()}`;
      const resp = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
      if (!resp.ok) throw new Error(`FEMA: ${String(resp.status)}`);
      const data = (await resp.json()) as ArcGISFeatureResponse;
      return data.features ?? [];
    },
    style: (feature) => {
      const p = (feature?.properties ?? {}) as FemaFloodProperties;
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
      const p = (f.properties ?? {}) as FemaFloodProperties;
      let html = `<b>FEMA Flood Zone: ${p.FLD_ZONE ?? 'Unknown'}</b>`;
      if (p.ZONE_SUBTY) html += `<br>Subtype: ${p.ZONE_SUBTY}`;
      if (p.STATIC_BFE != null) html += `<br>Base Flood Elev: ${String(p.STATIC_BFE)} ft`;
      const risk = p.SFHA_TF === 'T' ? 'High Risk (SFHA)' : 'Lower Risk';
      html += `<br>Risk: ${risk}`;
      return html;
    },
  });
}
