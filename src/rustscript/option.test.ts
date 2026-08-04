// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest';
import {
  Some,
  None,
  isSome,
  isNone,
  unwrapOption,
  unwrapOptionOr,
  unwrapOptionOrElse,
  mapOption,
  andThenOption,
  fromNullable,
  matchOption,
  toNullable,
} from './option.js';

describe('Option<T>', () => {
  describe('Some/None constructors', () => {
    it('Some wraps a value', () => {
      const opt = Some(42);
      expect(opt.some).toBe(true);
      expect(isSome(opt) && opt.value).toBe(42);
    });

    it('None has some=false', () => {
      const opt = None();
      expect(opt.some).toBe(false);
    });

    it('None is a singleton', () => {
      expect(None()).toBe(None());
    });

    it('Some(undefined) is still Some', () => {
      const opt = Some(undefined);
      expect(isSome(opt)).toBe(true);
    });

    it('Some(null) is still Some', () => {
      const opt = Some(null);
      expect(isSome(opt)).toBe(true);
    });
  });

  describe('isSome / isNone', () => {
    it('isSome returns true for Some', () => {
      expect(isSome(Some(1))).toBe(true);
    });

    it('isSome returns false for None', () => {
      expect(isSome(None())).toBe(false);
    });

    it('isNone returns true for None', () => {
      expect(isNone(None())).toBe(true);
    });

    it('isNone returns false for Some', () => {
      expect(isNone(Some(1))).toBe(false);
    });
  });

  describe('unwrapOption', () => {
    it('returns value for Some', () => {
      expect(unwrapOption(Some('hello'))).toBe('hello');
    });

    it('throws for None', () => {
      expect(() => unwrapOption(None())).toThrow('Called unwrap() on None');
    });
  });

  describe('unwrapOptionOr', () => {
    it('returns value for Some', () => {
      expect(unwrapOptionOr(Some(10), 0)).toBe(10);
    });

    it('returns default for None', () => {
      expect(unwrapOptionOr(None<number>(), 99)).toBe(99);
    });
  });

  describe('unwrapOptionOrElse', () => {
    it('returns value for Some without calling fn', () => {
      const fn = () => {
        throw new Error('should not be called');
      };
      expect(unwrapOptionOrElse(Some(5), fn)).toBe(5);
    });

    it('calls fn for None', () => {
      expect(unwrapOptionOrElse(None<number>(), () => 42)).toBe(42);
    });
  });

  describe('mapOption', () => {
    it('transforms value in Some', () => {
      const result = mapOption(Some(3), (n) => n * 2);
      expect(isSome(result)).toBe(true);
      if (isSome(result)) expect(result.value).toBe(6);
    });

    it('returns None for None', () => {
      const result = mapOption(None<number>(), (n) => n * 2);
      expect(isNone(result)).toBe(true);
    });
  });

  describe('andThenOption', () => {
    it('chains on Some', () => {
      const result = andThenOption(Some(5), (n) => (n > 3 ? Some(n * 2) : None()));
      expect(isSome(result)).toBe(true);
      if (isSome(result)) expect(result.value).toBe(10);
    });

    it('returns None when fn returns None', () => {
      const result = andThenOption(Some(1), (n) => (n > 3 ? Some(n) : None()));
      expect(isNone(result)).toBe(true);
    });

    it('returns None for input None', () => {
      const result = andThenOption(None<number>(), (n) => Some(n));
      expect(isNone(result)).toBe(true);
    });
  });

  describe('fromNullable', () => {
    it('converts non-null to Some', () => {
      const result = fromNullable(42);
      expect(isSome(result)).toBe(true);
      if (isSome(result)) expect(result.value).toBe(42);
    });

    it('converts null to None', () => {
      expect(isNone(fromNullable(null))).toBe(true);
    });

    it('converts undefined to None', () => {
      expect(isNone(fromNullable(undefined))).toBe(true);
    });

    it('converts empty string to Some', () => {
      expect(isSome(fromNullable(''))).toBe(true);
    });

    it('converts 0 to Some', () => {
      expect(isSome(fromNullable(0))).toBe(true);
    });
  });

  describe('matchOption', () => {
    it('calls some handler for Some', () => {
      const result = matchOption(Some(10), {
        some: (v) => v + 1,
        none: () => -1,
      });
      expect(result).toBe(11);
    });

    it('calls none handler for None', () => {
      const result = matchOption(None<number>(), {
        some: (v) => v + 1,
        none: () => -1,
      });
      expect(result).toBe(-1);
    });
  });

  describe('toNullable', () => {
    it('converts Some to value', () => {
      expect(toNullable(Some('hi'))).toBe('hi');
    });

    it('converts None to undefined', () => {
      expect(toNullable(None())).toBeUndefined();
    });
  });
});
