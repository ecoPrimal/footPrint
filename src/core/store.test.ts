import { describe, it, expect, beforeEach } from 'vitest';
import { EntityStore } from './store.js';
import { createEntity } from './entity.js';
import type { StoreEvent } from './store.js';
import { hexColorUnchecked } from '../types/brands.js';

function freshStore(): EntityStore {
  return new EntityStore();
}

function makeLayer(store: EntityStore, name = 'TestLayer') {
  const entity = createEntity('layer', null);
  entity.components.layer = { layerName: name, visible: true };
  entity.components.style = { color: hexColorUnchecked('#ff0000'), weight: 2, opacity: 1, fillOpacity: 0.5 };
  store.add(entity);
  return entity;
}

function makeShape(store: EntityStore, parentId: ReturnType<typeof createEntity>['id']) {
  const entity = createEntity('shape', parentId);
  entity.components.geometry = {
    geojson: { type: 'Point', coordinates: [0, 0] },
    shapeType: 'marker',
  };
  entity.components.style = { color: hexColorUnchecked('#00ff00'), weight: 1, opacity: 1, fillOpacity: 0.3 };
  entity.components.meta = { label: '', notes: '', status: 'planned', createdAt: '2026-01-01' };
  store.add(entity);
  return entity;
}

describe('EntityStore CRUD', () => {
  let store: EntityStore;

  beforeEach(() => { store = freshStore(); });

  it('adds and retrieves entities', () => {
    const layer = makeLayer(store);
    const res = store.get(layer.id);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.kind).toBe('layer');
    }
  });

  it('reports size correctly', () => {
    expect(store.size).toBe(0);
    makeLayer(store);
    expect(store.size).toBe(1);
    makeLayer(store, 'Layer2');
    expect(store.size).toBe(2);
  });

  it('has() returns true for existing and false for missing', () => {
    const layer = makeLayer(store);
    expect(store.has(layer.id)).toBe(true);
    expect(store.has('e_fake_0' as any)).toBe(false);
  });

  it('get returns EntityNotFound for missing', () => {
    const res = store.get('e_missing_0' as any);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe('EntityNotFound');
  });

  it('remove returns the entity and deletes it', () => {
    const layer = makeLayer(store);
    const opt = store.remove(layer.id);
    expect(opt.some).toBe(true);
    expect(store.has(layer.id)).toBe(false);
  });

  it('remove recursively removes children', () => {
    const layer = makeLayer(store);
    const shape = makeShape(store, layer.id);
    expect(store.size).toBe(2);
    store.remove(layer.id);
    expect(store.has(layer.id)).toBe(false);
    expect(store.has(shape.id)).toBe(false);
    expect(store.size).toBe(0);
  });

  it('clear removes all entities', () => {
    makeLayer(store);
    makeLayer(store, 'B');
    expect(store.size).toBe(2);
    store.clear();
    expect(store.size).toBe(0);
  });
});

describe('EntityStore queries', () => {
  let store: EntityStore;

  beforeEach(() => { store = freshStore(); });

  it('byKind returns entities of the given kind', () => {
    makeLayer(store);
    const layer2 = makeLayer(store, 'B');
    makeShape(store, layer2.id);

    const layers = store.byKind('layer').collect();
    expect(layers).toHaveLength(2);

    const shapes = store.byKind('shape').collect();
    expect(shapes).toHaveLength(1);
  });

  it('childrenOf returns child IDs', () => {
    const layer = makeLayer(store);
    const s1 = makeShape(store, layer.id);
    const s2 = makeShape(store, layer.id);

    const children = store.childrenOf(layer.id).collect();
    expect(children).toContain(s1.id);
    expect(children).toContain(s2.id);
    expect(children).toHaveLength(2);
  });

  it('withComponent returns entities that have the component', () => {
    const layer = makeLayer(store);
    makeShape(store, layer.id);

    const withGeom = store.withComponent('geometry').collect();
    expect(withGeom).toHaveLength(1);

    const withStyle = store.withComponent('style').collect();
    expect(withStyle).toHaveLength(2);
  });
});

describe('EntityStore events', () => {
  let store: EntityStore;

  beforeEach(() => { store = freshStore(); });

  it('emits add events', () => {
    const events: StoreEvent[] = [];
    store.on((e) => events.push(e));
    makeLayer(store);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('add');
  });

  it('emits remove events (including children)', () => {
    const layer = makeLayer(store);
    makeShape(store, layer.id);

    const events: StoreEvent[] = [];
    store.on((e) => events.push(e));
    store.remove(layer.id);

    const removeEvents = events.filter((e) => e.type === 'remove');
    expect(removeEvents).toHaveLength(2);
  });

  it('emits update events on setComponent', () => {
    const layer = makeLayer(store);
    const events: StoreEvent[] = [];
    store.on((e) => events.push(e));
    store.setComponent(layer.id, 'layer', { layerName: 'Renamed', visible: true });
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('update');
    expect(events[0]!.componentKey).toBe('layer');
  });

  it('batch coalesces events until endBatch', () => {
    const layer = makeLayer(store);
    const events: StoreEvent[] = [];
    store.on((e) => events.push(e));

    store.beginBatch();
    store.setComponent(layer.id, 'layer', { layerName: 'A', visible: true });
    store.setComponent(layer.id, 'layer', { layerName: 'B', visible: false });
    expect(events).toHaveLength(0);

    store.endBatch();
    expect(events).toHaveLength(2);
  });

  it('unsubscribe stops delivery', () => {
    const events: StoreEvent[] = [];
    const unsub = store.on((e) => events.push(e));
    makeLayer(store);
    expect(events).toHaveLength(1);

    unsub();
    makeLayer(store, 'B');
    expect(events).toHaveLength(1);
  });
});

describe('EntityStore borrow rules', () => {
  let store: EntityStore;

  beforeEach(() => { store = freshStore(); });

  it('allows multiple immutable borrows', () => {
    const layer = makeLayer(store);
    const r1 = store.borrow(layer.id);
    const r2 = store.borrow(layer.id);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok) r1.value[Symbol.dispose]();
    if (r2.ok) r2.value[Symbol.dispose]();
  });

  it('rejects mutable borrow while immutably borrowed', () => {
    const layer = makeLayer(store);
    const r1 = store.borrow(layer.id);
    expect(r1.ok).toBe(true);
    const r2 = store.borrowMut(layer.id);
    expect(r2.ok).toBe(false);
    if (r1.ok) r1.value[Symbol.dispose]();
  });

  it('rejects immutable borrow while mutably borrowed', () => {
    const layer = makeLayer(store);
    const r1 = store.borrowMut(layer.id);
    expect(r1.ok).toBe(true);
    const r2 = store.borrow(layer.id);
    expect(r2.ok).toBe(false);
    if (r1.ok) r1.value[Symbol.dispose]();
  });

  it('rejects double mutable borrow', () => {
    const layer = makeLayer(store);
    const r1 = store.borrowMut(layer.id);
    expect(r1.ok).toBe(true);
    const r2 = store.borrowMut(layer.id);
    expect(r2.ok).toBe(false);
    if (r1.ok) r1.value[Symbol.dispose]();
  });

  it('allows re-borrow after release', () => {
    const layer = makeLayer(store);
    const r1 = store.borrowMut(layer.id);
    expect(r1.ok).toBe(true);
    if (r1.ok) r1.value[Symbol.dispose]();

    const r2 = store.borrow(layer.id);
    expect(r2.ok).toBe(true);
    if (r2.ok) r2.value[Symbol.dispose]();
  });
});

describe('EntityStore serialize/deserialize', () => {
  it('round-trips entities', () => {
    const store1 = freshStore();
    const layer = makeLayer(store1, 'Serialize Test');
    makeShape(store1, layer.id);

    const serialized = store1.serialize();
    expect(serialized).toHaveLength(2);

    const store2 = freshStore();
    store2.deserialize(serialized);
    expect(store2.size).toBe(2);

    const res = store2.get(layer.id);
    expect(res.ok).toBe(true);
    if (res.ok && res.value.kind === 'layer') {
      expect(res.value.components.layer.layerName).toBe('Serialize Test');
    }
  });
});
