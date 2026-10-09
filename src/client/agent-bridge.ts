// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Client-side WebSocket bridge for the agent system.
 *
 * Connects to the Express server's WebSocket endpoint, syncs
 * entity store state, executes incoming commands from the AI agent,
 * and routes messages between the agent panel and server.
 */

import { store } from '../core/store.js';
import type { StoreEvent } from '../core/store.js';
import type { Entity, SerializedEntity } from '../core/entity.js';
import { createEntity, entityIdFrom, ENTITY_KINDS, isValidComponentValue } from '../core/entity.js';
import { execute, undo, redo } from '../core/history.js';
import {
  AddEntityCommand,
  RemoveEntityCommand,
  UpdateComponentCommand,
  MoveGeometryCommand,
} from '../core/commands.js';
import type {
  AgentTextMessage,
  AgentActionMessage,
  CommandPayload,
  DeltaEvent,
  JsonRpcFrame,
  JsonRpcRequest,
} from '../agent/protocol.js';
import {
  AGENT_COMMAND_ERROR,
  AGENT_METHODS,
  JSONRPC_INVALID_PARAMS,
  JSONRPC_METHOD_NOT_FOUND,
  isJsonRpcNotification,
  isJsonRpcRequest,
  jsonRpcError,
  jsonRpcNotify,
  jsonRpcSuccess,
  parseAgentActionParams,
  parseAgentMessageParams,
  parseJsonRpcFrame,
  parseProjectCommandParams,
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
      const raw: unknown = JSON.parse(String(event.data));
      const frame = parseJsonRpcFrame(raw);
      if (!frame) {
        console.error('[agent-bridge] Invalid JSON-RPC frame from server');
        return;
      }
      handleServerFrame(frame);
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

function sendFrame(frame: JsonRpcFrame | ReturnType<typeof jsonRpcNotify>): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(frame));
  }
}

// ── Outbound: store --> server ──────────────────────────────────

function sendFullSync(): void {
  const entities = store.serialize();
  sendFrame(jsonRpcNotify(AGENT_METHODS.PROJECT_SYNC, { entities }));
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

  sendFrame(jsonRpcNotify(AGENT_METHODS.PROJECT_DELTA, { event: deltaEvent, entity }));
}

// ── Inbound: server --> store ───────────────────────────────────

function handleServerFrame(frame: JsonRpcFrame): void {
  if (isJsonRpcRequest(frame)) {
    handleServerRequest(frame);
    return;
  }

  if (isJsonRpcNotification(frame)) {
    switch (frame.method) {
      case AGENT_METHODS.AGENT_MESSAGE: {
        const params = parseAgentMessageParams(frame.params);
        if (params) {
          panelCallback?.({ type: 'agent-message', text: params.text, timestamp: params.timestamp });
        }
        break;
      }
      case AGENT_METHODS.AGENT_ACTION: {
        const params = parseAgentActionParams(frame.params);
        if (params) {
          panelCallback?.({
            type: 'agent-action',
            description: params.description,
            entityId: params.entityId,
            timestamp: params.timestamp,
          });
        }
        break;
      }
      default:
        break;
    }
  }
}

function handleServerRequest(req: JsonRpcRequest): void {
  if (req.method !== AGENT_METHODS.PROJECT_COMMAND) {
    sendFrame(jsonRpcError(req.id, JSONRPC_METHOD_NOT_FOUND, `Method not found: ${req.method}`));
    return;
  }

  const params = parseProjectCommandParams(req.params);
  if (!params) {
    sendFrame(jsonRpcError(req.id, JSONRPC_INVALID_PARAMS, 'Invalid project.command params'));
    return;
  }

  handleProjectCommand(req.id, params.payload);
}

function handleProjectCommand(id: number, payload: CommandPayload): void {
  try {
    suppressSync = true;
    let resultData: unknown;

    switch (payload.action) {
      case 'add-entity': {
        if (!payload.kind || !ENTITY_KINDS.includes(payload.kind)) {
          throw new Error(`Invalid entity kind: ${payload.kind}`);
        }
        const kind = payload.kind;
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
        const key = payload.componentKey;
        if (!isValidComponentValue(key, payload.value)) {
          throw new Error(`Invalid value for component "${key}"`);
        }
        execute(new UpdateComponentCommand(eid, key, payload.value));
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
      default: {
        const _exhaustive: never = payload;
        throw new Error(`Unknown command action: ${(_exhaustive as { action: string }).action}`);
      }
    }

    suppressSync = false;
    sendFullSync();
    sendFrame(jsonRpcSuccess(id, { ok: true, data: resultData }));
  } catch (err: unknown) {
    suppressSync = false;
    const message = err instanceof Error ? err.message : 'Unknown error';
    sendFrame(jsonRpcError(id, AGENT_COMMAND_ERROR, message));
  }
}
