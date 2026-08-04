// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Rust's Iterator trait -- lazy, composable data pipelines in TypeScript.
 *
 * Core method: next() -> Option<T>.  Everything else is built from that.
 * Adapters (map, filter, take...) return new Iter<T> -- fully lazy,
 * no intermediate arrays.  Consumers (fold, collect, find...) drive
 * the pipeline and produce a final value.
 *
 * Implements Iterable<T> for for...of compatibility.
 *
 * Usage:
 *   const sum = Iter.fromRange(1, 100)
 *     .filter(n => n % 2 === 0)
 *     .map(n => n * n)
 *     .take(10)
 *     .fold(0, (acc, n) => acc + n);
 */

import type { Option } from './option.js';
import { Some, None, isSome } from './option.js';

type NextFn<T> = () => Option<T>;

export class Iter<T> implements Iterable<T> {
  private readonly nextFn: NextFn<T>;

  private constructor(nextFn: NextFn<T>) {
    this.nextFn = nextFn;
  }

  // -- Core --

  next(): Option<T> {
    return this.nextFn();
  }

  // -- Constructors --

  static from<T>(gen: () => Generator<T, void, undefined>): Iter<T> {
    const g = gen();
    return new Iter(() => {
      const r = g.next();
      return r.done ? None() : Some(r.value);
    });
  }

  static fromArray<T>(arr: readonly T[]): Iter<T> {
    let i = 0;
    return new Iter(() => (i < arr.length ? Some(arr[i++] as T) : None()));
  }

  static fromRange(start: number, end: number, step = 1): Iter<number> {
    if (step === 0) throw new RangeError('Iter.fromRange: step must not be zero');
    let cur = start;
    return new Iter(() => {
      if ((step > 0 && cur >= end) || (step < 0 && cur <= end)) return None();
      const val = cur;
      cur += step;
      return Some(val);
    });
  }

  static once<T>(value: T): Iter<T> {
    let done = false;
    return new Iter(() => {
      if (done) return None();
      done = true;
      return Some(value);
    });
  }

  static empty<T = never>(): Iter<T> {
    return new Iter(() => None());
  }

  // -- Adapters (lazy, return new Iter) --

  map<U>(fn: (value: T) => U): Iter<U> {
    return new Iter(() => {
      const item = this.next();
      return isSome(item) ? Some(fn(item.value)) : None();
    });
  }

  filter(predicate: (value: T) => boolean): Iter<T> {
    return new Iter(() => {
      for (;;) {
        const item = this.next();
        if (!isSome(item)) return None();
        if (predicate(item.value)) return item;
      }
    });
  }

  take(n: number): Iter<T> {
    let remaining = n;
    return new Iter(() => {
      if (remaining <= 0) return None();
      remaining--;
      return this.next();
    });
  }

  skip(n: number): Iter<T> {
    let skipped = 0;
    return new Iter(() => {
      while (skipped < n) {
        const item = this.next();
        if (!isSome(item)) return None();
        skipped++;
      }
      return this.next();
    });
  }

  enumerate(): Iter<[number, T]> {
    let i = 0;
    return new Iter(() => {
      const item = this.next();
      return isSome(item) ? Some([i++, item.value] as [number, T]) : None();
    });
  }

  zip<U>(other: Iter<U>): Iter<[T, U]> {
    return new Iter(() => {
      const a = this.next();
      const b = other.next();
      return isSome(a) && isSome(b) ? Some([a.value, b.value] as [T, U]) : None();
    });
  }

  chain(other: Iter<T>): Iter<T> {
    let firstDone = false;
    return new Iter(() => {
      if (!firstDone) {
        const item = this.next();
        if (isSome(item)) return item;
        firstDone = true;
      }
      return other.next();
    });
  }

  flatMap<U>(fn: (value: T) => Iter<U>): Iter<U> {
    let current: Iter<U> | null = null;
    return new Iter(() => {
      for (;;) {
        if (current !== null) {
          const item = current.next();
          if (isSome(item)) return item;
          current = null;
        }
        const outer = this.next();
        if (!isSome(outer)) return None();
        current = fn(outer.value);
      }
    });
  }

  inspect(fn: (value: T) => void): Iter<T> {
    return new Iter(() => {
      const item = this.next();
      if (isSome(item)) fn(item.value);
      return item;
    });
  }

  takeWhile(predicate: (value: T) => boolean): Iter<T> {
    let stopped = false;
    return new Iter(() => {
      if (stopped) return None();
      const item = this.next();
      if (!isSome(item) || !predicate(item.value)) {
        stopped = true;
        return None();
      }
      return item;
    });
  }

  skipWhile(predicate: (value: T) => boolean): Iter<T> {
    let skipping = true;
    return new Iter(() => {
      while (skipping) {
        const item = this.next();
        if (!isSome(item)) return None();
        if (!predicate(item.value)) {
          skipping = false;
          return item;
        }
      }
      return this.next();
    });
  }

  filterMap<U>(fn: (value: T) => Option<U>): Iter<U> {
    return new Iter(() => {
      for (;;) {
        const item = this.next();
        if (!isSome(item)) return None();
        const mapped = fn(item.value);
        if (isSome(mapped)) return mapped;
      }
    });
  }

  peekable(): PeekableIter<T> {
    return new PeekableIter(this);
  }

  // -- Consumers (drive the pipeline, produce a value) --

  fold<A>(init: A, fn: (acc: A, value: T) => A): A {
    let acc = init;
    for (;;) {
      const item = this.next();
      if (!isSome(item)) return acc;
      acc = fn(acc, item.value);
    }
  }

  collect(): T[] {
    return this.fold<T[]>([], (acc, v) => {
      acc.push(v);
      return acc;
    });
  }

  forEach(fn: (value: T) => void): void {
    for (;;) {
      const item = this.next();
      if (!isSome(item)) return;
      fn(item.value);
    }
  }

  count(): number {
    return this.fold(0, (n) => n + 1);
  }

  find(predicate: (value: T) => boolean): Option<T> {
    for (;;) {
      const item = this.next();
      if (!isSome(item)) return None();
      if (predicate(item.value)) return item;
    }
  }

  any(predicate: (value: T) => boolean): boolean {
    return isSome(this.find(predicate));
  }

  all(predicate: (value: T) => boolean): boolean {
    for (;;) {
      const item = this.next();
      if (!isSome(item)) return true;
      if (!predicate(item.value)) return false;
    }
  }

  nth(n: number): Option<T> {
    let remaining = n;
    for (;;) {
      const item = this.next();
      if (!isSome(item)) return None();
      if (remaining === 0) return item;
      remaining--;
    }
  }

  last(): Option<T> {
    let result: Option<T> = None();
    for (;;) {
      const item = this.next();
      if (!isSome(item)) return result;
      result = item;
    }
  }

  // -- Iterable protocol for for...of --

  [Symbol.iterator](): Iterator<T> {
    return {
      next: (): IteratorResult<T> => {
        const item = this.next();
        return isSome(item) ? { done: false, value: item.value } : { done: true, value: undefined };
      },
    };
  }
}

/**
 * An iterator that can look ahead one element without consuming it.
 * Equivalent to Rust's Peekable<I>.
 */
export class PeekableIter<T> implements Iterable<T> {
  private readonly inner: Iter<T>;
  private peeked: Option<T> | null = null;

  constructor(inner: Iter<T>) {
    this.inner = inner;
  }

  next(): Option<T> {
    if (this.peeked !== null) {
      const val = this.peeked;
      this.peeked = null;
      return val;
    }
    return this.inner.next();
  }

  peek(): Option<T> {
    if (this.peeked === null) {
      this.peeked = this.inner.next();
    }
    return this.peeked;
  }

  [Symbol.iterator](): Iterator<T> {
    return {
      next: (): IteratorResult<T> => {
        const item = this.next();
        return isSome(item) ? { done: false, value: item.value } : { done: true, value: undefined };
      },
    };
  }
}
