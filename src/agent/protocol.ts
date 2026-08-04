// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Agent bridge protocol — JSON-RPC 2.0 over WebSocket.
 *
 * Semantic method names follow domain.verb (wateringHole SEMANTIC_METHOD_NAMING_STANDARD v2.0):
 *   project.sync     notification  browser → server  full entity snapshot
 *   project.delta    notification  browser → server  incremental store change
 *   project.command  request       server → browser  execute a store command
 *   agent.message    notification  server → browser  agent text to user
 *   agent.action     notification  server → browser  agent action description
 *   agent.query      notification  browser → server  user text to agent queue
 *   agent.cancel     request       bidirectional     cancel in-flight agent work
 *   bridge.health    request       bidirectional     connection / bridge status
 */

import type { EntityKind, ComponentKey, ComponentMap, SerializedEntity } from '../core/entity.js';
import { ENTITY_KINDS } from '../core/entity.js';

// ── JSON-RPC 2.0 wire types ─────────────────────────────────────

export interface JsonRpcRequest {
  readonly jsonrpc: '2.0';
  readonly method: string;
  readonly params?: unknown;
  readonly id: number;
}

export interface JsonRpcResponse {
  readonly jsonrpc: '2.0';
  readonly id: number;
  readonly result?: unknown;
  readonly error?: JsonRpcError;
}

export interface JsonRpcNotification {
  readonly jsonrpc: '2.0';
  readonly method: string;
  readonly params?: unknown;
}

export interface JsonRpcError {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

export type JsonRpcFrame = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

/** Standard JSON-RPC 2.0 error codes. */
export const JSONRPC_PARSE_ERROR = -32700;
export const JSONRPC_INVALID_REQUEST = -32600;
export const JSONRPC_METHOD_NOT_FOUND = -32601;
export const JSONRPC_INVALID_PARAMS = -32602;
export const JSONRPC_INTERNAL_ERROR = -32603;

/** Application-specific error code for command execution failures. */
export const AGENT_COMMAND_ERROR = -32000;

// ── Semantic method names ─────────────────────────────────────────

export const AGENT_METHODS = {
  PROJECT_SYNC: 'project.sync',
  PROJECT_DELTA: 'project.delta',
  PROJECT_COMMAND: 'project.command',
  AGENT_MESSAGE: 'agent.message',
  AGENT_ACTION: 'agent.action',
  AGENT_QUERY: 'agent.query',
  AGENT_CANCEL: 'agent.cancel',
  BRIDGE_HEALTH: 'bridge.health',
} as const;

export type AgentMethod = (typeof AGENT_METHODS)[keyof typeof AGENT_METHODS];

const AGENT_METHOD_SET: ReadonlySet<string> = new Set(Object.values(AGENT_METHODS));

// ── Domain params / results ───────────────────────────────────────

export interface ProjectSyncParams {
  readonly entities: readonly SerializedEntity[];
}

export interface DeltaEvent {
  readonly kind: 'add' | 'remove' | 'update';
  readonly entityId: string;
  readonly componentKey?: string | undefined;
}

export interface ProjectDeltaParams {
  readonly event: DeltaEvent;
  readonly entity?: SerializedEntity | undefined;
}

export interface ProjectCommandParams {
  readonly payload: CommandPayload;
}

export interface ProjectCommandResult {
  readonly ok: true;
  readonly data?: unknown;
}

export interface AgentMessageParams {
  readonly text: string;
  readonly timestamp: number;
}

export interface AgentActionParams {
  readonly description: string;
  readonly entityId?: string | undefined;
  readonly timestamp: number;
}

export interface AgentQueryParams {
  readonly text: string;
  readonly timestamp: number;
}

export interface AgentCancelParams {
  readonly requestId?: number | undefined;
}

export interface BridgeHealthResult {
  readonly connected: boolean;
  readonly entityCount: number;
  readonly timestamp: number;
}

/** REST-layer command result (maps from JSON-RPC success / error responses). */
export interface CommandResultMessage {
  readonly id: string;
  readonly ok: boolean;
  readonly data?: unknown;
  readonly error?: string;
}

export type CommandPayload =
  AddEntityPayload | RemoveEntityPayload | UpdateComponentPayload | MoveGeometryPayload | UndoPayload | RedoPayload;

export interface AddEntityPayload {
  readonly action: 'add-entity';
  readonly kind: EntityKind;
  readonly parentId?: string;
  readonly components?: Partial<ComponentMap>;
}

export interface RemoveEntityPayload {
  readonly action: 'remove-entity';
  readonly entityId: string;
}

export interface UpdateComponentPayload {
  readonly action: 'update-component';
  readonly entityId: string;
  readonly componentKey: ComponentKey;
  readonly value: ComponentMap[ComponentKey];
}

export interface MoveGeometryPayload {
  readonly action: 'move-geometry';
  readonly entityId: string;
  readonly deltaLng: number;
  readonly deltaLat: number;
}

export interface UndoPayload {
  readonly action: 'undo';
}

export interface RedoPayload {
  readonly action: 'redo';
}

/** UI-layer message types (panel callback, not wire format). */
export interface AgentTextMessage {
  readonly type: 'agent-message';
  readonly text: string;
  readonly timestamp: number;
}

export interface AgentActionMessage {
  readonly type: 'agent-action';
  readonly description: string;
  readonly entityId?: string | undefined;
  readonly timestamp: number;
}

// ── Frame builders ──────────────────────────────────────────────

export function jsonRpcNotify(method: AgentMethod, params?: unknown): JsonRpcNotification {
  return params === undefined ? { jsonrpc: '2.0', method } : { jsonrpc: '2.0', method, params };
}

export function jsonRpcRequest(method: AgentMethod, params: unknown, id: number): JsonRpcRequest {
  return { jsonrpc: '2.0', method, params, id };
}

export function jsonRpcSuccess(id: number, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

export function jsonRpcError(id: number, code: number, message: string, data?: unknown): JsonRpcResponse {
  const error: JsonRpcError = data === undefined ? { code, message } : { code, message, data };
  return { jsonrpc: '2.0', id, error };
}

// ── Runtime validators ────────────────────────────────────────────

const COMMAND_ACTIONS: ReadonlySet<string> = new Set([
  'add-entity',
  'remove-entity',
  'update-component',
  'move-geometry',
  'undo',
  'redo',
]);

const COMPONENT_KEY_SET: ReadonlySet<string> = new Set([
  'geometry',
  'style',
  'meta',
  'layer',
  'dimension',
  'constraint',
  'elevation',
]);

const ENTITY_KIND_SET: ReadonlySet<string> = new Set(ENTITY_KINDS);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isSerializedEntity(v: unknown): boolean {
  if (!isRecord(v)) return false;
  return typeof v['id'] === 'string' && typeof v['kind'] === 'string' && ENTITY_KIND_SET.has(v['kind']);
}

function validateProjectSyncParams(params: unknown): params is ProjectSyncParams {
  return isRecord(params) && Array.isArray(params['entities']) && params['entities'].every(isSerializedEntity);
}

function validateProjectDeltaParams(params: unknown): params is ProjectDeltaParams {
  if (!isRecord(params) || !isRecord(params['event'])) return false;
  const ev = params['event'];
  if (typeof ev['entityId'] !== 'string') return false;
  const kind = ev['kind'];
  if (kind !== 'add' && kind !== 'remove' && kind !== 'update') return false;
  if (params['entity'] !== undefined && !isSerializedEntity(params['entity'])) return false;
  return true;
}

function validateProjectCommandParams(params: unknown): params is ProjectCommandParams {
  return isRecord(params) && isRecord(params['payload']) && validateCommandPayloadFields(params['payload']);
}

function validateAgentMessageParams(params: unknown): params is AgentMessageParams {
  return isRecord(params) && typeof params['text'] === 'string' && typeof params['timestamp'] === 'number';
}

function validateAgentActionParams(params: unknown): params is AgentActionParams {
  return (
    isRecord(params) &&
    typeof params['description'] === 'string' &&
    typeof params['timestamp'] === 'number' &&
    (params['entityId'] === undefined || typeof params['entityId'] === 'string')
  );
}

function validateAgentQueryParams(params: unknown): params is AgentQueryParams {
  return isRecord(params) && typeof params['text'] === 'string' && typeof params['timestamp'] === 'number';
}

function validateAgentCancelParams(params: unknown): params is AgentCancelParams {
  if (!isRecord(params)) return false;
  const requestId = params['requestId'];
  return requestId === undefined || typeof requestId === 'number';
}

function validateCommandPayloadFields(r: Record<string, unknown>): boolean {
  const action = r['action'];
  if (typeof action !== 'string' || !COMMAND_ACTIONS.has(action)) return false;
  switch (action) {
    case 'add-entity':
      return typeof r['kind'] === 'string' && ENTITY_KIND_SET.has(r['kind']);
    case 'remove-entity':
      return typeof r['entityId'] === 'string';
    case 'update-component':
      return (
        typeof r['entityId'] === 'string' &&
        typeof r['componentKey'] === 'string' &&
        COMPONENT_KEY_SET.has(r['componentKey']) &&
        r['value'] !== undefined
      );
    case 'move-geometry':
      return (
        typeof r['entityId'] === 'string' && typeof r['deltaLng'] === 'number' && typeof r['deltaLat'] === 'number'
      );
    case 'undo':
    case 'redo':
      return true;
    default:
      return false;
  }
}

function hasValidJsonRpcVersion(raw: Record<string, unknown>): boolean {
  return raw['jsonrpc'] === '2.0';
}

/**
 * Parse a JSON value as a JSON-RPC 2.0 frame (request, response, or notification).
 * Validates envelope shape only — use method-specific validators for params.
 */
export function parseJsonRpcFrame(raw: unknown): JsonRpcFrame | null {
  if (!isRecord(raw) || !hasValidJsonRpcVersion(raw)) return null;

  const hasId = 'id' in raw && typeof raw['id'] === 'number';
  const hasMethod = 'method' in raw && typeof raw['method'] === 'string';
  const hasResult = 'result' in raw;
  const hasError = 'error' in raw;

  if (hasId && hasMethod && !hasResult && !hasError) {
    return raw as unknown as JsonRpcRequest;
  }

  if (hasId && (hasResult || hasError) && !hasMethod) {
    if (hasError) {
      const err = raw['error'];
      if (!isRecord(err) || typeof err['code'] !== 'number' || typeof err['message'] !== 'string') return null;
    }
    return raw as unknown as JsonRpcResponse;
  }

  if (hasMethod && !hasId && !hasResult && !hasError) {
    return raw as unknown as JsonRpcNotification;
  }

  return null;
}

export function isJsonRpcRequest(frame: JsonRpcFrame): frame is JsonRpcRequest {
  return 'id' in frame && 'method' in frame && !('result' in frame) && !('error' in frame);
}

export function isJsonRpcResponse(frame: JsonRpcFrame): frame is JsonRpcResponse {
  return 'id' in frame && !('method' in frame) && ('result' in frame || 'error' in frame);
}

export function isJsonRpcNotification(frame: JsonRpcFrame): frame is JsonRpcNotification {
  return 'method' in frame && !('id' in frame) && !('result' in frame) && !('error' in frame);
}

export function isAgentMethod(method: string): method is AgentMethod {
  return AGENT_METHOD_SET.has(method);
}

export function parseProjectSyncParams(params: unknown): ProjectSyncParams | null {
  return validateProjectSyncParams(params) ? params : null;
}

export function parseProjectDeltaParams(params: unknown): ProjectDeltaParams | null {
  return validateProjectDeltaParams(params) ? params : null;
}

export function parseProjectCommandParams(params: unknown): ProjectCommandParams | null {
  return validateProjectCommandParams(params) ? params : null;
}

export function parseAgentMessageParams(params: unknown): AgentMessageParams | null {
  return validateAgentMessageParams(params) ? params : null;
}

export function parseAgentActionParams(params: unknown): AgentActionParams | null {
  return validateAgentActionParams(params) ? params : null;
}

export function parseAgentQueryParams(params: unknown): AgentQueryParams | null {
  return validateAgentQueryParams(params) ? params : null;
}

export function parseAgentCancelParams(params: unknown): AgentCancelParams | null {
  return validateAgentCancelParams(params) ? params : null;
}

/**
 * Validate a command payload has a known action with required fields.
 * Returns the same object identity on success, null on invalid shape.
 */
export function parseCommandPayload(raw: unknown): CommandPayload | null {
  if (!isRecord(raw)) return null;
  if (!validateCommandPayloadFields(raw)) return null;
  return raw as unknown as CommandPayload;
}

export function isValidCommandAction(action: string): boolean {
  return COMMAND_ACTIONS.has(action);
}

/**
 * Map a JSON-RPC response to the REST-layer CommandResultMessage shape.
 */
export function commandResultFromResponse(id: number, response: JsonRpcResponse): CommandResultMessage {
  const idStr = String(id);
  if (response.error) {
    return { id: idStr, ok: false, error: response.error.message };
  }
  return { id: idStr, ok: true, data: response.result };
}
