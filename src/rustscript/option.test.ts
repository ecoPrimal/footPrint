import { describe, it, expect } from 'vitest';
import { Some, None, isSome, isNone, unwrapOption, fromNullable, matchOption } from './option.js';

describe('Option', () => {
  it('Some wraps a value', () => {
    const opt = Some(42);
    expect(opt.some).toBe(true);
    expect(isSome(opt)).toBe(true);
    expect(isNone(opt)).toBe(false);
    if (opt.some) expect(opt.value).toBe(42);
  });

  it('None represents absence', () => {
    const opt = None<number>();
    expect(opt.some).toBe(false);
    expect(isSome(opt)).toBe(false);
    expect(isNone(opt)).toBe(true);
  });

  it('unwrapOption returns value on Some', () => {
    expect(unwrapOption(Some(7))).toBe(7);
  });

  it('unwrapOption throws on None', () => {
    expect(() => unwrapOption(None())).toThrow();
  });

  it('fromNullable converts null/undefined to None', () => {
    expect(isSome(fromNullable(5))).toBe(true);
    expect(isNone(fromNullable(null))).toBe(true);
    expect(isNone(fromNullable(undefined))).toBe(true);
  });

  it('matchOption dispatches correctly', () => {
    const onSome = matchOption(Some(10), {
      some: (v) => v * 2,
      none: () => -1,
    });
    expect(onSome).toBe(20);

    const onNone = matchOption(None<number>(), {
      some: (v) => v * 2,
      none: () => -1,
    });
    expect(onNone).toBe(-1);
  });
});
