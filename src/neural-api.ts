// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * JSON-RPC 2.0 over Unix Domain Socket (NDJSON framing).
 * Connects to NUCLEUS membrane sockets with riboCipher transport signal.
 *
 * riboCipher prefix: [0xEC, 0x01] = cleartext JSON-RPC (per RIBOCIPHER_TRANSPORT_SIGNAL_STANDARD).
 * All NUCLEUS primals require this 2-byte prefix before JSON-RPC payload on UDS.
 */

import { connect } from 'node:net';
import { NEURAL_API_TIMEOUT_MS } from './constants.js';

const RIBOCIPHER_CLEAR_JSONRPC = Buffer.from([0xec, 0x01]);

export interface NeuralApiConfig {
  readonly socketPath: string;
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
  readonly key: string;
  readonly data: unknown;
}

export interface ContentPutResult {
  readonly hash: string;
}

export interface ContentGetParams {
  readonly family?: string;
  readonly key: string;
}

export interface ContentGetResult {
  readonly data?: unknown;
  readonly error?: string;
}

export interface ContentListParams {
  readonly family: string;
}

export interface ContentListResult {
  readonly objects: readonly unknown[];
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
  private readonly socketPath: string;
  private readonly timeoutMs: number;

  constructor(config: NeuralApiConfig) {
    this.socketPath = config.socketPath;
    this.timeoutMs = config.timeoutMs ?? NEURAL_API_TIMEOUT_MS;
  }

  get socket(): string {
    return this.socketPath;
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
      key: params.key,
      data: params.data,
    });
  }

  async contentGet(params: ContentGetParams): Promise<ContentGetResult> {
    const rpcParams: Record<string, unknown> = { key: params.key };
    if (params.family !== undefined) {
      rpcParams['family'] = params.family;
    }
    return this.call<ContentGetResult>('content.get', rpcParams);
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
      const socket = connect(this.socketPath);
      let responseData = '';
      let settled = false;

      const finish = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        fn();
      };

      socket.setTimeout(this.timeoutMs);

      socket.on('connect', () => {
        const payload = Buffer.concat([RIBOCIPHER_CLEAR_JSONRPC, Buffer.from(requestLine, 'utf8')]);
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
 * Default: MEMBRANE_SOCKET env → /run/membrane/nestgate.sock
 * (biomeOS only proxies capability.call/graph.execute; CAS goes direct to nestGate)
 */
export function createNeuralApiClient(socketPath?: string): NeuralApiClient {
  const resolvedPath = socketPath ?? process.env['MEMBRANE_SOCKET'] ?? '/run/membrane/nestgate.sock';
  return new NeuralApiClient({ socketPath: resolvedPath });
}

export function isNeuralApiUnavailable(err: unknown): boolean {
  return err instanceof NeuralApiUnavailableError;
}
