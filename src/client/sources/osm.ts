import * as L from 'leaflet';
import type { OverpassResponse, OverpassNode, OverpassWay, OverpassRelation } from '../../types/overpass.js';
import { dataSourceId, hexColor } from '../../types/brands.js';
import { registerSource } from '../datasources.js';
import { OVERPASS_URL, PROXY_PATH } from '../../constants.js';

async function queryOverpass(overpassQL: string, bounds: L.LatLngBounds): Promise<ReadonlyArray<GeoJSON.Feature>> {
  const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
  const query = overpassQL.replace(/\{bbox\}/g, bbox);
  const body = `data=${encodeURIComponent(query)}`;

  const resp = await fetch(`${PROXY_PATH}?url=${encodeURIComponent(OVERPASS_URL)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body,
  });

  if (!resp.ok) throw new Error(`Overpass: ${String(resp.status)}`);
  const data = (await resp.json()) as OverpassResponse;
  return osmToGeoJSON(data);
}

function osmToGeoJSON(data: OverpassResponse): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];

  if (!data.elements) return features;

  for (const el of data.elements) {
    if (el.type === 'node') {
      const node = el as OverpassNode;
      if (node.tags) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [node.lon, node.lat] },
          properties: { _osmId: node.id, _osmType: 'node', ...node.tags },
        });
      }
    }

    if (el.type === 'way') {
      const way = el as OverpassWay;
      if (way.geometry) {
        const coords: Array<[number, number]> = way.geometry.map((n) => [n.lon, n.lat]);
        if (coords.length < 2) continue;

        const first = coords[0];
        const last = coords[coords.length - 1];
        const isClosed = coords.length > 3 && first && last &&
          first[0] === last[0] && first[1] === last[1];

        features.push({
          type: 'Feature',
          geometry: isClosed
            ? { type: 'Polygon', coordinates: [coords] }
            : { type: 'LineString', coordinates: coords },
          properties: { _osmId: way.id, _osmType: 'way', ...way.tags },
        });
      }
    }

    if (el.type === 'relation') {
      const rel = el as OverpassRelation;
      if (rel.members) {
        const outerCoords: Array<Array<[number, number]>> = [];
        for (const m of rel.members) {
          if (m.type === 'way' && m.geometry) {
            outerCoords.push(m.geometry.map((n) => [n.lon, n.lat]));
          }
        }
        if (outerCoords.length > 0) {
          features.push({
            type: 'Feature',
            geometry: { type: 'MultiPolygon', coordinates: outerCoords.map((ring) => [ring]) },
            properties: { _osmId: rel.id, _osmType: 'relation', ...rel.tags },
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
    color: hexColor('#9b59b6'),
    minZoom: 15,
    fetch: (bounds) => queryOverpass(
      `[out:json][timeout:25];(way["building"]({bbox});relation["building"]({bbox}););out body geom;`,
      bounds,
    ),
    style: () => ({
      color: '#9b59b6',
      weight: 1.5,
      opacity: 0.8,
      fillOpacity: 0.12,
    }),
    popupContent: (f) => {
      const p = f.properties as Record<string, string | undefined>;
      const name = p['name'] ?? p['addr:housenumber'] ?? 'Building';
      const parts = [p['addr:housenumber'], p['addr:street']].filter(Boolean);
      const addr = parts.join(' ');
      const buildingType = p['building'];
      return `<b>${name}</b>${addr ? `<br>${addr}` : ''}${buildingType && buildingType !== 'yes' ? `<br>Type: ${buildingType}` : ''}`;
    },
  });

  registerSource({
    id: dataSourceId('osm-power'),
    name: 'Power Lines',
    category: 'OpenStreetMap',
    color: hexColor('#e67e22'),
    minZoom: 14,
    fetch: (bounds) => queryOverpass(
      `[out:json][timeout:25];(way["power"~"line|minor_line|cable"]({bbox});node["power"~"pole|tower|transformer"]({bbox}););out body geom;`,
      bounds,
    ),
    style: (feature) => {
      const p = (feature?.properties ?? {}) as Record<string, string | undefined>;
      return {
        color: p['power'] === 'minor_line' ? '#f39c12' : '#e67e22',
        weight: p['power'] === 'line' ? 3 : 2,
        opacity: 0.9,
        dashArray: p['power'] === 'cable' ? '6 4' : undefined,
      };
    },
    popupContent: (f) => {
      const p = f.properties as Record<string, string | undefined>;
      let html = `<b>Power: ${p['power'] ?? 'unknown'}</b>`;
      if (p['voltage']) html += `<br>Voltage: ${p['voltage']}V`;
      if (p['operator']) html += `<br>Operator: ${p['operator']}`;
      if (p['cables']) html += `<br>Cables: ${p['cables']}`;
      return html;
    },
  });

  registerSource({
    id: dataSourceId('osm-pipelines'),
    name: 'Pipelines',
    category: 'OpenStreetMap',
    color: hexColor('#c0392b'),
    minZoom: 14,
    fetch: (bounds) => queryOverpass(
      `[out:json][timeout:25];(way["man_made"="pipeline"]({bbox});way["utility"="gas"]({bbox});way["utility"="water"]({bbox});way["utility"="sewer"]({bbox}););out body geom;`,
      bounds,
    ),
    style: () => ({
      color: '#c0392b',
      weight: 3,
      opacity: 0.8,
      dashArray: '8 4',
    }),
    popupContent: (f) => {
      const p = f.properties as Record<string, string | undefined>;
      let html = `<b>Pipeline</b>`;
      if (p['substance']) html += `<br>Substance: ${p['substance']}`;
      if (p['utility']) html += `<br>Utility: ${p['utility']}`;
      if (p['operator']) html += `<br>Operator: ${p['operator']}`;
      if (p['location']) html += `<br>Location: ${p['location']}`;
      return html;
    },
  });

  registerSource({
    id: dataSourceId('osm-fences'),
    name: 'Fences',
    category: 'OpenStreetMap',
    color: hexColor('#8B6914'),
    minZoom: 16,
    fetch: (bounds) => queryOverpass(
      `[out:json][timeout:25];(way["barrier"="fence"]({bbox});way["barrier"="wall"]({bbox});way["barrier"="hedge"]({bbox}););out body geom;`,
      bounds,
    ),
    style: (feature) => {
      const p = (feature?.properties ?? {}) as Record<string, string | undefined>;
      const barrierType = p['barrier'] ?? 'fence';
      return {
        color: barrierType === 'hedge' ? '#27ae60' : barrierType === 'wall' ? '#7f8c8d' : '#8B6914',
        weight: 2,
        opacity: 0.9,
      };
    },
    popupContent: (f) => {
      const p = f.properties as Record<string, string | undefined>;
      const barrier = p['barrier'] ?? 'barrier';
      let html = `<b>${barrier.charAt(0).toUpperCase() + barrier.slice(1)}</b>`;
      if (p['fence_type']) html += `<br>Type: ${p['fence_type']}`;
      if (p['material']) html += `<br>Material: ${p['material']}`;
      if (p['height']) html += `<br>Height: ${p['height']}`;
      return html;
    },
  });

  registerSource({
    id: dataSourceId('osm-water'),
    name: 'Water Features',
    category: 'OpenStreetMap',
    color: hexColor('#2980b9'),
    minZoom: 14,
    fetch: (bounds) => queryOverpass(
      `[out:json][timeout:25];(way["waterway"]({bbox});way["natural"="water"]({bbox});relation["natural"="water"]({bbox}););out body geom;`,
      bounds,
    ),
    style: (feature) => {
      const p = (feature?.properties ?? {}) as Record<string, string | undefined>;
      return {
        color: '#2980b9',
        weight: p['waterway'] ? 2 : 1,
        opacity: 0.8,
        fillOpacity: feature?.geometry.type.includes('Polygon') ? 0.2 : 0,
      };
    },
    popupContent: (f) => {
      const p = f.properties as Record<string, string | undefined>;
      const waterType = p['waterway'] ?? p['natural'] ?? 'Water';
      let html = `<b>${waterType.charAt(0).toUpperCase() + waterType.slice(1)}</b>`;
      if (p['name']) html += `<br>${p['name']}`;
      return html;
    },
  });
}
