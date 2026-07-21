import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ProjectFile } from '../types/project.js';

const PROJECTS_DIR = resolve(__dirname, '../../projects');

function loadProject(name: string): ProjectFile {
  const raw = readFileSync(resolve(PROJECTS_DIR, name), 'utf-8');
  return JSON.parse(raw) as ProjectFile;
}

describe('sample projects', () => {
  describe('lansing-scuffle.json', () => {
    const project = loadProject('lansing-scuffle.json');

    it('has required ProjectFile fields', () => {
      expect(project.name).toBeTruthy();
      expect(project.savedAt).toBeTruthy();
      expect(project.layers).toBeTruthy();
    });

    it('has valid savedAt timestamp', () => {
      const date = new Date(project.savedAt);
      expect(date.getTime()).not.toBeNaN();
    });

    it('has expected layers', () => {
      const layerIds = Object.keys(project.layers);
      expect(layerIds).toContain('parcel');
      expect(layerIds).toContain('building');
      expect(layerIds).toContain('kderm-zones');
      expect(layerIds).toContain('infrastructure');
    });

    it('every layer has name, color, and features', () => {
      for (const [id, layer] of Object.entries(project.layers)) {
        expect(layer.name, `${id} missing name`).toBeTruthy();
        expect(layer.color, `${id} missing color`).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(Array.isArray(layer.features), `${id} features not array`).toBe(true);
        expect(layer.features.length, `${id} has no features`).toBeGreaterThan(0);
      }
    });

    it('all features are valid GeoJSON', () => {
      for (const [id, layer] of Object.entries(project.layers)) {
        for (const feature of layer.features) {
          expect(feature.type, `${id} feature missing type`).toBe('Feature');
          expect(feature.geometry, `${id} feature missing geometry`).toBeTruthy();
          expect(feature.geometry.type, `${id} geometry missing type`).toBeTruthy();
          const geom = feature.geometry as { coordinates?: unknown };
          expect(geom.coordinates, `${id} geometry missing coordinates`).toBeTruthy();
          expect(feature.properties, `${id} feature missing properties`).toBeTruthy();
        }
      }
    });

    it('parcel has address and area', () => {
      const parcel = project.layers['parcel']!;
      expect(parcel).toBeTruthy();
      const props = parcel.features[0]!.properties as Record<string, unknown>;
      expect(props['address']).toContain('1305 S Cedar');
      expect(props['area_sf']).toBeGreaterThan(0);
    });

    it('building has structural specs', () => {
      const building = project.layers['building']!;
      expect(building).toBeTruthy();
      const props = building.features[0]!.properties as Record<string, unknown>;
      expect(props['area_sf']).toBe(464000);
      expect(props['floors']).toBe(3);
      expect(props['power_mw']).toBe(8);
      expect(props['year_built']).toBe(1941);
    });

    it('K-Derm zones cover all 3 floors', () => {
      const kderm = project.layers['kderm-zones']!;
      expect(kderm).toBeTruthy();
      expect(kderm.features.length).toBe(3);
      const floors = kderm.features.map(
        (f) => (f.properties as Record<string, unknown>)['floor'],
      );
      expect(floors).toContain(1);
      expect(floors).toContain(2);
      expect(floors).toContain(3);
    });

    it('infrastructure includes beachhead entry point', () => {
      const infra = project.layers['infrastructure']!;
      expect(infra).toBeTruthy();
      const beachhead = infra.features.find(
        (f) => (f.properties as Record<string, unknown>)['type'] === 'beachhead',
      );
      expect(beachhead).toBeTruthy();
      expect(beachhead?.geometry.type).toBe('Point');
    });

    it('all coordinates are in Lansing MI range', () => {
      for (const layer of Object.values(project.layers)) {
        for (const feature of layer.features) {
          const geom = feature.geometry as { coordinates?: unknown };
          const coords = flattenCoords(geom.coordinates);
          for (const [lng, lat] of coords) {
            expect(lat).toBeGreaterThan(42.7);
            expect(lat).toBeLessThan(42.73);
            expect(lng).toBeGreaterThan(-84.56);
            expect(lng).toBeLessThan(-84.53);
          }
        }
      }
    });
  });
});

function flattenCoords(coords: unknown): [number, number][] {
  if (!Array.isArray(coords)) return [];
  if (typeof coords[0] === 'number') return [coords as [number, number]];
  if (Array.isArray(coords[0]) && typeof coords[0][0] === 'number') {
    return coords as [number, number][];
  }
  return (coords as unknown[]).flatMap((c) => flattenCoords(c));
}
