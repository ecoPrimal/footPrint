// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Rust's Result<T, E> -- a discriminated union that forces handling both paths.
 * Unlike `T | undefined`, you cannot silently ignore the error case.
 */
export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export function Ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function Err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok;
}

/**
 * Unwrap a Result, panicking (throwing) on Err.
 * Use only when you are certain the Result is Ok, or in tests.
 * Equivalent to Rust's `.unwrap()`.
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw new Error(`Called unwrap() on Err: ${String(result.error)}`);
}

/**
 * Unwrap with a default value on Err.
 * Equivalent to Rust's `.unwrap_or(default)`.
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return result.ok ? result.value : defaultValue;
}

/**
 * Unwrap with a lazy default on Err.
 * Equivalent to Rust's `.unwrap_or_else(f)`.
 */
export function unwrapOrElse<T, E>(result: Result<T, E>, fn: (error: E) => T): T {
  return result.ok ? result.value : fn(result.error);
}

/**
 * Map the Ok value, leaving Err unchanged.
 * Equivalent to Rust's `.map(f)`.
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? Ok(fn(result.value)) : result;
}

/**
 * Map the Err value, leaving Ok unchanged.
 * Equivalent to Rust's `.map_err(f)`.
 */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return result.ok ? result : Err(fn(result.error));
}

/**
 * Chain Results -- flatMap for Result.
 * Equivalent to Rust's `.and_then(f)`.
 */
export function andThen<T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}

/**
 * Pattern match on a Result, handling both branches.
 * Equivalent to Rust's `match result { Ok(v) => ..., Err(e) => ... }`.
 */
export function match<T, E, R>(result: Result<T, E>, handlers: { ok: (value: T) => R; err: (error: E) => R }): R {
  return result.ok ? handlers.ok(result.value) : handlers.err(result.error);
}
