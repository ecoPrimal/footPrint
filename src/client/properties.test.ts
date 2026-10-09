// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StyleComponent } from '../core/entity.js';
import { entityIdFrom } from '../core/entity.js';
import { hexColorUnchecked } from '../types/brands.js';
import type { ShapeStatus } from '../types/shape.js';

vi.mock('../core/store.js', () => ({
  store: {
    get: vi.fn(),
  },
}));

vi.mock('../core/history.js', () => ({
  execute: vi.fn(),
}));

vi.mock('../core/renderer.js', () => ({
  getLeafletLayer: vi.fn(() => null),
}));

vi.mock('./measurement.js', () => ({
  computeMeasurement: vi.fn(() => '12.5 ft'),
}));

vi.mock('./drawing.js', () => ({
  deleteSelectedShape: vi.fn(),
  deselectShape: vi.fn(),
}));

vi.mock('./modal.js', () => ({
  modalConfirm: vi.fn(() => Promise.resolve(true)),
}));

function setupDom() {
  document.body.innerHTML = `
    <div id="props-panel" class="collapsed">
      <button id="btn-close-props"></button>
      <div id="props-content"><p class="hint">Select a shape to view properties.</p></div>
    </div>
  `;
}

function createShapeEntity(overrides?: {
  label?: string;
  notes?: string;
  status?: ShapeStatus;
  color?: string;
}) {
  return {
    ok: true,
    value: {
      kind: 'shape' as const,
      id: entityIdFrom('shape-001'),
      components: {
        meta: {
          label: overrides?.label ?? 'Test Shape',
          notes: overrides?.notes ?? 'Some notes',
          status: overrides?.status ?? 'planned',
          createdAt: '2026-08-01',
        },
        style: {
          color: hexColorUnchecked(overrides?.color ?? '#ff0000'),
          weight: 3,
          opacity: 0.9,
          fillOpacity: 0.25,
        } satisfies StyleComponent,
        geometry: {
          geojson: { type: 'Point', coordinates: [0, 0] },
          shapeType: 'marker' as const,
        },
      },
    },
  };
}

describe('properties panel', () => {
  let properties: typeof import('./properties.js');
  let storeMod: { store: { get: ReturnType<typeof vi.fn> } };
  let rendererMod: { getLeafletLayer: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.resetModules();
    setupDom();
    properties = await import('./properties.js');
    storeMod = await import('../core/store.js') as unknown as typeof storeMod;
    rendererMod = await import('../core/renderer.js') as unknown as typeof rendererMod;
  });

  describe('initProperties', () => {
    it('registers close button listener', () => {
      const btn = document.getElementById('btn-close-props')!;
      const spy = vi.spyOn(btn, 'addEventListener');
      properties.initProperties();
      expect(spy).toHaveBeenCalledWith('click', expect.any(Function));
    });
  });

  describe('showShapeProperties', () => {
    it('hides panel when entity is null', () => {
      const panel = document.getElementById('props-panel')!;
      panel.classList.remove('collapsed');
      properties.showShapeProperties(null);
      expect(panel.classList.contains('collapsed')).toBe(true);
    });

    it('hides panel when entity not found in store', () => {
      storeMod.store.get.mockReturnValue({ ok: false, error: 'not found' });
      const panel = document.getElementById('props-panel')!;
      panel.classList.remove('collapsed');
      properties.showShapeProperties(entityIdFrom('missing-001'));
      expect(panel.classList.contains('collapsed')).toBe(true);
    });

    it('renders label, notes, status and color inputs for valid shape', () => {
      const entity = createShapeEntity({ label: 'Back Fence', notes: 'Cedar' });
      storeMod.store.get.mockReturnValue(entity);
      properties.showShapeProperties(entityIdFrom('shape-001'));

      const panel = document.getElementById('props-panel')!;
      expect(panel.classList.contains('collapsed')).toBe(false);

      const labelInput = document.querySelector<HTMLInputElement>('#prop-label')!;
      expect(labelInput.value).toBe('Back Fence');

      const notesArea = document.querySelector<HTMLTextAreaElement>('#prop-notes')!;
      expect(notesArea.textContent).toBe('Cedar');

      const colorInput = document.querySelector<HTMLInputElement>('#prop-color')!;
      expect(colorInput.value).toBe('#ff0000');
    });

    it('renders correct status option as selected', () => {
      const entity = createShapeEntity({ status: 'in-progress' });
      storeMod.store.get.mockReturnValue(entity);
      properties.showShapeProperties(entityIdFrom('shape-001'));

      const select = document.querySelector<HTMLSelectElement>('#prop-status')!;
      expect(select.value).toBe('in-progress');
    });

    it('includes measurement when leaflet layer exists', () => {
      const entity = createShapeEntity();
      storeMod.store.get.mockReturnValue(entity);
      rendererMod.getLeafletLayer.mockReturnValue({});
      properties.showShapeProperties(entityIdFrom('shape-001'));

      const measureDiv = document.querySelector('.prop-measurement');
      expect(measureDiv).not.toBeNull();
      expect(measureDiv!.textContent).toBe('12.5 ft');
    });

    it('omits measurement div when no leaflet layer', () => {
      const entity = createShapeEntity();
      storeMod.store.get.mockReturnValue(entity);
      rendererMod.getLeafletLayer.mockReturnValue(null);
      properties.showShapeProperties(entityIdFrom('shape-001'));

      expect(document.querySelector('.prop-measurement')).toBeNull();
    });

    it('executes UpdateComponentCommand on label input', async () => {
      const entity = createShapeEntity();
      storeMod.store.get.mockReturnValue(entity);
      properties.showShapeProperties(entityIdFrom('shape-001'));

      const { execute } = await import('../core/history.js');
      const labelInput = document.querySelector<HTMLInputElement>('#prop-label')!;
      Object.defineProperty(labelInput, 'value', { value: 'New Label', writable: true });
      labelInput.dispatchEvent(new Event('input', { bubbles: true }));

      expect(execute).toHaveBeenCalled();
    });

    it('executes UpdateComponentCommand on color change', async () => {
      const entity = createShapeEntity();
      storeMod.store.get.mockReturnValue(entity);
      properties.showShapeProperties(entityIdFrom('shape-001'));

      const { execute } = await import('../core/history.js');
      const colorInput = document.querySelector<HTMLInputElement>('#prop-color')!;
      Object.defineProperty(colorInput, 'value', { value: '#00ff00', writable: true });
      colorInput.dispatchEvent(new Event('input', { bubbles: true }));

      expect(execute).toHaveBeenCalled();
    });

    it('escapes HTML in label preventing script injection', () => {
      const entity = createShapeEntity({ label: '<script>xss</script>', notes: '&danger' });
      storeMod.store.get.mockReturnValue(entity);
      properties.showShapeProperties(entityIdFrom('shape-001'));

      const content = document.getElementById('props-content')!;
      expect(content.querySelector('script')).toBeNull();
      const labelInput = content.querySelector<HTMLInputElement>('#prop-label')!;
      expect(labelInput.value).toBe('<script>xss</script>');
    });

    it('renders delete button that triggers modal confirm', async () => {
      const entity = createShapeEntity();
      storeMod.store.get.mockReturnValue(entity);
      properties.showShapeProperties(entityIdFrom('shape-001'));

      const deleteBtn = document.querySelector<HTMLButtonElement>('#btn-delete-shape')!;
      expect(deleteBtn).not.toBeNull();
      deleteBtn.click();

      const { modalConfirm } = await import('./modal.js');
      expect(modalConfirm).toHaveBeenCalledWith('Delete Shape', 'Delete this shape?');
    });
  });
});
