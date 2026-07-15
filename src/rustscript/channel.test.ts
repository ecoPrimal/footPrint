import { describe, it, expect } from 'vitest';
import { channel, boundedChannel } from './channel.js';
import { Owned, take } from './owned.js';
import { isSome, isNone } from './option.js';
import { isOk, isErr } from './result.js';

describe('channel', () => {
  it('sends and receives values with ownership transfer', () => {
    const [tx, rx] = channel<number>();
    const result = tx.send(Owned.of(42));
    expect(isOk(result)).toBe(true);

    const msg = rx.recv();
    expect(isSome(msg)).toBe(true);
    if (msg.some) expect(take(msg.value)).toBe(42);
  });

  it('recv returns None on empty buffer', () => {
    const [, rx] = channel<number>();
    expect(isNone(rx.recv())).toBe(true);
  });

  it('preserves FIFO ordering', () => {
    const [tx, rx] = channel<string>();
    tx.send(Owned.of('a'));
    tx.send(Owned.of('b'));
    tx.send(Owned.of('c'));

    const values: string[] = [];
    for (const msg of rx) values.push(take(msg));
    expect(values).toEqual(['a', 'b', 'c']);
  });

  it('reports isDrained when sender closes and buffer empty', () => {
    const [tx, rx] = channel<number>();
    tx.send(Owned.of(1));
    tx.close();
    expect(rx.isDrained).toBe(false);
    rx.recv();
    expect(rx.isDrained).toBe(true);
  });

  it('send fails after sender close', () => {
    const [tx] = channel<number>();
    tx.close();
    const result = tx.send(Owned.of(1));
    expect(isErr(result)).toBe(true);
  });

  it('send fails after receiver close', () => {
    const [tx, rx] = channel<number>();
    rx.close();
    const result = tx.send(Owned.of(1));
    expect(isErr(result)).toBe(true);
  });
});

describe('boundedChannel', () => {
  it('rejects capacity < 1', () => {
    expect(() => boundedChannel(0)).toThrow(RangeError);
  });

  it('blocks send when full', () => {
    const [tx, rx] = boundedChannel<number>(2);
    expect(isOk(tx.send(Owned.of(1)))).toBe(true);
    expect(isOk(tx.send(Owned.of(2)))).toBe(true);

    const full = tx.send(Owned.of(3));
    expect(isErr(full)).toBe(true);

    rx.recv();
    expect(isOk(tx.send(Owned.of(3)))).toBe(true);
  });

  it('pending tracks buffered count', () => {
    const [tx, rx] = boundedChannel<number>(5);
    tx.send(Owned.of(1));
    tx.send(Owned.of(2));
    expect(rx.pending).toBe(2);
    rx.recv();
    expect(rx.pending).toBe(1);
  });
});
