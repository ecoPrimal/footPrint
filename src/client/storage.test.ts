// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProjectFile } from '../types/project.js';

vi.mock('./api.js', () => ({
  listProjects: vi.fn(),
  loadProject: vi.fn(),
  saveProject: vi.fn(),
  deleteProject: vi.fn(),
}));

vi.mock('./nestgate-cas.js', () => ({
  casStoreProject: vi.fn(),
  casListProjects: vi.fn(),
  casFetchProject: vi.fn(),
}));

import * as api from './api.js';
import * as cas from './nestgate-cas.js';
import {
  mergeProjectEntries,
  saveProjectWithCas,
  loadProjectFromServer,
  listMergedProjects,
  deleteStoredProject,
} from './storage.js';

const sampleProject: ProjectFile = {
  name: 'garden',
  savedAt: '2026-08-04T12:00:00.000Z',
  layers: {},
};

beforeEach(() => {
  vi.mocked(api.saveProject).mockReset();
  vi.mocked(api.loadProject).mockReset();
  vi.mocked(api.listProjects).mockReset();
  vi.mocked(api.deleteProject).mockReset();
  vi.mocked(cas.casStoreProject).mockReset();
  vi.mocked(cas.casListProjects).mockReset();
  vi.mocked(cas.casFetchProject).mockReset();
});

describe('mergeProjectEntries', () => {
  it('merges local names with CAS hash entries', () => {
    const result = mergeProjectEntries(
      ['alpha', 'beta'],
      [
        { hash: 'h1abcdef1234567890', size: 100 },
        { hash: 'h2fedcba0987654321', size: 200 },
      ],
    );

    expect(result).toEqual([
      { name: 'alpha', casOnly: false },
      { name: 'beta', casOnly: false },
      { name: 'h1abcdef1234…', hash: 'h1abcdef1234567890', casOnly: true },
      { name: 'h2fedcba0987…', hash: 'h2fedcba0987654321', casOnly: true },
    ]);
  });

  it('sorts entries alphabetically by name', () => {
    const result = mergeProjectEntries(['zebra', 'apple'], []);
    expect(result.map((e) => e.name)).toEqual(['apple', 'zebra']);
  });
});

describe('saveProjectWithCas', () => {
  it('saves locally and dual-writes to CAS', async () => {
    vi.mocked(api.saveProject).mockResolvedValueOnce({ saved: 'garden' });
    vi.mocked(cas.casStoreProject).mockResolvedValueOnce({
      hash: 'abc',
      size: 10,
      stored: true,
    });

    const result = await saveProjectWithCas('garden', sampleProject);

    expect(result).toEqual({ saved: 'garden' });
    expect(api.saveProject).toHaveBeenCalledWith('garden', sampleProject);
    expect(cas.casStoreProject).toHaveBeenCalledWith(sampleProject);
  });

  it('succeeds locally even when CAS dual-write fails', async () => {
    vi.mocked(api.saveProject).mockResolvedValueOnce({ saved: 'garden' });
    vi.mocked(cas.casStoreProject).mockRejectedValueOnce(new Error('CAS down'));

    const result = await saveProjectWithCas('garden', sampleProject);
    expect(result).toEqual({ saved: 'garden' });

    await vi.waitFor(() => {
      expect(cas.casStoreProject).toHaveBeenCalled();
    });
  });

  it('propagates local save failures', async () => {
    vi.mocked(api.saveProject).mockRejectedValueOnce(new Error('disk full'));
    await expect(saveProjectWithCas('garden', sampleProject)).rejects.toThrow('disk full');
    expect(cas.casStoreProject).not.toHaveBeenCalled();
  });
});

describe('loadProjectFromServer', () => {
  it('loads from local API when no hash is provided', async () => {
    vi.mocked(api.loadProject).mockResolvedValueOnce(sampleProject);
    const result = await loadProjectFromServer('garden');
    expect(result).toEqual(sampleProject);
    expect(cas.casFetchProject).not.toHaveBeenCalled();
  });

  it('prefers local API when hash is provided and local succeeds', async () => {
    vi.mocked(api.loadProject).mockResolvedValueOnce(sampleProject);
    const result = await loadProjectFromServer('garden', 'hash123');
    expect(result).toEqual(sampleProject);
    expect(cas.casFetchProject).not.toHaveBeenCalled();
  });

  it('falls back to CAS when local load fails but hash is provided', async () => {
    vi.mocked(api.loadProject).mockRejectedValueOnce(new Error('404'));
    vi.mocked(cas.casFetchProject).mockResolvedValueOnce(sampleProject);

    const result = await loadProjectFromServer('garden', 'hash123');
    expect(result).toEqual(sampleProject);
    expect(cas.casFetchProject).toHaveBeenCalledWith('hash123');
  });
});

describe('listMergedProjects', () => {
  it('merges local and CAS project lists', async () => {
    vi.mocked(api.listProjects).mockResolvedValueOnce(['local-only']);
    vi.mocked(cas.casListProjects).mockResolvedValueOnce({
      count: 2,
      hashes: [
        { hash: 'h1abcdef1234567890', size: 100 },
        { hash: 'h2fedcba0987654321', size: 200 },
      ],
    });

    const result = await listMergedProjects();
    expect(result).toEqual([
      { name: 'h1abcdef1234…', hash: 'h1abcdef1234567890', casOnly: true },
      { name: 'h2fedcba0987…', hash: 'h2fedcba0987654321', casOnly: true },
      { name: 'local-only', casOnly: false },
    ]);
  });

  it('returns local projects when CAS listing fails', async () => {
    vi.mocked(api.listProjects).mockResolvedValueOnce(['alpha']);
    vi.mocked(cas.casListProjects).mockRejectedValueOnce(new Error('CAS offline'));

    const result = await listMergedProjects();
    expect(result).toEqual([{ name: 'alpha', casOnly: false }]);
  });

  it('returns CAS-only projects when local listing fails', async () => {
    vi.mocked(api.listProjects).mockRejectedValueOnce(new Error('server down'));
    vi.mocked(cas.casListProjects).mockResolvedValueOnce({
      count: 1,
      hashes: [{ hash: 'h1abcdef1234567890', size: 100 }],
    });

    const result = await listMergedProjects();
    expect(result).toEqual([{ name: 'h1abcdef1234…', hash: 'h1abcdef1234567890', casOnly: true }]);
  });
});

describe('deleteStoredProject', () => {
  it('delegates to the API delete endpoint', async () => {
    vi.mocked(api.deleteProject).mockResolvedValueOnce({ deleted: 'garden' });
    const result = await deleteStoredProject('garden');
    expect(result).toEqual({ deleted: 'garden' });
    expect(api.deleteProject).toHaveBeenCalledWith('garden');
  });
});
