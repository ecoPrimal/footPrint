import { describe, it, expect } from 'vitest';
import { RustVec } from './vec.js';

describe('RustVec', () => {
  it('push and iterate', () => {
    const v = RustVec.empty<number>();
    v.push(1);
    v.push(2);
    v.push(3);
    expect(v.len()).toBe(3);
    expect([...v]).toEqual([1, 2, 3]);
  });

  it('bounds-checked get', () => {
    const v = RustVec.from([10, 20, 30]);
    const opt = v.get(1);
    expect(opt.some).toBe(true);
    if (opt.some) expect(opt.value).toBe(20);
    expect(v.get(5).some).toBe(false);
  });

  it('removeAt shifts elements', () => {
    const v = RustVec.from([1, 2, 3, 4]);
    v.removeAt(1);
    expect([...v]).toEqual([1, 3, 4]);
    expect(v.len()).toBe(3);
  });

  it('iter produces an Iter', () => {
    const v = RustVec.from([1, 2, 3]);
    const doubled = v.iter().map((n) => n * 2).collect();
    expect(doubled).toEqual([2, 4, 6]);
  });

  it('clear empties the vec', () => {
    const v = RustVec.from([1, 2]);
    v.clear();
    expect(v.len()).toBe(0);
  });
});
