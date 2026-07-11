import { describe, it, expect } from 'vitest';
import { Iter } from './iter.js';

describe('Iter', () => {
  it('map transforms elements', () => {
    const result = Iter.fromArray([1, 2, 3]).map((x) => x * 10).collect();
    expect(result).toEqual([10, 20, 30]);
  });

  it('filter selects matching elements', () => {
    const result = Iter.fromArray([1, 2, 3, 4, 5]).filter((x) => x % 2 === 0).collect();
    expect(result).toEqual([2, 4]);
  });

  it('find returns first match as Option', () => {
    const opt = Iter.fromArray([10, 20, 30]).find((x) => x > 15);
    expect(opt.some).toBe(true);
    if (opt.some) expect(opt.value).toBe(20);
  });

  it('find returns None when no match', () => {
    const opt = Iter.fromArray([1, 2, 3]).find((x) => x > 100);
    expect(opt.some).toBe(false);
  });

  it('enumerate adds indices', () => {
    const result = Iter.fromArray(['a', 'b', 'c']).enumerate().collect();
    expect(result).toEqual([[0, 'a'], [1, 'b'], [2, 'c']]);
  });

  it('take limits elements', () => {
    const result = Iter.fromArray([1, 2, 3, 4, 5]).take(3).collect();
    expect(result).toEqual([1, 2, 3]);
  });

  it('any returns true if predicate matches', () => {
    expect(Iter.fromArray([1, 2, 3]).any((x) => x === 2)).toBe(true);
    expect(Iter.fromArray([1, 2, 3]).any((x) => x === 9)).toBe(false);
  });

  it('fold accumulates', () => {
    const sum = Iter.fromArray([1, 2, 3, 4]).fold(0, (acc, x) => acc + x);
    expect(sum).toBe(10);
  });

  it('flatMap flattens nested iterables', () => {
    const result = Iter.fromArray([1, 2, 3])
      .flatMap((x) => Iter.fromArray([x, x * 10]))
      .collect();
    expect(result).toEqual([1, 10, 2, 20, 3, 30]);
  });

  it('chains are lazy', () => {
    let evaluations = 0;
    const result = Iter.fromArray([1, 2, 3, 4, 5])
      .map((x) => { evaluations++; return x * 2; })
      .filter((x) => x > 4)
      .take(2)
      .collect();
    expect(result).toEqual([6, 8]);
    expect(evaluations).toBeLessThanOrEqual(4);
  });
});
