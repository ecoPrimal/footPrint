import type { Brand } from './types.js';
import type { Result } from './result.js';
import { Ok, Err } from './result.js';

/**
 * Validated newtype constructors -- Rust's TryFrom pattern.
 * Branded types can only be created through functions that validate.
 */

// ── Error types ──────────────

export interface InvalidId {
  readonly kind: 'InvalidId';
  readonly raw: string;
  readonly reason: string;
}

export interface InvalidColor {
  readonly kind: 'InvalidColor';
  readonly raw: string;
  readonly reason: string;
}

// ── EntityId ──────────────

export type EntityId = Brand<string, 'EntityId'>;

let _counter = 0;

/** Generate a new unique EntityId. Always succeeds. */
export function entityId(): EntityId {
  return `e_${Date.now().toString(36)}_${(_counter++).toString(36)}` as EntityId;
}

/** Parse a raw string into an EntityId with validation. */
export function parseEntityId(raw: string): Result<EntityId, InvalidId> {
  if (typeof raw !== 'string' || raw.length === 0) {
    return Err({ kind: 'InvalidId', raw, reason: 'empty string' });
  }
  if (!raw.startsWith('e_')) {
    return Err({ kind: 'InvalidId', raw, reason: 'must start with "e_"' });
  }
  return Ok(raw as EntityId);
}

/**
 * Unchecked cast for deserialization of trusted data.
 * Equivalent to Rust's `unsafe` -- caller asserts validity.
 */
export function entityIdUnchecked(raw: string): EntityId {
  return raw as EntityId;
}

// ── HexColor ──────────────

export type HexColor = Brand<string, 'HexColor'>;

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Parse a raw string into a HexColor with validation. */
export function parseHexColor(raw: string): Result<HexColor, InvalidColor> {
  if (!HEX_RE.test(raw)) {
    return Err({ kind: 'InvalidColor', raw, reason: 'must be #RGB, #RRGGBB, or #RRGGBBAA' });
  }
  return Ok(raw.toLowerCase() as HexColor);
}

/**
 * Unchecked cast for trusted data.
 * Equivalent to Rust's `unsafe`.
 */
export function hexColorUnchecked(raw: string): HexColor {
  return raw as HexColor;
}

// ── LayerId ──────────────

export type LayerId = Brand<string, 'LayerId'>;

export function layerId(raw: string): LayerId {
  return raw as LayerId;
}

// ── ProjectName ──────────────

export type ProjectName = Brand<string, 'ProjectName'>;

export function projectName(raw: string): ProjectName {
  return raw as ProjectName;
}

// ── DataSourceId ──────────────

export type DataSourceId = Brand<string, 'DataSourceId'>;

export function dataSourceId(raw: string): DataSourceId {
  return raw as DataSourceId;
}
