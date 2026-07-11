import type { GeometryComponent } from './entity.js';
import type { DeepReadonly } from '../rustscript/types.js';
import { exhaustive } from '../rustscript/exhaustive.js';

/**
 * Accept DeepReadonly<GeometryComponent> so both mutable and readonly callers work.
 * GeometryComponent (mutable) is assignable to DeepReadonly<GeometryComponent> (readonly).
 */
export function extractCoords(geo: DeepReadonly<GeometryComponent>): Array<[number, number]> {
  const g = geo.geojson;
  switch (g.type) {
    case 'Point': return [g.coordinates as unknown as [number, number]];
    case 'LineString': return g.coordinates as unknown as Array<[number, number]>;
    case 'Polygon': return (g.coordinates[0] ?? []) as unknown as Array<[number, number]>;
    case 'MultiPoint': return g.coordinates as unknown as Array<[number, number]>;
    case 'MultiLineString': {
      const result: Array<[number, number]> = [];
      for (const line of g.coordinates) {
        for (const c of line) result.push(c as unknown as [number, number]);
      }
      return result;
    }
    case 'MultiPolygon': {
      const result: Array<[number, number]> = [];
      for (const poly of g.coordinates) {
        const ring = poly[0];
        if (ring) {
          for (const c of ring) result.push(c as unknown as [number, number]);
        }
      }
      return result;
    }
    case 'GeometryCollection': return [];
    default: exhaustive(g);
  }
}

export function rebuildGeometry(
  original: DeepReadonly<GeometryComponent>,
  newCoords: Array<[number, number]>,
): GeometryComponent {
  // structuredClone produces a deep mutable copy; cast is safe
  const geo = structuredClone(original) as unknown as GeometryComponent;
  const g = geo.geojson;

  switch (g.type) {
    case 'Point':
      if (newCoords[0]) g.coordinates = newCoords[0];
      break;
    case 'LineString':
      (g as GeoJSON.LineString).coordinates = newCoords;
      break;
    case 'Polygon':
      if ((g as GeoJSON.Polygon).coordinates[0]) {
        (g as GeoJSON.Polygon).coordinates[0] = newCoords;
      }
      break;
    case 'MultiLineString': {
      let idx = 0;
      for (let li = 0; li < (g as GeoJSON.MultiLineString).coordinates.length; li++) {
        const line = (g as GeoJSON.MultiLineString).coordinates[li];
        if (!line) continue;
        const slice = newCoords.slice(idx, idx + line.length);
        (g as GeoJSON.MultiLineString).coordinates[li] = slice;
        idx += line.length;
      }
      break;
    }
    case 'MultiPolygon': {
      let idx = 0;
      for (const poly of (g as GeoJSON.MultiPolygon).coordinates) {
        const ring = poly[0];
        if (!ring) continue;
        const slice = newCoords.slice(idx, idx + ring.length);
        poly[0] = slice;
        idx += ring.length;
      }
      break;
    }
    case 'MultiPoint':
      (g as GeoJSON.MultiPoint).coordinates = newCoords;
      break;
    case 'GeometryCollection':
      break;
    default: exhaustive(g);
  }

  return geo;
}
