// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest';
import { Ok, Err, isOk, isErr, unwrap, unwrapOr, unwrapOrElse, map, mapErr, andThen, match } from './result.js';

describe('Result<T, E>', () => {
  describe('Ok/Err constructors', () => {
    it('Ok wraps a value', () => {
      const r = Ok(42);
      expect(r.ok).toBe(true);
      expect(isOk(r) && r.value).toBe(42);
    });

    it('Err wraps an error', () => {
      const r = Err('failure');
      expect(r.ok).toBe(false);
      expect(isErr(r) && r.error).toBe('failure');
    });
  });

  describe('isOk / isErr', () => {
    it('isOk returns true for Ok', () => {
      expect(isOk(Ok(1))).toBe(true);
    });

    it('isOk returns false for Err', () => {
      expect(isOk(Err('x'))).toBe(false);
    });

    it('isErr returns true for Err', () => {
      expect(isErr(Err('x'))).toBe(true);
    });

    it('isErr returns false for Ok', () => {
      expect(isErr(Ok(1))).toBe(false);
    });
  });

  describe('unwrap', () => {
    it('returns value for Ok', () => {
      expect(unwrap(Ok('hello'))).toBe('hello');
    });

    it('throws for Err with error message', () => {
      expect(() => unwrap(Err('bad'))).toThrow('Called unwrap() on Err: bad');
    });
  });

  describe('unwrapOr', () => {
    it('returns value for Ok', () => {
      expect(unwrapOr(Ok(10), 0)).toBe(10);
    });

    it('returns default for Err', () => {
      expect(unwrapOr(Err('x'), 99)).toBe(99);
    });
  });

  describe('unwrapOrElse', () => {
    it('returns value for Ok without calling fn', () => {
      expect(
        unwrapOrElse(Ok(5), () => {
          throw new Error('nope');
        }),
      ).toBe(5);
    });

    it('calls fn with error for Err', () => {
      const result = unwrapOrElse(Err('oops'), (e) => `recovered: ${e}`);
      expect(result).toBe('recovered: oops');
    });
  });

  describe('map', () => {
    it('transforms value in Ok', () => {
      const result = map(Ok(3), (n) => n * 2);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toBe(6);
    });

    it('passes through Err unchanged', () => {
      const result = map(Err('fail'), () => 42);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error).toBe('fail');
    });
  });

  describe('mapErr', () => {
    it('passes through Ok unchanged', () => {
      const result = mapErr(Ok(10), () => 'new error');
      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toBe(10);
    });

    it('transforms error in Err', () => {
      const result = mapErr(Err('old'), (e) => `mapped: ${e}`);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error).toBe('mapped: old');
    });
  });

  describe('andThen', () => {
    it('chains on Ok', () => {
      const result = andThen(Ok(5), (n) => (n > 3 ? Ok(n * 2) : Err('too small')));
      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toBe(10);
    });

    it('short-circuits on fn returning Err', () => {
      const result = andThen(Ok(1), (n) => (n > 3 ? Ok(n) : Err('too small')));
      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error).toBe('too small');
    });

    it('short-circuits on input Err', () => {
      const result = andThen(Err('already bad'), () => Ok(42));
      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error).toBe('already bad');
    });
  });

  describe('match', () => {
    it('calls ok handler for Ok', () => {
      const result = match(Ok(10), {
        ok: (v) => `got ${String(v)}`,
        err: (e) => `error: ${String(e)}`,
      });
      expect(result).toBe('got 10');
    });

    it('calls err handler for Err', () => {
      const result = match(Err('bad'), {
        ok: (v) => `got ${String(v)}`,
        err: (e) => `error: ${e}`,
      });
      expect(result).toBe('error: bad');
    });
  });
});
