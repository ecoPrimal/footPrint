// SPDX-License-Identifier: AGPL-3.0-or-later
import type { GeometryComponent } from './entity.js';
import type { DeepReadonly } from '@protokarya/rustscript';
import { exhaustive } from '@protokarya/rustscript';

/**
 * Safely narrow a GeoJSON Position (number[]) to [lng, lat].
 * GeoJSON positions are number[] but footPrint only uses 2D coordinates.
 */
export function toLngLat(pos: readonly number[]): [number, number] {
  return [pos[0] ?? 0, pos[1] ?? 0];
}

function positionsToLngLat(positions: readonly (readonly number[])[]): [number, number][] {
  return positions.map(toLngLat);
}

/**
 * Accept DeepReadonly<GeometryComponent> so both mutable and readonly callers work.
 * GeometryComponent (mutable) is assignable to DeepReadonly<GeometryComponent> (readonly).
 */
export function extractCoords(geo: DeepReadonly<GeometryComponent>): [number, number][] {
  const g = geo.geojson;
  switch (g.type) {
    case 'Point':
      return [toLngLat(g.coordinates)];
    case 'LineString':
      return positionsToLngLat(g.coordinates);
    case 'Polygon':
      return positionsToLngLat(g.coordinates[0] ?? []);
    case 'MultiPoint':
      return positionsToLngLat(g.coordinates);
    case 'MultiLineString': {
      const result: [number, number][] = [];
      for (const line of g.coordinates) {
        for (const c of line) result.push(toLngLat(c));
      }
      return result;
    }
    case 'MultiPolygon': {
      const result: [number, number][] = [];
      for (const poly of g.coordinates) {
        const ring = poly[0];
        if (ring) {
          for (const c of ring) result.push(toLngLat(c));
        }
      }
      return result;
    }
    case 'GeometryCollection':
      return [];
    default:
      exhaustive(g);
  }
}

export function rebuildGeometry(
  original: DeepReadonly<GeometryComponent>,
  newCoords: [number, number][],
): GeometryComponent {
  const geo = structuredClone(original) as GeometryComponent;
  const g = geo.geojson;

  switch (g.type) {
    case 'Point':
      if (newCoords[0]) g.coordinates = newCoords[0];
      break;
    case 'LineString':
      g.coordinates = newCoords;
      break;
    case 'Polygon':
      if (g.coordinates[0]) {
        g.coordinates[0] = newCoords;
      }
      break;
    case 'MultiLineString': {
      let idx = 0;
      for (let li = 0; li < g.coordinates.length; li++) {
        const line = g.coordinates[li];
        if (!line) continue;
        const slice = newCoords.slice(idx, idx + line.length);
        g.coordinates[li] = slice;
        idx += line.length;
      }
      break;
    }
    case 'MultiPolygon': {
      let idx = 0;
      for (const poly of g.coordinates) {
        const ring = poly[0];
        if (!ring) continue;
        const slice = newCoords.slice(idx, idx + ring.length);
        poly[0] = slice;
        idx += ring.length;
      }
      break;
    }
    case 'MultiPoint':
      g.coordinates = newCoords;
      break;
    case 'GeometryCollection':
      break;
    default:
      exhaustive(g);
  }

  return geo;
}
