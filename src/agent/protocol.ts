/**
 * Agent protocol -- shared types for WebSocket communication
 * between the FootPrint browser client and the Express server.
 *
 * These types define every message that can flow across the wire.
 * Both sides import from this single source of truth.
 */

import type { EntityKind, ComponentKey, ComponentMap, SerializedEntity } from '../core/entity.js';

// ── Store events (browser --> server) ───────────────────────────

export interface StateSyncMessage {
  readonly type: 'state-sync';
  readonly entities: readonly SerializedEntity[];
}

export interface StateDeltaMessage {
  readonly type: 'state-delta';
  readonly event: DeltaEvent;
  readonly entity?: SerializedEntity | undefined;
}

export interface DeltaEvent {
  readonly kind: 'add' | 'remove' | 'update';
  readonly entityId: string;
  readonly componentKey?: string | undefined;
}

// ── Commands (server --> browser) ───────────────────────────────

export interface CommandMessage {
  readonly type: 'command';
  readonly id: string;
  readonly payload: CommandPayload;
}

export interface CommandResultMessage {
  readonly type: 'command-result';
  readonly id: string;
  readonly ok: boolean;
  readonly data?: unknown;
  readonly error?: string;
}

export type CommandPayload =
  | AddEntityPayload
  | RemoveEntityPayload
  | UpdateComponentPayload
  | MoveGeometryPayload
  | UndoPayload
  | RedoPayload;

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

// ── Messaging (bidirectional) ───────────────────────────────────

export interface UserMessage {
  readonly type: 'user-message';
  readonly text: string;
  readonly timestamp: number;
}

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

// ── Union of all wire messages ──────────────────────────────────

export type AgentWireMessage =
  | StateSyncMessage
  | StateDeltaMessage
  | CommandMessage
  | CommandResultMessage
  | UserMessage
  | AgentTextMessage
  | AgentActionMessage;

// ── Runtime validators ──────────────────────────────────────────

const WIRE_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  'state-sync', 'state-delta', 'command', 'command-result',
  'user-message', 'agent-message', 'agent-action',
]);

const COMMAND_ACTIONS: ReadonlySet<string> = new Set([
  'add-entity', 'remove-entity', 'update-component',
  'move-geometry', 'undo', 'redo',
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate a parsed JSON value as an AgentWireMessage.
 * Returns null if the shape is invalid (missing `type` or unknown discriminant).
 */
export function parseWireMessage(raw: unknown): AgentWireMessage | null {
  if (!isRecord(raw)) return null;
  if (typeof raw['type'] !== 'string') return null;
  if (!WIRE_MESSAGE_TYPES.has(raw['type'])) return null;
  return raw as unknown as AgentWireMessage;
}

/**
 * Validate a command payload has a known action.
 * Returns null if `action` is missing or not one of the defined actions.
 */
export function parseCommandPayload(raw: unknown): CommandPayload | null {
  if (!isRecord(raw)) return null;
  if (typeof raw['action'] !== 'string') return null;
  if (!COMMAND_ACTIONS.has(raw['action'])) return null;
  return raw as unknown as CommandPayload;
}

export function isValidCommandAction(action: string): boolean {
  return COMMAND_ACTIONS.has(action);
}
