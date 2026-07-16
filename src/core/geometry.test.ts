import { describe, it, expect } from 'vitest';
import { extractCoords, rebuildGeometry } from './geometry.js';
import type { GeometryComponent } from './entity.js';

function makeGeo(geojson: GeoJSON.Geometry, shapeType: GeometryComponent['shapeType'] = 'polygon'): GeometryComponent {
  return { geojson, shapeType };
}

describe('extractCoords', () => {
  it('extracts Point coordinates', () => {
    const geo = makeGeo({ type: 'Point', coordinates: [1, 2] }, 'marker');
    expect(extractCoords(geo)).toEqual([[1, 2]]);
  });

  it('extracts LineString coordinates', () => {
    const geo = makeGeo({ type: 'LineString', coordinates: [[0, 0], [1, 1], [2, 2]] }, 'polyline');
    expect(extractCoords(geo)).toEqual([[0, 0], [1, 1], [2, 2]]);
  });

  it('extracts Polygon outer ring', () => {
    const ring = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
    const geo = makeGeo({ type: 'Polygon', coordinates: [ring] });
    expect(extractCoords(geo)).toEqual(ring);
  });

  it('extracts MultiPoint coordinates', () => {
    const geo = makeGeo({ type: 'MultiPoint', coordinates: [[5, 5], [6, 6]] }, 'marker');
    expect(extractCoords(geo)).toEqual([[5, 5], [6, 6]]);
  });

  it('extracts MultiLineString coordinates (flattened)', () => {
    const geo = makeGeo({
      type: 'MultiLineString',
      coordinates: [[[0, 0], [1, 1]], [[2, 2], [3, 3]]],
    }, 'polyline');
    expect(extractCoords(geo)).toEqual([[0, 0], [1, 1], [2, 2], [3, 3]]);
  });

  it('extracts MultiPolygon outer rings (flattened)', () => {
    const geo = makeGeo({
      type: 'MultiPolygon',
      coordinates: [
        [[[0, 0], [1, 0], [1, 1], [0, 0]]],
        [[[2, 2], [3, 2], [3, 3], [2, 2]]],
      ],
    });
    expect(extractCoords(geo)).toEqual([
      [0, 0], [1, 0], [1, 1], [0, 0],
      [2, 2], [3, 2], [3, 3], [2, 2],
    ]);
  });

  it('returns empty for GeometryCollection', () => {
    const geo = makeGeo({ type: 'GeometryCollection', geometries: [] });
    expect(extractCoords(geo)).toEqual([]);
  });
});

describe('rebuildGeometry', () => {
  it('round-trips Point', () => {
    const original = makeGeo({ type: 'Point', coordinates: [1, 2] }, 'marker');
    const coords = extractCoords(original);
    const rebuilt = rebuildGeometry(original, [[10, 20]]);
    expect(rebuilt.geojson.type).toBe('Point');
    expect((rebuilt.geojson as GeoJSON.Point).coordinates).toEqual([10, 20]);
    // original unchanged
    expect(coords).toEqual([[1, 2]]);
  });

  it('round-trips LineString', () => {
    const original = makeGeo({ type: 'LineString', coordinates: [[0, 0], [1, 1]] }, 'polyline');
    const rebuilt = rebuildGeometry(original, [[5, 5], [6, 6]]);
    expect((rebuilt.geojson as GeoJSON.LineString).coordinates).toEqual([[5, 5], [6, 6]]);
  });

  it('round-trips Polygon', () => {
    const ring = [[0, 0], [1, 0], [1, 1], [0, 0]];
    const original = makeGeo({ type: 'Polygon', coordinates: [ring] });
    const newRing: Array<[number, number]> = [[10, 10], [11, 10], [11, 11], [10, 10]];
    const rebuilt = rebuildGeometry(original, newRing);
    expect((rebuilt.geojson as GeoJSON.Polygon).coordinates[0]).toEqual(newRing);
  });

  it('round-trips MultiPoint', () => {
    const original = makeGeo({ type: 'MultiPoint', coordinates: [[0, 0], [1, 1]] }, 'marker');
    const rebuilt = rebuildGeometry(original, [[9, 9], [8, 8]]);
    expect((rebuilt.geojson as GeoJSON.MultiPoint).coordinates).toEqual([[9, 9], [8, 8]]);
  });

  it('round-trips MultiLineString preserving structure', () => {
    const original = makeGeo({
      type: 'MultiLineString',
      coordinates: [[[0, 0], [1, 1]], [[2, 2], [3, 3], [4, 4]]],
    }, 'polyline');
    const flat: Array<[number, number]> = [[10, 10], [11, 11], [12, 12], [13, 13], [14, 14]];
    const rebuilt = rebuildGeometry(original, flat);
    const coords = (rebuilt.geojson as GeoJSON.MultiLineString).coordinates;
    expect(coords[0]).toEqual([[10, 10], [11, 11]]);
    expect(coords[1]).toEqual([[12, 12], [13, 13], [14, 14]]);
  });

  it('round-trips MultiPolygon preserving structure', () => {
    const original = makeGeo({
      type: 'MultiPolygon',
      coordinates: [
        [[[0, 0], [1, 0], [1, 1], [0, 0]]],
        [[[2, 2], [3, 2], [3, 3], [2, 2]]],
      ],
    });
    const flat: Array<[number, number]> = [
      [10, 10], [11, 10], [11, 11], [10, 10],
      [20, 20], [21, 20], [21, 21], [20, 20],
    ];
    const rebuilt = rebuildGeometry(original, flat);
    const coords = (rebuilt.geojson as GeoJSON.MultiPolygon).coordinates;
    expect(coords[0]![0]).toEqual([[10, 10], [11, 10], [11, 11], [10, 10]]);
    expect(coords[1]![0]).toEqual([[20, 20], [21, 20], [21, 21], [20, 20]]);
  });

  it('preserves shapeType and radius', () => {
    const original: GeometryComponent = {
      geojson: { type: 'Point', coordinates: [0, 0] },
      shapeType: 'circle',
      radius: 42,
    };
    const rebuilt = rebuildGeometry(original, [[5, 5]]);
    expect(rebuilt.shapeType).toBe('circle');
    expect(rebuilt.radius).toBe(42);
  });

  it('does not mutate the original', () => {
    const original = makeGeo({ type: 'LineString', coordinates: [[0, 0], [1, 1]] }, 'polyline');
    rebuildGeometry(original, [[99, 99], [88, 88]]);
    expect((original.geojson as GeoJSON.LineString).coordinates).toEqual([[0, 0], [1, 1]]);
  });
});
