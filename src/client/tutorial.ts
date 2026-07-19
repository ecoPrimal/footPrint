/**
 * Interactive E2E tutorial with step-by-step element highlighting.
 *
 * Guides new users through the core workflow: location selection,
 * drawing, data sources, dimensions, and project saving. Each step
 * spotlights a UI element and shows a contextual tooltip.
 */

const STORAGE_KEY = 'footprint_tutorial_complete';
const TUTORIAL_ACTIVE_KEY = 'footprint_tutorial_active';

export interface TutorialStep {
  target: string;
  title: string;
  body: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  action?: 'click' | 'input';
}

const STEPS: TutorialStep[] = [
  {
    target: '#location-picker',
    title: 'Choose a Location',
    body: 'Start by selecting a known location from this dropdown, or type an address in the search box to the right.',
    position: 'bottom',
  },
  {
    target: '#geocoder-input',
    title: 'Search Any Address',
    body: 'Type a street address here and hit Enter or click the search button to fly to that location on the map.',
    position: 'bottom',
  },
  {
    target: '#btn-toggle-layers',
    title: 'Open the Layers Panel',
    body: 'Click this button to open the sidebar where you can manage drawing layers and toggle data sources.',
    position: 'right',
    action: 'click',
  },
  {
    target: '#layer-panel',
    title: 'Layers & Data Sources',
    body: 'Here you see your drawing layers and available data sources (parcels, zoning, flood zones, terrain). Toggle them on/off with the checkboxes.',
    position: 'right',
  },
  {
    target: '#map',
    title: 'Draw Your Property',
    body: 'Use the polygon tool from the Leaflet toolbar (left side of the map) to outline your property boundary. Click to place vertices, double-click to finish.',
    position: 'top',
  },
  {
    target: '#btn-grid',
    title: 'Engineering Grid',
    body: 'Toggle an engineering grid overlay for precise alignment. Combines with snap for pixel-perfect placement.',
    position: 'bottom',
  },
  {
    target: '#btn-snap',
    title: 'Snap to Grid',
    body: 'Enable snapping so drawn vertices automatically align to the nearest grid point or existing geometry.',
    position: 'bottom',
  },
  {
    target: '#btn-measure',
    title: 'Measure Tool',
    body: 'Click on the map to measure distances and areas. Results display in feet and square feet.',
    position: 'bottom',
  },
  {
    target: '#props-panel',
    title: 'Shape Properties',
    body: 'When you select a shape, this panel shows area, perimeter, elevation data, setback analysis, and proximity to infrastructure.',
    position: 'left',
  },
  {
    target: '#btn-save',
    title: 'Save Your Project',
    body: 'Save your work locally (and to the cloud when connected). Projects persist between sessions.',
    position: 'bottom',
  },
  {
    target: '#agent-panel-header',
    title: 'AI Agent',
    body: 'Ask the AI agent questions about your property, zoning rules, or get suggestions. The agent has full access to your project data.',
    position: 'top',
  },
];

let currentStep = 0;
let overlay: HTMLDivElement | null = null;
let tooltip: HTMLDivElement | null = null;
let spotlight: HTMLDivElement | null = null;

function createOverlayElements(): void {
  overlay = document.createElement('div');
  overlay.id = 'tutorial-overlay';

  spotlight = document.createElement('div');
  spotlight.id = 'tutorial-spotlight';

  tooltip = document.createElement('div');
  tooltip.id = 'tutorial-tooltip';
  tooltip.setAttribute('role', 'tooltip');

  overlay.appendChild(spotlight);
  overlay.appendChild(tooltip);
  document.body.appendChild(overlay);
}

function destroyOverlay(): void {
  overlay?.remove();
  overlay = null;
  tooltip = null;
  spotlight = null;
  currentStep = 0;
}

/** @internal test-only: forcibly reset module state */
export function _resetState(): void {
  destroyOverlay();
}

function positionSpotlight(el: HTMLElement): void {
  if (!spotlight) return;
  const rect = el.getBoundingClientRect();
  const pad = 6;
  spotlight.style.top = `${String(rect.top - pad)}px`;
  spotlight.style.left = `${String(rect.left - pad)}px`;
  spotlight.style.width = `${String(rect.width + pad * 2)}px`;
  spotlight.style.height = `${String(rect.height + pad * 2)}px`;
}

function positionTooltip(el: HTMLElement, position: TutorialStep['position']): void {
  if (!tooltip) return;
  const rect = el.getBoundingClientRect();
  const gap = 12;

  tooltip.classList.remove('pos-top', 'pos-bottom', 'pos-left', 'pos-right');
  tooltip.classList.add(`pos-${position}`);

  switch (position) {
    case 'bottom':
      tooltip.style.top = `${String(rect.bottom + gap)}px`;
      tooltip.style.left = `${String(rect.left + rect.width / 2)}px`;
      tooltip.style.transform = 'translateX(-50%)';
      break;
    case 'top':
      tooltip.style.top = `${String(rect.top - gap)}px`;
      tooltip.style.left = `${String(rect.left + rect.width / 2)}px`;
      tooltip.style.transform = 'translate(-50%, -100%)';
      break;
    case 'right':
      tooltip.style.top = `${String(rect.top + rect.height / 2)}px`;
      tooltip.style.left = `${String(rect.right + gap)}px`;
      tooltip.style.transform = 'translateY(-50%)';
      break;
    case 'left':
      tooltip.style.top = `${String(rect.top + rect.height / 2)}px`;
      tooltip.style.left = `${String(rect.left - gap)}px`;
      tooltip.style.transform = 'translate(-100%, -50%)';
      break;
  }
}

function renderStep(): void {
  const step = STEPS[currentStep];
  if (!step || !tooltip || !spotlight) return;

  const target = document.querySelector<HTMLElement>(step.target);
  if (!target) {
    if (currentStep < STEPS.length - 1) { currentStep++; renderStep(); }
    else { completeTutorial(); }
    return;
  }

  if (target.scrollIntoView) {
    target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  positionSpotlight(target);
  positionTooltip(target, step.position);

  tooltip!.innerHTML = `
    <div class="tutorial-header">
      <span class="tutorial-step-counter">${String(currentStep + 1)} / ${String(STEPS.length)}</span>
      <button class="tutorial-close" aria-label="Skip tutorial">&times;</button>
    </div>
    <h4 class="tutorial-title">${step.title}</h4>
    <p class="tutorial-body">${step.body}</p>
    <div class="tutorial-nav">
      <button class="tutorial-btn tutorial-prev" ${currentStep === 0 ? 'disabled' : ''}>Back</button>
      <button class="tutorial-btn tutorial-next">${currentStep === STEPS.length - 1 ? 'Finish' : 'Next'}</button>
    </div>
  `;

  tooltip!.querySelector('.tutorial-close')?.addEventListener('click', completeTutorial);
  tooltip!.querySelector('.tutorial-prev')?.addEventListener('click', prevStep);
  tooltip!.querySelector('.tutorial-next')?.addEventListener('click', nextStep);
}

function nextStep(): void {
  if (currentStep >= STEPS.length - 1) {
    completeTutorial();
    return;
  }
  currentStep++;
  renderStep();
}

function prevStep(): void {
  if (currentStep <= 0) return;
  currentStep--;
  renderStep();
}

function completeTutorial(): void {
  localStorage.setItem(STORAGE_KEY, '1');
  localStorage.removeItem(TUTORIAL_ACTIVE_KEY);
  destroyOverlay();
  currentStep = 0;
}

export function startTutorial(): void {
  if (document.getElementById('tutorial-overlay')) return;
  currentStep = 0;
  localStorage.setItem(TUTORIAL_ACTIVE_KEY, '1');
  createOverlayElements();
  renderStep();

  overlay?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') completeTutorial();
    if (e.key === 'ArrowRight') nextStep();
    if (e.key === 'ArrowLeft') prevStep();
  });

  overlay?.setAttribute('tabindex', '-1');
  overlay?.focus();
}

export function isTutorialComplete(): boolean {
  return localStorage.getItem(STORAGE_KEY) === '1';
}

export function resetTutorial(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(TUTORIAL_ACTIVE_KEY);
}

export function initTutorial(): void {
  const helpBtn = document.getElementById('btn-tutorial');
  helpBtn?.addEventListener('click', () => {
    resetTutorial();
    startTutorial();
  });

  if (!isTutorialComplete()) {
    setTimeout(() => { startTutorial(); }, 500);
  }
}
