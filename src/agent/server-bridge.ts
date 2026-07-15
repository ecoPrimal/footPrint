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
import type {
  AgentWireMessage,
  StateSyncMessage,
  StateDeltaMessage,
  CommandPayload,
  CommandResultMessage,
  UserMessage,
  AgentTextMessage,
  AgentActionMessage,
} from './protocol.js';
import type { SerializedEntity } from '../core/entity.js';
import { AGENT_COMMAND_TIMEOUT_MS } from '../constants.js';

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
const agentMessages: QueuedMessage[] = [];

export function getUserMessages(flush: boolean): readonly QueuedMessage[] {
  const copy = [...userMessages];
  if (flush) userMessages.length = 0;
  return copy;
}

// ── Command forwarding ─────────────────────────────────────────

type PendingResolve = (result: CommandResultMessage) => void;
const pendingCommands = new Map<string, PendingResolve>();
let commandSeq = 0;

function nextCommandId(): string {
  return `cmd_${String(++commandSeq)}_${Date.now()}`;
}

// ── WebSocket server ────────────────────────────────────────────

let wss: WebSocketServer | null = null;
let activeClient: WebSocket | null = null;

export function initAgentBridge(httpServer: HttpServer): void {
  wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    activeClient = ws;
    browserConnected = true;
    console.log('[agent-bridge] Browser connected');

    ws.on('message', (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString()) as AgentWireMessage;
        handleBrowserMessage(msg);
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

function handleBrowserMessage(msg: AgentWireMessage): void {
  switch (msg.type) {
    case 'state-sync':
      handleStateSync(msg);
      break;
    case 'state-delta':
      handleStateDelta(msg);
      break;
    case 'command-result':
      handleCommandResult(msg);
      break;
    case 'user-message':
      handleUserMessage(msg);
      break;
    default:
      break;
  }
}

function handleStateSync(msg: StateSyncMessage): void {
  shadowEntities = [...msg.entities];
}

function handleStateDelta(msg: StateDeltaMessage): void {
  const { event, entity } = msg;
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
        shadowEntities = shadowEntities.map((e) => e.id === event.entityId ? entity : e);
      }
      break;
  }
}

function handleCommandResult(msg: CommandResultMessage): void {
  const resolve = pendingCommands.get(msg.id);
  if (resolve) {
    pendingCommands.delete(msg.id);
    resolve(msg);
  }
}

function handleUserMessage(msg: UserMessage): void {
  userMessages.push({ text: msg.text, timestamp: msg.timestamp });
}

// ── Public API for REST layer ───────────────────────────────────

export async function sendCommand(payload: CommandPayload): Promise<CommandResultMessage> {
  if (!activeClient || activeClient.readyState !== WebSocket.OPEN) {
    return { type: 'command-result', id: '', ok: false, error: 'No browser connected' };
  }

  const id = nextCommandId();

  return new Promise<CommandResultMessage>((resolve) => {
    const timer = setTimeout(() => {
      pendingCommands.delete(id);
      resolve({ type: 'command-result', id, ok: false, error: 'Command timed out' });
    }, AGENT_COMMAND_TIMEOUT_MS);

    pendingCommands.set(id, (result) => {
      clearTimeout(timer);
      resolve(result);
    });

    const wireMsg: AgentWireMessage = { type: 'command', id, payload };
    activeClient!.send(JSON.stringify(wireMsg));
  });
}

export function sendAgentMessage(text: string): boolean {
  const msg: AgentTextMessage = {
    type: 'agent-message',
    text,
    timestamp: Date.now(),
  };
  agentMessages.push({ text, timestamp: msg.timestamp });

  if (activeClient && activeClient.readyState === WebSocket.OPEN) {
    activeClient.send(JSON.stringify(msg));
    return true;
  }
  return false;
}

export function sendAgentAction(description: string, entityId?: string): boolean {
  const msg: AgentActionMessage = {
    type: 'agent-action',
    description,
    entityId,
    timestamp: Date.now(),
  };

  if (activeClient && activeClient.readyState === WebSocket.OPEN) {
    activeClient.send(JSON.stringify(msg));
    return true;
  }
  return false;
}
