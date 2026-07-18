import { describe, it, expect } from 'vitest';
import { KNOWN_LOCATIONS, DEFAULT_MAP_CENTER } from '../constants.js';

describe('KNOWN_LOCATIONS', () => {
  it('has at least 3 locations (standard requirement)', () => {
    expect(KNOWN_LOCATIONS.length).toBeGreaterThanOrEqual(3);
  });

  it('has unique IDs', () => {
    const ids = KNOWN_LOCATIONS.map(l => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every location has a valid center (lat/lng in Michigan range)', () => {
    for (const loc of KNOWN_LOCATIONS) {
      const [lat, lng] = loc.center;
      expect(lat).toBeGreaterThan(42.0);
      expect(lat).toBeLessThan(43.5);
      expect(lng).toBeGreaterThan(-85.5);
      expect(lng).toBeLessThan(-83.5);
    }
  });

  it('every location has a zoom between 14 and 20', () => {
    for (const loc of KNOWN_LOCATIONS) {
      expect(loc.zoom).toBeGreaterThanOrEqual(14);
      expect(loc.zoom).toBeLessThanOrEqual(20);
    }
  });

  it('every location has at least 2 expectedSources', () => {
    for (const loc of KNOWN_LOCATIONS) {
      expect(loc.expectedSources.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('every location has non-empty name, description, and id', () => {
    for (const loc of KNOWN_LOCATIONS) {
      expect(loc.id.length).toBeGreaterThan(0);
      expect(loc.name.length).toBeGreaterThan(0);
      expect(loc.description.length).toBeGreaterThan(0);
    }
  });

  it('IDs are URL-hash-safe (lowercase alphanumeric + hyphens only)', () => {
    for (const loc of KNOWN_LOCATIONS) {
      expect(loc.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('includes required locations from standard (MSU, Downtown EL, Red Cedar, Meridian, Haslett)', () => {
    const ids = KNOWN_LOCATIONS.map(l => l.id);
    expect(ids).toContain('msu-campus');
    expect(ids).toContain('el-downtown');
    expect(ids).toContain('red-cedar');
    expect(ids).toContain('meridian-twp');
    expect(ids).toContain('haslett-farms');
  });

  it('default map center is within Michigan', () => {
    expect(DEFAULT_MAP_CENTER[0]).toBeGreaterThan(42.0);
    expect(DEFAULT_MAP_CENTER[0]).toBeLessThan(43.5);
    expect(DEFAULT_MAP_CENTER[1]).toBeGreaterThan(-85.5);
    expect(DEFAULT_MAP_CENTER[1]).toBeLessThan(-83.5);
  });
});
