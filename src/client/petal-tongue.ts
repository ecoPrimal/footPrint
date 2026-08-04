// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * petalTongue WebSocket JSON-RPC client.
 *
 * Connects to petalTongue's /ws bridge (proxied via Caddy from
 * footprint.primals.eco/ws → petalTongue:8080/ws) and exposes
 * JSON-RPC methods for AI agent real-time communication.
 *
 * JSON-RPC 2.0 protocol over WebSocket:
 *   Request:  { jsonrpc: "2.0", method, params, id }
 *   Response: { jsonrpc: "2.0", result | error, id }
 *   Notification: { jsonrpc: "2.0", method, params } (no id)
 */

import { petalTongueWsUrl } from './api.js';
import { AGENT_RECONNECT_MS, AGENT_RECONNECT_MAX_MS, RPC_TIMEOUT_MS } from '../constants.js';

// ── Types ────────────────────────────────────────────

interface JsonRpcRequest {
  readonly jsonrpc: '2.0';
  readonly method: string;
  readonly params?: unknown;
  readonly id: number;
}

interface JsonRpcResponse {
  readonly jsonrpc: '2.0';
  readonly id: number;
  readonly result?: unknown;
  readonly error?: JsonRpcError;
}

interface JsonRpcNotification {
  readonly jsonrpc: '2.0';
  readonly method: string;
  readonly params?: unknown;
}

interface JsonRpcError {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

interface PendingCall {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export type NotificationHandler = (method: string, params: unknown) => void;

// ── State ────────────────────────────────────────────

let ws: WebSocket | null = null;
let connected = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = AGENT_RECONNECT_MS;
let callId = 0;
const pendingCalls = new Map<number, PendingCall>();
let notificationHandler: NotificationHandler | null = null;
let statusCallback: ((connected: boolean) => void) | null = null;

// ── Public API ───────────────────────────────────────

export function initPetalTongue(
  onNotification?: NotificationHandler,
  onStatusChange?: (connected: boolean) => void,
): void {
  notificationHandler = onNotification ?? null;
  statusCallback = onStatusChange ?? null;
  connect();
}

export function isPetalTongueConnected(): boolean {
  return connected;
}

/**
 * Call a JSON-RPC method on petalTongue and await the response.
 * Rejects if disconnected, timed out, or the server returns an error.
 */
export function rpcCall<T = unknown>(method: string, params?: unknown): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (ws?.readyState !== WebSocket.OPEN) {
      reject(new Error('RPC bridge not connected'));
      return;
    }

    const id = ++callId;
    const timer = setTimeout(() => {
      pendingCalls.delete(id);
      reject(new Error(`RPC timeout: ${method}`));
    }, RPC_TIMEOUT_MS);

    pendingCalls.set(id, {
      resolve: resolve as (v: unknown) => void,
      reject,
      timer,
    });

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id,
    };
    ws.send(JSON.stringify(request));
  });
}

/**
 * Send a fire-and-forget notification (no response expected).
 */
export function rpcNotify(method: string, params?: unknown): void {
  if (ws?.readyState !== WebSocket.OPEN) return;
  const msg = JSON.stringify({ jsonrpc: '2.0', method, params });
  ws.send(msg);
}

// ── petalTongue JSON-RPC method wrappers ─────────────

export function agentQuery(prompt: string, context?: unknown): Promise<unknown> {
  return rpcCall('agent.query', { prompt, context });
}

export function agentStream(prompt: string, context?: unknown): Promise<unknown> {
  return rpcCall('agent.stream', { prompt, context });
}

export function agentCancel(requestId?: number): Promise<unknown> {
  return rpcCall('agent.cancel', { requestId });
}

export function agentStatus(): Promise<unknown> {
  return rpcCall('agent.status');
}

export function agentCapabilities(): Promise<unknown> {
  return rpcCall('agent.capabilities');
}

export function bridgeHealth(): Promise<unknown> {
  return rpcCall('bridge.health');
}

export function bridgeSubscribe(topic: string): Promise<unknown> {
  return rpcCall('bridge.subscribe', { topic });
}

// ── Connection management ────────────────────────────

function connect(): void {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return;
  }

  ws = new WebSocket(petalTongueWsUrl());

  ws.addEventListener('open', () => {
    connected = true;
    reconnectDelay = AGENT_RECONNECT_MS;
    statusCallback?.(true);
  });

  ws.addEventListener('message', (event: MessageEvent) => {
    try {
      const raw: unknown = JSON.parse(String(event.data));
      if (!isRecord(raw) || raw['jsonrpc'] !== '2.0') return;

      if ('id' in raw && typeof raw['id'] === 'number') {
        handleResponse(raw as unknown as JsonRpcResponse);
      } else if ('method' in raw && typeof raw['method'] === 'string') {
        handleNotification(raw as unknown as JsonRpcNotification);
      }
    } catch {
      // Silently ignore malformed frames
    }
  });

  ws.addEventListener('close', () => {
    connected = false;
    statusCallback?.(false);
    rejectAllPending('Connection closed');
    scheduleReconnect();
  });

  ws.addEventListener('error', () => {
    ws?.close();
  });
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectDelay = Math.min(reconnectDelay * 2, AGENT_RECONNECT_MAX_MS);
    connect();
  }, reconnectDelay);
}

function handleResponse(resp: JsonRpcResponse): void {
  const pending = pendingCalls.get(resp.id);
  if (!pending) return;
  pendingCalls.delete(resp.id);
  clearTimeout(pending.timer);

  if (resp.error) {
    pending.reject(new Error(`RPC error ${String(resp.error.code)}: ${resp.error.message}`));
  } else {
    pending.resolve(resp.result);
  }
}

function handleNotification(notif: JsonRpcNotification): void {
  notificationHandler?.(notif.method, notif.params);
}

function rejectAllPending(reason: string): void {
  for (const [id, pending] of pendingCalls) {
    clearTimeout(pending.timer);
    pending.reject(new Error(reason));
    pendingCalls.delete(id);
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** @internal Reset module state — for tests only. */
export function resetPetalTongueForTests(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
  connected = false;
  reconnectDelay = AGENT_RECONNECT_MS;
  callId = 0;
  pendingCalls.clear();
  notificationHandler = null;
  statusCallback = null;
}
