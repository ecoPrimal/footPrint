import type { EntityId, ComponentKey } from './entity.js';
import type { StoreEvent } from './store.js';
import { store } from './store.js';

export interface DerivedComputation<T = unknown> {
  readonly id: string;
  dependencies(): EntityId[];
  watchComponents?: readonly ComponentKey[];
  compute(): T;
  apply(value: T): void;
}

interface ScheduledComputation {
  computation: DerivedComputation;
  dirty: boolean;
}

const registry = new Map<string, ScheduledComputation>();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 16;
let initialized = false;

export function initReactive(): void {
  if (initialized) return;
  initialized = true;

  store.on((event: StoreEvent) => {
    markDirty(event);
    scheduleFlush();
  });
}

export function registerComputation<T>(computation: DerivedComputation<T>): () => void {
  registry.set(computation.id, { computation, dirty: true });
  scheduleFlush();

  return () => {
    registry.delete(computation.id);
  };
}

export function unregisterComputation(id: string): void {
  registry.delete(id);
}

export function runComputation(id: string): void {
  const entry = registry.get(id);
  if (!entry) return;
  try {
    const value = entry.computation.compute();
    entry.computation.apply(value);
    entry.dirty = false;
  } catch (err) {
    console.warn(`[Reactive] computation "${id}" failed:`, err);
  }
}

function markDirty(event: StoreEvent): void {
  for (const [, entry] of registry) {
    if (entry.dirty) continue;

    const deps = entry.computation.dependencies();
    if (deps.length === 0 || deps.includes(event.entityId)) {
      if (entry.computation.watchComponents && event.componentKey) {
        if (entry.computation.watchComponents.includes(event.componentKey)) {
          entry.dirty = true;
        }
      } else {
        entry.dirty = true;
      }
    }
  }
}

function scheduleFlush(): void {
  if (debounceTimer !== null) return;
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    flush();
  }, DEBOUNCE_MS);
}

function flush(): void {
  for (const [id, entry] of registry) {
    if (!entry.dirty) continue;
    try {
      const value = entry.computation.compute();
      entry.computation.apply(value);
    } catch (err) {
      console.warn(`[Reactive] computation "${id}" failed:`, err);
    }
    entry.dirty = false;
  }
}

export function forceFlush(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  flush();
}
