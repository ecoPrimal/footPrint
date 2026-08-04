// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DeepReadonly } from './types.js';

/**
 * Runtime borrow checker -- Rust's RefCell<T> in TypeScript.
 *
 * Enforces at runtime: either N immutable borrows OR 1 mutable borrow, never both.
 * Combined with `using` (TS 5.2+ Disposable), borrows auto-release when scope exits.
 *
 * Usage:
 *   const cell = new RefCell(myData);
 *   using ref = cell.borrow();          // immutable -- read ref.value
 *   using mut = cell.borrowMut();       // exclusive -- read/write mut.value
 */

export class BorrowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BorrowError';
  }
}

export class Ref<T> implements Disposable {
  private released = false;
  private readonly release: () => void;
  readonly value: DeepReadonly<T>;

  constructor(value: T, release: () => void) {
    this.value = value as DeepReadonly<T>;
    this.release = release;
  }

  [Symbol.dispose](): void {
    if (!this.released) {
      this.released = true;
      this.release();
    }
  }
}

export class RefMut<T> implements Disposable {
  private released = false;
  private readonly release: () => void;
  value: T;

  constructor(value: T, release: () => void) {
    this.value = value;
    this.release = release;
  }

  [Symbol.dispose](): void {
    if (!this.released) {
      this.released = true;
      this.release();
    }
  }
}

export class RefCell<T> {
  private inner: T;
  private borrowCount = 0;
  private mutBorrowed = false;

  constructor(value: T) {
    this.inner = value;
  }

  /**
   * Immutable borrow -- returns `Ref<T>` with `DeepReadonly<T>` value.
   * Panics if a mutable borrow is active.
   * Use with `using` for automatic release.
   */
  borrow(): Ref<T> {
    if (this.mutBorrowed) {
      throw new BorrowError('Cannot borrow immutably: already mutably borrowed');
    }
    this.borrowCount++;
    return new Ref(this.inner, () => {
      this.borrowCount--;
    });
  }

  /**
   * Mutable borrow -- returns `RefMut<T>` with full write access.
   * Panics if any borrows (mutable or immutable) are active.
   * Use with `using` for automatic release.
   */
  borrowMut(): RefMut<T> {
    if (this.mutBorrowed) {
      throw new BorrowError('Cannot borrow mutably: already mutably borrowed');
    }
    if (this.borrowCount > 0) {
      throw new BorrowError(`Cannot borrow mutably: ${String(this.borrowCount)} immutable borrow(s) active`);
    }
    this.mutBorrowed = true;
    return new RefMut(this.inner, () => {
      this.mutBorrowed = false;
    });
  }

  /**
   * Replace the inner value. Panics if any borrows are active.
   */
  replace(value: T): T {
    if (this.mutBorrowed || this.borrowCount > 0) {
      throw new BorrowError('Cannot replace: borrows are active');
    }
    const old = this.inner;
    this.inner = value;
    return old;
  }

  /**
   * Get a snapshot (clone) without borrowing.
   */
  snapshot(): T {
    return structuredClone(this.inner);
  }
}
