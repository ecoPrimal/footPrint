import { describe, it, expect } from 'vitest';
import { Owned, take } from './owned.js';

describe('Owned', () => {
  it('creates and takes a value', () => {
    const o = Owned.of(42);
    expect(take(o)).toBe(42);
  });

  it('prevents double-take (use-after-move)', () => {
    const o = Owned.of('hello');
    take(o);
    expect(() => take(o)).toThrow();
  });
});
