// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Server-side WebSocket bridge.
 *
 * Responsibilities:
 * - Maintain a shadow copy of the browser's entity store (serialized JSON)
 * - Forward agent commands from the REST API to the connected browser client
 * - Queue messages between AI agent and browser user
 * - Track connection status
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'node:http';
import type { CommandPayload, CommandResultMessage, JsonRpcResponse, ProjectDeltaParams } from './protocol.js';
import {
  AGENT_METHODS,
  JSONRPC_METHOD_NOT_FOUND,
  commandResultFromResponse,
  isAgentMethod,
  isJsonRpcNotification,
  isJsonRpcRequest,
  isJsonRpcResponse,
  jsonRpcError,
  jsonRpcRequest,
  jsonRpcSuccess,
  parseAgentQueryParams,
  parseJsonRpcFrame,
  parseProjectDeltaParams,
  parseProjectSyncParams,
} from './protocol.js';
import type { SerializedEntity } from '../core/entity.js';
import { AGENT_COMMAND_TIMEOUT_MS, AGENT_BRIDGE_PATH } from '../constants.js';

// ── Shadow state ────────────────────────────────────────────────

let shadowEntities: SerializedEntity[] = [];
let browserConnected = false;

export function getShadowState(): readonly SerializedEntity[] {
  return shadowEntities;
}

export function isBrowserConnected(): boolean {
  return browserConnected;
}

// ── Message queues ──────────────────────────────────────────────

interface QueuedMessage {
  readonly text: string;
  readonly timestamp: number;
}

const userMessages: QueuedMessage[] = [];

export function getUserMessages(flush: boolean): readonly QueuedMessage[] {
  const copy = [...userMessages];
  if (flush) userMessages.length = 0;
  return copy;
}

// ── Command forwarding ─────────────────────────────────────────

type PendingResolve = (result: CommandResultMessage) => void;
const pendingCommands = new Map<number, PendingResolve>();
let commandSeq = 0;

function nextCommandId(): number {
  return ++commandSeq;
}

// ── WebSocket server ────────────────────────────────────────────

let wss: WebSocketServer | null = null;
let activeClient: WebSocket | null = null;

function sendFrame(ws: WebSocket, frame: unknown): void {
  ws.send(JSON.stringify(frame));
}

export function initAgentBridge(httpServer: HttpServer): void {
  wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`).pathname;
    if (pathname !== AGENT_BRIDGE_PATH) return;
    wss?.handleUpgrade(req, socket, head, (ws) => {
      wss?.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws: WebSocket) => {
    activeClient = ws;
    browserConnected = true;
    console.log('[agent-bridge] Browser connected');

    ws.on('message', (raw: Buffer | string) => {
      try {
        const parsed: unknown = JSON.parse(typeof raw === 'string' ? raw : raw.toString());
        const frame = parseJsonRpcFrame(parsed);
        if (!frame) {
          console.error('[agent-bridge] Invalid JSON-RPC frame from browser');
          return;
        }
        handleBrowserFrame(ws, frame);
      } catch {
        console.error('[agent-bridge] Failed to parse message from browser');
      }
    });

    ws.on('close', () => {
      if (activeClient === ws) {
        activeClient = null;
        browserConnected = false;
        console.log('[agent-bridge] Browser disconnected');
      }
    });

    ws.on('error', (err: Error) => {
      console.error('[agent-bridge] WebSocket error:', err.message);
    });
  });
}

function handleBrowserFrame(ws: WebSocket, frame: ReturnType<typeof parseJsonRpcFrame>): void {
  if (!frame) return;

  if (isJsonRpcResponse(frame)) {
    handleCommandResponse(frame);
    return;
  }

  if (isJsonRpcRequest(frame)) {
    handleBrowserRequest(ws, frame);
    return;
  }

  if (isJsonRpcNotification(frame)) {
    handleBrowserNotification(frame);
  }
}

function handleBrowserRequest(ws: WebSocket, req: { method: string; params?: unknown; id: number }): void {
  if (req.method === AGENT_METHODS.BRIDGE_HEALTH) {
    sendFrame(
      ws,
      jsonRpcSuccess(req.id, {
        connected: browserConnected,
        entityCount: shadowEntities.length,
        timestamp: Date.now(),
      }),
    );
    return;
  }

  if (req.method === AGENT_METHODS.AGENT_CANCEL) {
    sendFrame(ws, jsonRpcSuccess(req.id, { cancelled: true }));
    return;
  }

  if (!isAgentMethod(req.method)) {
    sendFrame(ws, jsonRpcError(req.id, JSONRPC_METHOD_NOT_FOUND, `Method not found: ${req.method}`));
    return;
  }

  sendFrame(ws, jsonRpcError(req.id, JSONRPC_METHOD_NOT_FOUND, `Method not supported on server: ${req.method}`));
}

function handleBrowserNotification(notif: { method: string; params?: unknown }): void {
  switch (notif.method) {
    case AGENT_METHODS.PROJECT_SYNC: {
      const params = parseProjectSyncParams(notif.params);
      if (params) shadowEntities = [...params.entities];
      break;
    }
    case AGENT_METHODS.PROJECT_DELTA: {
      const params = parseProjectDeltaParams(notif.params);
      if (params) applyStateDelta(params);
      break;
    }
    case AGENT_METHODS.AGENT_QUERY: {
      const params = parseAgentQueryParams(notif.params);
      if (params) userMessages.push({ text: params.text, timestamp: params.timestamp });
      break;
    }
    default:
      break;
  }
}

function applyStateDelta(params: ProjectDeltaParams): void {
  const { event, entity } = params;
  switch (event.kind) {
    case 'add':
      if (entity) {
        shadowEntities = shadowEntities.filter((e) => e.id !== event.entityId);
        shadowEntities.push(entity);
      }
      break;
    case 'remove':
      shadowEntities = shadowEntities.filter((e) => e.id !== event.entityId);
      break;
    case 'update':
      if (entity) {
        shadowEntities = shadowEntities.map((e) => (e.id === event.entityId ? entity : e));
      }
      break;
  }
}

function handleCommandResponse(response: JsonRpcResponse): void {
  const resolve = pendingCommands.get(response.id);
  if (resolve) {
    pendingCommands.delete(response.id);
    resolve(commandResultFromResponse(response.id, response));
  }
}

// ── Public API for REST layer ───────────────────────────────────

export async function sendCommand(payload: CommandPayload): Promise<CommandResultMessage> {
  if (activeClient?.readyState !== WebSocket.OPEN) {
    return { id: '', ok: false, error: 'No browser connected' };
  }

  const client = activeClient;
  const id = nextCommandId();

  return new Promise<CommandResultMessage>((resolve) => {
    const timer = setTimeout(() => {
      pendingCommands.delete(id);
      resolve({ id: String(id), ok: false, error: 'Command timed out' });
    }, AGENT_COMMAND_TIMEOUT_MS);

    pendingCommands.set(id, (result) => {
      clearTimeout(timer);
      resolve(result);
    });

    sendFrame(client, jsonRpcRequest(AGENT_METHODS.PROJECT_COMMAND, { payload }, id));
  });
}

export function sendAgentMessage(text: string): boolean {
  const timestamp = Date.now();

  if (activeClient?.readyState === WebSocket.OPEN) {
    sendFrame(activeClient, {
      jsonrpc: '2.0',
      method: AGENT_METHODS.AGENT_MESSAGE,
      params: { text, timestamp },
    });
    return true;
  }
  return false;
}

export function sendAgentAction(description: string, entityId?: string): boolean {
  const timestamp = Date.now();

  if (activeClient?.readyState === WebSocket.OPEN) {
    sendFrame(activeClient, {
      jsonrpc: '2.0',
      method: AGENT_METHODS.AGENT_ACTION,
      params: { description, entityId, timestamp },
    });
    return true;
  }
  return false;
}

/** @internal Reset module state — for tests only. */
export function resetAgentBridgeForTests(): void {
  shadowEntities = [];
  browserConnected = false;
  userMessages.length = 0;
  pendingCommands.clear();
  commandSeq = 0;
  if (activeClient) {
    activeClient.close();
    activeClient = null;
  }
  if (wss) {
    wss.close();
    wss = null;
  }
}
