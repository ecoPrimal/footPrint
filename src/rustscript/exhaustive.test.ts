// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest';
import { exhaustive } from './exhaustive.js';

describe('exhaustive', () => {
  it('throws with a readable message for strings', () => {
    expect(() => exhaustive('oops' as never)).toThrow('Unhandled case: oops');
  });

  it('throws with JSON for objects', () => {
    const obj = { kind: 'unknown' };
    expect(() => exhaustive(obj as never)).toThrow('Unhandled case: {"kind":"unknown"}');
  });

  it('throws for numeric values', () => {
    expect(() => exhaustive(42 as never)).toThrow('Unhandled case: 42');
  });
});
