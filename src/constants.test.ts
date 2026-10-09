// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest';
import {
  METERS_PER_DEGREE_LAT,
  FEET_PER_METER,
  FEET_PER_DEGREE_LAT,
  ALLOWED_HOSTS,
  CACHE_TTLS,
  SOLVER_MAX_ITERATIONS,
  SOLVER_TOLERANCE,
} from './constants.js';

describe('constants', () => {
  it('FEET_PER_DEGREE_LAT is derived correctly', () => {
    expect(FEET_PER_DEGREE_LAT).toBeCloseTo(METERS_PER_DEGREE_LAT * FEET_PER_METER, 0);
  });

  it('ALLOWED_HOSTS contains expected sovereign data sources', () => {
    expect(ALLOWED_HOSTS).toContain('overpass-api.de');
    expect(ALLOWED_HOSTS).toContain('hazards.fema.gov');
    expect(ALLOWED_HOSTS).toContain('epqs.nationalmap.gov');
    expect(ALLOWED_HOSTS).toContain('nominatim.openstreetmap.org');
  });

  it('CACHE_TTLS are ordered sensibly', () => {
    expect(CACHE_TTLS.fema).toBeLessThan(CACHE_TTLS.overpass);
    expect(CACHE_TTLS.overpass).toBeLessThan(CACHE_TTLS.default);
    expect(CACHE_TTLS.default).toBeLessThan(CACHE_TTLS.elevation);
    expect(CACHE_TTLS.elevation).toBeLessThan(CACHE_TTLS.soils);
  });

  it('solver constants are positive', () => {
    expect(SOLVER_MAX_ITERATIONS).toBeGreaterThan(0);
    expect(SOLVER_TOLERANCE).toBeGreaterThan(0);
    expect(SOLVER_TOLERANCE).toBeLessThan(1);
  });
});
