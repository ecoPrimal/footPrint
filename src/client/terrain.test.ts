// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { generateContours, computeSlopeAspect } from './terrain.js';
import type { TerrainGrid, ElevationSample } from '../types/terrain.js';

function makeGrid(
  elevations: number[][],
  sw: [number, number] = [42.0, -84.0],
  ne: [number, number] = [42.001, -83.999],
): TerrainGrid {
  const rows = elevations.length;
  const cols = elevations[0]?.length ?? 0;
  const samples: ElevationSample[] = [];
  const latStep = (ne[0] - sw[0]) / (rows - 1 || 1);
  const lngStep = (ne[1] - sw[1]) / (cols - 1 || 1);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      samples.push({
        lat: sw[0] + r * latStep,
        lng: sw[1] + c * lngStep,
        elevation: elevations[r]?.[c] ?? 0,
      });
    }
  }

  const all = samples.map((s) => s.elevation);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const mean = all.reduce((a, b) => a + b, 0) / all.length;

  return {
    samples,
    rows,
    cols,
    bounds: { sw, ne },
    resolution: 12.4,
    stats: { min, max, mean, range: max - min },
  };
}

describe('generateContours', () => {
  it('returns empty for grid smaller than 2x2', () => {
    const grid = makeGrid([[100]]);
    expect(generateContours(grid, 5)).toEqual([]);
  });

  it('returns empty for flat grid (no level crossings)', () => {
    const grid = makeGrid([
      [100, 100, 100],
      [100, 100, 100],
      [100, 100, 100],
    ]);
    const contours = generateContours(grid, 5);
    expect(contours).toEqual([]);
  });

  it('generates contours at the specified interval', () => {
    const grid = makeGrid([
      [900, 900, 900],
      [910, 910, 910],
      [920, 920, 920],
    ]);
    const contours = generateContours(grid, 5);
    const levels = contours.map((c) => c.elevation);
    expect(levels).toContain(905);
    expect(levels).toContain(910);
    expect(levels).toContain(915);
  });

  it('marks major contours correctly (every 5th interval)', () => {
    const grid = makeGrid([
      [900, 900, 900],
      [910, 910, 910],
      [930, 930, 930],
    ]);
    const contours = generateContours(grid, 5);
    const major = contours.filter((c) => c.isMajor);
    for (const c of major) {
      expect(c.elevation % 25).toBe(0);
    }
  });

  it('each contour has at least 2 coordinates', () => {
    const grid = makeGrid([
      [100, 105, 110],
      [105, 110, 115],
      [110, 115, 120],
    ]);
    const contours = generateContours(grid, 5);
    expect(contours.length).toBeGreaterThan(0);
    for (const c of contours) {
      expect(c.geometry.type).toBe('LineString');
      expect(c.geometry.coordinates.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('contour coordinates are within grid bounds', () => {
    const sw: [number, number] = [42.0, -84.0];
    const ne: [number, number] = [42.001, -83.999];
    const grid = makeGrid([
      [100, 100, 110],
      [100, 110, 120],
      [110, 120, 130],
    ], sw, ne);
    const contours = generateContours(grid, 10);
    for (const c of contours) {
      for (const [lng, lat] of c.geometry.coordinates) {
        expect(lat).toBeGreaterThanOrEqual(sw[0] - 0.001);
        expect(lat).toBeLessThanOrEqual(ne[0] + 0.001);
        expect(lng).toBeGreaterThanOrEqual(sw[1] - 0.001);
        expect(lng).toBeLessThanOrEqual(ne[1] + 0.001);
      }
    }
  });
});

describe('computeSlopeAspect', () => {
  it('returns empty for grid smaller than 3x3', () => {
    const grid = makeGrid([[100, 110], [120, 130]]);
    expect(computeSlopeAspect(grid)).toEqual([]);
  });

  it('returns zero slope for flat terrain', () => {
    const grid = makeGrid([
      [100, 100, 100],
      [100, 100, 100],
      [100, 100, 100],
    ]);
    const results = computeSlopeAspect(grid);
    expect(results).toHaveLength(1);
    expect(results[0]!.slope).toBe(0);
  });

  it('returns (rows-2)*(cols-2) interior points', () => {
    const grid = makeGrid([
      [100, 100, 100, 100],
      [100, 100, 100, 100],
      [100, 100, 100, 100],
      [100, 100, 100, 100],
    ]);
    const results = computeSlopeAspect(grid);
    expect(results).toHaveLength(4);
  });

  it('detects slope for north-facing gradient', () => {
    const grid = makeGrid([
      [110, 110, 110],
      [105, 105, 105],
      [100, 100, 100],
    ]);
    const results = computeSlopeAspect(grid);
    expect(results).toHaveLength(1);
    expect(results[0]!.slope).toBeGreaterThan(0);
  });

  it('slope values are reasonable degrees', () => {
    const grid = makeGrid([
      [100, 105, 110],
      [105, 110, 115],
      [110, 115, 120],
    ]);
    const results = computeSlopeAspect(grid);
    for (const r of results) {
      expect(r.slope).toBeGreaterThanOrEqual(0);
      expect(r.slope).toBeLessThan(90);
      expect(r.aspect).toBeGreaterThanOrEqual(0);
      expect(r.aspect).toBeLessThan(360);
      expect(r.drainageDirection).toBeGreaterThanOrEqual(0);
      expect(r.drainageDirection).toBeLessThan(360);
    }
  });
});
