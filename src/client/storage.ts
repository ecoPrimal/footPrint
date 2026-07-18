import type { ProjectFile } from '../types/project.js';
import { serializeLayers, deserializeLayers } from './layers.js';
import { deselectShape } from './drawing.js';
import { clearHistory } from '../core/history.js';
import { listProjects as apiListProjects, loadProject as apiLoadProject, saveProject as apiSaveProject, deleteProject as apiDeleteProject } from './api.js';
import { escHtml } from './html.js';
import { TOAST_DURATION_MS } from '../constants.js';

let currentProject: string | null = null;

export function initStorage(): void {
  document.getElementById('btn-new')?.addEventListener('click', () => { newProject(); });
  document.getElementById('btn-save')?.addEventListener('click', () => { void saveProject(); });
  document.getElementById('btn-load')?.addEventListener('click', () => { void showLoadModal(); });
  document.getElementById('modal-close')?.addEventListener('click', hideModal);
  document.getElementById('modal-overlay')?.addEventListener('click', (e: MouseEvent) => {
    if (e.target instanceof HTMLElement && e.target.id === 'modal-overlay') hideModal();
  });
}

function newProject(): void {
  const name = prompt('New project name:');
  if (!name) return;
  currentProject = name;
  deselectShape();
  clearHistory();
  document.title = `FootPrint \u2014 ${name}`;
}

async function saveProject(): Promise<void> {
  if (!currentProject) {
    const name = prompt('Project name:');
    if (!name) return;
    currentProject = name;
  }

  const data: ProjectFile = {
    name: currentProject,
    savedAt: new Date().toISOString(),
    layers: serializeLayers(),
  };

  try {
    const result = await apiSaveProject(currentProject, data);
    document.title = `FootPrint \u2014 ${currentProject}`;
    showToast(`Saved: ${result.saved}`);
  } catch {
    alert('Failed to save project');
  }
}

async function showLoadModal(): Promise<void> {
  const overlay = document.getElementById('modal-overlay');
  const body = document.getElementById('modal-body');
  const title = document.getElementById('modal-title');
  if (!overlay || !body || !title) return;
  title.textContent = 'Load Project';

  try {
    const projects = await apiListProjects();

    if (projects.length === 0) {
      body.innerHTML = '<p class="hint">No saved projects yet.</p>';
    } else {
      body.innerHTML = projects.map((name) => `
        <div class="project-item" data-name="${escHtml(name)}">
          <span>${escHtml(name)}</span>
          <button class="project-delete" data-name="${escHtml(name)}" title="Delete">&times;</button>
        </div>
      `).join('');

      body.querySelectorAll('.project-item').forEach((el) => {
        if (!(el instanceof HTMLElement)) return;
        el.addEventListener('click', (e: Event) => {
          if (e.target instanceof HTMLElement && e.target.classList.contains('project-delete')) return;
          void loadProject(el.dataset['name'] ?? '').then(hideModal);
        });
      });

      body.querySelectorAll('.project-delete').forEach((btn) => {
        if (!(btn instanceof HTMLElement)) return;
        btn.addEventListener('click', (e: Event) => {
          e.stopPropagation();
          const name = btn.dataset['name'];
          if (!name || !confirm(`Delete project "${name}"?`)) return;
          void apiDeleteProject(name).then(() => { void showLoadModal(); });
        });
      });
    }
  } catch {
    body.innerHTML = '<p class="hint">Failed to load project list.</p>';
  }

  overlay.classList.remove('hidden');
}

async function loadProject(name: string): Promise<void> {
  try {
    const data = await apiLoadProject(name);

    deselectShape();
    clearHistory();
    deserializeLayers(data.layers);
    currentProject = data.name || name;
    document.title = `FootPrint \u2014 ${currentProject}`;
    showToast(`Loaded: ${currentProject}`);
  } catch {
    alert('Failed to load project');
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
  setTimeout(() => { toast.remove(); }, TOAST_DURATION_MS);
}

