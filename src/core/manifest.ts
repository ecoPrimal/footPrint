// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * SourceManifest — capability-based, locality-agnostic discovery registry.
 *
 * Primal pattern: modules self-describe capabilities; callers discover at runtime.
 * Endpoints, known locations, and map defaults are runtime-configurable registries,
 * not compile-time constants.
 */

import type { Brand } from '../rustscript/types.js';

// ── Branded keys ───────────────────────────────────

export type EndpointKey = Brand<string, 'EndpointKey'>;

export function endpointKey(raw: string): EndpointKey {
  return raw as EndpointKey;
}

export type SourceCapability = 'discovery:auto-enable' | 'intelligence:utility-conflict';

// ── Coverage & requirements ────────────────────────

export interface CoverageBounds {
  readonly south: number;
  readonly west: number;
  readonly north: number;
  readonly east: number;
}

export interface SourceManifest {
  readonly id: string;
  readonly capabilities: readonly SourceCapability[];
  readonly coverage?: CoverageBounds;
  readonly endpointKeys?: readonly EndpointKey[];
}

export interface KnownLocation {
  readonly id: string;
  readonly name: string;
  readonly center: readonly [number, number];
  readonly zoom: number;
  readonly description: string;
  readonly expectedSources: readonly string[];
}

export interface MapViewDefaults {
  readonly center: readonly [number, number];
  readonly zoom: number;
}

// ── Registries ─────────────────────────────────────

const endpoints = new Map<EndpointKey, string>();
const sourceManifests = new Map<string, SourceManifest>();
const knownLocations = new Map<string, KnownLocation>();

let mapViewDefaults: MapViewDefaults = {
  center: [0, 0],
  zoom: 18,
};

let defaultsInitialized = false;
let defaultsInitializer: (() => void) | null = null;

/** Register the bootstrap function (called lazily on first registry access). */
export function setManifestDefaultsInitializer(initializer: () => void): void {
  defaultsInitializer = initializer;
}

function ensureDefaults(): void {
  if (defaultsInitialized) return;
  defaultsInitialized = true;
  defaultsInitializer?.();
}

/** @internal Reset all registries — for tests only. */
export function clearManifestRegistry(): void {
  endpoints.clear();
  sourceManifests.clear();
  knownLocations.clear();
  mapViewDefaults = { center: [0, 0], zoom: 18 };
  defaultsInitialized = false;
}

// ── Endpoints ──────────────────────────────────────

export function registerEndpoint(key: EndpointKey, url: string): void {
  endpoints.set(key, url);
}

/** Register only when the key is not already present (bootstrap-safe). */
export function registerEndpointIfAbsent(key: EndpointKey, url: string): void {
  if (!endpoints.has(key)) {
    endpoints.set(key, url);
  }
}

/** Set or replace an endpoint URL (runtime configuration). */
export function setEndpoint(key: EndpointKey, url: string): void {
  ensureDefaults();
  endpoints.set(key, url);
}

export function getEndpoint(key: EndpointKey): string {
  ensureDefaults();
  const url = endpoints.get(key);
  if (!url) {
    throw new Error(`Endpoint "${String(key)}" is not registered`);
  }
  return url;
}

export function tryGetEndpoint(key: EndpointKey): string | undefined {
  ensureDefaults();
  return endpoints.get(key);
}

export function listEndpointKeys(): readonly EndpointKey[] {
  ensureDefaults();
  return [...endpoints.keys()];
}

export function endpointHosts(): readonly string[] {
  ensureDefaults();
  const hosts = new Set<string>();
  for (const url of endpoints.values()) {
    try {
      hosts.add(new URL(url).hostname);
    } catch {
      // skip malformed URLs
    }
  }
  return [...hosts];
}

// ── Source manifests ───────────────────────────────

export function registerSourceManifest(manifest: SourceManifest): void {
  sourceManifests.set(manifest.id, manifest);
}

export function unregisterSourceManifest(id: string): void {
  sourceManifests.delete(id);
}

export function getSourceManifest(id: string): SourceManifest | undefined {
  ensureDefaults();
  return sourceManifests.get(id);
}

export function listSourceManifests(): readonly SourceManifest[] {
  ensureDefaults();
  return [...sourceManifests.values()];
}

export function getSourceIdsByCapability(capability: SourceCapability): readonly string[] {
  ensureDefaults();
  return [...sourceManifests.values()].filter((m) => m.capabilities.includes(capability)).map((m) => m.id);
}

export function coversPoint(bounds: CoverageBounds, lat: number, lng: number): boolean {
  return lat >= bounds.south && lat <= bounds.north && lng >= bounds.west && lng <= bounds.east;
}

export function sourcesCoveringPoint(lat: number, lng: number): readonly SourceManifest[] {
  ensureDefaults();
  return [...sourceManifests.values()].filter((m) => !m.coverage || coversPoint(m.coverage, lat, lng));
}

// ── Known locations ────────────────────────────────

export function registerKnownLocation(location: KnownLocation): void {
  knownLocations.set(location.id, location);
}

export function unregisterKnownLocation(id: string): void {
  knownLocations.delete(id);
}

export function getKnownLocations(): readonly KnownLocation[] {
  ensureDefaults();
  return [...knownLocations.values()];
}

export function findKnownLocation(id: string): KnownLocation | undefined {
  ensureDefaults();
  return knownLocations.get(id);
}

// ── Map view defaults ──────────────────────────────

export function setMapViewDefaults(config: MapViewDefaults): void {
  mapViewDefaults = config;
}

/** Apply defaults only when map center has not been configured yet. */
export function applyMapViewDefaultsIfUnset(config: MapViewDefaults): void {
  if (mapViewDefaults.center[0] === 0 && mapViewDefaults.center[1] === 0) {
    mapViewDefaults = config;
  }
}

export function getMapViewDefaults(): MapViewDefaults {
  ensureDefaults();
  return mapViewDefaults;
}

export type MapViewResolver = () => MapViewDefaults;

let mapViewResolver: MapViewResolver | null = null;

/** Override how the map resolves its initial view (geolocation, user prefs, etc.). */
export function setMapViewResolver(resolver: MapViewResolver | null): void {
  mapViewResolver = resolver;
}

export function resolveMapViewDefaults(): MapViewDefaults {
  ensureDefaults();
  return mapViewResolver ? mapViewResolver() : mapViewDefaults;
}
