// SPDX-License-Identifier: AGPL-3.0-or-later
import type { EntityId, StyleComponent } from '../core/entity.js';
import { store } from '../core/store.js';
import { execute } from '../core/history.js';
import { UpdateComponentCommand } from '../core/commands.js';
import { deleteSelectedShape, deselectShape } from './drawing.js';
import { modalConfirm } from './modal.js';
import { computeMeasurement } from './measurement.js';
import { getLeafletLayer } from '../core/renderer.js';
import type { ShapeStatus } from '../types/shape.js';
import { parseHexColor, hexColorUnchecked } from '../types/brands.js';
import { escHtml } from './html.js';
import { unwrapOr } from '../rustscript/result.js';

const panel = document.getElementById('props-panel');
const content = document.getElementById('props-content');
const closeBtn = document.getElementById('btn-close-props');

export function initProperties(): void {
  closeBtn?.addEventListener('click', () => {
    deselectShape();
    hidePanel();
  });
}

export function showShapeProperties(entityId: EntityId | null): void {
  if (!entityId) {
    hidePanel();
    return;
  }

  const res = store.get(entityId);
  if (!res.ok || res.value.kind !== 'shape') {
    hidePanel();
    return;
  }
  const entity = res.value;

  panel?.classList.remove('collapsed');

  const meta = entity.components.meta;
  const style = entity.components.style;

  const leafletLayer = getLeafletLayer(entityId);
  const measurement = leafletLayer ? computeMeasurement(leafletLayer) : '';

  if (!content) return;

  const colorValue = style?.color ?? '#e94560';

  content.innerHTML = `
    <div class="prop-group">
      <label>Label</label>
      <input type="text" id="prop-label" value="${escHtml(meta.label)}" placeholder="e.g. Back fence" />
    </div>
    <div class="prop-group">
      <label>Notes</label>
      <textarea id="prop-notes" placeholder="Add notes\u2026">${escHtml(meta.notes)}</textarea>
    </div>
    <div class="prop-group">
      <label>Status</label>
      <select id="prop-status">
        <option value="planned" ${meta.status === 'planned' ? 'selected' : ''}>Planned</option>
        <option value="in-progress" ${meta.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
        <option value="complete" ${meta.status === 'complete' ? 'selected' : ''}>Complete</option>
      </select>
    </div>
    <div class="prop-group">
      <label>Color</label>
      <input type="color" id="prop-color" value="${colorValue}" />
    </div>
    ${measurement ? `<div class="prop-measurement">${measurement}</div>` : ''}
    <button id="btn-delete-shape">Delete Shape</button>
  `;

  let currentMeta = { ...meta };

  content.querySelector('#prop-label')?.addEventListener('input', (e: Event) => {
    if (!(e.target instanceof HTMLInputElement)) return;
    currentMeta = { ...currentMeta, label: e.target.value };
    execute(new UpdateComponentCommand(entityId, 'meta', currentMeta));
  });

  content.querySelector('#prop-notes')?.addEventListener('input', (e: Event) => {
    if (!(e.target instanceof HTMLTextAreaElement)) return;
    currentMeta = { ...currentMeta, notes: e.target.value };
    execute(new UpdateComponentCommand(entityId, 'meta', currentMeta));
  });

  content.querySelector('#prop-status')?.addEventListener('change', (e: Event) => {
    if (!(e.target instanceof HTMLSelectElement)) return;
    currentMeta = { ...currentMeta, status: e.target.value as ShapeStatus };
    execute(new UpdateComponentCommand(entityId, 'meta', currentMeta));
  });

  content.querySelector('#prop-color')?.addEventListener('input', (e: Event) => {
    if (!(e.target instanceof HTMLInputElement)) return;
    const rawColor = e.target.value;
    const newColor = unwrapOr(parseHexColor(rawColor), hexColorUnchecked('#e94560'));
    const newStyle: StyleComponent = {
      color: newColor,
      weight: style?.weight ?? 3,
      opacity: style?.opacity ?? 0.9,
      fillOpacity: style?.fillOpacity ?? 0.25,
    };
    execute(new UpdateComponentCommand(entityId, 'style', newStyle));
  });

  content.querySelector('#btn-delete-shape')?.addEventListener('click', () => {
    void modalConfirm('Delete Shape', 'Delete this shape?').then((yes) => {
      if (yes) {
        deleteSelectedShape();
        hidePanel();
      }
    });
  });
}

function hidePanel(): void {
  panel?.classList.add('collapsed');
  if (content) {
    content.innerHTML = '<p class="hint">Select a shape to view properties.</p>';
  }
}
