// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AGENT_RECONNECT_MS, AGENT_RECONNECT_MAX_MS } from '../constants.js';

vi.mock('./api.js', () => ({
  petalTongueWsUrl: vi.fn(() => 'ws://localhost/ws'),
}));

type WsListener = (event?: { data?: string }) => void;

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    this.emit('close');
  });

  private readonly listeners = new Map<string, WsListener[]>();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  static instances: MockWebSocket[] = [];

  addEventListener(event: string, listener: WsListener): void {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
  }

  emit(event: string, payload?: { data?: string }): void {
    if (event === 'close') {
      this.readyState = MockWebSocket.CLOSED;
    }
    for (const listener of this.listeners.get(event) ?? []) {
      listener(payload);
    }
  }

  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.emit('open');
  }

  simulateMessage(data: unknown): void {
    this.emit('message', { data: JSON.stringify(data) });
  }
}

let petal: typeof import('./petal-tongue.js');

beforeEach(async () => {
  vi.useFakeTimers();
  MockWebSocket.instances = [];
  vi.stubGlobal('WebSocket', MockWebSocket);

  vi.resetModules();
  petal = await import('./petal-tongue.js');
  petal.resetPetalTongueForTests();
});

afterEach(() => {
  petal.resetPetalTongueForTests();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('rpcCall', () => {
  it('sends JSON-RPC 2.0 request over WebSocket', async () => {
    petal.initPetalTongue();
    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();

    const promise = petal.rpcCall('agent.status');
    expect(ws.send).toHaveBeenCalledTimes(1);

    const frame = JSON.parse(String(vi.mocked(ws.send).mock.calls[0]![0])) as {
      jsonrpc: string;
      method: string;
      id: number;
    };
    expect(frame).toEqual({
      jsonrpc: '2.0',
      method: 'agent.status',
      id: 1,
    });

    ws.simulateMessage({ jsonrpc: '2.0', id: 1, result: { ready: true } });
    await expect(promise).resolves.toEqual({ ready: true });
  });

  it('rejects when not connected', async () => {
    await expect(petal.rpcCall('agent.status')).rejects.toThrow('petalTongue not connected');
  });

  it('rejects on RPC timeout', async () => {
    petal.initPetalTongue();
    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();

    const promise = petal.rpcCall('agent.query', { prompt: 'hello' });
    vi.advanceTimersByTime(15_000);
    await expect(promise).rejects.toThrow('RPC timeout: agent.query');
  });

  it('rejects when server returns JSON-RPC error', async () => {
    petal.initPetalTongue();
    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();

    const promise = petal.rpcCall('agent.query', { prompt: 'hello' });
    ws.simulateMessage({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32000, message: 'agent busy' },
    });

    await expect(promise).rejects.toThrow('RPC error -32000: agent busy');
  });
});

describe('rpcNotify', () => {
  it('sends notification without id and does not await a response', () => {
    petal.initPetalTongue();
    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();

    petal.rpcNotify('bridge.subscribe', { topic: 'updates' });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ jsonrpc: '2.0', method: 'bridge.subscribe', params: { topic: 'updates' } }),
    );
  });

  it('no-ops when disconnected', () => {
    petal.rpcNotify('bridge.subscribe', { topic: 'updates' });
    expect(MockWebSocket.instances).toHaveLength(0);
  });
});

describe('notification handler dispatch', () => {
  it('dispatches server notifications to the registered handler', () => {
    const onNotification = vi.fn();
    petal.initPetalTongue(onNotification);
    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();

    ws.simulateMessage({
      jsonrpc: '2.0',
      method: 'agent.stream.chunk',
      params: { text: 'partial' },
    });

    expect(onNotification).toHaveBeenCalledWith('agent.stream.chunk', { text: 'partial' });
  });

  it('ignores malformed frames', () => {
    const onNotification = vi.fn();
    petal.initPetalTongue(onNotification);
    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();

    ws.simulateMessage('not-json');
    ws.simulateMessage({ jsonrpc: '1.0', method: 'old' });

    expect(onNotification).not.toHaveBeenCalled();
  });
});

describe('reconnection logic', () => {
  it('schedules reconnect after disconnect with exponential backoff', () => {
    const onStatus = vi.fn();
    petal.initPetalTongue(undefined, onStatus);
    const first = MockWebSocket.instances[0]!;
    first.simulateOpen();
    expect(onStatus).toHaveBeenCalledWith(true);

    first.emit('close');
    expect(onStatus).toHaveBeenCalledWith(false);
    expect(MockWebSocket.instances).toHaveLength(1);

    vi.advanceTimersByTime(AGENT_RECONNECT_MS);
    expect(MockWebSocket.instances).toHaveLength(2);

    MockWebSocket.instances[1]!.emit('close');
    vi.advanceTimersByTime(AGENT_RECONNECT_MS * 2);
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it('caps reconnect delay at AGENT_RECONNECT_MAX_MS', () => {
    petal.initPetalTongue();
    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();

    for (let i = 0; i < 6; i++) {
      ws.emit('close');
      vi.advanceTimersByTime(AGENT_RECONNECT_MAX_MS);
    }

    expect(MockWebSocket.instances.length).toBeGreaterThan(1);
  });

  it('reports connection status via callback', () => {
    const onStatus = vi.fn();
    petal.initPetalTongue(undefined, onStatus);
    const ws = MockWebSocket.instances[0]!;

    ws.simulateOpen();
    expect(petal.isPetalTongueConnected()).toBe(true);

    ws.emit('close');
    expect(petal.isPetalTongueConnected()).toBe(false);
  });
});
