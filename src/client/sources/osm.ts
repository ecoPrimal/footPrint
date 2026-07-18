import * as L from 'leaflet';
import type { OverpassResponse } from '../../types/overpass.js';
import { isOverpassNode, isOverpassWay, isOverpassRelation } from '../../types/overpass.js';
import { dataSourceId, hexColorUnchecked } from '../../types/brands.js';
import { registerSource } from '../datasources.js';
import { OVERPASS_URL, OVERPASS_TIMEOUT_S } from '../../constants.js';
import { proxyPost } from '../api.js';
import { escHtml } from '../html.js';

type OsmProps = Readonly<Record<string, string | undefined>>;

function osmProps(f: GeoJSON.Feature): OsmProps {
  return (f.properties ?? {});
}

export async function queryOverpass(overpassQL: string, bounds: L.LatLngBounds): Promise<readonly GeoJSON.Feature[]> {
  const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
  const normalized = overpassQL.replace(/\[timeout:\d+\]/, `[timeout:${String(OVERPASS_TIMEOUT_S)}]`);
  const query = normalized.replace(/\{bbox\}/g, bbox);
  const body = `data=${encodeURIComponent(query)}`;

  const data = await proxyPost<OverpassResponse>(OVERPASS_URL, body);
  return osmToGeoJSON(data);
}

export function osmToGeoJSON(data: OverpassResponse): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];

  if (!data.elements) return features;

  for (const el of data.elements) {
    if (isOverpassNode(el)) {
      if (el.tags) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [el.lon, el.lat] },
          properties: { _osmId: el.id, _osmType: 'node', ...el.tags },
        });
      }
      continue;
    }

    if (isOverpassWay(el)) {
      if (el.geometry) {
        const coords: [number, number][] = el.geometry.map((n) => [n.lon, n.lat]);
        if (coords.length < 2) continue;

        const first = coords[0];
        const last = coords[coords.length - 1];
        const isClosed = coords.length > 3 &&
          first?.[0] === last?.[0] && first?.[1] === last?.[1];

        features.push({
          type: 'Feature',
          geometry: isClosed
            ? { type: 'Polygon', coordinates: [coords] }
            : { type: 'LineString', coordinates: coords },
          properties: { _osmId: el.id, _osmType: 'way', ...el.tags },
        });
      }
      continue;
    }

    if (isOverpassRelation(el)) {
      if (el.members) {
        const outerCoords: [number, number][][] = [];
        for (const m of el.members) {
          if (m.type === 'way' && m.geometry) {
            outerCoords.push(m.geometry.map((n) => [n.lon, n.lat]));
          }
        }
        if (outerCoords.length > 0) {
          features.push({
            type: 'Feature',
            geometry: { type: 'MultiPolygon', coordinates: outerCoords.map((ring) => [ring]) },
            properties: { _osmId: el.id, _osmType: 'relation', ...el.tags },
          });
        }
      }
    }
  }

  return features;
}

export function registerOSMSources(): void {
  registerSource({
    id: dataSourceId('osm-buildings'),
    name: 'Buildings',
    category: 'OpenStreetMap',
    color: hexColorUnchecked('#9b59b6'),
    minZoom: 15,
    fetch: (bounds) => queryOverpass(
      `[out:json][timeout:${OVERPASS_TIMEOUT_S}];(way["building"]({bbox});relation["building"]({bbox}););out body geom;`,
      bounds,
    ),
    style: () => ({
      color: '#9b59b6',
      weight: 1.5,
      opacity: 0.8,
      fillOpacity: 0.12,
    }),
    popupContent: (f) => {
      const p = osmProps(f);
      const name = p['name'] ?? p['addr:housenumber'] ?? 'Building';
      const parts = [p['addr:housenumber'], p['addr:street']].filter(Boolean);
      const addr = parts.join(' ');
      const buildingType = p['building'];
      return `<b>${escHtml(name)}</b>${addr ? `<br>${escHtml(addr)}` : ''}${buildingType && buildingType !== 'yes' ? `<br>Type: ${escHtml(buildingType)}` : ''}`;
    },
  });

  registerSource({
    id: dataSourceId('osm-power'),
    name: 'Power Lines',
    category: 'OpenStreetMap',
    color: hexColorUnchecked('#e67e22'),
    minZoom: 14,
    fetch: (bounds) => queryOverpass(
      `[out:json][timeout:${OVERPASS_TIMEOUT_S}];(way["power"~"line|minor_line|cable"]({bbox});node["power"~"pole|tower|transformer"]({bbox}););out body geom;`,
      bounds,
    ),
    style: (feature) => {
      const p = feature ? osmProps(feature as GeoJSON.Feature) : {};
      return {
        color: p['power'] === 'minor_line' ? '#f39c12' : '#e67e22',
        weight: p['power'] === 'line' ? 3 : 2,
        opacity: 0.9,
        dashArray: p['power'] === 'cable' ? '6 4' : undefined,
      };
    },
    popupContent: (f) => {
      const p = osmProps(f);
      let html = `<b>Power: ${escHtml(p['power'] ?? 'unknown')}</b>`;
      if (p['voltage']) html += `<br>Voltage: ${escHtml(p['voltage'])}V`;
      if (p['operator']) html += `<br>Operator: ${escHtml(p['operator'])}`;
      if (p['cables']) html += `<br>Cables: ${escHtml(p['cables'])}`;
      return html;
    },
  });

  registerSource({
    id: dataSourceId('osm-pipelines'),
    name: 'Pipelines',
    category: 'OpenStreetMap',
    color: hexColorUnchecked('#c0392b'),
    minZoom: 14,
    fetch: (bounds) => queryOverpass(
      `[out:json][timeout:${OVERPASS_TIMEOUT_S}];(way["man_made"="pipeline"]({bbox});way["utility"="gas"]({bbox});way["utility"="water"]({bbox});way["utility"="sewer"]({bbox}););out body geom;`,
      bounds,
    ),
    style: () => ({
      color: '#c0392b',
      weight: 3,
      opacity: 0.8,
      dashArray: '8 4',
    }),
    popupContent: (f) => {
      const p = osmProps(f);
      let html = `<b>Pipeline</b>`;
      if (p['substance']) html += `<br>Substance: ${escHtml(p['substance'])}`;
      if (p['utility']) html += `<br>Utility: ${escHtml(p['utility'])}`;
      if (p['operator']) html += `<br>Operator: ${escHtml(p['operator'])}`;
      if (p['location']) html += `<br>Location: ${escHtml(p['location'])}`;
      return html;
    },
  });

  registerSource({
    id: dataSourceId('osm-fences'),
    name: 'Fences',
    category: 'OpenStreetMap',
    color: hexColorUnchecked('#8B6914'),
    minZoom: 16,
    fetch: (bounds) => queryOverpass(
      `[out:json][timeout:${OVERPASS_TIMEOUT_S}];(way["barrier"="fence"]({bbox});way["barrier"="wall"]({bbox});way["barrier"="hedge"]({bbox}););out body geom;`,
      bounds,
    ),
    style: (feature) => {
      const p = feature ? osmProps(feature as GeoJSON.Feature) : {};
      const barrierType = p['barrier'] ?? 'fence';
      return {
        color: barrierType === 'hedge' ? '#27ae60' : barrierType === 'wall' ? '#7f8c8d' : '#8B6914',
        weight: 2,
        opacity: 0.9,
      };
    },
    popupContent: (f) => {
      const p = osmProps(f);
      const barrier = p['barrier'] ?? 'barrier';
      let html = `<b>${escHtml(barrier.charAt(0).toUpperCase() + barrier.slice(1))}</b>`;
      if (p['fence_type']) html += `<br>Type: ${escHtml(p['fence_type'])}`;
      if (p['material']) html += `<br>Material: ${escHtml(p['material'])}`;
      if (p['height']) html += `<br>Height: ${escHtml(p['height'])}`;
      return html;
    },
  });

  registerSource({
    id: dataSourceId('osm-water'),
    name: 'Water Features',
    category: 'OpenStreetMap',
    color: hexColorUnchecked('#2980b9'),
    minZoom: 14,
    fetch: (bounds) => queryOverpass(
      `[out:json][timeout:${OVERPASS_TIMEOUT_S}];(way["waterway"]({bbox});way["natural"="water"]({bbox});relation["natural"="water"]({bbox}););out body geom;`,
      bounds,
    ),
    style: (feature) => {
      const p = feature ? osmProps(feature as GeoJSON.Feature) : {};
      return {
        color: '#2980b9',
        weight: p['waterway'] ? 2 : 1,
        opacity: 0.8,
        fillOpacity: feature?.geometry.type.includes('Polygon') ? 0.2 : 0,
      };
    },
    popupContent: (f) => {
      const p = osmProps(f);
      const waterType = p['waterway'] ?? p['natural'] ?? 'Water';
      let html = `<b>${escHtml(waterType.charAt(0).toUpperCase() + waterType.slice(1))}</b>`;
      if (p['name']) html += `<br>${escHtml(p['name'])}`;
      return html;
    },
  });
}
