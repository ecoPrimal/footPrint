import { describe, it, expect, beforeEach } from 'vitest';
import {
  Primal,
  registerPrimal,
  unregisterPrimal,
  getPrimal,
  findByCapability,
  listPrimals,
  invokeCapability,
  requireCapability,
  onRegistryChange,
  clearPrimals,
} from './primal.js';
import { Ok, isOk, isErr, isSome } from '@protokarya/rustscript';

function makeTestCapability(name: string) {
  return {
    name,
    description: `Test capability: ${name}`,
    version: '1.0.0',
    handle: (input: unknown) => Ok(input),
  };
}

describe('Primal', () => {
  beforeEach(() => { clearPrimals(); });

  it('exposes and invokes capabilities', () => {
    const p = new Primal('test', 'TestPrimal', '1.0.0');
    p.expose(makeTestCapability('greet'));

    const result = p.invoke('greet', 'hello');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('hello');
  });

  it('returns NotFound for unknown capability', () => {
    const p = new Primal('test', 'TestPrimal', '1.0.0');
    const result = p.invoke('missing', null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NotFound');
  });

  it('manifest lists all capabilities', () => {
    const p = new Primal('test', 'TestPrimal', '1.0.0');
    p.expose(makeTestCapability('a'));
    p.expose(makeTestCapability('b'));
    const m = p.manifest();
    expect(m.capabilities).toEqual(['a', 'b']);
  });
});

describe('Registry', () => {
  beforeEach(() => { clearPrimals(); });

  it('registers and discovers by ID', () => {
    const p = new Primal('foo', 'Foo', '1.0');
    registerPrimal(p);
    const found = getPrimal('foo');
    expect(isSome(found)).toBe(true);
  });

  it('unregister removes primal', () => {
    const p = new Primal('bar', 'Bar', '1.0');
    registerPrimal(p);
    unregisterPrimal('bar');
    expect(isSome(getPrimal('bar'))).toBe(false);
  });

  it('findByCapability discovers at runtime', () => {
    const p1 = new Primal('p1', 'P1', '1.0');
    p1.expose(makeTestCapability('compute'));
    const p2 = new Primal('p2', 'P2', '1.0');
    p2.expose(makeTestCapability('storage'));

    registerPrimal(p1);
    registerPrimal(p2);

    const computing = findByCapability('compute').collect();
    expect(computing).toHaveLength(1);
    expect(computing[0]?.id).toBe('p1');
  });

  it('listPrimals returns all manifests', () => {
    registerPrimal(new Primal('a', 'A', '1.0'));
    registerPrimal(new Primal('b', 'B', '1.0'));
    const manifests = listPrimals().collect();
    expect(manifests).toHaveLength(2);
  });

  it('invokeCapability routes to the right primal', () => {
    const p = new Primal('math', 'Math', '1.0');
    p.expose({
      name: 'double',
      description: 'Double a number',
      version: '1.0',
      handle: (input: unknown) => Ok((input as number) * 2),
    });
    registerPrimal(p);

    const result = invokeCapability('double', 5);
    expect(isOk(result)).toBe(true);
    if (result.ok) expect(result.value).toBe(10);
  });

  it('invokeCapability returns Err when no provider', () => {
    const result = invokeCapability('nonexistent', null);
    expect(isErr(result)).toBe(true);
  });

  it('requireCapability returns Ok when available', () => {
    const p = new Primal('svc', 'Svc', '1.0');
    p.expose(makeTestCapability('needed'));
    registerPrimal(p);
    expect(isOk(requireCapability('needed'))).toBe(true);
  });

  it('requireCapability returns Err when unavailable', () => {
    expect(isErr(requireCapability('nonexistent'))).toBe(true);
  });

  it('onRegistryChange fires on register/unregister', () => {
    const events: string[] = [];
    const unsub = onRegistryChange((e) => { events.push(e.type); });

    registerPrimal(new Primal('x', 'X', '1.0'));
    unregisterPrimal('x');
    unsub();
    registerPrimal(new Primal('y', 'Y', '1.0'));

    expect(events).toEqual(['registered', 'unregistered']);
  });
});
