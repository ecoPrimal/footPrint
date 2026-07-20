/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startTutorial, isTutorialComplete, resetTutorial, initTutorial, _resetState } from './tutorial.js';

function setupDOM(): void {
  document.body.innerHTML = `
    <select id="location-picker"></select>
    <input id="geocoder-input" />
    <button id="btn-toggle-layers"></button>
    <aside id="layer-panel"></aside>
    <main id="map"></main>
    <button id="btn-grid"></button>
    <button id="btn-snap"></button>
    <button id="btn-measure"></button>
    <aside id="props-panel"></aside>
    <button id="btn-save"></button>
    <div id="agent-panel-header"></div>
    <button id="btn-tutorial"></button>
  `;
}

describe('tutorial', () => {
  beforeEach(() => {
    localStorage.clear();
    setupDOM();
    vi.useFakeTimers();
  });

  afterEach(() => {
    _resetState();
    vi.useRealTimers();
  });

  it('starts and creates overlay DOM', () => {
    startTutorial();
    expect(document.getElementById('tutorial-overlay')).not.toBeNull();
    expect(document.getElementById('tutorial-spotlight')).not.toBeNull();
    expect(document.getElementById('tutorial-tooltip')).not.toBeNull();
  });

  it('shows step 1 content', () => {
    startTutorial();
    const tooltip = document.getElementById('tutorial-tooltip');
    expect(tooltip?.innerHTML).toContain('Choose a Location');
    expect(tooltip?.innerHTML).toContain('1 / 11');
  });

  it('navigates forward with Next button', () => {
    startTutorial();
    const tooltip = document.getElementById('tutorial-tooltip');
    const nextBtn = tooltip?.querySelector('.tutorial-next') as HTMLButtonElement;
    nextBtn.click();
    expect(tooltip?.innerHTML).toContain('Search Any Address');
    expect(tooltip?.innerHTML).toContain('2 / 11');
  });

  it('navigates back with Back button', () => {
    startTutorial();
    const tooltip = document.getElementById('tutorial-tooltip');
    (tooltip?.querySelector('.tutorial-next') as HTMLButtonElement).click();
    (tooltip?.querySelector('.tutorial-prev') as HTMLButtonElement).click();
    expect(tooltip?.innerHTML).toContain('Choose a Location');
  });

  it('completes tutorial and sets localStorage', () => {
    startTutorial();
    expect(isTutorialComplete()).toBe(false);

    const tooltip = document.getElementById('tutorial-tooltip');
    for (let i = 0; i < 11; i++) {
      const nextBtn = tooltip?.querySelector('.tutorial-next') as HTMLButtonElement;
      if (nextBtn) nextBtn.click();
    }

    expect(isTutorialComplete()).toBe(true);
    expect(document.getElementById('tutorial-overlay')).toBeNull();
  });

  it('closes on Escape key', () => {
    startTutorial();
    const overlay = document.getElementById('tutorial-overlay')!;
    overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.getElementById('tutorial-overlay')).toBeNull();
    expect(isTutorialComplete()).toBe(true);
  });

  it('closes via X button', () => {
    startTutorial();
    const closeBtn = document.querySelector('.tutorial-close') as HTMLButtonElement;
    closeBtn.click();
    expect(document.getElementById('tutorial-overlay')).toBeNull();
  });

  it('resetTutorial clears completion state', () => {
    localStorage.setItem('footprint_tutorial_complete', '1');
    expect(isTutorialComplete()).toBe(true);
    resetTutorial();
    expect(isTutorialComplete()).toBe(false);
  });

  it('initTutorial auto-starts for new users after delay', () => {
    initTutorial();
    expect(document.getElementById('tutorial-overlay')).toBeNull();
    vi.advanceTimersByTime(600);
    expect(document.getElementById('tutorial-overlay')).not.toBeNull();
  });

  it('initTutorial does not auto-start if already completed', () => {
    localStorage.setItem('footprint_tutorial_complete', '1');
    initTutorial();
    vi.advanceTimersByTime(600);
    expect(document.getElementById('tutorial-overlay')).toBeNull();
  });

  it('Guide button re-triggers tutorial', () => {
    localStorage.setItem('footprint_tutorial_complete', '1');
    initTutorial();
    const btn = document.getElementById('btn-tutorial')!;
    btn.click();
    expect(document.getElementById('tutorial-overlay')).not.toBeNull();
    expect(isTutorialComplete()).toBe(false);
  });

  it('does not create duplicate overlays', () => {
    startTutorial();
    startTutorial();
    expect(document.querySelectorAll('#tutorial-overlay').length).toBe(1);
  });

  it('skips steps when target element is missing', () => {
    document.getElementById('location-picker')?.remove();
    startTutorial();
    const tooltip = document.getElementById('tutorial-tooltip');
    expect(tooltip?.innerHTML).toContain('Search Any Address');
  });
});
