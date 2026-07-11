/**
 * Primal -- capability-based module system inspired by ecoPrimals gen3.
 *
 * A Primal is a self-contained module that:
 * - Owns one domain
 * - Exposes capabilities as typed Primitives (atomic operations)
 * - Has zero compile-time coupling to other Primals
 * - Discovers other capabilities at runtime
 *
 * This is the gen3 primal pattern expressed in TypeScript:
 * "A primal knows only itself: what capabilities it has, how to advertise
 *  them, and how to respond to requests."
 */

import type { Result } from '../rustscript/result.js';
import { Err } from '../rustscript/result.js';
import type { Option } from '../rustscript/option.js';
import { Some, None } from '../rustscript/option.js';
import { Iter } from '../rustscript/iter.js';
import { RustVec } from '../rustscript/vec.js';

// -- Capability types --

export interface Capability<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly description: string;
  readonly version: string;
  handle(input: TInput): Result<TOutput, PrimalError>;
}

export interface PrimalError {
  readonly kind: 'NotFound' | 'InvalidInput' | 'InternalError';
  readonly message: string;
  readonly primalId?: string;
}

export interface PrimalManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly capabilities: readonly string[];
}

// -- Primal definition --

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

  /** Register a capability this primal provides. */
  expose<TIn, TOut>(capability: Capability<TIn, TOut>): void {
    this.capabilities.set(capability.name, capability as Capability);
  }

  /** Invoke a capability by name. */
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

  /** List all capabilities this primal exposes. */
  listCapabilities(): Iter<string> {
    return Iter.fromArray([...this.capabilities.keys()]);
  }

  /** Get the primal's manifest for discovery. */
  manifest(): PrimalManifest {
    return {
      id: this.id,
      name: this.name,
      version: this.version,
      capabilities: [...this.capabilities.keys()],
    };
  }
}

// -- Registry (runtime discovery) --

const registry = new Map<string, Primal>();

/** Register a primal in the global registry. */
export function registerPrimal(primal: Primal): void {
  registry.set(primal.id, primal);
}

/** Unregister a primal. */
export function unregisterPrimal(id: string): void {
  registry.delete(id);
}

/** Discover a primal by ID. */
export function getPrimal(id: string): Option<Primal> {
  const primal = registry.get(id);
  return primal ? Some(primal) : None();
}

/** Find all primals that expose a given capability. */
export function findByCapability(capabilityName: string): Iter<Primal> {
  const matches = RustVec.empty<Primal>();
  for (const primal of registry.values()) {
    if (primal.listCapabilities().any((c) => c === capabilityName)) {
      matches.push(primal);
    }
  }
  return matches.iter();
}

/** List all registered primal manifests. */
export function listPrimals(): Iter<PrimalManifest> {
  return Iter.fromArray([...registry.values()]).map((p) => p.manifest());
}

/**
 * Invoke a capability on any primal that provides it.
 * Returns the first successful result, or the last error.
 */
export function invokeCapability(
  capabilityName: string,
  input: unknown,
): Result<unknown, PrimalError> {
  let lastError: PrimalError = {
    kind: 'NotFound',
    message: `No primal provides capability "${capabilityName}"`,
  };

  for (const primal of registry.values()) {
    const result = primal.invoke(capabilityName, input);
    if (result.ok) return result;
    lastError = result.error;
  }

  return Err(lastError);
}

/** Reset the registry (for testing). */
export function clearPrimals(): void {
  registry.clear();
}
