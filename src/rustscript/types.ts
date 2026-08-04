// SPDX-License-Identifier: AGPL-3.0-or-later
declare const __brand: unique symbol;

/**
 * Branded type -- nominal typing in a structural type system.
 * Equivalent to Rust's newtype pattern: `struct Foo(String)`.
 */
export type Brand<T, B extends string> = T & { readonly [__brand]: B };

/**
 * Recursive deep-readonly type -- compile-time `&T`.
 * Every property, nested object, array element, Map/Set value becomes readonly.
 * The closest TypeScript gets to Rust's immutable borrow.
 */
export type DeepReadonly<T> = T extends string | number | boolean | bigint | symbol | null | undefined
  ? T
  : T extends Map<infer K, infer V>
    ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
    : T extends Set<infer U>
      ? ReadonlySet<DeepReadonly<U>>
      : T extends ReadonlyMap<infer K, infer V>
        ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
        : T extends ReadonlySet<infer U>
          ? ReadonlySet<DeepReadonly<U>>
          : T extends readonly (infer U)[]
            ? readonly DeepReadonly<U>[]
            : T extends (...args: infer A) => infer R
              ? (...args: A) => R
              : T extends object
                ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
                : T;

/**
 * Mutable counterpart -- compile-time `&mut T`.
 * Strips readonly from all properties recursively.
 */
export type DeepMutable<T> = T extends string | number | boolean | bigint | symbol | null | undefined
  ? T
  : T extends ReadonlyMap<infer K, infer V>
    ? Map<DeepMutable<K>, DeepMutable<V>>
    : T extends ReadonlySet<infer U>
      ? Set<DeepMutable<U>>
      : T extends readonly (infer U)[]
        ? DeepMutable<U>[]
        : T extends object
          ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
          : T;
