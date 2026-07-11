import { describe, it, expect } from 'vitest';
import { Ok, Err, isOk, isErr, unwrap, unwrapOr, map } from './result.js';

describe('Result', () => {
  it('Ok carries a value', () => {
    const r = Ok(42);
    expect(r.ok).toBe(true);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    if (r.ok) expect(r.value).toBe(42);
  });

  it('Err carries an error', () => {
    const r = Err('fail');
    expect(r.ok).toBe(false);
    expect(isOk(r)).toBe(false);
    expect(isErr(r)).toBe(true);
    if (!r.ok) expect(r.error).toBe('fail');
  });

  it('unwrap returns value on Ok', () => {
    expect(unwrap(Ok(7))).toBe(7);
  });

  it('unwrap throws on Err', () => {
    expect(() => unwrap(Err('boom'))).toThrow();
  });

  it('unwrapOr returns fallback on Err', () => {
    expect(unwrapOr(Err('x'), 99)).toBe(99);
    expect(unwrapOr(Ok(1), 99)).toBe(1);
  });

  it('map transforms Ok value', () => {
    const r = map(Ok(3), (n) => n * 2);
    expect(isOk(r) && r.value).toBe(6);
  });

  it('map passes Err through', () => {
    const r = map(Err('e'), (n: number) => n * 2);
    expect(isErr(r)).toBe(true);
  });
});
