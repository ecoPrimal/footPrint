// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  proxyUrl,
  proxyGet,
  proxyPost,
  listProjects,
  loadProject,
  saveProject,
  deleteProject,
  agentWsUrl,
  petalTongueWsUrl,
} from './api.js';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  vi.stubGlobal('location', { protocol: 'https:', host: 'primals.eco' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('proxyUrl', () => {
  it('encodes the external URL as a query parameter', () => {
    const result = proxyUrl('https://overpass-api.de/api/interpreter');
    expect(result).toBe('/ext?url=https%3A%2F%2Foverpass-api.de%2Fapi%2Finterpreter');
  });

  it('handles URLs with existing query parameters', () => {
    const result = proxyUrl('https://example.com/api?x=1&y=2');
    expect(result).toContain(encodeURIComponent('https://example.com/api?x=1&y=2'));
  });
});

describe('proxyGet', () => {
  it('fetches via the proxy and returns parsed JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ features: [] }),
    });

    const result = await proxyGet<{ features: unknown[] }>('https://fema.gov/api');
    expect(result).toEqual({ features: [] });
    expect(mockFetch).toHaveBeenCalledWith('/ext?url=https%3A%2F%2Ffema.gov%2Fapi');
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
    await expect(proxyGet('https://evil.com/api')).rejects.toThrow('Proxy GET 403');
  });
});

describe('proxyPost', () => {
  it('posts through the proxy with text/plain content type', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ elements: [] }),
    });

    await proxyPost('https://overpass-api.de/api/interpreter', 'data=query');
    expect(mockFetch).toHaveBeenCalledWith('/ext?url=https%3A%2F%2Foverpass-api.de%2Fapi%2Finterpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'data=query',
    });
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 502 });
    await expect(proxyPost('https://example.com', 'body')).rejects.toThrow('Proxy POST 502');
  });
});

describe('listProjects', () => {
  it('fetches from PROJECTS_PATH', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(['project-a', 'project-b']),
    });

    const result = await listProjects();
    expect(result).toEqual(['project-a', 'project-b']);
    expect(mockFetch).toHaveBeenCalledWith('/api/projects');
  });
});

describe('loadProject', () => {
  it('fetches a project by name with URL encoding', async () => {
    const project = { name: 'my house', savedAt: '2026-07-12', layers: {} };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(project),
    });

    const result = await loadProject('my house');
    expect(result).toEqual(project);
    expect(mockFetch).toHaveBeenCalledWith('/api/projects/my%20house');
  });
});

describe('saveProject', () => {
  it('POSTs project data as JSON', async () => {
    const project = { name: 'test', savedAt: '2026-07-12', layers: {} };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ saved: 'test' }),
    });

    const result = await saveProject('test', project);
    expect(result).toEqual({ saved: 'test' });
    expect(mockFetch).toHaveBeenCalledWith('/api/projects/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    });
  });
});

describe('deleteProject', () => {
  it('sends DELETE request', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ deleted: 'test' }),
    });

    const result = await deleteProject('test');
    expect(result).toEqual({ deleted: 'test' });
    expect(mockFetch).toHaveBeenCalledWith('/api/projects/test', { method: 'DELETE' });
  });
});

describe('agentWsUrl', () => {
  it('builds wss URL from https location', () => {
    expect(agentWsUrl()).toBe('wss://primals.eco/ws/bridge');
  });

  it('builds ws URL from http location', () => {
    vi.stubGlobal('location', { protocol: 'http:', host: 'localhost:5173' });
    expect(agentWsUrl()).toBe('ws://localhost:5173/ws/bridge');
  });
});

describe('petalTongueWsUrl', () => {
  it('builds wss URL from https location', () => {
    expect(petalTongueWsUrl()).toBe('wss://primals.eco/ws');
  });

  it('builds ws URL from http location', () => {
    vi.stubGlobal('location', { protocol: 'http:', host: 'localhost:5173' });
    expect(petalTongueWsUrl()).toBe('ws://localhost:5173/ws');
  });
});
