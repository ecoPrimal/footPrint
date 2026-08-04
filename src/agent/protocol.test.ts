// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest';
import {
  parseJsonRpcFrame,
  parseCommandPayload,
  isValidCommandAction,
  isAgentMethod,
  AGENT_METHODS,
} from './protocol.js';

describe('parseJsonRpcFrame', () => {
  it('returns null for non-object', () => {
    expect(parseJsonRpcFrame(null)).toBeNull();
    expect(parseJsonRpcFrame(42)).toBeNull();
    expect(parseJsonRpcFrame('string')).toBeNull();
    expect(parseJsonRpcFrame(undefined)).toBeNull();
  });

  it('returns null for missing or invalid jsonrpc version', () => {
    expect(parseJsonRpcFrame({ method: 'project.sync' })).toBeNull();
    expect(parseJsonRpcFrame({ jsonrpc: '1.0', method: 'project.sync' })).toBeNull();
  });

  it('returns null for array', () => {
    expect(parseJsonRpcFrame([1, 2, 3])).toBeNull();
  });

  it('accepts valid notification', () => {
    const msg = { jsonrpc: '2.0', method: 'project.sync', params: { entities: [] } };
    expect(parseJsonRpcFrame(msg)).toBe(msg);
  });

  it('accepts valid request', () => {
    const msg = {
      jsonrpc: '2.0',
      method: 'project.command',
      params: { payload: { action: 'undo' } },
      id: 1,
    };
    expect(parseJsonRpcFrame(msg)).toBe(msg);
  });

  it('accepts valid success response', () => {
    const msg = { jsonrpc: '2.0', id: 1, result: { ok: true } };
    expect(parseJsonRpcFrame(msg)).toBe(msg);
  });

  it('accepts valid error response', () => {
    const msg = { jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'fail' } };
    expect(parseJsonRpcFrame(msg)).toBe(msg);
  });

  it('rejects ambiguous or incomplete frames', () => {
    expect(parseJsonRpcFrame({ jsonrpc: '2.0', id: 1 })).toBeNull();
    expect(parseJsonRpcFrame({ jsonrpc: '2.0', method: 'project.sync', id: 1, result: {} })).toBeNull();
    expect(parseJsonRpcFrame({ jsonrpc: '2.0', id: 1, error: { code: 'bad', message: 'fail' } })).toBeNull();
    expect(parseJsonRpcFrame({ jsonrpc: '2.0', method: 'project.sync' })).not.toBeNull();
  });
});

describe('isAgentMethod', () => {
  it('returns true for known methods', () => {
    for (const method of Object.values(AGENT_METHODS)) {
      expect(isAgentMethod(method)).toBe(true);
    }
  });

  it('returns false for unknown methods', () => {
    expect(isAgentMethod('state-sync')).toBe(false);
    expect(isAgentMethod('')).toBe(false);
  });
});

describe('parseCommandPayload', () => {
  it('returns null for non-object', () => {
    expect(parseCommandPayload(null)).toBeNull();
    expect(parseCommandPayload('undo')).toBeNull();
  });

  it('returns null for missing action', () => {
    expect(parseCommandPayload({ entityId: 'e1' })).toBeNull();
  });

  it('returns null for unknown action', () => {
    expect(parseCommandPayload({ action: 'destroy-world' })).toBeNull();
  });

  it('accepts valid undo payload', () => {
    const p = { action: 'undo' };
    expect(parseCommandPayload(p)).toBe(p);
  });

  it('accepts valid add-entity payload', () => {
    const p = { action: 'add-entity', kind: 'shape' };
    expect(parseCommandPayload(p)).toBe(p);
  });

  it('accepts all known actions with valid fields', () => {
    const validPayloads = [
      { action: 'add-entity', kind: 'shape' },
      { action: 'remove-entity', entityId: 'e1' },
      { action: 'update-component', entityId: 'e1', componentKey: 'style', value: {} },
      { action: 'move-geometry', entityId: 'e1', deltaLng: 1, deltaLat: 2 },
      { action: 'undo' },
      { action: 'redo' },
    ];
    for (const p of validPayloads) {
      expect(parseCommandPayload(p)).not.toBeNull();
    }
  });

  it('rejects payloads with valid action but missing required fields', () => {
    expect(parseCommandPayload({ action: 'add-entity' })).toBeNull();
    expect(parseCommandPayload({ action: 'remove-entity' })).toBeNull();
    expect(parseCommandPayload({ action: 'update-component', entityId: 'e1' })).toBeNull();
    expect(parseCommandPayload({ action: 'move-geometry', entityId: 'e1' })).toBeNull();
  });
});

describe('isValidCommandAction', () => {
  it('returns true for known actions', () => {
    expect(isValidCommandAction('undo')).toBe(true);
    expect(isValidCommandAction('add-entity')).toBe(true);
  });

  it('returns false for unknown actions', () => {
    expect(isValidCommandAction('nuke')).toBe(false);
    expect(isValidCommandAction('')).toBe(false);
  });
});
