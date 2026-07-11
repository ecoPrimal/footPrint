/**
 * Rust's Option<T> -- explicit presence/absence.
 * Unlike `T | undefined`, you must destructure to access the value.
 * No silent propagation through optional chaining.
 */
export type Option<T> =
  | { readonly some: true; readonly value: T }
  | { readonly some: false };

export function Some<T>(value: T): Option<T> {
  return { some: true, value };
}

const NONE: Option<never> = Object.freeze({ some: false }) as Option<never>;

export function None<T = never>(): Option<T> {
  return NONE as Option<T>;
}

export function isSome<T>(opt: Option<T>): opt is { some: true; value: T } {
  return opt.some;
}

export function isNone<T>(opt: Option<T>): opt is { some: false } {
  return !opt.some;
}

export function unwrapOption<T>(opt: Option<T>): T {
  if (opt.some) return opt.value;
  throw new Error('Called unwrap() on None');
}

export function unwrapOptionOr<T>(opt: Option<T>, defaultValue: T): T {
  return opt.some ? opt.value : defaultValue;
}

export function unwrapOptionOrElse<T>(opt: Option<T>, fn: () => T): T {
  return opt.some ? opt.value : fn();
}

export function mapOption<T, U>(opt: Option<T>, fn: (value: T) => U): Option<U> {
  return opt.some ? Some(fn(opt.value)) : None();
}

export function andThenOption<T, U>(opt: Option<T>, fn: (value: T) => Option<U>): Option<U> {
  return opt.some ? fn(opt.value) : None();
}

/**
 * Convert `T | null | undefined` to `Option<T>`.
 */
export function fromNullable<T>(value: T | null | undefined): Option<T> {
  return value != null ? Some(value) : None();
}

/**
 * Pattern match on an Option, handling both branches.
 * Equivalent to Rust's `match opt { Some(v) => ..., None => ... }`.
 */
export function matchOption<T, R>(
  opt: Option<T>,
  handlers: { some: (value: T) => R; none: () => R },
): R {
  return opt.some ? handlers.some(opt.value) : handlers.none();
}

/**
 * Convert `Option<T>` to `T | undefined`.
 */
export function toNullable<T>(opt: Option<T>): T | undefined {
  return opt.some ? opt.value : undefined;
}
