// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Backend abstraction layer for footPrint.
 *
 * All HTTP and WebSocket calls from the browser client go through
 * this module. Deployment teams rewire by changing the path constants
 * in `src/constants.ts` (PROXY_PATH, PROJECTS_PATH, WS_PATH).
 */

import type { ProjectFile, SaveResponse, DeleteResponse } from '../types/project.js';
import { PROXY_PATH, PROJECTS_PATH, WS_PATH, AGENT_BRIDGE_PATH } from '../constants.js';

// ── Proxy (external data sources) ───────────────────

export function proxyUrl(externalUrl: string): string {
  return `${PROXY_PATH}?url=${encodeURIComponent(externalUrl)}`;
}

export async function proxyGet<T = unknown>(externalUrl: string): Promise<T> {
  const resp = await fetch(proxyUrl(externalUrl));
  if (!resp.ok) throw new Error(`Proxy GET ${resp.status}: ${externalUrl}`);
  return (await resp.json()) as T;
}

export async function proxyPost<T = unknown>(externalUrl: string, body: string): Promise<T> {
  const resp = await fetch(proxyUrl(externalUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body,
  });
  if (!resp.ok) throw new Error(`Proxy POST ${resp.status}: ${externalUrl}`);
  return (await resp.json()) as T;
}

// ── Project persistence ─────────────────────────────

export async function listProjects(): Promise<readonly string[]> {
  const resp = await fetch(PROJECTS_PATH);
  if (!resp.ok) throw new Error(`listProjects: ${resp.status}`);
  return (await resp.json()) as string[];
}

export async function loadProject(name: string): Promise<ProjectFile> {
  const resp = await fetch(`${PROJECTS_PATH}/${encodeURIComponent(name)}`);
  if (!resp.ok) throw new Error(`loadProject: ${resp.status}`);
  return (await resp.json()) as ProjectFile;
}

export async function saveProject(name: string, data: ProjectFile): Promise<SaveResponse> {
  const resp = await fetch(`${PROJECTS_PATH}/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!resp.ok) throw new Error(`saveProject: ${resp.status}`);
  return (await resp.json()) as SaveResponse;
}

export async function deleteProject(name: string): Promise<DeleteResponse> {
  const resp = await fetch(`${PROJECTS_PATH}/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
  if (!resp.ok) throw new Error(`deleteProject: ${resp.status}`);
  return (await resp.json()) as DeleteResponse;
}

// ── WebSocket ───────────────────────────────────────

export function agentWsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}${AGENT_BRIDGE_PATH}`;
}

export function petalTongueWsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}${WS_PATH}`;
}
