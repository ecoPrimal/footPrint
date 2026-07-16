// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { layerToFeature } from './geojson.js';
import * as L from 'leaflet';

describe('layerToFeature', () => {
  it('extracts a GeoJSON Feature from a Leaflet polygon', () => {
    const poly = L.polygon([[42.7, -84.5], [42.71, -84.5], [42.71, -84.49]]);
    const feat = layerToFeature(poly);
    expect(feat).not.toBeNull();
    expect(feat!.type).toBe('Feature');
    expect(feat!.geometry.type).toBe('Polygon');
  });

  it('extracts a GeoJSON Feature from a Leaflet polyline', () => {
    const line = L.polyline([[42.7, -84.5], [42.71, -84.5]]);
    const feat = layerToFeature(line);
    expect(feat).not.toBeNull();
    expect(feat!.type).toBe('Feature');
    expect(feat!.geometry.type).toBe('LineString');
  });

  it('returns null for a plain object without toGeoJSON', () => {
    const fake = {} as L.Layer;
    const result = layerToFeature(fake);
    expect(result).toBeNull();
  });

  it('extracts a GeoJSON Feature from a circle marker', () => {
    const marker = L.circleMarker([42.7, -84.5]);
    const feat = layerToFeature(marker);
    expect(feat).not.toBeNull();
    expect(feat!.geometry.type).toBe('Point');
  });
});
