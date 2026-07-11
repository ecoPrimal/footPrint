/**
 * Rust's std::sync::mpsc -- message-passing channels with ownership transfer.
 *
 * Values are moved through the channel via Owned<T>, enforcing that the sender
 * relinquishes ownership and the receiver becomes the sole owner.
 * Both Sender and Receiver implement Disposable for RAII scope management.
 *
 * Usage:
 *   const [tx, rx] = channel<number>();
 *
 *   tx.send(Owned.of(42));
 *   tx.send(Owned.of(99));
 *   using tx_ = tx;     // auto-close sender at scope exit
 *
 *   for (const msg of rx) {
 *     console.log(take(msg));   // 42, then 99
 *   }
 */

import type { Option } from './option.js';
import { Some, None } from './option.js';
import type { Result } from './result.js';
import { Ok, Err } from './result.js';
import { Owned, take } from './owned.js';

// -- Errors --

export class SendError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'SendError';
  }
}

export class RecvError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'RecvError';
  }
}

// -- Internal shared buffer --

class ChannelBuffer<T> {
  private readonly queue: Owned<T>[] = [];
  private readonly capacity: number | null;
  private senderClosed = false;
  private receiverClosed = false;

  constructor(capacity: number | null) {
    this.capacity = capacity;
  }

  get isSenderClosed(): boolean { return this.senderClosed; }
  get isReceiverClosed(): boolean { return this.receiverClosed; }

  closeSender(): void { this.senderClosed = true; }
  closeReceiver(): void { this.receiverClosed = true; }

  get isFull(): boolean {
    return this.capacity !== null && this.queue.length >= this.capacity;
  }

  get isEmpty(): boolean {
    return this.queue.length === 0;
  }

  get length(): number {
    return this.queue.length;
  }

  push(value: Owned<T>): void {
    this.queue.push(value);
  }

  shift(): Owned<T> | undefined {
    return this.queue.shift();
  }
}

// -- Sender --

export class Sender<T> implements Disposable {
  private readonly buf: ChannelBuffer<T>;
  private closed = false;

  /** @internal */
  constructor(buf: ChannelBuffer<T>) {
    this.buf = buf;
  }

  /**
   * Send a value through the channel, transferring ownership.
   * The Owned<T> is moved -- the sender cannot access it afterward.
   * Returns Err if the receiver has been dropped or channel is full (bounded).
   */
  send(value: Owned<T>): Result<void, SendError> {
    if (this.closed) return Err(new SendError('Sender is closed'));
    if (this.buf.isReceiverClosed) return Err(new SendError('Receiver has been dropped'));
    if (this.buf.isFull) return Err(new SendError('Channel is full'));

    const moved = Owned.of(take(value));
    this.buf.push(moved);
    return Ok(undefined);
  }

  get isOpen(): boolean {
    return !this.closed && !this.buf.isReceiverClosed;
  }

  close(): void {
    if (!this.closed) {
      this.closed = true;
      this.buf.closeSender();
    }
  }

  [Symbol.dispose](): void {
    this.close();
  }
}

// -- Receiver --

export class Receiver<T> implements Disposable, Iterable<Owned<T>> {
  private readonly buf: ChannelBuffer<T>;
  private closed = false;

  /** @internal */
  constructor(buf: ChannelBuffer<T>) {
    this.buf = buf;
  }

  /**
   * Take the next message from the channel.
   * Returns Some(Owned<T>) if a message is buffered.
   * Returns None if the buffer is empty or the receiver is closed.
   *
   * Note: In single-threaded JS, recv() cannot block like Rust's mpsc::recv().
   * Use tryRecv() + isSenderClosed to distinguish "temporarily empty" from
   * "permanently drained" in polling loops.
   */
  recv(): Option<Owned<T>> {
    if (this.closed) return None();
    const item = this.buf.shift();
    return item !== undefined ? Some(item) : None();
  }

  /**
   * Non-blocking receive. Returns None if nothing is available right now.
   * Identical to recv() in JS (no blocking); exists for API parity with Rust
   * and to signal intent: "I expect this might be empty."
   */
  tryRecv(): Option<Owned<T>> {
    if (this.closed) return None();
    const item = this.buf.shift();
    return item !== undefined ? Some(item) : None();
  }

  /** True when the sender has been closed and the buffer is empty. */
  get isDrained(): boolean {
    return this.buf.isSenderClosed && this.buf.isEmpty;
  }

  /** Number of messages currently buffered. */
  get pending(): number {
    return this.buf.length;
  }

  get isOpen(): boolean {
    return !this.closed;
  }

  close(): void {
    if (!this.closed) {
      this.closed = true;
      this.buf.closeReceiver();
    }
  }

  [Symbol.dispose](): void {
    this.close();
  }

  /** Drain all pending messages. Stops when buffer is empty. */
  [Symbol.iterator](): Iterator<Owned<T>> {
    return {
      next: (): IteratorResult<Owned<T>> => {
        const item = this.tryRecv();
        if (item.some) {
          return { done: false, value: item.value };
        }
        return { done: true, value: undefined };
      },
    };
  }
}

// -- Factory functions --

/**
 * Create an unbounded channel. Messages buffer indefinitely.
 * Equivalent to Rust's `std::sync::mpsc::channel()`.
 */
export function channel<T>(): [Sender<T>, Receiver<T>] {
  const buf = new ChannelBuffer<T>(null);
  return [new Sender(buf), new Receiver(buf)];
}

/**
 * Create a bounded channel with a maximum capacity.
 * send() returns Err(SendError) when the buffer is full.
 * Equivalent to Rust's `std::sync::mpsc::sync_channel(bound)`.
 */
export function boundedChannel<T>(capacity: number): [Sender<T>, Receiver<T>] {
  if (capacity < 1) throw new RangeError('Channel capacity must be at least 1');
  const buf = new ChannelBuffer<T>(capacity);
  return [new Sender(buf), new Receiver(buf)];
}
