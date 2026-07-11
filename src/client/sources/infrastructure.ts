import * as L from 'leaflet';
import { dataSourceId, hexColor } from '../../types/brands.js';
import { registerSource } from '../datasources.js';
import { OVERPASS_URL, PROXY_PATH } from '../../constants.js';

async function queryOverpassNodes(
  overpassQL: string,
  bounds: L.LatLngBounds,
): Promise<ReadonlyArray<GeoJSON.Feature>> {
  const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
  const query = overpassQL.replace(/\{bbox\}/g, bbox);
  const body = `data=${encodeURIComponent(query)}`;

  const resp = await fetch(`${PROXY_PATH}?url=${encodeURIComponent(OVERPASS_URL)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body,
  });

  if (!resp.ok) throw new Error(`Overpass: ${String(resp.status)}`);
  interface OverpassNodeResult {
    elements?: ReadonlyArray<{
      type: string;
      id: number;
      lat: number;
      lon: number;
      tags?: Record<string, string>;
    }>;
  }
  const data = (await resp.json()) as OverpassNodeResult;
  const features: GeoJSON.Feature[] = [];
  for (const el of data.elements ?? []) {
    if (el.type === 'node' && el.lat != null && el.lon != null) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [el.lon, el.lat] },
        properties: { _osmId: el.id, _osmType: 'node', ...el.tags },
      });
    }
  }
  return features;
}

function makePointIcon(symbol: string, color: string): L.DivIcon {
  return L.divIcon({
    className: 'infra-point-icon',
    html: `<span style="color:${color};font-size:14px;text-shadow:0 0 3px rgba(0,0,0,0.8)">${symbol}</span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

export function registerInfrastructureSources(): void {
  registerSource({
    id: dataSourceId('osm-manholes'),
    name: 'Manholes',
    category: 'Infrastructure',
    color: hexColor('#546E7A'),
    minZoom: 17,
    fetch: (bounds) => queryOverpassNodes(
      `[out:json][timeout:25];node["man_made"="manhole"]({bbox});out body;`,
      bounds,
    ),
    pointToLayer: (_feat: GeoJSON.Feature, latlng: L.LatLng) =>
      L.marker(latlng, { icon: makePointIcon('\u25CE', '#546E7A') }),
    popupContent: (f) => {
      const p = (f.properties ?? {}) as Record<string, string | undefined>;
      let html = '<b>Manhole</b>';
      if (p['manhole']) html += `<br>Type: ${p['manhole']}`;
      if (p['utility']) html += `<br>Utility: ${p['utility']}`;
      if (p['operator']) html += `<br>Operator: ${p['operator']}`;
      return html;
    },
  });

  registerSource({
    id: dataSourceId('osm-hydrants'),
    name: 'Fire Hydrants',
    category: 'Infrastructure',
    color: hexColor('#D32F2F'),
    minZoom: 17,
    fetch: (bounds) => queryOverpassNodes(
      `[out:json][timeout:25];node["emergency"="fire_hydrant"]({bbox});out body;`,
      bounds,
    ),
    pointToLayer: (_feat: GeoJSON.Feature, latlng: L.LatLng) =>
      L.marker(latlng, { icon: makePointIcon('\u{1F6C8}', '#D32F2F') }),
    popupContent: (f) => {
      const p = (f.properties ?? {}) as Record<string, string | undefined>;
      let html = '<b>Fire Hydrant</b>';
      if (p['fire_hydrant:type']) html += `<br>Type: ${p['fire_hydrant:type']}`;
      if (p['fire_hydrant:diameter']) html += `<br>Diameter: ${p['fire_hydrant:diameter']}`;
      if (p['operator']) html += `<br>Operator: ${p['operator']}`;
      return html;
    },
  });

  registerSource({
    id: dataSourceId('osm-streetlights'),
    name: 'Street Lights',
    category: 'Infrastructure',
    color: hexColor('#FFC107'),
    minZoom: 17,
    fetch: (bounds) => queryOverpassNodes(
      `[out:json][timeout:25];node["highway"="street_lamp"]({bbox});out body;`,
      bounds,
    ),
    pointToLayer: (_feat: GeoJSON.Feature, latlng: L.LatLng) =>
      L.marker(latlng, { icon: makePointIcon('\u{1F4A1}', '#FFC107') }),
    popupContent: (f) => {
      const p = (f.properties ?? {}) as Record<string, string | undefined>;
      let html = '<b>Street Light</b>';
      if (p['lamp_type']) html += `<br>Type: ${p['lamp_type']}`;
      if (p['operator']) html += `<br>Operator: ${p['operator']}`;
      return html;
    },
  });

  registerSource({
    id: dataSourceId('osm-poles'),
    name: 'Utility Poles',
    category: 'Infrastructure',
    color: hexColor('#FF8F00'),
    minZoom: 16,
    fetch: (bounds) => queryOverpassNodes(
      `[out:json][timeout:25];(node["power"="pole"]({bbox});node["power"="tower"]({bbox});node["utility"="pole"]({bbox}););out body;`,
      bounds,
    ),
    pointToLayer: (_feat: GeoJSON.Feature, latlng: L.LatLng) =>
      L.marker(latlng, { icon: makePointIcon('\u{1F5FC}', '#FF8F00') }),
    popupContent: (f) => {
      const p = (f.properties ?? {}) as Record<string, string | undefined>;
      const type = p['power'] ?? p['utility'] ?? 'pole';
      let html = `<b>${type.charAt(0).toUpperCase() + type.slice(1)}</b>`;
      if (p['operator']) html += `<br>Operator: ${p['operator']}`;
      if (p['material']) html += `<br>Material: ${p['material']}`;
      if (p['height']) html += `<br>Height: ${p['height']}`;
      return html;
    },
  });
}
