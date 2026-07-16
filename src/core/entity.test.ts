import { describe, it, expect } from 'vitest';
import { createEntity, ENTITY_KINDS } from './entity.js';

describe('createEntity', () => {
  it('produces a shape entity with expected structure', () => {
    const e = createEntity('shape');
    expect(e.kind).toBe('shape');
    expect(e.id).toMatch(/^e_/);
    expect(e.parentId).toBeNull();
    expect(e.children).toBeInstanceOf(Set);
    expect(e.children.size).toBe(0);
    expect(e.components).toEqual({});
  });

  it('produces unique IDs across calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => createEntity('layer').id));
    expect(ids.size).toBe(100);
  });

  it('accepts a parentId', () => {
    const parent = createEntity('layer');
    const child = createEntity('shape', parent.id);
    expect(child.parentId).toBe(parent.id);
  });

  it('supports all entity kinds', () => {
    for (const kind of ENTITY_KINDS) {
      const e = createEntity(kind);
      expect(e.kind).toBe(kind);
    }
  });
});
