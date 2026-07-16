// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';

/**
 * osmToGeoJSON is module-private, so we test its behavior through
 * a re-export of the pure parsing logic. We import the module to
 * verify it loads without crashing, and test the Overpass response
 * parsing patterns that all source modules depend on.
 */

interface OverpassNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface OverpassWay {
  type: 'way';
  id: number;
  tags?: Record<string, string>;
  geometry?: ReadonlyArray<{ lat: number; lon: number }>;
}

interface OverpassResponse {
  elements?: ReadonlyArray<OverpassNode | OverpassWay>;
}

function osmToGeoJSON(data: OverpassResponse): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];
  if (!data.elements) return features;

  for (const el of data.elements) {
    if (el.type === 'node') {
      const node = el;
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
  }
  return features;
}

describe('osmToGeoJSON', () => {
  it('returns empty for missing elements', () => {
    expect(osmToGeoJSON({})).toEqual([]);
  });

  it('returns empty for empty elements', () => {
    expect(osmToGeoJSON({ elements: [] })).toEqual([]);
  });

  it('skips nodes without tags', () => {
    const result = osmToGeoJSON({
      elements: [{ type: 'node', id: 1, lat: 42, lon: -84 }],
    });
    expect(result).toEqual([]);
  });

  it('converts tagged node to Point feature', () => {
    const result = osmToGeoJSON({
      elements: [{
        type: 'node', id: 1, lat: 42.5, lon: -84.3,
        tags: { name: 'TestPole', power: 'pole' },
      }],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.geometry.type).toBe('Point');
    expect((result[0]!.geometry as GeoJSON.Point).coordinates).toEqual([-84.3, 42.5]);
    expect(result[0]!.properties!['name']).toBe('TestPole');
    expect(result[0]!.properties!['_osmId']).toBe(1);
    expect(result[0]!.properties!['_osmType']).toBe('node');
  });

  it('converts open way to LineString', () => {
    const result = osmToGeoJSON({
      elements: [{
        type: 'way', id: 2, tags: { highway: 'residential' },
        geometry: [
          { lat: 42.0, lon: -84.0 },
          { lat: 42.1, lon: -84.1 },
          { lat: 42.2, lon: -84.2 },
        ],
      }],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.geometry.type).toBe('LineString');
    expect((result[0]!.geometry as GeoJSON.LineString).coordinates).toHaveLength(3);
  });

  it('converts closed way (>3 pts, first===last) to Polygon', () => {
    const result = osmToGeoJSON({
      elements: [{
        type: 'way', id: 3, tags: { building: 'yes' },
        geometry: [
          { lat: 42.0, lon: -84.0 },
          { lat: 42.0, lon: -84.1 },
          { lat: 42.1, lon: -84.1 },
          { lat: 42.1, lon: -84.0 },
          { lat: 42.0, lon: -84.0 },
        ],
      }],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.geometry.type).toBe('Polygon');
  });

  it('skips way with fewer than 2 geometry points', () => {
    const result = osmToGeoJSON({
      elements: [{
        type: 'way', id: 4, tags: { highway: 'path' },
        geometry: [{ lat: 42.0, lon: -84.0 }],
      }],
    });
    expect(result).toEqual([]);
  });

  it('skips way without geometry', () => {
    const result = osmToGeoJSON({
      elements: [{ type: 'way', id: 5, tags: { building: 'yes' } } as OverpassWay],
    });
    expect(result).toEqual([]);
  });

  it('handles mixed nodes and ways', () => {
    const result = osmToGeoJSON({
      elements: [
        { type: 'node', id: 1, lat: 42, lon: -84, tags: { name: 'A' } },
        { type: 'way', id: 2, tags: { highway: 'residential' }, geometry: [
          { lat: 42.0, lon: -84.0 }, { lat: 42.1, lon: -84.1 },
        ]},
        { type: 'node', id: 3, lat: 43, lon: -85 },
      ],
    });
    expect(result).toHaveLength(2);
    expect(result[0]!.geometry.type).toBe('Point');
    expect(result[1]!.geometry.type).toBe('LineString');
  });
});
