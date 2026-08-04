// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { HEALTH_PATH, PROJECTS_PATH, PROXY_PATH } from './constants.js';
import type { ProjectFile } from './types/project.js';

let server: Server;
let baseUrl: string;
let projectsDir: string;
let cacheDir: string;
const testProjectName = `vitest-server-${String(Date.now())}`;

const upstreamFetch = vi.fn();
let originalFetch: typeof fetch;

beforeAll(async () => {
  projectsDir = await mkdtemp(join(tmpdir(), 'footprint-projects-'));
  cacheDir = await mkdtemp(join(tmpdir(), 'footprint-cache-'));

  const { createApp } = await import('./server.js');
  const app = await createApp({ projectsDir, cacheDir, enableAgentBridge: false });
  server = app.listen(0);
  await new Promise<void>((resolve) => {
    server.once('listening', () => resolve());
  });

  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${String(addr.port)}`;

  originalFetch = globalThis.fetch;
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit): ReturnType<typeof fetch> => {
    const href =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input instanceof Request
            ? input.url
            : String(input);
    if (href.startsWith(baseUrl)) {
      return originalFetch(input, init);
    }
    return upstreamFetch(input, init) as ReturnType<typeof fetch>;
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await rm(projectsDir, { recursive: true, force: true });
  await rm(cacheDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

function url(path: string): string {
  return `${baseUrl}${path}`;
}

describe('GET /api/health', () => {
  it('returns 200 with status', async () => {
    const resp = await fetch(url(HEALTH_PATH));
    expect(resp.status).toBe(200);

    const body = (await resp.json()) as Record<string, unknown>;
    expect(body['status']).toBe('ok');
    expect(body['version']).toBeTruthy();
    expect(typeof body['uptime']).toBe('number');
  });
});

describe('project routes', () => {
  const sampleProject: ProjectFile = {
    name: testProjectName,
    savedAt: new Date().toISOString(),
    layers: {},
  };

  it('GET /api/projects lists projects', async () => {
    const saveResp = await fetch(url(`${PROJECTS_PATH}/${testProjectName}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sampleProject),
    });
    expect(saveResp.status).toBe(200);

    const resp = await fetch(url(PROJECTS_PATH));
    expect(resp.status).toBe(200);

    const projects = (await resp.json()) as string[];
    expect(projects).toContain(testProjectName);
  });

  it('POST /api/projects/:name saves a project', async () => {
    const resp = await fetch(url(`${PROJECTS_PATH}/${testProjectName}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sampleProject),
    });
    expect(resp.status).toBe(200);

    const body = (await resp.json()) as { saved: string };
    expect(body.saved).toBe(testProjectName);
  });

  it('DELETE /api/projects/:name deletes a project', async () => {
    const resp = await fetch(url(`${PROJECTS_PATH}/${testProjectName}`), {
      method: 'DELETE',
    });
    expect(resp.status).toBe(200);

    const body = (await resp.json()) as { deleted: string };
    expect(body.deleted).toBe(testProjectName);

    const listResp = await fetch(url(PROJECTS_PATH));
    const projects = (await listResp.json()) as string[];
    expect(projects).not.toContain(testProjectName);
  });

  it('returns 400 for malformed project POST body', async () => {
    const resp = await fetch(url(`${PROJECTS_PATH}/bad-project`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'missing-fields' }),
    });
    expect(resp.status).toBe(400);

    const body = (await resp.json()) as { error: string };
    expect(body.error).toContain('Invalid project');
  });

  it('returns 404 when deleting a missing project', async () => {
    const resp = await fetch(url(`${PROJECTS_PATH}/does-not-exist-${testProjectName}`), {
      method: 'DELETE',
    });
    expect(resp.status).toBe(404);
  });
});

describe('GET /ext proxy', () => {
  it('proxies allowed hosts with mocked upstream fetch', async () => {
    upstreamFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      json: () => Promise.resolve({ ok: true, source: 'mock' }),
    });

    const target = 'https://overpass-api.de/api/interpreter?data=test';
    const resp = await fetch(url(`${PROXY_PATH}?url=${encodeURIComponent(target)}`));
    expect(resp.status).toBe(200);

    const body = (await resp.json()) as Record<string, unknown>;
    expect(body['source']).toBe('mock');
    expect(resp.headers.get('X-Cache')).toBe('MISS');
    expect(upstreamFetch).toHaveBeenCalled();
  });

  it('rejects disallowed hosts', async () => {
    const resp = await fetch(url(`${PROXY_PATH}?url=${encodeURIComponent('https://evil.example.com/data')}`));
    expect(resp.status).toBe(403);

    const body = (await resp.json()) as { error: string };
    expect(body.error).toBe('Host not allowed');
  });

  it('returns 400 when url parameter is missing', async () => {
    const resp = await fetch(url(PROXY_PATH));
    expect(resp.status).toBe(400);

    const body = (await resp.json()) as { error: string };
    expect(body.error).toBe('Missing url parameter');
  });
});

describe('agent message validation', () => {
  it('returns 400 for malformed agent message POST', async () => {
    const resp = await fetch(url('/api/agent/messages'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(resp.status).toBe(400);
  });
});
