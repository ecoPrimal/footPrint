// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server as NetServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import {
  NeuralApiClient,
  NeuralApiRpcError,
  NeuralApiUnavailableError,
  resetRequestIdForTests,
  type JsonRpcResponse,
} from './neural-api.js';

let socketPath: string;
let socketDir: string;
let mockServer: NetServer;

function rpcResponse(id: number, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id: number, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

beforeAll(async () => {
  socketDir = await mkdtemp(join(tmpdir(), 'neural-api-test-'));
  socketPath = join(socketDir, 'biomeos.sock');

  mockServer = createServer((socket) => {
    let buffer = Buffer.alloc(0);

    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      // Strip riboCipher prefix [0xEC, 0x01] if present
      if (buffer.length >= 2 && buffer[0] === 0xec && buffer[1] === 0x01) {
        buffer = buffer.subarray(2);
      }

      const str = buffer.toString('utf8');
      const newlineIndex = str.indexOf('\n');
      if (newlineIndex < 0) return;

      const line = str.slice(0, newlineIndex);
      buffer = Buffer.from(str.slice(newlineIndex + 1), 'utf8');

      const request = JSON.parse(line) as {
        id: number;
        method: string;
        params: Record<string, unknown>;
      };

      let response: JsonRpcResponse;

      switch (request.method) {
        case 'health.check':
          response = rpcResponse(request.id, { status: 'ok', service: 'biomeos' });
          break;
        case 'content.put':
          response = rpcResponse(request.id, {
            hash: 'abc123deadbeef',
            family: request.params['family'],
            key: request.params['key'],
          });
          break;
        case 'content.get':
          if (request.params['key'] === 'missing') {
            response = rpcResponse(request.id, { error: 'not found' });
          } else {
            response = rpcResponse(request.id, {
              data: { name: 'test-project', savedAt: '2026-01-01T00:00:00.000Z', layers: {} },
            });
          }
          break;
        case 'content.list':
          response = rpcResponse(request.id, {
            objects: [
              { hash: 'abc123', name: 'proj-a', savedAt: '2026-01-01T00:00:00.000Z' },
              { hash: 'def456', name: 'proj-b', savedAt: '2026-01-02T00:00:00.000Z' },
            ],
          });
          break;
        default:
          response = rpcError(request.id, -32601, `Method not found: ${request.method}`);
      }

      socket.write(`${JSON.stringify(response)}\n`);
      socket.end();
    });
  });

  await new Promise<void>((resolve, reject) => {
    mockServer.once('error', reject);
    mockServer.listen(socketPath, () => resolve());
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    mockServer.close((err) => (err ? reject(err) : resolve()));
  });
  await rm(socketDir, { recursive: true, force: true });
});

describe('NeuralApiClient', () => {
  beforeAll(() => {
    resetRequestIdForTests();
  });

  it('health.check returns service status', async () => {
    const client = new NeuralApiClient({ socketPath });
    const result = await client.healthCheck();
    expect(result).toEqual({ status: 'ok', service: 'biomeos' });
  });

  it('isAvailable returns true when socket responds', async () => {
    const client = new NeuralApiClient({ socketPath });
    await expect(client.isAvailable()).resolves.toBe(true);
  });

  it('content.put sends family, key, and data', async () => {
    const client = new NeuralApiClient({ socketPath });
    const result = await client.contentPut({
      family: 'footprint-projects',
      key: 'my-project',
      data: { name: 'my-project', layers: {} },
    });
    expect(result.hash).toBe('abc123deadbeef');
  });

  it('content.get returns data for existing key', async () => {
    const client = new NeuralApiClient({ socketPath });
    const result = await client.contentGet({ family: 'footprint-projects', key: 'abc123' });
    expect(result.data).toEqual({
      name: 'test-project',
      savedAt: '2026-01-01T00:00:00.000Z',
      layers: {},
    });
  });

  it('content.get returns error field for missing key', async () => {
    const client = new NeuralApiClient({ socketPath });
    const result = await client.contentGet({ key: 'missing' });
    expect(result.error).toBe('not found');
  });

  it('content.list returns objects array', async () => {
    const client = new NeuralApiClient({ socketPath });
    const result = await client.contentList({ family: 'footprint-projects' });
    expect(result.objects).toHaveLength(2);
    expect(result.objects[0]).toEqual({
      hash: 'abc123',
      name: 'proj-a',
      savedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('throws NeuralApiRpcError on JSON-RPC error response', async () => {
    const client = new NeuralApiClient({ socketPath });
    await expect(client.call('unknown.method', {})).rejects.toBeInstanceOf(NeuralApiRpcError);
  });

  it('throws NeuralApiUnavailableError when socket does not exist', async () => {
    const client = new NeuralApiClient({
      socketPath: join(dirname(socketPath), 'nonexistent.sock'),
      timeoutMs: 500,
    });
    await expect(client.healthCheck()).rejects.toBeInstanceOf(NeuralApiUnavailableError);
  });

  it('isAvailable returns false when socket is unreachable', async () => {
    const client = new NeuralApiClient({
      socketPath: join(dirname(socketPath), 'nonexistent.sock'),
      timeoutMs: 500,
    });
    await expect(client.isAvailable()).resolves.toBe(false);
  });
});
