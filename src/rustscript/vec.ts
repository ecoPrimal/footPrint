// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Rust's Vec<T> -- bounds-checked, ownership-aware growable array.
 *
 * Every index access returns Option<T> instead of T|undefined.
 * Integrates with Iter<T> for lazy pipelines and collect().
 *
 * Usage:
 *   const v = RustVec.from([1, 2, 3]);
 *   const first = v.get(0);           // Some(1)
 *   const oob = v.get(99);            // None
 *   const doubled = v.iter().map(n => n * 2).collect();
 */

import type { Option } from './option.js';
import { Some, None } from './option.js';
import { Iter } from './iter.js';

export class RustVec<T> {
  private readonly buf: T[];

  private constructor(items: T[]) {
    this.buf = items;
  }

  // -- Constructors --

  static of<T>(...items: T[]): RustVec<T> {
    return new RustVec([...items]);
  }

  static from<T>(arr: readonly T[]): RustVec<T> {
    return new RustVec([...arr]);
  }

  static empty<T = never>(): RustVec<T> {
    return new RustVec<T>([]);
  }

  // -- Bounds-checked access --

  get(index: number): Option<T> {
    if (index < 0 || index >= this.buf.length) return None();
    return Some(this.buf[index] as T);
  }

  /** Panics on out-of-range. Use only when you have verified the index. */
  getUnchecked(index: number): T {
    if (index < 0 || index >= this.buf.length) {
      throw new RangeError(`index out of bounds: len is ${String(this.buf.length)} but index is ${String(index)}`);
    }
    return this.buf[index] as T;
  }

  first(): Option<T> {
    return this.get(0);
  }

  last(): Option<T> {
    return this.get(this.buf.length - 1);
  }

  // -- Mutation --

  push(value: T): void {
    this.buf.push(value);
  }

  pop(): Option<T> {
    if (this.buf.length === 0) return None();
    return Some(this.buf.pop() as T);
  }

  insert(index: number, value: T): void {
    if (index < 0 || index > this.buf.length) {
      throw new RangeError(
        `insertion index out of bounds: len is ${String(this.buf.length)} but index is ${String(index)}`,
      );
    }
    this.buf.splice(index, 0, value);
  }

  removeAt(index: number): Option<T> {
    if (index < 0 || index >= this.buf.length) return None();
    return Some(this.buf.splice(index, 1)[0] as T);
  }

  clear(): void {
    this.buf.length = 0;
  }

  // -- Queries --

  len(): number {
    return this.buf.length;
  }

  isEmpty(): boolean {
    return this.buf.length === 0;
  }

  contains(value: T): boolean {
    return this.buf.includes(value);
  }

  // -- Iteration --

  iter(): Iter<T> {
    return Iter.fromArray(this.buf);
  }

  // -- Transforms (eager, return new RustVec) --

  mapVec<U>(fn: (value: T, index: number) => U): RustVec<U> {
    return new RustVec(this.buf.map(fn));
  }

  filterVec(predicate: (value: T, index: number) => boolean): RustVec<T> {
    return new RustVec(this.buf.filter(predicate));
  }

  // -- Conversion --

  toArray(): readonly T[] {
    return Object.freeze([...this.buf]);
  }

  /** Collects an Iter<T> into a RustVec<T>. */
  static collect<T>(iter: Iter<T>): RustVec<T> {
    return new RustVec(iter.collect());
  }

  // -- Iterable protocol --

  [Symbol.iterator](): Iterator<T> {
    return this.buf[Symbol.iterator]();
  }
}
