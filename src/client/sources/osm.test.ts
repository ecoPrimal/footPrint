// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { osmToGeoJSON } from './osm.js';

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
      elements: [{ type: 'way', id: 5, tags: { building: 'yes' } }],
    });
    expect(result).toEqual([]);
  });

  it('handles relation with way members as MultiPolygon', () => {
    const result = osmToGeoJSON({
      elements: [{
        type: 'relation', id: 10, tags: { type: 'multipolygon' },
        members: [{
          type: 'way', ref: 100, role: 'outer',
          geometry: [
            { lat: 42.0, lon: -84.0 },
            { lat: 42.0, lon: -84.1 },
            { lat: 42.1, lon: -84.0 },
            { lat: 42.0, lon: -84.0 },
          ],
        }],
      }],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.geometry.type).toBe('MultiPolygon');
    expect(result[0]!.properties!['_osmType']).toBe('relation');
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
