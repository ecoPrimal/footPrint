// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import {
  initAgentBridge,
  sendCommand,
  sendAgentMessage,
  getShadowState,
  getUserMessages,
  isBrowserConnected,
  resetAgentBridgeForTests,
} from './server-bridge.js';
import { AGENT_BRIDGE_PATH, AGENT_COMMAND_TIMEOUT_MS } from '../constants.js';
import { AGENT_METHODS } from './protocol.js';
import type { SerializedEntity } from '../core/entity.js';

let httpServer: Server;
let wsUrl: string;

function connectBrowser(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function messageToString(raw: WebSocket.RawData): string {
  if (typeof raw === 'string') return raw;
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf8');
  return Buffer.from(raw).toString('utf8');
}

function waitForMessage(ws: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for message')), 5000);
    ws.once('message', (raw: WebSocket.RawData) => {
      clearTimeout(timer);
      resolve(JSON.parse(messageToString(raw)));
    });
  });
}

const sampleEntity: SerializedEntity = {
  id: 'shape-1',
  kind: 'shape',
  parentId: 'layer-1',
  children: [],
  components: {
    geometry: {
      geojson: { type: 'Point', coordinates: [-84.5, 42.7] },
      shapeType: 'marker',
    },
  },
};

beforeEach(async () => {
  resetAgentBridgeForTests();
  httpServer = createServer();
  initAgentBridge(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const addr = httpServer.address() as AddressInfo;
  wsUrl = `ws://127.0.0.1:${String(addr.port)}${AGENT_BRIDGE_PATH}`;
});

afterEach(async () => {
  resetAgentBridgeForTests();
  await new Promise<void>((resolve, reject) => {
    httpServer.close((err) => (err ? reject(err) : resolve()));
  });
});

describe('JSON-RPC 2.0 message framing', () => {
  it('accepts valid project.sync notification and updates shadow state', async () => {
    const ws = await connectBrowser();
    ws.send(
      JSON.stringify({
        jsonrpc: '2.0',
        method: AGENT_METHODS.PROJECT_SYNC,
        params: { entities: [sampleEntity] },
      }),
    );

    await new Promise((r) => setTimeout(r, 50));
    expect(getShadowState()).toEqual([sampleEntity]);
    ws.close();
  });

  it('ignores invalid JSON-RPC frames', async () => {
    const ws = await connectBrowser();
    ws.send(JSON.stringify({ jsonrpc: '1.0', method: AGENT_METHODS.PROJECT_SYNC }));
    ws.send(JSON.stringify({ jsonrpc: '2.0', id: 1 }));

    await new Promise((r) => setTimeout(r, 50));
    expect(getShadowState()).toEqual([]);
    ws.close();
  });

  it('responds to bridge.health requests from browser', async () => {
    const ws = await connectBrowser();
    ws.send(
      JSON.stringify({
        jsonrpc: '2.0',
        method: AGENT_METHODS.BRIDGE_HEALTH,
        id: 42,
      }),
    );

    const frame = (await waitForMessage(ws)) as {
      jsonrpc: string;
      id: number;
      result: { connected: boolean; entityCount: number };
    };

    expect(frame).toEqual({
      jsonrpc: '2.0',
      id: 42,
      result: {
        connected: true,
        entityCount: 0,
        timestamp: expect.any(Number) as number,
      },
    });
    ws.close();
  });
});

describe('project.command request/response flow', () => {
  it('forwards command to browser and resolves with JSON-RPC result', async () => {
    const ws = await connectBrowser();

    const commandPromise = sendCommand({ action: 'undo' });

    const frame = (await waitForMessage(ws)) as {
      jsonrpc: string;
      method: string;
      id: number;
      params: { payload: { action: string } };
    };

    expect(frame).toEqual({
      jsonrpc: '2.0',
      method: AGENT_METHODS.PROJECT_COMMAND,
      id: expect.any(Number) as number,
      params: { payload: { action: 'undo' } },
    });

    ws.send(
      JSON.stringify({
        jsonrpc: '2.0',
        id: frame.id,
        result: { ok: true, data: { undone: 1 } },
      }),
    );

    const result = await commandPromise;
    expect(result).toEqual({
      id: String(frame.id),
      ok: true,
      data: { ok: true, data: { undone: 1 } },
    });
    ws.close();
  });

  it('returns error when no browser is connected', async () => {
    const result = await sendCommand({ action: 'redo' });
    expect(result).toEqual({ id: '', ok: false, error: 'No browser connected' });
  });

  it('times out when browser does not respond', async () => {
    vi.useFakeTimers();
    try {
      const ws = await connectBrowser();
      const commandPromise = sendCommand({ action: 'undo' });
      await waitForMessage(ws);
      vi.advanceTimersByTime(AGENT_COMMAND_TIMEOUT_MS + 1);
      const result = await commandPromise;
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Command timed out');
      ws.close();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('agent.message notification routing', () => {
  it('queues agent.query from browser into user messages', async () => {
    const ws = await connectBrowser();
    ws.send(
      JSON.stringify({
        jsonrpc: '2.0',
        method: AGENT_METHODS.AGENT_QUERY,
        params: { text: 'Add a patio', timestamp: 1_700_000_000_000 },
      }),
    );

    await new Promise((r) => setTimeout(r, 50));
    expect(getUserMessages(false)).toEqual([{ text: 'Add a patio', timestamp: 1_700_000_000_000 }]);
    ws.close();
  });

  it('sends agent.message notification to connected browser', async () => {
    const ws = await connectBrowser();
    const delivered = sendAgentMessage('Hello from agent');
    expect(delivered).toBe(true);
    expect(isBrowserConnected()).toBe(true);

    const frame = (await waitForMessage(ws)) as {
      jsonrpc: string;
      method: string;
      params: { text: string; timestamp: number };
    };

    expect(frame.jsonrpc).toBe('2.0');
    expect(frame.method).toBe(AGENT_METHODS.AGENT_MESSAGE);
    expect(frame.params.text).toBe('Hello from agent');
    expect(typeof frame.params.timestamp).toBe('number');
    ws.close();
  });

  it('returns false when browser is disconnected', () => {
    expect(sendAgentMessage('orphan')).toBe(false);
  });
});

describe('project.delta shadow updates', () => {
  it('applies incremental add/remove/update events', async () => {
    const ws = await connectBrowser();

    ws.send(
      JSON.stringify({
        jsonrpc: '2.0',
        method: AGENT_METHODS.PROJECT_DELTA,
        params: {
          event: { kind: 'add', entityId: 'shape-1' },
          entity: sampleEntity,
        },
      }),
    );

    await new Promise((r) => setTimeout(r, 50));
    expect(getShadowState()).toEqual([sampleEntity]);

    ws.send(
      JSON.stringify({
        jsonrpc: '2.0',
        method: AGENT_METHODS.PROJECT_DELTA,
        params: { event: { kind: 'remove', entityId: 'shape-1' } },
      }),
    );

    await new Promise((r) => setTimeout(r, 50));
    expect(getShadowState()).toEqual([]);
    ws.close();
  });
});
