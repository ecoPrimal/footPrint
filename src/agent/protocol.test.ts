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

  it('accepts all known message types', () => {
    const types = [
      'state-sync', 'state-delta', 'command', 'command-result',
      'user-message', 'agent-message', 'agent-action',
    ];
    for (const t of types) {
      expect(parseWireMessage({ type: t })).not.toBeNull();
    }
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

  it('accepts all known actions', () => {
    const actions = [
      'add-entity', 'remove-entity', 'update-component',
      'move-geometry', 'undo', 'redo',
    ];
    for (const a of actions) {
      expect(parseCommandPayload({ action: a })).not.toBeNull();
    }
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
