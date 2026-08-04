// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest';
import { RustVec } from './vec.js';
import { isSome, isNone } from './option.js';

describe('RustVec<T>', () => {
  describe('constructors', () => {
    it('of creates from variadic args', () => {
      const v = RustVec.of(1, 2, 3);
      expect(v.len()).toBe(3);
    });

    it('from creates from array', () => {
      const v = RustVec.from([10, 20, 30]);
      expect(v.len()).toBe(3);
    });

    it('empty creates zero-length vec', () => {
      const v = RustVec.empty();
      expect(v.len()).toBe(0);
      expect(v.isEmpty()).toBe(true);
    });

    it('from does not share reference with source', () => {
      const arr = [1, 2, 3];
      const v = RustVec.from(arr);
      arr.push(4);
      expect(v.len()).toBe(3);
    });
  });

  describe('bounds-checked access', () => {
    it('get returns Some for valid index', () => {
      const v = RustVec.of('a', 'b', 'c');
      const result = v.get(1);
      expect(isSome(result)).toBe(true);
      if (isSome(result)) expect(result.value).toBe('b');
    });

    it('get returns None for negative index', () => {
      const v = RustVec.of(1, 2, 3);
      expect(isNone(v.get(-1))).toBe(true);
    });

    it('get returns None for out-of-bounds index', () => {
      const v = RustVec.of(1, 2, 3);
      expect(isNone(v.get(5))).toBe(true);
    });

    it('getUnchecked returns value for valid index', () => {
      const v = RustVec.of(10, 20, 30);
      expect(v.getUnchecked(2)).toBe(30);
    });

    it('getUnchecked throws RangeError for invalid index', () => {
      const v = RustVec.of(1);
      expect(() => v.getUnchecked(5)).toThrow(RangeError);
      expect(() => v.getUnchecked(-1)).toThrow(RangeError);
    });

    it('first returns first element', () => {
      const v = RustVec.of(10, 20);
      const f = v.first();
      expect(isSome(f)).toBe(true);
      if (isSome(f)) expect(f.value).toBe(10);
    });

    it('first returns None for empty', () => {
      expect(isNone(RustVec.empty().first())).toBe(true);
    });

    it('last returns last element', () => {
      const v = RustVec.of(10, 20, 30);
      const l = v.last();
      expect(isSome(l)).toBe(true);
      if (isSome(l)) expect(l.value).toBe(30);
    });

    it('last returns None for empty', () => {
      expect(isNone(RustVec.empty().last())).toBe(true);
    });
  });

  describe('mutation', () => {
    it('push adds element', () => {
      const v = RustVec.empty<number>();
      v.push(1);
      v.push(2);
      expect(v.len()).toBe(2);
      expect(v.getUnchecked(1)).toBe(2);
    });

    it('pop removes and returns last element', () => {
      const v = RustVec.of(1, 2, 3);
      const popped = v.pop();
      expect(isSome(popped)).toBe(true);
      if (isSome(popped)) expect(popped.value).toBe(3);
      expect(v.len()).toBe(2);
    });

    it('pop on empty returns None', () => {
      const v = RustVec.empty<number>();
      expect(isNone(v.pop())).toBe(true);
    });

    it('insert at index shifts elements', () => {
      const v = RustVec.of(1, 2, 3);
      v.insert(1, 99);
      expect(v.getUnchecked(0)).toBe(1);
      expect(v.getUnchecked(1)).toBe(99);
      expect(v.getUnchecked(2)).toBe(2);
      expect(v.len()).toBe(4);
    });

    it('insert at end appends', () => {
      const v = RustVec.of(1, 2);
      v.insert(2, 3);
      expect(v.getUnchecked(2)).toBe(3);
    });

    it('insert at invalid index throws', () => {
      const v = RustVec.of(1);
      expect(() => v.insert(5, 99)).toThrow(RangeError);
      expect(() => v.insert(-1, 99)).toThrow(RangeError);
    });

    it('removeAt removes and returns element', () => {
      const v = RustVec.of(10, 20, 30);
      const removed = v.removeAt(1);
      expect(isSome(removed)).toBe(true);
      if (isSome(removed)) expect(removed.value).toBe(20);
      expect(v.len()).toBe(2);
    });

    it('removeAt returns None for invalid index', () => {
      const v = RustVec.of(1);
      expect(isNone(v.removeAt(5))).toBe(true);
      expect(isNone(v.removeAt(-1))).toBe(true);
    });

    it('clear empties the vec', () => {
      const v = RustVec.of(1, 2, 3);
      v.clear();
      expect(v.len()).toBe(0);
      expect(v.isEmpty()).toBe(true);
    });
  });

  describe('queries', () => {
    it('len returns current length', () => {
      expect(RustVec.of(1, 2, 3).len()).toBe(3);
    });

    it('isEmpty returns true for empty', () => {
      expect(RustVec.empty().isEmpty()).toBe(true);
    });

    it('isEmpty returns false for non-empty', () => {
      expect(RustVec.of(1).isEmpty()).toBe(false);
    });

    it('contains checks membership', () => {
      const v = RustVec.of(1, 2, 3);
      expect(v.contains(2)).toBe(true);
      expect(v.contains(5)).toBe(false);
    });
  });

  describe('iteration', () => {
    it('iter returns an Iter that yields all elements', () => {
      const v = RustVec.of(1, 2, 3);
      expect(v.iter().collect()).toEqual([1, 2, 3]);
    });

    it('Symbol.iterator works with for...of', () => {
      const result: number[] = [];
      for (const n of RustVec.of(1, 2, 3)) {
        result.push(n);
      }
      expect(result).toEqual([1, 2, 3]);
    });
  });

  describe('transforms', () => {
    it('mapVec transforms elements into new vec', () => {
      const v = RustVec.of(1, 2, 3).mapVec((n) => n * 10);
      expect(v.getUnchecked(0)).toBe(10);
      expect(v.getUnchecked(2)).toBe(30);
    });

    it('filterVec returns new vec with matching elements', () => {
      const v = RustVec.of(1, 2, 3, 4, 5).filterVec((n) => n % 2 === 0);
      expect(v.len()).toBe(2);
      expect(v.getUnchecked(0)).toBe(2);
      expect(v.getUnchecked(1)).toBe(4);
    });
  });

  describe('conversion', () => {
    it('toArray returns frozen copy', () => {
      const v = RustVec.of(1, 2, 3);
      const arr = v.toArray();
      expect(arr).toEqual([1, 2, 3]);
      expect(Object.isFrozen(arr)).toBe(true);
    });

    it('collect creates vec from Iter', () => {
      const iter = RustVec.of(1, 2, 3)
        .iter()
        .map((n) => n + 1);
      const v = RustVec.collect(iter);
      expect(v.len()).toBe(3);
      expect(v.getUnchecked(0)).toBe(2);
    });
  });
});
