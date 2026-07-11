/**
 * Rust's move semantics -- affine types in TypeScript.
 *
 * Every Owned<T> value has exactly one owner. Transferring ownership
 * (via move/consume/take) invalidates the source. Any subsequent access
 * to a moved value throws UseAfterMoveError -- the runtime equivalent
 * of Rust's compile-time "use of moved value" error.
 *
 * Usage:
 *   const a = Owned.of({ x: 1 });
 *   const b = transfer(a);          // a is now invalid
 *   console.log(b.value);           // { x: 1 }
 *   console.log(a.value);           // throws UseAfterMoveError
 *
 * With RAII:
 *   using resource = Owned.of(handle);
 *   doWork(resource.value);
 *   // resource auto-dropped at scope exit
 */

export class UseAfterMoveError extends Error {
  constructor(message = 'Attempted to access a moved value') {
    super(message);
    this.name = 'UseAfterMoveError';
  }
}

export class Owned<T> implements Disposable {
  private inner: T | undefined;
  private moved = false;
  private dropped = false;

  private constructor(value: T) {
    this.inner = value;
  }

  static of<T>(value: T): Owned<T> {
    return new Owned(value);
  }

  get value(): T {
    if (this.moved) throw new UseAfterMoveError();
    if (this.dropped) throw new UseAfterMoveError('Attempted to access a dropped value');
    return this.inner as T;
  }

  /** True if ownership has been transferred away or value was dropped. */
  get isAlive(): boolean {
    return !this.moved && !this.dropped;
  }

  /**
   * Mark this wrapper as moved, clearing the inner reference.
   * Called internally by transfer/consume/take. Not for external use.
   */
  _invalidate(): T {
    if (this.moved) throw new UseAfterMoveError();
    if (this.dropped) throw new UseAfterMoveError('Attempted to move a dropped value');
    const val = this.inner as T;
    this.inner = undefined;
    this.moved = true;
    return val;
  }

  [Symbol.dispose](): void {
    if (!this.moved && !this.dropped) {
      this.inner = undefined;
      this.dropped = true;
    }
  }
}

/**
 * Transfer ownership from `source` to a new Owned<T>.
 * The source is invalidated -- any further access throws.
 * Equivalent to Rust's implicit move on assignment.
 */
export function transfer<T>(source: Owned<T>): Owned<T> {
  const val = source._invalidate();
  return Owned.of(val);
}

/**
 * One-shot consumption: extract the value, apply a function, invalidate the source.
 * Equivalent to taking ownership in a Rust function parameter.
 */
export function consume<T, R>(source: Owned<T>, fn: (value: T) => R): R {
  const val = source._invalidate();
  return fn(val);
}

/**
 * Extract the inner value, invalidating the Owned wrapper.
 * Equivalent to destructuring an owned value in Rust.
 */
export function take<T>(source: Owned<T>): T {
  return source._invalidate();
}
