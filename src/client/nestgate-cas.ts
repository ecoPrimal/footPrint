/**
 * nestGate CAS (Content-Addressed Storage) client.
 *
 * Provides content-addressed project persistence through nestGate.
 * Projects are stored by their BLAKE3 hash, enabling deduplication,
 * integrity verification, and distributed retrieval.
 *
 * Architecture:
 *   footPrint client → Express /api/projects (existing, local FS)
 *   footPrint client → nestGate CAS (content-addressed, distributed)
 *
 * The CAS layer is additive — projects saved locally are also pushed
 * to CAS for integrity and distribution. Loading can fall back to
 * either source.
 */

import type { ProjectFile } from '../types/project.js';

// nestGate CAS serves on the same origin via Caddy reverse proxy.
// Path convention: /cas/store (PUT), /cas/fetch/{hash} (GET), /cas/index/{family} (GET)
const CAS_BASE = '/api/cas';
const CAS_FAMILY = 'footprint-projects';

export interface CasStoreResult {
  readonly hash: string;
  readonly size: number;
  readonly stored: boolean;
}

export interface CasIndexEntry {
  readonly hash: string;
  readonly name: string;
  readonly savedAt: string;
}

/**
 * Store a project in nestGate CAS. Returns the content hash.
 * The project is stored content-addressed — same content = same hash.
 */
export async function casStoreProject(project: ProjectFile): Promise<CasStoreResult> {
  const payload = JSON.stringify(project);
  const resp = await fetch(`${CAS_BASE}/store`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-CAS-Family': CAS_FAMILY,
      'X-CAS-Name': project.name,
    },
    body: payload,
  });
  if (!resp.ok) throw new Error(`CAS store failed: ${resp.status}`);
  return (await resp.json()) as CasStoreResult;
}

/**
 * Fetch a project by its content hash from nestGate CAS.
 */
export async function casFetchProject(hash: string): Promise<ProjectFile> {
  const resp = await fetch(`${CAS_BASE}/fetch/${encodeURIComponent(hash)}`);
  if (!resp.ok) throw new Error(`CAS fetch failed: ${resp.status}`);
  return (await resp.json()) as ProjectFile;
}

/**
 * List all projects in the footPrint CAS family.
 * Returns an index of content hashes with metadata.
 */
export async function casListProjects(): Promise<readonly CasIndexEntry[]> {
  const resp = await fetch(`${CAS_BASE}/index/${encodeURIComponent(CAS_FAMILY)}`);
  if (!resp.ok) throw new Error(`CAS index failed: ${resp.status}`);
  return (await resp.json()) as CasIndexEntry[];
}

/**
 * Check if CAS is reachable. Returns false if nestGate is unavailable.
 */
export async function casHealthCheck(): Promise<boolean> {
  try {
    const resp = await fetch(`${CAS_BASE}/health`, { method: 'GET' });
    return resp.ok;
  } catch {
    return false;
  }
}
