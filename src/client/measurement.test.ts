// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import * as L from 'leaflet';
import { computeMeasurement } from './measurement.js';
import { FEET_PER_METER, FEET_PER_MILE, SQ_FEET_PER_ACRE } from '../constants.js';

describe('computeMeasurement', () => {
  describe('distance calculation', () => {
    it('computes line length in feet', () => {
      const line = L.polyline([
        [42.7, -84.5],
        [42.701, -84.5],
      ]);
      const result = computeMeasurement(line);
      expect(result).toContain('Length:');
      expect(result).toMatch(/\d+(\.\d+)? ft/);
    });

    it('formats long distances in miles', () => {
      const milesFeet = FEET_PER_MILE * 2;
      const latDelta = milesFeet / 364_000;
      const line = L.polyline([
        [42.0, -84.0],
        [42.0 + latDelta, -84.0],
      ]);
      const result = computeMeasurement(line);
      expect(result).toMatch(/mi/);
    });
  });

  describe('area calculation', () => {
    it('computes polygon area in square feet', () => {
      const poly = L.polygon([
        [42.7, -84.5],
        [42.701, -84.5],
        [42.701, -84.499],
        [42.7, -84.499],
      ]);
      const result = computeMeasurement(poly);
      expect(result).toContain('Area:');
      expect(result).toMatch(/acres|sq ft/);
    });

    it('formats large areas in acres', () => {
      const sideDeg = Math.sqrt(SQ_FEET_PER_ACRE * 10) / 364_000;
      const poly = L.polygon([
        [42.0, -84.0],
        [42.0 + sideDeg, -84.0],
        [42.0 + sideDeg, -84.0 + sideDeg],
        [42.0, -84.0 + sideDeg],
      ]);
      const result = computeMeasurement(poly);
      expect(result).toMatch(/acres/);
    });
  });

  describe('perimeter calculation', () => {
    it('includes perimeter for polygons', () => {
      const poly = L.polygon([
        [42.7, -84.5],
        [42.701, -84.5],
        [42.701, -84.499],
        [42.7, -84.499],
      ]);
      const result = computeMeasurement(poly);
      expect(result).toContain('Perimeter:');
    });
  });

  describe('circle measurements', () => {
    it('computes radius, area, and circumference with unit conversion from meters', () => {
      const radiusM = 10;
      const circle = L.circle([42.7, -84.5], { radius: radiusM });
      const result = computeMeasurement(circle);

      const radiusFt = radiusM * FEET_PER_METER;
      expect(result).toContain('Radius:');
      expect(result).toContain(`${radiusFt.toFixed(1)} ft`);
      expect(result).toContain('Area:');
      expect(result).toContain('Circumference:');
    });
  });

  describe('other geometry types', () => {
    it('returns coordinates for point features', () => {
      const marker = L.marker([42.735123, -84.545678]);
      const result = computeMeasurement(marker);
      expect(result).toContain('Position:');
      expect(result).toContain('42.735123');
      expect(result).toContain('-84.545678');
    });

    it('returns null for unsupported layers', () => {
      const fake = {} as L.Layer;
      expect(computeMeasurement(fake)).toBeNull();
    });
  });
});
