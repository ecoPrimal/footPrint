import { describe, it, expect } from 'vitest';
import { Cow } from './cow.js';

describe('Cow', () => {
  it('borrowed reads without cloning', () => {
    const original = { x: 1 };
    const cow = Cow.borrowed(original);
    expect(cow.value).toBe(original);
    expect(cow.isBorrowed()).toBe(true);
    expect(cow.isOwned()).toBe(false);
  });

  it('of creates an owned cow', () => {
    const cow = Cow.of(42);
    expect(cow.isOwned()).toBe(true);
    expect(cow.value).toBe(42);
  });

  it('mutate auto-clones borrowed value', () => {
    const original = { x: 1 };
    const cow = Cow.borrowed(original);
    cow.mutate(v => ({ ...v, x: 99 }));
    expect(cow.value.x).toBe(99);
    expect(cow.isOwned()).toBe(true);
    expect(original.x).toBe(1);
  });

  it('mutate on owned does not clone', () => {
    const cow = Cow.of({ x: 1 });
    cow.mutate(v => ({ ...v, x: 2 }));
    expect(cow.value.x).toBe(2);
  });

  it('toOwned transitions from borrowed to owned', () => {
    const cow = Cow.borrowed([1, 2, 3]);
    expect(cow.isBorrowed()).toBe(true);
    cow.toOwned();
    expect(cow.isOwned()).toBe(true);
  });

  it('intoOwned returns value and ensures ownership', () => {
    const original = { name: 'test' };
    const cow = Cow.borrowed(original);
    const owned = cow.intoOwned();
    expect(owned).toEqual({ name: 'test' });
    expect(owned).not.toBe(original);
  });
});
