import { describe, it, expect, beforeEach } from 'vitest';
import { execute, undo, redo, canUndo, canRedo, clearHistory, getUndoCount, getRedoCount, initHistory } from './history.js';
import { store } from './store.js';
import { createEntity } from './entity.js';
import { AddEntityCommand, RemoveEntityCommand, UpdateComponentCommand } from './commands.js';
import { hexColorUnchecked } from '../types/brands.js';
import type { StyleComponent } from './entity.js';

beforeEach(() => {
  store.clear();
  clearHistory();
  initHistory();
});

describe('history', () => {
  it('execute adds entity to store and pushes onto undo stack', () => {
    const entity = createEntity('layer');
    execute(new AddEntityCommand(entity));
    expect(store.has(entity.id)).toBe(true);
    expect(canUndo()).toBe(true);
    expect(canRedo()).toBe(false);
    expect(getUndoCount()).toBe(1);
  });

  it('undo reverses the last command', () => {
    const entity = createEntity('layer');
    execute(new AddEntityCommand(entity));
    undo();
    expect(store.has(entity.id)).toBe(false);
    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(true);
  });

  it('redo re-applies the undone command', () => {
    const entity = createEntity('layer');
    execute(new AddEntityCommand(entity));
    undo();
    redo();
    expect(store.has(entity.id)).toBe(true);
    expect(canUndo()).toBe(true);
    expect(canRedo()).toBe(false);
  });

  it('new execute after undo clears redo stack', () => {
    const e1 = createEntity('layer');
    const e2 = createEntity('layer');
    execute(new AddEntityCommand(e1));
    undo();
    execute(new AddEntityCommand(e2));
    expect(canRedo()).toBe(false);
    expect(getRedoCount()).toBe(0);
  });

  it('clearHistory resets both stacks', () => {
    const entity = createEntity('layer');
    execute(new AddEntityCommand(entity));
    execute(new AddEntityCommand(createEntity('layer')));
    undo();
    expect(getUndoCount()).toBe(1);
    expect(getRedoCount()).toBe(1);
    clearHistory();
    expect(getUndoCount()).toBe(0);
    expect(getRedoCount()).toBe(0);
    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(false);
  });

  it('undo on empty stack is a no-op', () => {
    undo();
    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(false);
  });

  it('redo on empty stack is a no-op', () => {
    redo();
    expect(canRedo()).toBe(false);
  });

  it('supports multi-step undo/redo sequence', () => {
    const e1 = createEntity('shape');
    const e2 = createEntity('shape');
    execute(new AddEntityCommand(e1));
    execute(new AddEntityCommand(e2));

    expect(getUndoCount()).toBe(2);
    undo();
    expect(store.has(e2.id)).toBe(false);
    expect(store.has(e1.id)).toBe(true);

    undo();
    expect(store.has(e1.id)).toBe(false);

    redo();
    expect(store.has(e1.id)).toBe(true);
    redo();
    expect(store.has(e2.id)).toBe(true);
  });

  it('handles UpdateComponentCommand undo/redo', () => {
    const entity = createEntity('shape');
    const style: StyleComponent = { color: hexColorUnchecked('#ff0000'), weight: 3, opacity: 0.9, fillOpacity: 0.25 };
    entity.components.style = style;
    store.add(entity);

    const newStyle: StyleComponent = { color: hexColorUnchecked('#00ff00'), weight: 5, opacity: 1, fillOpacity: 0.5 };
    execute(new UpdateComponentCommand(entity.id, 'style', newStyle));

    const afterUpdate = store.get(entity.id);
    expect(afterUpdate.ok).toBe(true);
    if (afterUpdate.ok && afterUpdate.value.kind === 'shape')
      expect(afterUpdate.value.components.style.color).toBe(hexColorUnchecked('#00ff00'));

    undo();
    const afterUndo = store.get(entity.id);
    expect(afterUndo.ok).toBe(true);
    if (afterUndo.ok && afterUndo.value.kind === 'shape')
      expect(afterUndo.value.components.style.color).toBe(hexColorUnchecked('#ff0000'));

    redo();
    const afterRedo = store.get(entity.id);
    expect(afterRedo.ok).toBe(true);
    if (afterRedo.ok && afterRedo.value.kind === 'shape')
      expect(afterRedo.value.components.style.color).toBe(hexColorUnchecked('#00ff00'));
  });

  it('handles RemoveEntityCommand undo/redo', () => {
    const entity = createEntity('layer');
    store.add(entity);
    execute(new RemoveEntityCommand(entity.id));
    expect(store.has(entity.id)).toBe(false);

    undo();
    expect(store.has(entity.id)).toBe(true);

    redo();
    expect(store.has(entity.id)).toBe(false);
  });
});
