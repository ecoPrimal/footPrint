// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * nestGate CAS (Content-Addressed Storage) client.
 *
 * Provides content-addressed project persistence through nestGate.
 * Projects are stored by their BLAKE3 hash, enabling deduplication,
 * integrity verification, and distributed retrieval.
 *
 * Architecture:
 *   footPrint client → Express /api/projects (existing, local FS)
 *   footPrint client → /api/cas/* (server-side routing, transparent to browser)
 *
 * The Express server routes /api/cas/* through biomeOS Neural API (UDS) when
 * available, falling back to direct HTTP to nestGate (NESTGATE_URL). This client
 * always calls same-origin /api/cas — the transport choice is server-side only.
 *
 * The CAS layer is additive — projects saved locally are also pushed
 * to CAS for integrity and distribution. Loading can fall back to
 * either source.
 */

import type { ProjectFile } from '../types/project.js';

// REST paths exposed by footPrint server (proxied to Neural API or nestGate HTTP).
// Path convention: /api/cas/store (PUT), /api/cas/fetch/{hash} (GET), /api/cas/index/{family} (GET)
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
