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

describe('channel - additional coverage', () => {
  it('tryRecv returns message when available', () => {
    const [tx, rx] = channel<number>();
    tx.send(Owned.of(7));
    const msg = rx.tryRecv();
    expect(isSome(msg)).toBe(true);
    if (msg.some) expect(take(msg.value)).toBe(7);
  });

  it('tryRecv returns None when empty', () => {
    const [, rx] = channel<number>();
    expect(isNone(rx.tryRecv())).toBe(true);
  });

  it('tryRecv returns None after receiver closed', () => {
    const [tx, rx] = channel<number>();
    tx.send(Owned.of(1));
    rx.close();
    expect(isNone(rx.tryRecv())).toBe(true);
  });

  it('recv returns None after receiver closed', () => {
    const [tx, rx] = channel<number>();
    tx.send(Owned.of(1));
    rx.close();
    expect(isNone(rx.recv())).toBe(true);
  });

  it('sender isOpen tracks state', () => {
    const [tx, rx] = channel<number>();
    expect(tx.isOpen).toBe(true);
    tx.close();
    expect(tx.isOpen).toBe(false);
    void rx;
  });

  it('sender isOpen becomes false when receiver drops', () => {
    const [tx, rx] = channel<number>();
    expect(tx.isOpen).toBe(true);
    rx.close();
    expect(tx.isOpen).toBe(false);
  });

  it('receiver isOpen tracks state', () => {
    const [, rx] = channel<number>();
    expect(rx.isOpen).toBe(true);
    rx.close();
    expect(rx.isOpen).toBe(false);
  });

  it('sender Symbol.dispose closes sender', () => {
    const [tx, rx] = channel<number>();
    tx[Symbol.dispose]();
    expect(tx.isOpen).toBe(false);
    void rx;
  });

  it('receiver Symbol.dispose closes receiver', () => {
    const [tx, rx] = channel<number>();
    rx[Symbol.dispose]();
    expect(rx.isOpen).toBe(false);
    const result = tx.send(Owned.of(1));
    expect(isErr(result)).toBe(true);
  });

  it('double close on sender is safe', () => {
    const [tx] = channel<number>();
    tx.close();
    tx.close();
    expect(tx.isOpen).toBe(false);
  });

  it('double close on receiver is safe', () => {
    const [, rx] = channel<number>();
    rx.close();
    rx.close();
    expect(rx.isOpen).toBe(false);
  });

  it('Symbol.iterator drains all messages', () => {
    const [tx, rx] = channel<number>();
    tx.send(Owned.of(10));
    tx.send(Owned.of(20));
    tx.send(Owned.of(30));

    const result: number[] = [];
    for (const msg of rx) {
      result.push(take(msg));
    }
    expect(result).toEqual([10, 20, 30]);
  });
});
