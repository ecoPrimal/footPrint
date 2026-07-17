import { describe, it, expect } from 'vitest';
import { parseWireMessage, parseCommandPayload, isValidCommandAction } from './protocol.js';

describe('parseWireMessage', () => {
  it('returns null for non-object', () => {
    expect(parseWireMessage(null)).toBeNull();
    expect(parseWireMessage(42)).toBeNull();
    expect(parseWireMessage('string')).toBeNull();
    expect(parseWireMessage(undefined)).toBeNull();
  });

  it('returns null for missing type', () => {
    expect(parseWireMessage({ foo: 'bar' })).toBeNull();
  });

  it('returns null for unknown type', () => {
    expect(parseWireMessage({ type: 'bogus' })).toBeNull();
  });

  it('returns null for array', () => {
    expect(parseWireMessage([1, 2, 3])).toBeNull();
  });

  it('accepts valid state-sync message', () => {
    const msg = { type: 'state-sync', entities: [] };
    expect(parseWireMessage(msg)).toBe(msg);
  });

  it('accepts valid command message', () => {
    const msg = { type: 'command', id: 'cmd_1', payload: { action: 'undo' } };
    expect(parseWireMessage(msg)).toBe(msg);
  });

  it('accepts valid agent-message', () => {
    const msg = { type: 'agent-message', text: 'hello', timestamp: 123 };
    expect(parseWireMessage(msg)).toBe(msg);
  });

  it('accepts all known message types with valid fields', () => {
    const validMessages = [
      { type: 'state-sync', entities: [] },
      { type: 'state-delta', event: { kind: 'add', entityId: 'e1' } },
      { type: 'command', id: 'c1', payload: { action: 'undo' } },
      { type: 'command-result', id: 'c1', ok: true },
      { type: 'user-message', text: 'hi', timestamp: 1 },
      { type: 'agent-message', text: 'hi', timestamp: 1 },
      { type: 'agent-action', description: 'did thing', timestamp: 1 },
    ];
    for (const msg of validMessages) {
      expect(parseWireMessage(msg)).not.toBeNull();
    }
  });

  it('rejects messages with valid type but missing required fields', () => {
    expect(parseWireMessage({ type: 'state-sync' })).toBeNull();
    expect(parseWireMessage({ type: 'command', id: 'c1' })).toBeNull();
    expect(parseWireMessage({ type: 'command-result', id: 'c1' })).toBeNull();
    expect(parseWireMessage({ type: 'user-message', text: 'hi' })).toBeNull();
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
