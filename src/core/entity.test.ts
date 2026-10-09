// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest';
import { createEntity, isValidComponentValue, ENTITY_KINDS, CONSTRAINT_TYPES } from './entity.js';
import type { ComponentKey, EntityId } from './entity.js';

describe('createEntity', () => {
  it('creates an entity with unique ID', () => {
    const a = createEntity('shape');
    const b = createEntity('shape');
    expect(a.id).not.toBe(b.id);
  });

  it('creates entity with correct kind', () => {
    for (const kind of ENTITY_KINDS) {
      const entity = createEntity(kind);
      expect(entity.kind).toBe(kind);
    }
  });

  it('creates entity with null parentId by default', () => {
    const entity = createEntity('shape');
    expect(entity.parentId).toBeNull();
  });

  it('creates entity with specified parentId', () => {
    const parent = createEntity('layer');
    const child = createEntity('shape', parent.id);
    expect(child.parentId).toBe(parent.id);
  });

  it('creates entity with empty children set', () => {
    const entity = createEntity('shape');
    expect(entity.children.size).toBe(0);
  });

  it('creates entity with empty components', () => {
    const entity = createEntity('shape');
    expect(entity.components).toEqual({});
  });

  it('creates mutable entity whose components can be assigned', () => {
    const entity = createEntity('shape');
    entity.components.geometry = {
      geojson: { type: 'Point', coordinates: [0, 0] },
      shapeType: 'marker',
    };
    expect(entity.components.geometry?.shapeType).toBe('marker');
  });
});

describe('isValidComponentValue', () => {
  describe('geometry', () => {
    it('accepts valid geometry', () => {
      expect(
        isValidComponentValue('geometry', {
          geojson: { type: 'Point', coordinates: [0, 0] },
          shapeType: 'marker',
        }),
      ).toBe(true);
    });

    it('rejects missing geojson', () => {
      expect(isValidComponentValue('geometry', { shapeType: 'marker' })).toBe(false);
    });

    it('rejects invalid shapeType', () => {
      expect(
        isValidComponentValue('geometry', {
          geojson: { type: 'Point', coordinates: [0, 0] },
          shapeType: 'invalid',
        }),
      ).toBe(false);
    });

    it('rejects non-object geojson', () => {
      expect(
        isValidComponentValue('geometry', {
          geojson: 'not an object',
          shapeType: 'marker',
        }),
      ).toBe(false);
    });

    it('accepts all valid shape types', () => {
      for (const st of ['polygon', 'polyline', 'rectangle', 'circle', 'marker', 'circlemarker']) {
        expect(
          isValidComponentValue('geometry', {
            geojson: { type: 'Point', coordinates: [0, 0] },
            shapeType: st,
          }),
        ).toBe(true);
      }
    });
  });

  describe('style', () => {
    it('accepts valid style', () => {
      expect(
        isValidComponentValue('style', {
          color: '#ff0000',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.5,
        }),
      ).toBe(true);
    });

    it('rejects missing color', () => {
      expect(isValidComponentValue('style', { weight: 2 })).toBe(false);
    });

    it('rejects non-number weight', () => {
      expect(isValidComponentValue('style', { color: '#ff0000', weight: 'thick' })).toBe(false);
    });
  });

  describe('meta', () => {
    it('accepts valid meta', () => {
      expect(
        isValidComponentValue('meta', {
          label: 'test',
          notes: '',
          status: 'planned',
          createdAt: '2026-01-01',
        }),
      ).toBe(true);
    });

    it('rejects missing label', () => {
      expect(isValidComponentValue('meta', { status: 'planned' })).toBe(false);
    });

    it('rejects non-string status', () => {
      expect(isValidComponentValue('meta', { label: 'test', status: 123 })).toBe(false);
    });
  });

  describe('layer', () => {
    it('accepts valid layer', () => {
      expect(isValidComponentValue('layer', { layerName: 'Base', visible: true })).toBe(true);
    });

    it('rejects non-boolean visible', () => {
      expect(isValidComponentValue('layer', { layerName: 'Base', visible: 'yes' })).toBe(false);
    });

    it('rejects missing layerName', () => {
      expect(isValidComponentValue('layer', { visible: true })).toBe(false);
    });
  });

  describe('dimension', () => {
    it('accepts valid dimension', () => {
      expect(
        isValidComponentValue('dimension', {
          targetEntityId: 'abc-123',
          fromVertex: 0,
          toVertex: 1,
          value: 25.5,
          unit: 'ft',
        }),
      ).toBe(true);
    });

    it('rejects non-string targetEntityId', () => {
      expect(
        isValidComponentValue('dimension', {
          targetEntityId: 123,
          value: 25.5,
        }),
      ).toBe(false);
    });

    it('rejects non-number value', () => {
      expect(
        isValidComponentValue('dimension', {
          targetEntityId: 'abc',
          value: 'twenty',
        }),
      ).toBe(false);
    });
  });

  describe('constraint', () => {
    it('accepts valid constraint', () => {
      expect(
        isValidComponentValue('constraint', {
          type: 'fixed-distance',
          entityIds: ['abc' as EntityId],
          params: { distance: 10 },
          satisfied: true,
        }),
      ).toBe(true);
    });

    it('rejects non-array entityIds', () => {
      expect(
        isValidComponentValue('constraint', {
          type: 'fixed-distance',
          entityIds: 'abc',
        }),
      ).toBe(false);
    });

    it('rejects non-string type', () => {
      expect(
        isValidComponentValue('constraint', {
          type: 123,
          entityIds: [],
        }),
      ).toBe(false);
    });
  });

  describe('elevation', () => {
    it('accepts valid elevation', () => {
      expect(
        isValidComponentValue('elevation', {
          vertices: [{ index: 0, elevation: 100 }],
          min: 100,
          max: 200,
        }),
      ).toBe(true);
    });

    it('rejects non-array vertices', () => {
      expect(
        isValidComponentValue('elevation', {
          vertices: 'not array',
          min: 0,
        }),
      ).toBe(false);
    });

    it('rejects non-number min', () => {
      expect(
        isValidComponentValue('elevation', {
          vertices: [],
          min: 'low',
        }),
      ).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('rejects non-object values', () => {
      const keys: ComponentKey[] = ['geometry', 'style', 'meta', 'layer', 'dimension', 'constraint', 'elevation'];
      for (const key of keys) {
        expect(isValidComponentValue(key, null)).toBe(false);
        expect(isValidComponentValue(key, undefined)).toBe(false);
        expect(isValidComponentValue(key, 'string')).toBe(false);
        expect(isValidComponentValue(key, 42)).toBe(false);
        expect(isValidComponentValue(key, [])).toBe(false);
      }
    });
  });
});

describe('ENTITY_KINDS', () => {
  it('has 5 kinds', () => {
    expect(ENTITY_KINDS).toHaveLength(5);
  });

  it('contains shape, layer, dimension, constraint, annotation', () => {
    expect(ENTITY_KINDS).toContain('shape');
    expect(ENTITY_KINDS).toContain('layer');
    expect(ENTITY_KINDS).toContain('dimension');
    expect(ENTITY_KINDS).toContain('constraint');
    expect(ENTITY_KINDS).toContain('annotation');
  });
});

describe('CONSTRAINT_TYPES', () => {
  it('has 10 constraint types', () => {
    expect(CONSTRAINT_TYPES).toHaveLength(10);
  });

  it('contains all supported types', () => {
    expect(CONSTRAINT_TYPES).toContain('fixed-distance');
    expect(CONSTRAINT_TYPES).toContain('parallel');
    expect(CONSTRAINT_TYPES).toContain('perpendicular');
    expect(CONSTRAINT_TYPES).toContain('point-on-line');
    expect(CONSTRAINT_TYPES).toContain('coincident');
    expect(CONSTRAINT_TYPES).toContain('horizontal');
    expect(CONSTRAINT_TYPES).toContain('vertical');
    expect(CONSTRAINT_TYPES).toContain('tangent');
    expect(CONSTRAINT_TYPES).toContain('symmetric');
    expect(CONSTRAINT_TYPES).toContain('setback');
  });
});
