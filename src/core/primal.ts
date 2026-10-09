// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Primal -- capability-based module system for footPrint.
 *
 * A Primal is a self-contained module that:
 * - Owns one domain
 * - Exposes capabilities as typed operations
 * - Has zero compile-time coupling to other Primals
 * - Discovers other capabilities at runtime via the registry
 *
 * "A primal knows only itself: what capabilities it has, how to advertise
 *  them, and how to respond to requests."
 */

import type { Result, Option } from '@protokarya/rustscript';
import { Ok, Err, Some, None, Iter, RustVec } from '@protokarya/rustscript';

// ── Capability types ─────────────────────────────────

export interface Capability<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly description: string;
  readonly version: string;
  handle(input: TInput): Result<TOutput, PrimalError>;
}

export interface PrimalError {
  readonly kind: 'NotFound' | 'InvalidInput' | 'InternalError' | 'Unavailable';
  readonly message: string;
  readonly primalId?: string;
}

export interface PrimalManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly capabilities: readonly string[];
}

// ── Discovery event bus ──────────────────────────────

type RegistryEvent = { type: 'registered'; manifest: PrimalManifest } | { type: 'unregistered'; id: string };

type RegistryListener = (event: RegistryEvent) => void;

// ── Primal definition ────────────────────────────────

export class Primal {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  private readonly capabilities = new Map<string, Capability>();

  constructor(id: string, name: string, version: string) {
    this.id = id;
    this.name = name;
    this.version = version;
  }

  expose<TIn, TOut>(capability: Capability<TIn, TOut>): void {
    this.capabilities.set(capability.name, capability);
  }

  invoke(capabilityName: string, input: unknown): Result<unknown, PrimalError> {
    const cap = this.capabilities.get(capabilityName);
    if (!cap) {
      return Err({
        kind: 'NotFound',
        message: `Capability "${capabilityName}" not found on primal "${this.id}"`,
        primalId: this.id,
      });
    }
    return cap.handle(input);
  }

  hasCapability(name: string): boolean {
    return this.capabilities.has(name);
  }

  listCapabilities(): Iter<string> {
    return Iter.fromArray([...this.capabilities.keys()]);
  }

  manifest(): PrimalManifest {
    return {
      id: this.id,
      name: this.name,
      version: this.version,
      capabilities: [...this.capabilities.keys()],
    };
  }
}

// ── Registry (runtime discovery) ─────────────────────

const registry = new Map<string, Primal>();
const listeners = RustVec.empty<RegistryListener>();

export function registerPrimal(primal: Primal): void {
  registry.set(primal.id, primal);
  const event: RegistryEvent = { type: 'registered', manifest: primal.manifest() };
  for (const listener of listeners) {
    listener(event);
  }
}

export function unregisterPrimal(id: string): void {
  if (!registry.has(id)) return;
  registry.delete(id);
  const event: RegistryEvent = { type: 'unregistered', id };
  for (const listener of listeners) {
    listener(event);
  }
}

/** Subscribe to registry changes for runtime discovery. */
export function onRegistryChange(listener: RegistryListener): () => void {
  listeners.push(listener);
  return () => {
    const found = listeners
      .iter()
      .enumerate()
      .find(([, l]) => l === listener);
    if (found.some) listeners.removeAt(found.value[0]);
  };
}

export function getPrimal(id: string): Option<Primal> {
  const primal = registry.get(id);
  return primal ? Some(primal) : None();
}

export function findByCapability(capabilityName: string): Iter<Primal> {
  const matches = RustVec.empty<Primal>();
  for (const primal of registry.values()) {
    if (primal.hasCapability(capabilityName)) {
      matches.push(primal);
    }
  }
  return matches.iter();
}

export function listPrimals(): Iter<PrimalManifest> {
  return Iter.fromArray([...registry.values()]).map((p) => p.manifest());
}

/**
 * Invoke a capability on any primal that provides it.
 * Pure runtime discovery — the caller does not know which primal will handle it.
 */
export function invokeCapability(capabilityName: string, input: unknown): Result<unknown, PrimalError> {
  let lastError: PrimalError = {
    kind: 'NotFound',
    message: `No primal provides capability "${capabilityName}"`,
  };

  for (const primal of registry.values()) {
    if (!primal.hasCapability(capabilityName)) continue;
    const result = primal.invoke(capabilityName, input);
    if (result.ok) return result;
    lastError = result.error;
  }

  return Err(lastError);
}

/**
 * Require a capability, returning Ok if found or Err if unavailable.
 * Used for declaring runtime dependencies without compile-time coupling.
 */
export function requireCapability(capabilityName: string): Result<Primal, PrimalError> {
  for (const primal of registry.values()) {
    if (primal.hasCapability(capabilityName)) return Ok(primal);
  }
  return Err({
    kind: 'Unavailable',
    message: `Required capability "${capabilityName}" not provided by any registered primal`,
  });
}

export function clearPrimals(): void {
  registry.clear();
}
