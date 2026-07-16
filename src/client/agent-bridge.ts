/**
 * Client-side WebSocket bridge for the agent system.
 *
 * Connects to the Express server's WebSocket endpoint, syncs
 * entity store state, executes incoming commands from the AI agent,
 * and routes messages between the agent panel and server.
 */

import { store } from '../core/store.js';
import type { StoreEvent } from '../core/store.js';
import type { Entity, EntityKind, ComponentKey, ComponentMap, SerializedEntity } from '../core/entity.js';
import { createEntity, entityIdFrom } from '../core/entity.js';
import { execute, undo, redo } from '../core/history.js';
import {
  AddEntityCommand,
  RemoveEntityCommand,
  UpdateComponentCommand,
  MoveGeometryCommand,
} from '../core/commands.js';
import type {
  AgentWireMessage,
  CommandMessage,
  CommandResultMessage,
  AgentTextMessage,
  AgentActionMessage,
  StateSyncMessage,
  StateDeltaMessage,
  DeltaEvent,
} from '../agent/protocol.js';
import { agentWsUrl } from './api.js';
import { AGENT_RECONNECT_MS, AGENT_RECONNECT_MAX_MS } from '../constants.js';

type AgentPanelCallback = (msg: AgentTextMessage | AgentActionMessage) => void;

let ws: WebSocket | null = null;
let panelCallback: AgentPanelCallback | null = null;
let statusCallback: ((connected: boolean) => void) | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = AGENT_RECONNECT_MS;
const MAX_RECONNECT_DELAY = AGENT_RECONNECT_MAX_MS;
let suppressSync = false;

export function initAgentBridge(
  onPanelMessage?: AgentPanelCallback,
  onStatusChange?: (connected: boolean) => void,
): void {
  panelCallback = onPanelMessage ?? null;
  statusCallback = onStatusChange ?? null;

  store.on(handleStoreEvent);
  connect();
}

function connect(): void {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return;
  }

  ws = new WebSocket(agentWsUrl());

  ws.addEventListener('open', () => {
    reconnectDelay = AGENT_RECONNECT_MS;
    statusCallback?.(true);
    sendFullSync();
  });

  ws.addEventListener('message', (event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data as string) as AgentWireMessage;
      handleServerMessage(msg);
    } catch {
      console.error('[agent-bridge] Failed to parse server message');
    }
  });

  ws.addEventListener('close', () => {
    statusCallback?.(false);
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
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
    connect();
  }, reconnectDelay);
}

function send(msg: AgentWireMessage): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// ── Outbound: store --> server ──────────────────────────────────

function sendFullSync(): void {
  const entities = store.serialize();
  const msg: StateSyncMessage = { type: 'state-sync', entities };
  send(msg);
}

function serializeEntity(entity: Entity): SerializedEntity {
  return {
    id: entity.id,
    kind: entity.kind,
    parentId: entity.parentId,
    children: [...entity.children],
    components: structuredClone(entity.components),
  };
}

function handleStoreEvent(event: StoreEvent): void {
  if (suppressSync) return;

  const deltaEvent: DeltaEvent = {
    kind: event.type,
    entityId: event.entityId,
    componentKey: event.componentKey,
  };

  let entity: SerializedEntity | undefined;
  if (event.type === 'add' || event.type === 'update') {
    const opt = store.getEntity(event.entityId);
    if (opt.some) {
      entity = serializeEntity(opt.value);
    }
  }

  const msg: StateDeltaMessage = { type: 'state-delta', event: deltaEvent, entity };
  send(msg);
}

// ── Inbound: server --> store ───────────────────────────────────

function handleServerMessage(msg: AgentWireMessage): void {
  switch (msg.type) {
    case 'command':
      handleCommand(msg);
      break;
    case 'agent-message':
    case 'agent-action':
      panelCallback?.(msg);
      break;
    default:
      break;
  }
}

function handleCommand(msg: CommandMessage): void {
  const { id, payload } = msg;
  try {
    suppressSync = true;
    let resultData: unknown;

    switch (payload.action) {
      case 'add-entity': {
        const kind = payload.kind as EntityKind;
        const parentId = payload.parentId ? entityIdFrom(payload.parentId) : null;
        const entity = createEntity(kind, parentId);
        if (payload.components) {
          Object.assign(entity.components, structuredClone(payload.components));
        }
        const cmd = new AddEntityCommand(entity);
        execute(cmd);
        resultData = { entityId: entity.id };
        break;
      }
      case 'remove-entity': {
        const eid = entityIdFrom(payload.entityId);
        execute(new RemoveEntityCommand(eid));
        resultData = { removed: payload.entityId };
        break;
      }
      case 'update-component': {
        const eid = entityIdFrom(payload.entityId);
        const key = payload.componentKey as ComponentKey;
        execute(new UpdateComponentCommand(eid, key, payload.value as ComponentMap[typeof key]));
        resultData = { updated: payload.entityId, component: key };
        break;
      }
      case 'move-geometry': {
        const eid = entityIdFrom(payload.entityId);
        execute(new MoveGeometryCommand(eid, payload.deltaLng, payload.deltaLat));
        resultData = { moved: payload.entityId };
        break;
      }
      case 'undo': {
        undo();
        resultData = { undone: true };
        break;
      }
      case 'redo': {
        redo();
        resultData = { redone: true };
        break;
      }
    }

    suppressSync = false;
    sendFullSync();

    const result: CommandResultMessage = { type: 'command-result', id, ok: true, data: resultData };
    send(result);
  } catch (err: unknown) {
    suppressSync = false;
    const message = err instanceof Error ? err.message : 'Unknown error';
    const result: CommandResultMessage = { type: 'command-result', id, ok: false, error: message };
    send(result);
  }
}

// ── Outbound: user messages ─────────────────────────────────────

export function sendUserMessage(text: string): void {
  send({ type: 'user-message', text, timestamp: Date.now() });
}

