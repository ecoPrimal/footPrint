// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { casStoreProject, casFetchProject, casListProjects, casHealthCheck } from './nestgate-cas.js';
import type { ProjectFile } from '../types/project.js';

const mockFetch = vi.fn();

const sampleProject: ProjectFile = {
  name: 'test-project',
  savedAt: '2026-08-04T12:00:00.000Z',
  layers: {},
};

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
  mockFetch.mockReset();
});

describe('casStoreProject', () => {
  it('sends PUT with project body and CAS headers', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ hash: 'abc123', size: 42, stored: true }),
    });

    const result = await casStoreProject(sampleProject);

    expect(result).toEqual({ hash: 'abc123', size: 42, stored: true });
    expect(mockFetch).toHaveBeenCalledWith('/api/cas/store', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-CAS-Family': 'footprint-projects',
      },
      body: JSON.stringify(sampleProject),
    });
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(casStoreProject(sampleProject)).rejects.toThrow('CAS store failed: 503');
  });
});

describe('casFetchProject', () => {
  it('fetches and parses a project by hash', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(sampleProject),
    });

    const result = await casFetchProject('abc123');
    expect(result).toEqual(sampleProject);
    expect(mockFetch).toHaveBeenCalledWith('/api/cas/fetch/abc123');
  });

  it('URL-encodes hash values', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(sampleProject),
    });

    await casFetchProject('hash/with/slash');
    expect(mockFetch).toHaveBeenCalledWith('/api/cas/fetch/hash%2Fwith%2Fslash');
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(casFetchProject('missing')).rejects.toThrow('CAS fetch failed: 404');
  });
});

describe('casListProjects', () => {
  it('returns the CAS index response', async () => {
    const index = {
      count: 2,
      family_id: 'footprint-projects',
      hashes: [
        { hash: 'h1', size: 100 },
        { hash: 'h2', size: 200 },
      ],
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(index),
    });

    const result = await casListProjects();
    expect(result).toEqual(index);
    expect(mockFetch).toHaveBeenCalledWith('/api/cas/index/footprint-projects');
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(casListProjects()).rejects.toThrow('CAS index failed: 500');
  });
});

describe('casHealthCheck', () => {
  it('returns true when health endpoint responds ok', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    await expect(casHealthCheck()).resolves.toBe(true);
    expect(mockFetch).toHaveBeenCalledWith('/api/cas/health', { method: 'GET' });
  });

  it('returns false when health endpoint fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(casHealthCheck()).resolves.toBe(false);
  });

  it('returns false when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));
    await expect(casHealthCheck()).resolves.toBe(false);
  });
});
