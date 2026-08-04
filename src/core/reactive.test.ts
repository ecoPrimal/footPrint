// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerComputation, initReactive } from './reactive.js';
import type { DerivedComputation } from './reactive.js';
import { store } from './store.js';
import { createEntity } from './entity.js';
import type { EntityId } from './entity.js';
import { REACTIVE_DEBOUNCE_MS } from '../constants.js';

beforeEach(() => {
  vi.useFakeTimers();
  store.clear();
  initReactive();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

function makeComputation(
  id: string,
  deps: () => EntityId[],
  computeFn: () => unknown,
  applyFn: (v: unknown) => void,
  watchComponents?: DerivedComputation['watchComponents'],
): DerivedComputation {
  const base = { id, dependencies: deps, compute: computeFn, apply: applyFn };
  return watchComponents ? { ...base, watchComponents } : base;
}

describe('reactive', () => {
  it('runs computation on register after debounce', () => {
    const applied = vi.fn();
    registerComputation(
      makeComputation(
        'r-1',
        () => [],
        () => 42,
        applied,
      ),
    );
    expect(applied).not.toHaveBeenCalled();
    vi.advanceTimersByTime(REACTIVE_DEBOUNCE_MS + 1);
    expect(applied).toHaveBeenCalledWith(42);
  });

  it('re-runs computation when a dependency entity changes', () => {
    const entity = createEntity('shape');
    store.add(entity);

    let callCount = 0;
    const unregister = registerComputation(
      makeComputation(
        'r-dep',
        () => [entity.id],
        () => ++callCount,
        () => {
          /* no-op */
        },
      ),
    );

    vi.advanceTimersByTime(REACTIVE_DEBOUNCE_MS + 1);
    expect(callCount).toBe(1);

    store.setComponent(entity.id, 'meta', { label: 'x', notes: '', status: 'planned', createdAt: '' });
    vi.advanceTimersByTime(REACTIVE_DEBOUNCE_MS + 1);
    expect(callCount).toBe(2);
    unregister();
  });

  it('filters by watchComponents when specified', () => {
    const entity = createEntity('shape');
    store.add(entity);

    let callCount = 0;
    const unregister = registerComputation(
      makeComputation(
        'r-watch',
        () => [entity.id],
        () => ++callCount,
        () => {
          /* no-op */
        },
        ['style'],
      ),
    );
    vi.advanceTimersByTime(REACTIVE_DEBOUNCE_MS + 1);
    expect(callCount).toBe(1);

    store.setComponent(entity.id, 'meta', { label: 'x', notes: '', status: 'planned', createdAt: '' });
    vi.advanceTimersByTime(REACTIVE_DEBOUNCE_MS + 1);
    expect(callCount).toBe(1);
    unregister();
  });

  it('unregister stops computation from running on future events', () => {
    const applied = vi.fn();
    const unregister = registerComputation(
      makeComputation(
        'r-unreg',
        () => [],
        () => 'val',
        applied,
      ),
    );
    vi.advanceTimersByTime(REACTIVE_DEBOUNCE_MS + 1);
    expect(applied).toHaveBeenCalledTimes(1);

    unregister();
    store.add(createEntity('layer'));
    vi.advanceTimersByTime(REACTIVE_DEBOUNCE_MS + 1);
    expect(applied).toHaveBeenCalledTimes(1);
  });

  it('handles computation errors gracefully', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* no-op */
    });
    const unregister = registerComputation(
      makeComputation(
        'r-err',
        () => [],
        () => {
          throw new Error('boom');
        },
        () => {
          /* no-op */
        },
      ),
    );
    vi.advanceTimersByTime(REACTIVE_DEBOUNCE_MS + 1);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
    unregister();
  });
});
