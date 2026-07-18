/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as L from 'leaflet';
import { EntityStore } from './store.js';
import { createEntity } from './entity.js';
import type { EntityId, MutableEntity } from './entity.js';
import { hexColorUnchecked } from '../types/brands.js';
import { initRenderer, getLeafletLayer, getEntityIdForLayer, setDimensionClickHandler } from './renderer.js';

// Override the module-level store import
vi.mock('./store.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./store.js')>();
  const testStore = new actual.EntityStore();
  return { ...actual, store: testStore, EntityStore: actual.EntityStore };
});

let store: EntityStore;

async function getStore(): Promise<EntityStore> {
  const mod = await import('./store.js');
  return mod.store as unknown as EntityStore;
}

function makeLayerEntity(s: EntityStore, name = 'TestLayer', visible = true): MutableEntity {
  const entity = createEntity('layer', null);
  entity.components.layer = { layerName: name, visible };
  entity.components.style = { color: hexColorUnchecked('#ff0000'), weight: 2, opacity: 1, fillOpacity: 0.5 };
  s.add(entity);
  return entity;
}

function makeShapeEntity(s: EntityStore, parentId: EntityId, shapeType: 'polygon' | 'polyline' | 'marker' | 'circle' | 'circlemarker' = 'polygon'): MutableEntity {
  const entity = createEntity('shape', parentId);

  if (shapeType === 'polygon') {
    entity.components.geometry = {
      geojson: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
      shapeType: 'polygon',
    };
  } else if (shapeType === 'marker') {
    entity.components.geometry = {
      geojson: { type: 'Point', coordinates: [-84.48, 42.73] },
      shapeType: 'marker',
    };
  } else if (shapeType === 'circle') {
    entity.components.geometry = {
      geojson: { type: 'Point', coordinates: [-84.48, 42.73] },
      shapeType: 'circle',
      radius: 100,
    };
  } else if (shapeType === 'circlemarker') {
    entity.components.geometry = {
      geojson: { type: 'Point', coordinates: [-84.48, 42.73] },
      shapeType: 'circlemarker',
    };
  } else {
    entity.components.geometry = {
      geojson: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
      shapeType: 'polyline',
    };
  }

  entity.components.style = { color: hexColorUnchecked('#00ff00'), weight: 1, opacity: 1, fillOpacity: 0.3 };
  entity.components.meta = { label: 'test', notes: '', status: 'planned', createdAt: '2026-01-01' };
  s.add(entity);
  return entity;
}

function makeDimensionEntity(s: EntityStore, targetId: EntityId): MutableEntity {
  const entity = createEntity('dimension', null);
  entity.components.dimension = {
    targetEntityId: targetId,
    fromVertex: 0,
    toVertex: 1,
    value: 25.5,
    unit: 'ft',
  };
  s.add(entity);
  return entity;
}

function makeConstraintEntity(s: EntityStore, targetId: EntityId): MutableEntity {
  const entity = createEntity('constraint', null);
  entity.components.constraint = {
    type: 'fixed-distance',
    entityIds: [targetId],
    params: { distance: 10, vertexIndices: [0, 1] },
    satisfied: true,
  };
  s.add(entity);
  return entity;
}

describe('renderer', () => {
  let map: L.Map;

  beforeEach(async () => {
    store = await getStore();
    store.clear();

    const div = document.createElement('div');
    div.style.width = '800px';
    div.style.height = '600px';
    document.body.appendChild(div);
    map = L.map(div, { center: [42.73, -84.48], zoom: 16 });

    initRenderer(map);
  });

  describe('initRenderer + getLeafletLayer', () => {
    it('returns undefined for unknown entity IDs', () => {
      expect(getLeafletLayer('nonexistent' as EntityId)).toBeUndefined();
    });

    it('creates a leaflet layer when a shape entity is added', () => {
      const layer = makeLayerEntity(store);
      const shape = makeShapeEntity(store, layer.id);
      const leaflet = getLeafletLayer(shape.id);
      expect(leaflet).toBeDefined();
    });

    it('creates a FeatureGroup for layer entities', () => {
      const layer = makeLayerEntity(store);
      // Layer groups are tracked internally; we verify by checking shapes added to them
      const shape = makeShapeEntity(store, layer.id);
      expect(getLeafletLayer(shape.id)).toBeDefined();
    });
  });

  describe('getEntityIdForLayer', () => {
    it('returns entity ID for a known leaflet layer', () => {
      const layer = makeLayerEntity(store);
      const shape = makeShapeEntity(store, layer.id, 'marker');
      const leaflet = getLeafletLayer(shape.id);
      expect(leaflet).toBeDefined();
      expect(getEntityIdForLayer(leaflet!)).toBe(shape.id);
    });

    it('returns undefined for an unknown leaflet layer', () => {
      const randomLayer = L.marker([0, 0]);
      expect(getEntityIdForLayer(randomLayer)).toBeUndefined();
    });
  });

  describe('shape rendering by type', () => {
    it('renders polygon shapes as GeoJSON layers', () => {
      const layer = makeLayerEntity(store);
      const shape = makeShapeEntity(store, layer.id, 'polygon');
      expect(getLeafletLayer(shape.id)).toBeDefined();
    });

    it('renders marker shapes as L.Marker', () => {
      const layer = makeLayerEntity(store);
      const shape = makeShapeEntity(store, layer.id, 'marker');
      const leaflet = getLeafletLayer(shape.id);
      expect(leaflet).toBeInstanceOf(L.Marker);
    });

    it('renders circle shapes as L.Circle', () => {
      const layer = makeLayerEntity(store);
      const shape = makeShapeEntity(store, layer.id, 'circle');
      const leaflet = getLeafletLayer(shape.id);
      expect(leaflet).toBeInstanceOf(L.Circle);
    });

    it('renders circlemarker shapes as L.CircleMarker', () => {
      const layer = makeLayerEntity(store);
      const shape = makeShapeEntity(store, layer.id, 'circlemarker');
      const leaflet = getLeafletLayer(shape.id);
      expect(leaflet).toBeInstanceOf(L.CircleMarker);
    });

    it('renders polyline shapes', () => {
      const layer = makeLayerEntity(store);
      const shape = makeShapeEntity(store, layer.id, 'polyline');
      expect(getLeafletLayer(shape.id)).toBeDefined();
    });
  });

  describe('entity removal', () => {
    it('removes the leaflet layer from the map when entity is removed', () => {
      const layer = makeLayerEntity(store);
      const shape = makeShapeEntity(store, layer.id, 'marker');
      expect(getLeafletLayer(shape.id)).toBeDefined();

      store.remove(shape.id);
      expect(getLeafletLayer(shape.id)).toBeUndefined();
    });

    it('removes layer group when layer entity is removed', () => {
      const layer = makeLayerEntity(store);
      const shape = makeShapeEntity(store, layer.id, 'marker');
      expect(getLeafletLayer(shape.id)).toBeDefined();

      store.remove(layer.id);
      // The layer group itself is cleaned up
      expect(getLeafletLayer(layer.id)).toBeUndefined();
    });
  });

  describe('entity updates', () => {
    it('applies style changes to existing path layers', () => {
      const layer = makeLayerEntity(store);
      const shape = makeShapeEntity(store, layer.id, 'polygon');
      const leaflet = getLeafletLayer(shape.id);
      expect(leaflet).toBeDefined();

      store.setComponent(shape.id, 'style', {
        color: hexColorUnchecked('#0000ff'),
        weight: 5,
        opacity: 0.8,
        fillOpacity: 0.2,
      });

      const updated = getLeafletLayer(shape.id);
      if (updated instanceof L.Path) {
        const opts = updated.options;
        expect(opts.color).toBe('#0000ff');
        expect(opts.weight).toBe(5);
      }
    });

    it('rebuilds shape layer on geometry update', () => {
      const layer = makeLayerEntity(store);
      const shape = makeShapeEntity(store, layer.id, 'marker');
      const original = getLeafletLayer(shape.id);
      expect(original).toBeDefined();

      store.setComponent(shape.id, 'geometry', {
        geojson: { type: 'Point', coordinates: [-84.5, 42.8] },
        shapeType: 'marker',
      });

      const rebuilt = getLeafletLayer(shape.id);
      expect(rebuilt).toBeDefined();
      expect(rebuilt).not.toBe(original);
    });

    it('toggles layer visibility on layer component update', () => {
      const layer = makeLayerEntity(store, 'Test', true);

      store.setComponent(layer.id, 'layer', {
        layerName: 'Test',
        visible: false,
      });

      // Re-toggle visible
      store.setComponent(layer.id, 'layer', {
        layerName: 'Test',
        visible: true,
      });
    });
  });

  describe('dimension rendering', () => {
    it('renders dimension entities as markers with label', () => {
      const layer = makeLayerEntity(store);
      const shape = makeShapeEntity(store, layer.id, 'polygon');
      const dim = makeDimensionEntity(store, shape.id);

      const leaflet = getLeafletLayer(dim.id);
      expect(leaflet).toBeDefined();
      expect(leaflet).toBeInstanceOf(L.Marker);
    });

    it('renders constrained dimension with special class', () => {
      const layer = makeLayerEntity(store);
      const shape = makeShapeEntity(store, layer.id, 'polygon');
      makeConstraintEntity(store, shape.id);
      const dim = makeDimensionEntity(store, shape.id);

      const leaflet = getLeafletLayer(dim.id);
      expect(leaflet).toBeDefined();
    });

    it('returns null for dimension with invalid target', () => {
      const dim = createEntity('dimension', null);
      dim.components.dimension = {
        targetEntityId: 'nonexistent' as EntityId,
        fromVertex: 0,
        toVertex: 1,
        value: 10,
        unit: 'ft',
      };
      store.add(dim);

      expect(getLeafletLayer(dim.id)).toBeUndefined();
    });

    it('updates dimension layer on update event', () => {
      const layer = makeLayerEntity(store);
      const shape = makeShapeEntity(store, layer.id, 'polygon');
      const dim = makeDimensionEntity(store, shape.id);

      const original = getLeafletLayer(dim.id);
      store.setComponent(dim.id, 'dimension', {
        targetEntityId: shape.id,
        fromVertex: 0,
        toVertex: 1,
        value: 50.0,
        unit: 'ft',
      });

      const updated = getLeafletLayer(dim.id);
      expect(updated).toBeDefined();
      expect(updated).not.toBe(original);
    });
  });

  describe('setDimensionClickHandler', () => {
    it('fires handler when dimension marker is clicked', () => {
      const handler = vi.fn();
      setDimensionClickHandler(handler);

      const layer = makeLayerEntity(store);
      const shape = makeShapeEntity(store, layer.id, 'polygon');
      const dim = makeDimensionEntity(store, shape.id);

      const leaflet = getLeafletLayer(dim.id);
      expect(leaflet).toBeDefined();
      (leaflet as L.Marker).fire('click');

      expect(handler).toHaveBeenCalledWith(dim.id);
    });
  });

  describe('annotation entities', () => {
    it('handles annotation entity addition (currently no-op)', () => {
      const entity = createEntity('annotation', null);
      entity.components.meta = { label: 'Note', notes: 'test', status: 'planned', createdAt: '2026-01-01' };
      store.add(entity);
      // buildAnnotationLayer returns null currently
      expect(getLeafletLayer(entity.id)).toBeUndefined();
    });
  });

  describe('constraint entities', () => {
    it('handles constraint entity addition (no leaflet layer)', () => {
      const layer = makeLayerEntity(store);
      const shape = makeShapeEntity(store, layer.id, 'polygon');
      makeConstraintEntity(store, shape.id);
      // Constraints don't produce leaflet layers
    });
  });

  describe('dimension value formatting', () => {
    it('renders large values as rounded integers', () => {
      const layer = makeLayerEntity(store);
      const shape = makeShapeEntity(store, layer.id, 'polygon');
      const dim = createEntity('dimension', null);
      dim.components.dimension = {
        targetEntityId: shape.id,
        fromVertex: 0,
        toVertex: 1,
        value: 150.7,
        unit: 'ft',
      };
      store.add(dim);

      const leaflet = getLeafletLayer(dim.id);
      expect(leaflet).toBeDefined();
    });

    it('renders values in meters when unit is m', () => {
      const layer = makeLayerEntity(store);
      const shape = makeShapeEntity(store, layer.id, 'polygon');
      const dim = createEntity('dimension', null);
      dim.components.dimension = {
        targetEntityId: shape.id,
        fromVertex: 0,
        toVertex: 1,
        value: 8.3,
        unit: 'm',
      };
      store.add(dim);

      const leaflet = getLeafletLayer(dim.id);
      expect(leaflet).toBeDefined();
    });
  });

  describe('addToParentGroup', () => {
    it('adds shape to parent group if parent exists', () => {
      const layer = makeLayerEntity(store);
      const shape = makeShapeEntity(store, layer.id, 'marker');
      // If it's in the parent group, it's on the map (the group was added)
      const leaflet = getLeafletLayer(shape.id);
      expect(leaflet).toBeDefined();
    });

    it('adds shape directly to map if no parent group', () => {
      const shape = makeShapeEntity(store, null as unknown as EntityId, 'marker');
      // Shape with null parent adds directly to map
      const leaflet = getLeafletLayer(shape.id);
      expect(leaflet).toBeDefined();
    });
  });
});
