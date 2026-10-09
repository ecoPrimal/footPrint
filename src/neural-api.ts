// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * JSON-RPC 2.0 client for NUCLEUS primal communication.
 *
 * Supports two transports:
 * - TCP (host:port) — for same-gate services (no BTSP required, local-trust)
 * - UDS (socket path) — for inter-primal IPC (requires riboCipher prefix [0xEC, 0x01])
 *
 * Default resolution order: NESTGATE_RPC_URL env → TCP localhost:8080 (same-gate local-trust)
 * UDS path via MEMBRANE_SOCKET env (requires BTSP — future: capability routing)
 */

import { connect, type Socket } from 'node:net';
import { NEURAL_API_TIMEOUT_MS } from './constants.js';

const RIBOCIPHER_CLEAR_JSONRPC = Buffer.from([0xec, 0x01]);

export interface NeuralApiConfig {
  readonly transport: 'tcp' | 'uds';
  readonly host?: string;
  readonly port?: number;
  readonly socketPath?: string;
  readonly timeoutMs?: number;
}

export interface JsonRpcError {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

export interface JsonRpcResponse<T = unknown> {
  readonly jsonrpc: '2.0';
  readonly id: number;
  readonly result?: T;
  readonly error?: JsonRpcError;
}

export interface ContentPutParams {
  readonly family: string;
  readonly content_base64: string;
}

export interface ContentPutResult {
  readonly hash: string;
  readonly size: number;
  readonly stored: boolean;
  readonly deduplicated: boolean;
  readonly family_id: string;
}

export interface ContentGetParams {
  readonly family: string;
  readonly hash: string;
}

export interface ContentGetResult {
  readonly data: string;
  readonly hash: string;
  readonly size: number;
  readonly family_id: string;
}

export interface ContentListParams {
  readonly family: string;
}

export interface ContentListResult {
  readonly count: number;
  readonly family_id: string;
  readonly hashes: readonly { readonly hash: string; readonly size: number }[];
}

/** Thrown when the Neural API socket is unreachable (triggers HTTP fallback). */
export class NeuralApiUnavailableError extends Error {
  readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'NeuralApiUnavailableError';
    this.cause = cause;
  }
}

/** Thrown when the socket responds with a JSON-RPC error object. */
export class NeuralApiRpcError extends Error {
  readonly code: number;
  readonly data: unknown;

  constructor(error: JsonRpcError) {
    super(error.message);
    this.name = 'NeuralApiRpcError';
    this.code = error.code;
    this.data = error.data ?? null;
  }
}

let nextRequestId = 1;

export function resetRequestIdForTests(): void {
  nextRequestId = 1;
}

export class NeuralApiClient {
  private readonly config: NeuralApiConfig;
  private readonly timeoutMs: number;

  constructor(config: NeuralApiConfig) {
    this.config = config;
    this.timeoutMs = config.timeoutMs ?? NEURAL_API_TIMEOUT_MS;
  }

  get socket(): string {
    if (this.config.transport === 'uds') {
      return this.config.socketPath ?? '/run/membrane/nestgate.sock';
    }
    return `${this.config.host ?? '127.0.0.1'}:${String(this.config.port ?? 8080)}`;
  }

  get transport(): 'tcp' | 'uds' {
    return this.config.transport;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.healthCheck();
      return true;
    } catch {
      return false;
    }
  }

  async healthCheck(): Promise<unknown> {
    return this.call('health.check', {});
  }

  async contentPut(params: ContentPutParams): Promise<ContentPutResult> {
    return this.call<ContentPutResult>('content.put', {
      family: params.family,
      content_base64: params.content_base64,
    });
  }

  async contentGet(params: ContentGetParams): Promise<ContentGetResult> {
    return this.call<ContentGetResult>('content.get', {
      family: params.family,
      hash: params.hash,
    });
  }

  async contentList(params: ContentListParams): Promise<ContentListResult> {
    return this.call<ContentListResult>('content.list', { family: params.family });
  }

  async call<T = unknown>(method: string, params: Record<string, unknown>): Promise<T> {
    const id = nextRequestId++;
    const request = { jsonrpc: '2.0' as const, id, method, params };
    const line = `${JSON.stringify(request)}\n`;

    const responseLine = await this.exchange(line);
    const parsed = JSON.parse(responseLine) as JsonRpcResponse<T>;

    if (parsed.error) {
      throw new NeuralApiRpcError(parsed.error);
    }

    if (parsed.result === undefined) {
      throw new NeuralApiRpcError({ code: -32603, message: 'Missing result in JSON-RPC response' });
    }

    return parsed.result;
  }

  private exchange(requestLine: string): Promise<string> {
    return new Promise((resolve, reject) => {
      let socket: Socket;

      if (this.config.transport === 'uds') {
        socket = connect(this.config.socketPath ?? '/run/membrane/nestgate.sock');
      } else {
        socket = connect({
          host: this.config.host ?? '127.0.0.1',
          port: this.config.port ?? 8080,
        });
      }

      let responseData = '';
      let settled = false;

      const finish = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        fn();
      };

      socket.setTimeout(this.timeoutMs);

      socket.on('connect', () => {
        const lineBuffer = Buffer.from(requestLine, 'utf8');
        const payload =
          this.config.transport === 'uds' ? Buffer.concat([RIBOCIPHER_CLEAR_JSONRPC, lineBuffer]) : lineBuffer;
        socket.write(payload, (writeErr) => {
          if (writeErr) {
            finish(() => {
              socket.destroy();
              reject(new NeuralApiUnavailableError('Neural API write failed', writeErr));
            });
          }
        });
      });

      socket.on('data', (chunk: Buffer) => {
        responseData += chunk.toString('utf8');
        const newlineIndex = responseData.indexOf('\n');
        if (newlineIndex >= 0) {
          const line = responseData.slice(0, newlineIndex).trim();
          finish(() => {
            socket.end();
            if (line.length === 0) {
              reject(new NeuralApiRpcError({ code: -32603, message: 'Empty response from Neural API' }));
              return;
            }
            resolve(line);
          });
        }
      });

      socket.on('timeout', () => {
        finish(() => {
          socket.destroy();
          reject(new NeuralApiUnavailableError('Neural API request timed out'));
        });
      });

      socket.on('error', (err: NodeJS.ErrnoException) => {
        finish(() => {
          reject(new NeuralApiUnavailableError(`Neural API socket error: ${err.message}`, err));
        });
      });

      socket.on('end', () => {
        finish(() => {
          if (responseData.trim().length > 0 && !responseData.includes('\n')) {
            resolve(responseData.trim());
          }
        });
      });
    });
  }
}

/**
 * Create a client for CAS operations.
 *
 * Resolution order:
 * 1. NESTGATE_RPC_URL env (e.g. "tcp://127.0.0.1:8080") — explicit TCP endpoint
 * 2. NESTGATE_RPC_PORT env → TCP localhost on that port
 * 3. MEMBRANE_SOCKET env → UDS path (requires BTSP on production NUCLEUS)
 * 4. Default: TCP localhost:8080 (same-gate local-trust, no BTSP needed)
 *
 * TCP is preferred for same-gate services because BTSP is enforced on UDS
 * when FAMILY_ID is set. TCP on loopback provides process-level local-trust.
 */
export function createNeuralApiClient(socketPath?: string): NeuralApiClient {
  if (socketPath) {
    return new NeuralApiClient({ transport: 'uds', socketPath });
  }

  const rpcUrl = process.env['NESTGATE_RPC_URL'];
  if (rpcUrl) {
    const url = new URL(rpcUrl);
    if (url.protocol === 'unix:' || url.protocol === 'uds:') {
      return new NeuralApiClient({ transport: 'uds', socketPath: url.pathname });
    }
    return new NeuralApiClient({
      transport: 'tcp',
      host: url.hostname || '127.0.0.1',
      port: Number(url.port) || 8080,
    });
  }

  const rpcPort = process.env['NESTGATE_RPC_PORT'];
  if (rpcPort) {
    return new NeuralApiClient({ transport: 'tcp', port: Number(rpcPort) });
  }

  const membraneSocket = process.env['MEMBRANE_SOCKET'];
  if (membraneSocket) {
    return new NeuralApiClient({ transport: 'uds', socketPath: membraneSocket });
  }

  return new NeuralApiClient({ transport: 'tcp', port: 8080 });
}

export function isNeuralApiUnavailable(err: unknown): boolean {
  return err instanceof NeuralApiUnavailableError;
}
