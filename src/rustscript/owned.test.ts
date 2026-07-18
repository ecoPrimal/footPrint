import { describe, it, expect } from 'vitest';
import { Owned, UseAfterMoveError, transfer, consume, take } from './owned.js';

describe('Owned<T>', () => {
  describe('creation and access', () => {
    it('creates an owned value', () => {
      const o = Owned.of({ x: 1 });
      expect(o.value).toEqual({ x: 1 });
    });

    it('isAlive is true on fresh value', () => {
      const o = Owned.of(42);
      expect(o.isAlive).toBe(true);
    });

    it('allows multiple reads before move', () => {
      const o = Owned.of('hello');
      expect(o.value).toBe('hello');
      expect(o.value).toBe('hello');
    });
  });

  describe('transfer', () => {
    it('moves value to new owner', () => {
      const a = Owned.of({ x: 1 });
      const b = transfer(a);
      expect(b.value).toEqual({ x: 1 });
    });

    it('invalidates source after transfer', () => {
      const a = Owned.of(42);
      transfer(a);
      expect(a.isAlive).toBe(false);
      expect(() => a.value).toThrow(UseAfterMoveError);
    });

    it('double transfer throws', () => {
      const a = Owned.of(1);
      transfer(a);
      expect(() => transfer(a)).toThrow(UseAfterMoveError);
    });
  });

  describe('consume', () => {
    it('applies function to value and invalidates', () => {
      const a = Owned.of(5);
      const result = consume(a, v => v * 2);
      expect(result).toBe(10);
      expect(a.isAlive).toBe(false);
    });

    it('throws on already-moved value', () => {
      const a = Owned.of(1);
      take(a);
      expect(() => consume(a, v => v)).toThrow(UseAfterMoveError);
    });
  });

  describe('take', () => {
    it('extracts the inner value', () => {
      const a = Owned.of('data');
      expect(take(a)).toBe('data');
    });

    it('invalidates after take', () => {
      const a = Owned.of(1);
      take(a);
      expect(() => a.value).toThrow(UseAfterMoveError);
    });
  });

  describe('Disposable (Symbol.dispose)', () => {
    it('drops value on dispose', () => {
      const a = Owned.of({ x: 1 });
      a[Symbol.dispose]();
      expect(a.isAlive).toBe(false);
      expect(() => a.value).toThrow(UseAfterMoveError);
    });

    it('dispose on already-moved is no-op', () => {
      const a = Owned.of(1);
      transfer(a);
      a[Symbol.dispose]();
      expect(a.isAlive).toBe(false);
    });

    it('dispose on already-dropped is no-op', () => {
      const a = Owned.of(1);
      a[Symbol.dispose]();
      a[Symbol.dispose]();
      expect(a.isAlive).toBe(false);
    });

    it('move after dispose throws', () => {
      const a = Owned.of(1);
      a[Symbol.dispose]();
      expect(() => transfer(a)).toThrow(UseAfterMoveError);
    });
  });

  describe('UseAfterMoveError', () => {
    it('has correct name', () => {
      const err = new UseAfterMoveError();
      expect(err.name).toBe('UseAfterMoveError');
    });

    it('has default message', () => {
      const err = new UseAfterMoveError();
      expect(err.message).toBe('Attempted to access a moved value');
    });

    it('accepts custom message', () => {
      const err = new UseAfterMoveError('custom');
      expect(err.message).toBe('custom');
    });
  });
});
