// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * CAS (Content-Addressed Storage) client.
 *
 * Provides content-addressed project persistence. Projects are stored by their
 * BLAKE3 hash, enabling deduplication, integrity verification, and distributed
 * retrieval.
 *
 * The CAS layer is additive — projects saved locally are also pushed to CAS for
 * integrity and distribution. Loading can fall back to either source.
 */

import type { ProjectFile } from '../types/project.js';
import { CAS_PATH, CAS_FAMILY } from '../constants.js';

export interface CasStoreResult {
  readonly hash: string;
  readonly size: number;
  readonly stored: boolean;
}

export interface CasHashEntry {
  readonly hash: string;
  readonly size: number;
}

export interface CasListResult {
  readonly count: number;
  readonly hashes: readonly CasHashEntry[];
}

/**
 * Store a project in CAS. Returns the content hash.
 * The project is stored content-addressed — same content = same hash.
 */
export async function casStoreProject(project: ProjectFile): Promise<CasStoreResult> {
  const payload = JSON.stringify(project);
  const resp = await fetch(`${CAS_PATH}/store`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-CAS-Family': CAS_FAMILY,
    },
    body: payload,
  });
  if (!resp.ok) throw new Error(`CAS store failed: ${resp.status}`);
  return (await resp.json()) as CasStoreResult;
}

/**
 * Fetch a decoded project by its content hash from CAS.
 */
export async function casFetchProject(hash: string): Promise<ProjectFile> {
  const resp = await fetch(`${CAS_PATH}/fetch/${encodeURIComponent(hash)}`);
  if (!resp.ok) throw new Error(`CAS fetch failed: ${resp.status}`);
  return (await resp.json()) as ProjectFile;
}

/**
 * List all content hashes in the footPrint CAS family.
 */
export async function casListProjects(): Promise<CasListResult> {
  const resp = await fetch(`${CAS_PATH}/index/${encodeURIComponent(CAS_FAMILY)}`);
  if (!resp.ok) throw new Error(`CAS index failed: ${resp.status}`);
  return (await resp.json()) as CasListResult;
}

/**
 * Check if CAS is reachable. Returns false when the storage backend is unavailable.
 */
export async function casHealthCheck(): Promise<boolean> {
  try {
    const resp = await fetch(`${CAS_PATH}/health`, { method: 'GET' });
    return resp.ok;
  } catch {
    return false;
  }
}
