// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest';
import { RefCell, BorrowError } from './refcell.js';

describe('RefCell', () => {
  it('allows multiple immutable borrows', () => {
    const cell = new RefCell({ x: 1 });
    using r1 = cell.borrow();
    using r2 = cell.borrow();
    expect(r1.value.x).toBe(1);
    expect(r2.value.x).toBe(1);
  });

  it('allows a single mutable borrow', () => {
    const cell = new RefCell({ x: 1 });
    using r = cell.borrowMut();
    r.value = { x: 42 };
    expect(r.value.x).toBe(42);
  });

  it('panics on mutable borrow while immutably borrowed', () => {
    const cell = new RefCell(0);
    using _r = cell.borrow();
    expect(() => cell.borrowMut()).toThrow(BorrowError);
  });

  it('panics on immutable borrow while mutably borrowed', () => {
    const cell = new RefCell(0);
    using _r = cell.borrowMut();
    expect(() => cell.borrow()).toThrow(BorrowError);
  });

  it('panics on double mutable borrow', () => {
    const cell = new RefCell(0);
    using _r = cell.borrowMut();
    expect(() => cell.borrowMut()).toThrow(BorrowError);
  });

  it('allows reborrow after dispose', () => {
    const cell = new RefCell({ x: 10 });
    {
      using r = cell.borrowMut();
      r.value.x = 20;
    }
    using r2 = cell.borrow();
    expect(r2.value.x).toBe(20);
  });

  it('replace swaps the inner value', () => {
    const cell = new RefCell('a');
    const old = cell.replace('b');
    expect(old).toBe('a');
    using r = cell.borrow();
    expect(r.value).toBe('b');
  });

  it('replace panics while borrowed', () => {
    const cell = new RefCell(0);
    using _r = cell.borrow();
    expect(() => cell.replace(1)).toThrow(BorrowError);
  });

  it('snapshot clones without borrowing', () => {
    const cell = new RefCell({ items: [1, 2, 3] });
    const snap = cell.snapshot();
    snap.items.push(4);
    using r = cell.borrow();
    expect(r.value.items).toHaveLength(3);
  });
});
