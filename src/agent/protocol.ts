/**
 * Agent protocol -- shared types for WebSocket communication
 * between the FootPrint browser client and the Express server.
 *
 * These types define every message that can flow across the wire.
 * Both sides import from this single source of truth.
 */

import type { EntityKind, ComponentKey, ComponentMap, SerializedEntity } from '../core/entity.js';
import { ENTITY_KINDS } from '../core/entity.js';

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

const COMMAND_ACTIONS: ReadonlySet<string> = new Set([
  'add-entity', 'remove-entity', 'update-component',
  'move-geometry', 'undo', 'redo',
]);

const COMPONENT_KEY_SET: ReadonlySet<string> = new Set([
  'geometry', 'style', 'meta', 'layer', 'dimension', 'constraint', 'elevation',
]);

const ENTITY_KIND_SET: ReadonlySet<string> = new Set(ENTITY_KINDS);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isSerializedEntity(v: unknown): boolean {
  if (!isRecord(v)) return false;
  return typeof v['id'] === 'string' && typeof v['kind'] === 'string' && ENTITY_KIND_SET.has(v['kind']);
}

function validateStateSyncFields(r: Record<string, unknown>): boolean {
  return Array.isArray(r['entities']) && (r['entities'] as unknown[]).every(isSerializedEntity);
}

function validateStateDeltaFields(r: Record<string, unknown>): boolean {
  if (!isRecord(r['event'])) return false;
  const ev = r['event'];
  if (typeof ev['entityId'] !== 'string') return false;
  const kind = ev['kind'];
  return kind === 'add' || kind === 'remove' || kind === 'update';
}

function validateCommandFields(r: Record<string, unknown>): boolean {
  return typeof r['id'] === 'string' && isRecord(r['payload']) && validateCommandPayloadFields(r['payload']);
}

function validateCommandResultFields(r: Record<string, unknown>): boolean {
  return typeof r['id'] === 'string' && typeof r['ok'] === 'boolean';
}

function validateTextMessageFields(r: Record<string, unknown>): boolean {
  return typeof r['text'] === 'string' && typeof r['timestamp'] === 'number';
}

function validateAgentActionFields(r: Record<string, unknown>): boolean {
  return typeof r['description'] === 'string' && typeof r['timestamp'] === 'number';
}

const WIRE_VALIDATORS: Record<string, (r: Record<string, unknown>) => boolean> = {
  'state-sync': validateStateSyncFields,
  'state-delta': validateStateDeltaFields,
  'command': validateCommandFields,
  'command-result': validateCommandResultFields,
  'user-message': validateTextMessageFields,
  'agent-message': validateTextMessageFields,
  'agent-action': validateAgentActionFields,
};

/**
 * Validate a parsed JSON value as an AgentWireMessage.
 * Checks discriminant AND per-variant required fields.
 * Returns the same object identity on success, null on invalid shape.
 */
export function parseWireMessage(raw: unknown): AgentWireMessage | null {
  if (!isRecord(raw)) return null;
  const type = raw['type'];
  if (typeof type !== 'string') return null;
  const validator = WIRE_VALIDATORS[type];
  if (!validator || !validator(raw)) return null;
  return raw as unknown as AgentWireMessage;
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
      return typeof r['entityId'] === 'string'
        && typeof r['componentKey'] === 'string'
        && COMPONENT_KEY_SET.has(r['componentKey'])
        && r['value'] !== undefined;
    case 'move-geometry':
      return typeof r['entityId'] === 'string'
        && typeof r['deltaLng'] === 'number'
        && typeof r['deltaLat'] === 'number';
    case 'undo':
    case 'redo':
      return true;
    default:
      return false;
  }
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
