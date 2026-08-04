// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest';
import { Iter } from './iter.js';
import { isSome, isNone } from './option.js';

describe('Iter', () => {
  describe('constructors', () => {
    it('fromArray iterates all elements', () => {
      expect(Iter.fromArray([1, 2, 3]).collect()).toEqual([1, 2, 3]);
    });

    it('fromArray of empty array yields no elements', () => {
      expect(Iter.fromArray([]).collect()).toEqual([]);
    });

    it('fromRange produces sequential numbers', () => {
      expect(Iter.fromRange(0, 5).collect()).toEqual([0, 1, 2, 3, 4]);
    });

    it('fromRange with step > 1', () => {
      expect(Iter.fromRange(0, 10, 2).collect()).toEqual([0, 2, 4, 6, 8]);
    });

    it('fromRange with negative step', () => {
      expect(Iter.fromRange(5, 0, -1).collect()).toEqual([5, 4, 3, 2, 1]);
    });

    it('fromRange with step=0 throws RangeError', () => {
      expect(() => Iter.fromRange(0, 5, 0)).toThrow(RangeError);
    });

    it('fromRange with start >= end (positive step) yields nothing', () => {
      expect(Iter.fromRange(5, 5).collect()).toEqual([]);
      expect(Iter.fromRange(6, 5).collect()).toEqual([]);
    });

    it('fromRange with start <= end (negative step) yields nothing', () => {
      expect(Iter.fromRange(5, 5, -1).collect()).toEqual([]);
      expect(Iter.fromRange(4, 5, -1).collect()).toEqual([]);
    });

    it('once yields exactly one value', () => {
      const items = Iter.once(42).collect();
      expect(items).toEqual([42]);
    });

    it('empty yields no values', () => {
      expect(Iter.empty().collect()).toEqual([]);
    });

    it('from creates from a generator', () => {
      const iter = Iter.from(function* () {
        yield 'a';
        yield 'b';
        yield 'c';
      });
      expect(iter.collect()).toEqual(['a', 'b', 'c']);
    });
  });

  describe('adapters', () => {
    it('map transforms each element', () => {
      const result = Iter.fromArray([1, 2, 3])
        .map((n) => n * 2)
        .collect();
      expect(result).toEqual([2, 4, 6]);
    });

    it('filter removes non-matching elements', () => {
      const result = Iter.fromRange(0, 10)
        .filter((n) => n % 2 === 0)
        .collect();
      expect(result).toEqual([0, 2, 4, 6, 8]);
    });

    it('take limits to first n elements', () => {
      const result = Iter.fromRange(0, 100).take(3).collect();
      expect(result).toEqual([0, 1, 2]);
    });

    it('take(0) yields nothing', () => {
      expect(Iter.fromArray([1, 2, 3]).take(0).collect()).toEqual([]);
    });

    it('skip drops first n elements', () => {
      const result = Iter.fromArray([1, 2, 3, 4, 5]).skip(2).collect();
      expect(result).toEqual([3, 4, 5]);
    });

    it('skip on shorter sequence yields nothing', () => {
      expect(Iter.fromArray([1, 2]).skip(5).collect()).toEqual([]);
    });

    it('enumerate pairs index with value', () => {
      const result = Iter.fromArray(['a', 'b', 'c']).enumerate().collect();
      expect(result).toEqual([
        [0, 'a'],
        [1, 'b'],
        [2, 'c'],
      ]);
    });

    it('zip pairs two iterators', () => {
      const a = Iter.fromArray([1, 2, 3]);
      const b = Iter.fromArray(['a', 'b', 'c']);
      expect(a.zip(b).collect()).toEqual([
        [1, 'a'],
        [2, 'b'],
        [3, 'c'],
      ]);
    });

    it('zip stops at shorter iterator', () => {
      const a = Iter.fromArray([1, 2]);
      const b = Iter.fromArray(['a', 'b', 'c']);
      expect(a.zip(b).collect()).toEqual([
        [1, 'a'],
        [2, 'b'],
      ]);
    });

    it('chain appends two iterators', () => {
      const a = Iter.fromArray([1, 2]);
      const b = Iter.fromArray([3, 4]);
      expect(a.chain(b).collect()).toEqual([1, 2, 3, 4]);
    });

    it('flatMap flattens nested iterators', () => {
      const result = Iter.fromArray([1, 2, 3])
        .flatMap((n) => Iter.fromArray([n, n * 10]))
        .collect();
      expect(result).toEqual([1, 10, 2, 20, 3, 30]);
    });

    it('inspect calls fn for each element without consuming', () => {
      const seen: number[] = [];
      const result = Iter.fromArray([1, 2, 3])
        .inspect((n) => {
          seen.push(n);
        })
        .collect();
      expect(result).toEqual([1, 2, 3]);
      expect(seen).toEqual([1, 2, 3]);
    });

    it('takeWhile yields elements until predicate fails', () => {
      const result = Iter.fromArray([1, 2, 3, 4, 5])
        .takeWhile((n) => n < 4)
        .collect();
      expect(result).toEqual([1, 2, 3]);
    });

    it('takeWhile on empty yields empty', () => {
      expect(
        Iter.empty<number>()
          .takeWhile(() => true)
          .collect(),
      ).toEqual([]);
    });

    it('skipWhile skips elements until predicate fails', () => {
      const result = Iter.fromArray([1, 2, 3, 4, 5])
        .skipWhile((n) => n < 3)
        .collect();
      expect(result).toEqual([3, 4, 5]);
    });

    it('skipWhile that never stops yields empty', () => {
      expect(
        Iter.fromArray([1, 2, 3])
          .skipWhile(() => true)
          .collect(),
      ).toEqual([]);
    });

    it('filterMap applies fn and keeps Some results', () => {
      const result = Iter.fromArray([1, 2, 3, 4, 5])
        .filterMap((n) => (n % 2 === 0 ? ({ some: true, value: n * 10 } as const) : ({ some: false } as const)))
        .collect();
      expect(result).toEqual([20, 40]);
    });
  });

  describe('consumers', () => {
    it('fold accumulates a value', () => {
      const sum = Iter.fromRange(1, 6).fold(0, (acc, n) => acc + n);
      expect(sum).toBe(15);
    });

    it('collect returns all elements as array', () => {
      expect(Iter.fromRange(0, 3).collect()).toEqual([0, 1, 2]);
    });

    it('forEach visits each element', () => {
      const seen: number[] = [];
      Iter.fromArray([10, 20, 30]).forEach((n) => {
        seen.push(n);
      });
      expect(seen).toEqual([10, 20, 30]);
    });

    it('count returns number of elements', () => {
      expect(Iter.fromRange(0, 10).count()).toBe(10);
      expect(Iter.empty().count()).toBe(0);
    });

    it('find returns first match', () => {
      const result = Iter.fromArray([1, 2, 3, 4]).find((n) => n > 2);
      expect(isSome(result)).toBe(true);
      if (isSome(result)) expect(result.value).toBe(3);
    });

    it('find returns None if no match', () => {
      const result = Iter.fromArray([1, 2, 3]).find((n) => n > 10);
      expect(isNone(result)).toBe(true);
    });

    it('any returns true if any match', () => {
      expect(Iter.fromArray([1, 2, 3]).any((n) => n === 2)).toBe(true);
    });

    it('any returns false if no match', () => {
      expect(Iter.fromArray([1, 2, 3]).any((n) => n === 5)).toBe(false);
    });

    it('all returns true if all match', () => {
      expect(Iter.fromArray([2, 4, 6]).all((n) => n % 2 === 0)).toBe(true);
    });

    it('all returns false if any fails', () => {
      expect(Iter.fromArray([2, 3, 6]).all((n) => n % 2 === 0)).toBe(false);
    });

    it('all on empty returns true', () => {
      expect(Iter.empty<number>().all(() => false)).toBe(true);
    });

    it('nth returns nth element (0-indexed)', () => {
      const result = Iter.fromArray(['a', 'b', 'c']).nth(1);
      expect(isSome(result)).toBe(true);
      if (isSome(result)) expect(result.value).toBe('b');
    });

    it('nth returns None for out-of-range', () => {
      expect(isNone(Iter.fromArray([1]).nth(5))).toBe(true);
    });

    it('last returns the final element', () => {
      const result = Iter.fromArray([1, 2, 3]).last();
      expect(isSome(result)).toBe(true);
      if (isSome(result)) expect(result.value).toBe(3);
    });

    it('last returns None for empty', () => {
      expect(isNone(Iter.empty().last())).toBe(true);
    });
  });

  describe('Iterable protocol', () => {
    it('works with for...of', () => {
      const result: number[] = [];
      for (const n of Iter.fromArray([1, 2, 3])) {
        result.push(n);
      }
      expect(result).toEqual([1, 2, 3]);
    });

    it('works with Array.from', () => {
      expect(Array.from(Iter.fromRange(0, 3))).toEqual([0, 1, 2]);
    });

    it('works with spread operator', () => {
      expect([...Iter.fromArray([1, 2, 3])]).toEqual([1, 2, 3]);
    });
  });

  describe('composition', () => {
    it('complex pipeline: filter+map+take+fold', () => {
      const result = Iter.fromRange(1, 100)
        .filter((n) => n % 2 === 0)
        .map((n) => n * n)
        .take(5)
        .fold(0, (acc, n) => acc + n);
      expect(result).toBe(4 + 16 + 36 + 64 + 100);
    });

    it('laziness: map is not called beyond take', () => {
      let mapCalls = 0;
      const result = Iter.fromRange(0, 1000)
        .map((n) => {
          mapCalls++;
          return n;
        })
        .take(3)
        .collect();
      expect(result).toEqual([0, 1, 2]);
      expect(mapCalls).toBe(3);
    });
  });
});

describe('PeekableIter', () => {
  it('peek returns next value without consuming', () => {
    const iter = Iter.fromArray([1, 2, 3]).peekable();
    const peeked = iter.peek();
    expect(isSome(peeked)).toBe(true);
    if (isSome(peeked)) expect(peeked.value).toBe(1);

    const next = iter.next();
    expect(isSome(next)).toBe(true);
    if (isSome(next)) expect(next.value).toBe(1);
  });

  it('peek returns same value on repeated calls', () => {
    const iter = Iter.fromArray([1, 2]).peekable();
    const p1 = iter.peek();
    const p2 = iter.peek();
    expect(p1).toBe(p2);
  });

  it('next advances after peek', () => {
    const iter = Iter.fromArray([1, 2, 3]).peekable();
    iter.peek();
    iter.next();
    const second = iter.next();
    expect(isSome(second)).toBe(true);
    if (isSome(second)) expect(second.value).toBe(2);
  });

  it('returns None when exhausted', () => {
    const iter = Iter.fromArray([1]).peekable();
    iter.next();
    expect(isNone(iter.peek())).toBe(true);
    expect(isNone(iter.next())).toBe(true);
  });

  it('is iterable via for...of', () => {
    const result: number[] = [];
    for (const n of Iter.fromArray([1, 2, 3]).peekable()) {
      result.push(n);
    }
    expect(result).toEqual([1, 2, 3]);
  });
});
