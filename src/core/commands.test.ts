// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach } from 'vitest';
import { EntityStore } from './store.js';
import { createEntity } from './entity.js';
import type { EntityId } from './entity.js';
import {
  AddEntityCommand,
  RemoveEntityCommand,
  UpdateComponentCommand,
  MoveGeometryCommand,
  BatchCommand,
} from './commands.js';
import { hexColorUnchecked } from '../types/brands.js';

function freshStore(): EntityStore {
  return new EntityStore();
}

function addLayer(store: EntityStore, name = 'L'): EntityId {
  const entity = createEntity('layer', null);
  entity.components.layer = { layerName: name, visible: true };
  entity.components.style = { color: hexColorUnchecked('#ff0000'), weight: 2, opacity: 1, fillOpacity: 0.5 };
  const cmd = new AddEntityCommand(entity);
  cmd.execute(store);
  return entity.id;
}

function addShape(store: EntityStore, parentId: EntityId): EntityId {
  const entity = createEntity('shape', parentId);
  entity.components.geometry = {
    geojson: { type: 'Point', coordinates: [10, 20] },
    shapeType: 'marker',
  };
  entity.components.style = { color: hexColorUnchecked('#00ff00'), weight: 1, opacity: 1, fillOpacity: 0.3 };
  entity.components.meta = { label: 'test', notes: '', status: 'planned', createdAt: '2026-01-01' };
  const cmd = new AddEntityCommand(entity);
  cmd.execute(store);
  return entity.id;
}

describe('AddEntityCommand', () => {
  let store: EntityStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('adds entity on execute', () => {
    const id = addLayer(store);
    expect(store.has(id)).toBe(true);
  });

  it('removes entity on undo', () => {
    const entity = createEntity('layer', null);
    entity.components.layer = { layerName: 'L', visible: true };
    entity.components.style = { color: hexColorUnchecked('#ff0000'), weight: 2, opacity: 1, fillOpacity: 0.5 };
    const cmd = new AddEntityCommand(entity);
    cmd.execute(store);
    expect(store.has(entity.id)).toBe(true);
    cmd.undo(store);
    expect(store.has(entity.id)).toBe(false);
  });
});

describe('RemoveEntityCommand', () => {
  let store: EntityStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('removes entity and children on execute', () => {
    const layerId = addLayer(store);
    const shapeId = addShape(store, layerId);
    expect(store.size).toBe(2);

    const cmd = new RemoveEntityCommand(layerId);
    cmd.execute(store);
    expect(store.has(layerId)).toBe(false);
    expect(store.has(shapeId)).toBe(false);
  });

  it('restores full subtree on undo', () => {
    const layerId = addLayer(store);
    const shapeId = addShape(store, layerId);

    const cmd = new RemoveEntityCommand(layerId);
    cmd.execute(store);
    expect(store.size).toBe(0);

    cmd.undo(store);
    expect(store.has(layerId)).toBe(true);
    expect(store.has(shapeId)).toBe(true);
    expect(store.size).toBe(2);
  });
});

describe('UpdateComponentCommand', () => {
  let store: EntityStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('updates component value', () => {
    const layerId = addLayer(store, 'Original');
    const cmd = new UpdateComponentCommand(layerId, 'layer', { layerName: 'Updated', visible: false });
    cmd.execute(store);

    const res = store.get(layerId);
    expect(res.ok).toBe(true);
    if (res.ok && res.value.kind === 'layer') {
      expect(res.value.components.layer.layerName).toBe('Updated');
      expect(res.value.components.layer.visible).toBe(false);
    }
  });

  it('restores old value on undo', () => {
    const layerId = addLayer(store, 'Original');
    const cmd = new UpdateComponentCommand(layerId, 'layer', { layerName: 'Changed', visible: true });
    cmd.execute(store);
    cmd.undo(store);

    const res = store.get(layerId);
    expect(res.ok).toBe(true);
    if (res.ok && res.value.kind === 'layer') {
      expect(res.value.components.layer.layerName).toBe('Original');
    }
  });
});

describe('MoveGeometryCommand', () => {
  let store: EntityStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('offsets Point coordinates', () => {
    const layerId = addLayer(store);
    const shapeId = addShape(store, layerId);

    const cmd = new MoveGeometryCommand(shapeId, 5, 10);
    cmd.execute(store);

    const res = store.get(shapeId);
    expect(res.ok).toBe(true);
    if (res.ok && res.value.kind === 'shape') {
      const coords = (res.value.components.geometry.geojson as GeoJSON.Point).coordinates;
      expect(coords[0]).toBeCloseTo(15);
      expect(coords[1]).toBeCloseTo(30);
    }
  });

  it('reverses offset on undo', () => {
    const layerId = addLayer(store);
    const shapeId = addShape(store, layerId);

    const cmd = new MoveGeometryCommand(shapeId, 5, 10);
    cmd.execute(store);
    cmd.undo(store);

    const res = store.get(shapeId);
    expect(res.ok).toBe(true);
    if (res.ok && res.value.kind === 'shape') {
      const coords = (res.value.components.geometry.geojson as GeoJSON.Point).coordinates;
      expect(coords[0]).toBeCloseTo(10);
      expect(coords[1]).toBeCloseTo(20);
    }
  });

  it('translates Polygon coordinates', () => {
    const layerId = addLayer(store);
    const entity = createEntity('shape', layerId);
    entity.components.geometry = {
      geojson: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      },
      shapeType: 'polygon',
    };
    entity.components.style = { color: hexColorUnchecked('#ff0000'), weight: 1, opacity: 1, fillOpacity: 0.3 };
    entity.components.meta = { label: '', notes: '', status: 'planned', createdAt: '2026-01-01' };
    new AddEntityCommand(entity).execute(store);

    new MoveGeometryCommand(entity.id, 10, 20).execute(store);
    const res = store.get(entity.id);
    expect(res.ok).toBe(true);
    if (res.ok && res.value.kind === 'shape') {
      const coords = (res.value.components.geometry.geojson as GeoJSON.Polygon).coordinates[0];
      expect(coords![0]).toEqual([10, 20]);
      expect(coords![1]).toEqual([11, 20]);
    }
  });
});

describe('BatchCommand', () => {
  let store: EntityStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('executes all sub-commands', () => {
    const e1 = createEntity('layer', null);
    e1.components.layer = { layerName: 'A', visible: true };
    e1.components.style = { color: hexColorUnchecked('#ff0000'), weight: 2, opacity: 1, fillOpacity: 0.5 };
    const e2 = createEntity('layer', null);
    e2.components.layer = { layerName: 'B', visible: true };
    e2.components.style = { color: hexColorUnchecked('#00ff00'), weight: 2, opacity: 1, fillOpacity: 0.5 };

    const batch = new BatchCommand([new AddEntityCommand(e1), new AddEntityCommand(e2)]);
    batch.execute(store);
    expect(store.size).toBe(2);
  });

  it('undoes all sub-commands in reverse order', () => {
    const layerId = addLayer(store);
    const s1 = addShape(store, layerId);
    const s2 = addShape(store, layerId);
    expect(store.size).toBe(3);

    const batch = new BatchCommand([new RemoveEntityCommand(s1), new RemoveEntityCommand(s2)]);
    batch.execute(store);
    expect(store.size).toBe(1);

    batch.undo(store);
    expect(store.size).toBe(3);
    expect(store.has(s1)).toBe(true);
    expect(store.has(s2)).toBe(true);
  });

  it('coalesces events during batch', () => {
    const events: string[] = [];
    store.on((e) => events.push(e.type));

    const e1 = createEntity('layer', null);
    e1.components.layer = { layerName: 'A', visible: true };
    e1.components.style = { color: hexColorUnchecked('#ff0000'), weight: 2, opacity: 1, fillOpacity: 0.5 };

    const batch = new BatchCommand([new AddEntityCommand(e1)]);
    batch.execute(store);
    expect(events).toEqual(['add']);
  });
});
