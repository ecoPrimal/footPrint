// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server as NetServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import {
  NeuralApiClient,
  NeuralApiRpcError,
  NeuralApiUnavailableError,
  resetRequestIdForTests,
  createNeuralApiClient,
  type JsonRpcResponse,
} from './neural-api.js';

let socketPath: string;
let socketDir: string;
let mockUdsServer: NetServer;
let tcpPort: number;
let mockTcpServer: NetServer;

function rpcResponse(id: number, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id: number, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function handleConnection(socket: import('node:net').Socket, expectRiboCipher: boolean): void {
  let buffer = Buffer.alloc(0);

  socket.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);

    if (expectRiboCipher && buffer.length >= 2 && buffer[0] === 0xec && buffer[1] === 0x01) {
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
        response = rpcResponse(request.id, { primal: 'nestgate', status: 'healthy', version: '0.5.0' });
        break;
      case 'content.put':
        response = rpcResponse(request.id, {
          hash: 'a'.repeat(64),
          size: 46,
          stored: true,
          deduplicated: false,
          family_id: 'e8b62b6e',
        });
        break;
      case 'content.get':
        if (request.params['hash'] === '0'.repeat(64)) {
          response = rpcError(request.id, -32603, 'Content not found');
        } else {
          response = rpcResponse(request.id, {
            data: Buffer.from('{"name":"test"}', 'utf8').toString('base64'),
            hash: request.params['hash'],
            size: 15,
            family_id: 'e8b62b6e',
          });
        }
        break;
      case 'content.list':
        response = rpcResponse(request.id, {
          count: 2,
          family_id: 'e8b62b6e',
          hashes: [
            { hash: 'a'.repeat(64), size: 46 },
            { hash: 'b'.repeat(64), size: 128 },
          ],
        });
        break;
      default:
        response = rpcError(request.id, -32601, `Method not found: ${request.method}`);
    }

    socket.write(`${JSON.stringify(response)}\n`);
    socket.end();
  });
}

beforeAll(async () => {
  socketDir = await mkdtemp(join(tmpdir(), 'neural-api-test-'));
  socketPath = join(socketDir, 'nestgate.sock');

  mockUdsServer = createServer((socket) => handleConnection(socket, true));
  await new Promise<void>((resolve, reject) => {
    mockUdsServer.once('error', reject);
    mockUdsServer.listen(socketPath, () => resolve());
  });

  mockTcpServer = createServer((socket) => handleConnection(socket, false));
  await new Promise<void>((resolve, reject) => {
    mockTcpServer.once('error', reject);
    mockTcpServer.listen(0, '127.0.0.1', () => {
      const addr = mockTcpServer.address();
      tcpPort = typeof addr === 'object' && addr !== null ? addr.port : 0;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    mockUdsServer.close((err) => (err ? reject(err) : resolve()));
  });
  await new Promise<void>((resolve, reject) => {
    mockTcpServer.close((err) => (err ? reject(err) : resolve()));
  });
  await rm(socketDir, { recursive: true, force: true });
});

describe('NeuralApiClient (UDS transport)', () => {
  beforeEach(() => {
    resetRequestIdForTests();
  });

  it('health.check returns primal status', async () => {
    const client = new NeuralApiClient({ transport: 'uds', socketPath });
    const result = await client.healthCheck();
    expect(result).toEqual({ primal: 'nestgate', status: 'healthy', version: '0.5.0' });
  });

  it('isAvailable returns true when socket responds', async () => {
    const client = new NeuralApiClient({ transport: 'uds', socketPath });
    await expect(client.isAvailable()).resolves.toBe(true);
  });

  it('content.put sends base64 content', async () => {
    const client = new NeuralApiClient({ transport: 'uds', socketPath });
    const result = await client.contentPut({
      family: 'footprint-projects',
      content_base64: Buffer.from('{"test":true}').toString('base64'),
    });
    expect(result.hash).toBe('a'.repeat(64));
    expect(result.stored).toBe(true);
  });

  it('content.get retrieves by hash', async () => {
    const client = new NeuralApiClient({ transport: 'uds', socketPath });
    const result = await client.contentGet({ family: 'footprint-projects', hash: 'c'.repeat(64) });
    expect(result.data).toBe(Buffer.from('{"name":"test"}', 'utf8').toString('base64'));
    expect(result.size).toBe(15);
  });

  it('content.get throws on missing hash', async () => {
    const client = new NeuralApiClient({ transport: 'uds', socketPath });
    await expect(client.contentGet({ family: 'footprint-projects', hash: '0'.repeat(64) })).rejects.toBeInstanceOf(
      NeuralApiRpcError,
    );
  });

  it('content.list returns hashes array', async () => {
    const client = new NeuralApiClient({ transport: 'uds', socketPath });
    const result = await client.contentList({ family: 'footprint-projects' });
    expect(result.count).toBe(2);
    expect(result.hashes).toHaveLength(2);
    expect(result.hashes[0]?.hash).toBe('a'.repeat(64));
  });

  it('throws NeuralApiUnavailableError when socket missing', async () => {
    const client = new NeuralApiClient({
      transport: 'uds',
      socketPath: join(dirname(socketPath), 'nonexistent.sock'),
      timeoutMs: 500,
    });
    await expect(client.healthCheck()).rejects.toBeInstanceOf(NeuralApiUnavailableError);
  });
});

describe('NeuralApiClient (TCP transport)', () => {
  beforeEach(() => {
    resetRequestIdForTests();
  });

  it('health.check over TCP', async () => {
    const client = new NeuralApiClient({ transport: 'tcp', host: '127.0.0.1', port: tcpPort });
    const result = await client.healthCheck();
    expect(result).toEqual({ primal: 'nestgate', status: 'healthy', version: '0.5.0' });
  });

  it('content.put over TCP', async () => {
    const client = new NeuralApiClient({ transport: 'tcp', port: tcpPort });
    const result = await client.contentPut({
      family: 'footprint-projects',
      content_base64: Buffer.from('hello').toString('base64'),
    });
    expect(result.stored).toBe(true);
    expect(result.hash).toHaveLength(64);
  });

  it('content.list over TCP', async () => {
    const client = new NeuralApiClient({ transport: 'tcp', port: tcpPort });
    const result = await client.contentList({ family: 'footprint-projects' });
    expect(result.count).toBe(2);
  });

  it('socket property shows host:port for TCP', () => {
    const client = new NeuralApiClient({ transport: 'tcp', host: '10.0.0.1', port: 9090 });
    expect(client.socket).toBe('10.0.0.1:9090');
  });

  it('transport property reflects config', () => {
    const tcpClient = new NeuralApiClient({ transport: 'tcp', port: tcpPort });
    const udsClient = new NeuralApiClient({ transport: 'uds', socketPath });
    expect(tcpClient.transport).toBe('tcp');
    expect(udsClient.transport).toBe('uds');
  });

  it('throws NeuralApiUnavailableError on connection refused', async () => {
    const client = new NeuralApiClient({ transport: 'tcp', port: 1, timeoutMs: 500 });
    await expect(client.healthCheck()).rejects.toBeInstanceOf(NeuralApiUnavailableError);
  });
});

describe('createNeuralApiClient factory', () => {
  it('explicit socketPath creates UDS client', () => {
    const client = createNeuralApiClient('/tmp/test.sock');
    expect(client.transport).toBe('uds');
    expect(client.socket).toBe('/tmp/test.sock');
  });

  it('defaults to TCP localhost:8080 when no env set', () => {
    const orig = { ...process.env };
    delete process.env['NESTGATE_RPC_URL'];
    delete process.env['NESTGATE_RPC_PORT'];
    delete process.env['MEMBRANE_SOCKET'];
    try {
      const client = createNeuralApiClient();
      expect(client.transport).toBe('tcp');
      expect(client.socket).toBe('127.0.0.1:8080');
    } finally {
      Object.assign(process.env, orig);
    }
  });

  it('NESTGATE_RPC_PORT env creates TCP client', () => {
    const orig = process.env['NESTGATE_RPC_PORT'];
    process.env['NESTGATE_RPC_PORT'] = '9999';
    try {
      delete process.env['NESTGATE_RPC_URL'];
      delete process.env['MEMBRANE_SOCKET'];
      const client = createNeuralApiClient();
      expect(client.transport).toBe('tcp');
      expect(client.socket).toBe('127.0.0.1:9999');
    } finally {
      if (orig !== undefined) {
        process.env['NESTGATE_RPC_PORT'] = orig;
      } else {
        delete process.env['NESTGATE_RPC_PORT'];
      }
    }
  });
});
