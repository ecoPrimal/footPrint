// SPDX-License-Identifier: AGPL-3.0-or-later
import * as L from 'leaflet';
import { dataSourceId, hexColorUnchecked } from '../../types/brands.js';
import { registerSource } from '../datasources.js';
import { queryOverpass } from './osm.js';
import { OVERPASS_TIMEOUT_S } from '../../constants.js';
import { escHtml } from '../html.js';

type OsmProps = Readonly<Record<string, string | undefined>>;

function osmProps(f: GeoJSON.Feature): OsmProps {
  return f.properties ?? {};
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
    color: hexColorUnchecked('#546E7A'),
    minZoom: 17,
    fetch: (bounds) =>
      queryOverpass(`[out:json][timeout:${OVERPASS_TIMEOUT_S}];node["man_made"="manhole"]({bbox});out body;`, bounds),
    pointToLayer: (_feat: GeoJSON.Feature, latlng: L.LatLng) =>
      L.marker(latlng, { icon: makePointIcon('\u25CE', '#546E7A') }),
    popupContent: (f) => {
      const p = osmProps(f);
      let html = '<b>Manhole</b>';
      if (p['manhole']) html += `<br>Type: ${escHtml(p['manhole'])}`;
      if (p['utility']) html += `<br>Utility: ${escHtml(p['utility'])}`;
      if (p['operator']) html += `<br>Operator: ${escHtml(p['operator'])}`;
      return html;
    },
  });

  registerSource({
    id: dataSourceId('osm-hydrants'),
    name: 'Fire Hydrants',
    category: 'Infrastructure',
    color: hexColorUnchecked('#D32F2F'),
    minZoom: 17,
    fetch: (bounds) =>
      queryOverpass(
        `[out:json][timeout:${OVERPASS_TIMEOUT_S}];node["emergency"="fire_hydrant"]({bbox});out body;`,
        bounds,
      ),
    pointToLayer: (_feat: GeoJSON.Feature, latlng: L.LatLng) =>
      L.marker(latlng, { icon: makePointIcon('\u{1F6C8}', '#D32F2F') }),
    popupContent: (f) => {
      const p = osmProps(f);
      let html = '<b>Fire Hydrant</b>';
      if (p['fire_hydrant:type']) html += `<br>Type: ${escHtml(p['fire_hydrant:type'])}`;
      if (p['fire_hydrant:diameter']) html += `<br>Diameter: ${escHtml(p['fire_hydrant:diameter'])}`;
      if (p['operator']) html += `<br>Operator: ${escHtml(p['operator'])}`;
      return html;
    },
  });

  registerSource({
    id: dataSourceId('osm-streetlights'),
    name: 'Street Lights',
    category: 'Infrastructure',
    color: hexColorUnchecked('#FFC107'),
    minZoom: 17,
    fetch: (bounds) =>
      queryOverpass(
        `[out:json][timeout:${OVERPASS_TIMEOUT_S}];node["highway"="street_lamp"]({bbox});out body;`,
        bounds,
      ),
    pointToLayer: (_feat: GeoJSON.Feature, latlng: L.LatLng) =>
      L.marker(latlng, { icon: makePointIcon('\u{1F4A1}', '#FFC107') }),
    popupContent: (f) => {
      const p = osmProps(f);
      let html = '<b>Street Light</b>';
      if (p['lamp_type']) html += `<br>Type: ${escHtml(p['lamp_type'])}`;
      if (p['operator']) html += `<br>Operator: ${escHtml(p['operator'])}`;
      return html;
    },
  });

  registerSource({
    id: dataSourceId('osm-poles'),
    name: 'Utility Poles',
    category: 'Infrastructure',
    color: hexColorUnchecked('#FF8F00'),
    minZoom: 16,
    fetch: (bounds) =>
      queryOverpass(
        `[out:json][timeout:${OVERPASS_TIMEOUT_S}];(node["power"="pole"]({bbox});node["power"="tower"]({bbox});node["utility"="pole"]({bbox}););out body;`,
        bounds,
      ),
    pointToLayer: (_feat: GeoJSON.Feature, latlng: L.LatLng) =>
      L.marker(latlng, { icon: makePointIcon('\u{1F5FC}', '#FF8F00') }),
    popupContent: (f) => {
      const p = osmProps(f);
      const type = p['power'] ?? p['utility'] ?? 'pole';
      let html = `<b>${escHtml(type.charAt(0).toUpperCase() + type.slice(1))}</b>`;
      if (p['operator']) html += `<br>Operator: ${escHtml(p['operator'])}`;
      if (p['material']) html += `<br>Material: ${escHtml(p['material'])}`;
      if (p['height']) html += `<br>Height: ${escHtml(p['height'])}`;
      return html;
    },
  });
}
