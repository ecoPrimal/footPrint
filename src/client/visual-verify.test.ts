/** @vitest-environment jsdom */
/**
 * Visual verification tests — DOM structure smoke tests.
 *
 * Validates that the HTML layout, critical elements, ARIA attributes, and
 * element relationships are correct. These tests act as a contract between
 * the HTML template and the client modules that query the DOM.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let doc: Document;

beforeAll(() => {
  const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf-8');
  doc = new DOMParser().parseFromString(html, 'text/html');
});

describe('visual verification — page skeleton', () => {
  it('has correct title', () => {
    expect(doc.title).toContain('FootPrint');
  });

  it('has favicon link', () => {
    const link = doc.querySelector('link[rel="icon"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('/favicon.svg');
  });

  it('has app.css stylesheet', () => {
    const css = doc.querySelector('link[rel="stylesheet"]');
    expect(css).not.toBeNull();
    expect(css?.getAttribute('href')).toBe('/css/app.css');
  });

  it('has module script entry point', () => {
    const script = doc.querySelector('script[type="module"]');
    expect(script).not.toBeNull();
    expect(script?.getAttribute('src')).toBe('/src/client/app.ts');
  });
});

describe('visual verification — toolbar', () => {
  it('has toolbar header with correct role', () => {
    const toolbar = doc.getElementById('toolbar');
    expect(toolbar).not.toBeNull();
    expect(toolbar?.getAttribute('role')).toBe('toolbar');
    expect(toolbar?.tagName).toBe('HEADER');
  });

  it('has three toolbar sections', () => {
    const toolbar = doc.getElementById('toolbar');
    const left = toolbar?.querySelector('.toolbar-left');
    const center = toolbar?.querySelector('.toolbar-center');
    const right = toolbar?.querySelector('.toolbar-right');
    expect(left).not.toBeNull();
    expect(center).not.toBeNull();
    expect(right).not.toBeNull();
  });

  it('has logo text', () => {
    const logo = doc.querySelector('.logo');
    expect(logo?.textContent).toBe('FootPrint');
  });

  it('has layer panel toggle button', () => {
    const btn = doc.getElementById('btn-toggle-layers');
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute('aria-controls')).toBe('layer-panel');
    expect(btn?.getAttribute('aria-expanded')).toBe('false');
  });

  it('has location picker select', () => {
    const picker = doc.getElementById('location-picker');
    expect(picker).not.toBeNull();
    expect(picker?.tagName).toBe('SELECT');
    expect(picker?.getAttribute('aria-label')).toBe('Jump to known location');
  });

  it('has geocoder input', () => {
    const input = doc.getElementById('geocoder-input');
    expect(input).not.toBeNull();
    expect(input?.getAttribute('type')).toBe('text');
    expect(input?.getAttribute('aria-label')).toBe('Search address');
  });

  it('has geocoder search button', () => {
    const btn = doc.getElementById('geocoder-btn');
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute('aria-label')).toBe('Search address');
  });

  it('has project management buttons', () => {
    for (const id of ['btn-new', 'btn-save', 'btn-load']) {
      expect(doc.getElementById(id)).not.toBeNull();
    }
  });

  it('has toolbar tool buttons', () => {
    for (const id of ['btn-grid', 'btn-snap', 'btn-measure']) {
      const btn = doc.getElementById(id);
      expect(btn).not.toBeNull();
      expect(btn?.getAttribute('aria-pressed')).toBe('false');
    }
  });

  it('has tutorial guide button', () => {
    const btn = doc.getElementById('btn-tutorial');
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute('aria-label')).toBe('Start guided tutorial');
  });
});

describe('visual verification — main layout', () => {
  it('has app container', () => {
    const app = doc.getElementById('app');
    expect(app).not.toBeNull();
  });

  it('has map main element with correct role', () => {
    const map = doc.getElementById('map');
    expect(map).not.toBeNull();
    expect(map?.tagName).toBe('MAIN');
    expect(map?.getAttribute('role')).toBe('application');
    expect(map?.getAttribute('aria-label')).toBe('Interactive map');
  });

  it('has left sidebar (layer panel) with correct structure', () => {
    const panel = doc.getElementById('layer-panel');
    expect(panel).not.toBeNull();
    expect(panel?.tagName).toBe('ASIDE');
    expect(panel?.getAttribute('role')).toBe('complementary');

    const layerList = doc.getElementById('layer-list');
    expect(layerList).not.toBeNull();
    expect(layerList?.getAttribute('role')).toBe('listbox');

    const sourceList = doc.getElementById('data-source-list');
    expect(sourceList).not.toBeNull();
    expect(sourceList?.getAttribute('role')).toBe('list');
  });

  it('has add-layer button inside panel', () => {
    const btn = doc.getElementById('btn-add-layer');
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute('aria-label')).toBe('Add custom layer');
  });

  it('has discovery panel (hidden by default)', () => {
    const panel = doc.getElementById('discovery-panel');
    expect(panel).not.toBeNull();
    expect(panel?.classList.contains('hidden')).toBe(true);
  });

  it('has right sidebar (properties panel) collapsed by default', () => {
    const panel = doc.getElementById('props-panel');
    expect(panel).not.toBeNull();
    expect(panel?.tagName).toBe('ASIDE');
    expect(panel?.classList.contains('collapsed')).toBe(true);

    const content = doc.getElementById('props-content');
    expect(content).not.toBeNull();
  });
});

describe('visual verification — modal system', () => {
  it('has modal overlay hidden by default', () => {
    const overlay = doc.getElementById('modal-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay?.classList.contains('hidden')).toBe(true);
    expect(overlay?.getAttribute('role')).toBe('dialog');
    expect(overlay?.getAttribute('aria-modal')).toBe('true');
  });

  it('has modal inner structure', () => {
    const modal = doc.getElementById('modal');
    expect(modal).not.toBeNull();

    const title = doc.getElementById('modal-title');
    expect(title).not.toBeNull();

    const body = doc.getElementById('modal-body');
    expect(body).not.toBeNull();

    const close = doc.getElementById('modal-close');
    expect(close).not.toBeNull();
    expect(close?.getAttribute('aria-label')).toBe('Close dialog');
  });
});

describe('visual verification — agent panel', () => {
  it('has agent panel with correct structure', () => {
    const panel = doc.getElementById('agent-panel');
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute('role')).toBe('complementary');
    expect(panel?.classList.contains('agent-collapsed')).toBe(true);
  });

  it('has agent header with status dot and toggle', () => {
    const header = doc.getElementById('agent-panel-header');
    expect(header).not.toBeNull();

    const dot = doc.getElementById('agent-status-dot');
    expect(dot).not.toBeNull();
    expect(dot?.classList.contains('agent-dot-disconnected')).toBe(true);

    const toggle = doc.getElementById('btn-toggle-agent');
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
  });

  it('has agent input system', () => {
    const input = doc.getElementById('agent-input');
    expect(input).not.toBeNull();
    expect(input?.getAttribute('aria-label')).toBe('Message the AI');

    const send = doc.getElementById('agent-send');
    expect(send).not.toBeNull();

    const log = doc.getElementById('agent-log');
    expect(log).not.toBeNull();
    expect(log?.getAttribute('role')).toBe('log');
    expect(log?.getAttribute('aria-live')).toBe('polite');
  });
});

describe('visual verification — status bar', () => {
  it('has status bar footer with correct role', () => {
    const bar = doc.getElementById('status-bar');
    expect(bar).not.toBeNull();
    expect(bar?.tagName).toBe('FOOTER');
    expect(bar?.getAttribute('role')).toBe('status');
    expect(bar?.getAttribute('aria-live')).toBe('polite');
  });

  it('has all status segments', () => {
    for (const id of ['status-coords', 'status-zoom', 'status-scale', 'status-snap', 'status-grid', 'status-elev']) {
      const el = doc.getElementById(id);
      expect(el).not.toBeNull();
    }
  });
});

describe('visual verification — accessibility contract', () => {
  it('all interactive elements have aria-labels', () => {
    const buttons = doc.querySelectorAll('button');
    for (const btn of buttons) {
      const label = btn.getAttribute('aria-label') ?? btn.getAttribute('title');
      expect(label, `Button missing aria-label/title: ${btn.id || btn.textContent}`).toBeTruthy();
    }
  });

  it('all inputs have labels or aria-labels', () => {
    const inputs = doc.querySelectorAll('input, select');
    for (const input of inputs) {
      const hasAriaLabel = input.getAttribute('aria-label');
      const hasLabel = input.id && doc.querySelector(`label[for="${input.id}"]`);
      expect(
        hasAriaLabel || hasLabel,
        `Input missing label: ${input.id}`,
      ).toBeTruthy();
    }
  });

  it('landmark roles are unique and present', () => {
    const main = doc.querySelectorAll('main');
    expect(main.length).toBe(1);

    const toolbars = doc.querySelectorAll('[role="toolbar"]');
    expect(toolbars.length).toBe(1);

    const complementary = doc.querySelectorAll('[role="complementary"]');
    expect(complementary.length).toBeGreaterThanOrEqual(2);
  });

  it('dialog has required ARIA attributes', () => {
    const dialog = doc.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-labelledby')).toBe('modal-title');
  });

  it('no duplicate IDs in document', () => {
    const allIds = Array.from(doc.querySelectorAll('[id]')).map(el => el.id);
    const duplicates = allIds.filter((id, i) => allIds.indexOf(id) !== i);
    expect(duplicates).toEqual([]);
  });
});

describe('visual verification — element count contract', () => {
  it('has expected number of toolbar buttons', () => {
    const toolbar = doc.getElementById('toolbar');
    const buttons = toolbar?.querySelectorAll('button') ?? [];
    expect(buttons.length).toBeGreaterThanOrEqual(8);
  });

  it('has measurement tooltip container', () => {
    const tooltip = doc.getElementById('measure-tooltip');
    expect(tooltip).not.toBeNull();
    expect(tooltip?.classList.contains('hidden')).toBe(true);
  });

  it('has sr-only labels for accessibility', () => {
    const srOnly = doc.querySelectorAll('.sr-only');
    expect(srOnly.length).toBeGreaterThanOrEqual(2);
  });
});
