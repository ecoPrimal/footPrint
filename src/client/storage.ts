// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ProjectFile } from '../types/project.js';
import { serializeLayers, deserializeLayers } from './layers.js';
import { deselectShape } from './drawing.js';
import { clearHistory } from '../core/history.js';
import {
  listProjects as apiListProjects,
  loadProject as apiLoadProject,
  saveProject as apiSaveProject,
  deleteProject as apiDeleteProject,
} from './api.js';
import { casStoreProject, casListProjects, casFetchProject, type CasHashEntry } from './nestgate-cas.js';
import { escHtml } from './html.js';
import { TOAST_DURATION_MS } from '../constants.js';
import { modalPrompt, modalAlert, modalConfirm } from './modal.js';

let currentProject: string | null = null;

export function initStorage(): void {
  document.getElementById('btn-new')?.addEventListener('click', () => {
    void newProject();
  });
  document.getElementById('btn-save')?.addEventListener('click', () => {
    void saveProject();
  });
  document.getElementById('btn-load')?.addEventListener('click', () => {
    void showLoadModal();
  });
  document.getElementById('modal-close')?.addEventListener('click', hideModal);
  document.getElementById('modal-overlay')?.addEventListener('click', (e: MouseEvent) => {
    if (e.target instanceof HTMLElement && e.target.id === 'modal-overlay') hideModal();
  });
}

async function newProject(): Promise<void> {
  const name = await modalPrompt('New Project', 'Enter project name:');
  if (!name) return;
  currentProject = name;
  deselectShape();
  clearHistory();
  document.title = `FootPrint \u2014 ${name}`;
}

async function saveProject(): Promise<void> {
  if (!currentProject) {
    const name = await modalPrompt('Save Project', 'Enter project name:');
    if (!name) return;
    currentProject = name;
  }

  const data: ProjectFile = {
    name: currentProject,
    savedAt: new Date().toISOString(),
    layers: serializeLayers(),
  };

  try {
    const result = await saveProjectWithCas(currentProject, data);
    document.title = `FootPrint \u2014 ${currentProject}`;
    showToast(`Saved: ${result.saved}`);
  } catch {
    void modalAlert('Error', 'Failed to save project.');
  }
}

async function showLoadModal(): Promise<void> {
  const overlay = document.getElementById('modal-overlay');
  const body = document.getElementById('modal-body');
  const title = document.getElementById('modal-title');
  if (!overlay || !body || !title) return;
  title.textContent = 'Load Project';

  try {
    const entries = await listMergedProjects();

    if (entries.length === 0) {
      body.innerHTML = '<p class="hint">No saved projects yet.</p>';
    } else {
      body.innerHTML = entries
        .map(
          (entry) => `
        <div class="project-item" data-name="${escHtml(entry.name)}"${entry.hash ? ` data-hash="${escHtml(entry.hash)}"` : ''}>
          <span>${escHtml(entry.name)}${entry.casOnly ? ' <span class="hint">(CAS)</span>' : ''}</span>
          <button class="project-delete" data-name="${escHtml(entry.name)}" title="Delete">&times;</button>
        </div>
      `,
        )
        .join('');

      body.querySelectorAll('.project-item').forEach((el) => {
        if (!(el instanceof HTMLElement)) return;
        el.addEventListener('click', (e: Event) => {
          if (e.target instanceof HTMLElement && e.target.classList.contains('project-delete')) return;
          const name = el.dataset['name'] ?? '';
          const hash = el.dataset['hash'];
          void loadProject(name, hash).then(hideModal);
        });
      });

      body.querySelectorAll('.project-delete').forEach((btn) => {
        if (!(btn instanceof HTMLElement)) return;
        btn.addEventListener('click', (e: Event) => {
          e.stopPropagation();
          const name = btn.dataset['name'];
          if (!name) return;
          void modalConfirm('Delete Project', `Delete project "${name}"?`).then((yes) => {
            if (yes)
              void apiDeleteProject(name).then(() => {
                void showLoadModal();
              });
          });
        });
      });
    }
  } catch {
    body.innerHTML = '<p class="hint">Failed to load project list.</p>';
  }

  overlay.classList.remove('hidden');
}

export interface ProjectEntry {
  readonly name: string;
  readonly hash?: string;
  readonly casOnly: boolean;
}

export function mergeProjectEntries(local: readonly string[], cas: readonly CasHashEntry[]): ProjectEntry[] {
  const byName = new Map<string, ProjectEntry>();

  for (const name of local) {
    byName.set(name, { name, casOnly: false });
  }

  for (const entry of cas) {
    const label = `${entry.hash.slice(0, 12)}…`;
    if (!byName.has(label)) {
      byName.set(label, { name: label, hash: entry.hash, casOnly: true });
    }
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Persist locally and dual-write to CAS (CAS failure is non-fatal). */
export async function saveProjectWithCas(name: string, data: ProjectFile): Promise<{ saved: string }> {
  const result = await apiSaveProject(name, data);
  casStoreProject(data).catch(() => {
    // CAS unavailable — local save still succeeded
  });
  return result;
}

/** Load from local API, falling back to CAS when a hash is provided. */
export async function loadProjectFromServer(name: string, hash?: string): Promise<ProjectFile> {
  if (hash) {
    try {
      return await apiLoadProject(name);
    } catch {
      return await casFetchProject(hash);
    }
  }
  return await apiLoadProject(name);
}

/** Merge local project names with CAS index entries. */
export async function listMergedProjects(): Promise<readonly ProjectEntry[]> {
  const [localProjects, casIndex] = await Promise.all([
    apiListProjects().catch(() => [] as string[]),
    casListProjects().catch(() => ({ count: 0, hashes: [] as CasHashEntry[] })),
  ]);
  return mergeProjectEntries(localProjects, casIndex.hashes);
}

export async function deleteStoredProject(name: string): Promise<{ deleted: string }> {
  return apiDeleteProject(name);
}

async function loadProject(name: string, hash?: string): Promise<void> {
  try {
    const data = await loadProjectFromServer(name, hash);

    deselectShape();
    clearHistory();
    deserializeLayers(data.layers);
    currentProject = data.name || name;
    document.title = `FootPrint \u2014 ${currentProject}`;
    showToast(`Loaded: ${currentProject}`);
  } catch {
    void modalAlert('Error', 'Failed to load project.');
  }
}

function hideModal(): void {
  document.getElementById('modal-overlay')?.classList.add('hidden');
}

function showToast(msg: string): void {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed; bottom: 40px; left: 50%; transform: translateX(-50%);
    background: #1a1a2e; color: #2ecc71; padding: 10px 20px; border-radius: 6px;
    border: 1px solid #2ecc71; font-size: 13px; z-index: 3000;
    animation: fadeout 0.3s ease 1.5s forwards;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, TOAST_DURATION_MS);
}
