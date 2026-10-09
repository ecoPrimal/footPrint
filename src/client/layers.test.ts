// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { EntityId } from '../core/entity.js';
import { hexColorUnchecked } from '../types/brands.js';

vi.mock('./modal.js', () => ({
  modalPrompt: vi.fn(),
  modalConfirm: vi.fn(),
}));

import { modalPrompt } from './modal.js';

let layers: typeof import('./layers.js');
let store: typeof import('../core/store.js').store;
let clearHistory: typeof import('../core/history.js').clearHistory;

const mockMap = {} as L.Map;

beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = '<ul id="layer-list"></ul>';

  const storeMod = await import('../core/store.js');
  store = storeMod.store;
  store.clear();

  const historyMod = await import('../core/history.js');
  clearHistory = historyMod.clearHistory;
  clearHistory();

  layers = await import('./layers.js');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('initLayers', () => {
  it('creates default layers with visibility and style defaults', () => {
    layers.initLayers(mockMap, vi.fn());

    const layerIds = store.byKind('layer').collect();
    expect(layerIds.length).toBe(5);

    for (const entityId of layerIds) {
      const res = store.get(entityId);
      expect(res.ok).toBe(true);
      if (!res.ok || res.value.kind !== 'layer') continue;
      expect(res.value.components.layer.visible).toBe(true);
      expect(res.value.components.style.weight).toBe(3);
      expect(res.value.components.style.opacity).toBe(0.9);
    }
  });

  it('activates the property layer by default', () => {
    const onChange = vi.fn();
    layers.initLayers(mockMap, onChange);

    expect(onChange).toHaveBeenCalled();
    const [entityId, color] = onChange.mock.calls[0]!;
    const res = store.get(entityId as EntityId);
    expect(res.ok && res.value.kind === 'layer' && res.value.components.layer.layerName).toBe('Property Boundary');
    expect(color).toBe(hexColorUnchecked('#e74c3c'));
  });
});

describe('setActiveLayer', () => {
  it('invokes the change callback with the layer color', () => {
    const onChange = vi.fn();
    layers.initLayers(mockMap, onChange);
    onChange.mockClear();

    const fencing = store
      .byKind('layer')
      .collect()
      .find((id) => {
        const res = store.get(id);
        return res.ok && res.value.kind === 'layer' && res.value.components.layer.layerName === 'Fencing';
      });
    expect(fencing).toBeDefined();

    layers.setActiveLayer(fencing!);
    expect(onChange).toHaveBeenCalledWith(fencing, hexColorUnchecked('#8B4513'));
  });
});

describe('toggleLayerVisibility', () => {
  it('toggles layer visibility through the history command', () => {
    layers.initLayers(mockMap, vi.fn());
    const entityId = store.byKind('layer').collect()[0]!;

    layers.toggleLayerVisibility(entityId);
    let res = store.get(entityId);
    expect(res.ok && res.value.kind === 'layer' && res.value.components.layer.visible).toBe(false);

    layers.toggleLayerVisibility(entityId);
    res = store.get(entityId);
    expect(res.ok && res.value.kind === 'layer' && res.value.components.layer.visible).toBe(true);
  });
});

describe('addCustomLayer', () => {
  it('creates a custom layer and sets it active', async () => {
    layers.initLayers(mockMap, vi.fn());
    vi.mocked(modalPrompt).mockResolvedValueOnce('Garden Beds').mockResolvedValueOnce('#ff00ff');

    await layers.addCustomLayer();

    const custom = store
      .byKind('layer')
      .collect()
      .find((id) => {
        const res = store.get(id);
        return res.ok && res.value.kind === 'layer' && res.value.components.layer.layerName === 'Garden Beds';
      });
    expect(custom).toBeDefined();

    const res = store.get(custom!);
    expect(res.ok && res.value.kind === 'layer' && res.value.components.style.color).toBe(hexColorUnchecked('#ff00ff'));
  });

  it('aborts when the user cancels the name prompt', async () => {
    layers.initLayers(mockMap, vi.fn());
    const before = store.byKind('layer').collect().length;
    vi.mocked(modalPrompt).mockResolvedValueOnce(null);

    await layers.addCustomLayer();

    expect(store.byKind('layer').collect().length).toBe(before);
  });
});

describe('deleteLayer', () => {
  it('removes the layer and selects another active layer', () => {
    layers.initLayers(mockMap, vi.fn());
    const target = store.byKind('layer').collect()[0]!;

    layers.deleteLayer(target);

    expect(store.has(target)).toBe(false);
    expect(store.byKind('layer').collect().length).toBe(4);
  });

  it('clears active layer when the last layer is deleted', () => {
    layers.initLayers(mockMap, vi.fn());

    for (const entityId of [...store.byKind('layer')]) {
      layers.deleteLayer(entityId);
    }

    expect(store.byKind('layer').collect().length).toBe(0);
  });
});

describe('serializeLayers / deserializeLayers', () => {
  it('round-trips layer data and child shapes', async () => {
    const { createEntity } = await import('../core/entity.js');
    layers.initLayers(mockMap, vi.fn());
    const layerEntityId = store.byKind('layer').collect()[0]!;
    const shape = createEntity('shape', layerEntityId);
    shape.components.geometry = {
      geojson: { type: 'Point', coordinates: [-84.5, 42.7] },
      shapeType: 'marker',
    };
    shape.components.style = {
      color: hexColorUnchecked('#00ff00'),
      weight: 2,
      opacity: 1,
      fillOpacity: 0.2,
    };
    shape.components.meta = {
      label: 'Tree',
      notes: '',
      status: 'planned',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    store.add(shape);

    const serialized = layers.serializeLayers();
    store.clear();
    layers.deserializeLayers(serialized);

    expect(store.byKind('layer').collect().length).toBeGreaterThan(0);
    expect(store.byKind('shape').collect().length).toBe(1);
    const restored = store.get(store.byKind('shape').collect()[0]!);
    expect(restored.ok && restored.value.kind === 'shape' && restored.value.components.meta.label).toBe('Tree');
  });
});
