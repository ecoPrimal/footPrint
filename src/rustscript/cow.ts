// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Rust's Cow<'a, T> -- Clone-on-Write smart pointer.
 *
 * Holds a reference (borrowed) or a value (owned). Read access never clones.
 * Mutation auto-clones a borrowed value into an owned one on first write.
 * Ideal for read-heavy paths that occasionally need mutation --
 * e.g. entity snapshots in undo/redo, shared config overlays.
 *
 * Usage:
 *   const shared = Cow.borrowed(entitySnapshot);
 *   console.log(shared.value);           // no clone
 *
 *   shared.mutate(v => ({ ...v, name: 'updated' }));
 *   // now owned -- original entitySnapshot untouched
 */

export class Cow<T> {
  private inner: T;
  private owned: boolean;

  private constructor(value: T, owned: boolean) {
    this.inner = value;
    this.owned = owned;
  }

  /** Wrap a shared reference. No clone until mutation. */
  static borrowed<T>(value: T): Cow<T> {
    return new Cow(value, false);
  }

  /** Wrap a value you already own. */
  static of<T>(value: T): Cow<T> {
    return new Cow(value, true);
  }

  /** Read access -- never clones. */
  get value(): T {
    return this.inner;
  }

  isBorrowed(): boolean {
    return !this.owned;
  }

  isOwned(): boolean {
    return this.owned;
  }

  /**
   * Ensure the value is owned. If currently borrowed, performs
   * a structuredClone to obtain an independent copy.
   * Returns `this` for chaining.
   */
  toOwned(): this {
    if (!this.owned) {
      this.inner = structuredClone(this.inner);
      this.owned = true;
    }
    return this;
  }

  /**
   * Apply a mutation. If borrowed, auto-clones first.
   * The mutation function receives the current value and returns the new one.
   */
  mutate(fn: (value: T) => T): void {
    this.toOwned();
    this.inner = fn(this.inner);
  }

  /**
   * Extract the inner value as owned.
   * If borrowed, clones first; if already owned, returns directly.
   */
  intoOwned(): T {
    this.toOwned();
    return this.inner;
  }
}
