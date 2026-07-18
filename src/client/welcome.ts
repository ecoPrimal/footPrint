/**
 * First-run welcome overlay.
 *
 * Shows on first visit (localStorage key). Dismissible, never shows again.
 * Guides new users through the key features and known locations.
 */

import { KNOWN_LOCATIONS } from '../constants.js';

const STORAGE_KEY = 'footprint_welcome_seen';

export function initWelcome(): void {
  if (localStorage.getItem(STORAGE_KEY)) return;

  const overlay = document.createElement('div');
  overlay.id = 'welcome-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'welcome-title');

  const locationList = KNOWN_LOCATIONS.map(
    (loc) => `<li><strong>${loc.name}</strong> — ${loc.description}</li>`,
  ).join('');

  overlay.innerHTML = `
    <div class="welcome-card">
      <h2 id="welcome-title">Welcome to FootPrint</h2>
      <p class="welcome-subtitle">GIS Home Improvement Planner</p>

      <div class="welcome-steps">
        <div class="welcome-step">
          <span class="step-num">1</span>
          <span>Pick a <strong>Known Location</strong> from the dropdown, or search an address</span>
        </div>
        <div class="welcome-step">
          <span class="step-num">2</span>
          <span>Draw your <strong>property boundary</strong> using the polygon tool (left toolbar)</span>
        </div>
        <div class="welcome-step">
          <span class="step-num">3</span>
          <span><strong>Data sources</strong> auto-enable — parcels, zoning, flood zones, terrain</span>
        </div>
        <div class="welcome-step">
          <span class="step-num">4</span>
          <span>Add <strong>dimensions &amp; constraints</strong> — click edges to set distances</span>
        </div>
      </div>

      <details class="welcome-locations">
        <summary>Explore Known Locations</summary>
        <ul>${locationList}</ul>
      </details>

      <button id="welcome-dismiss" class="welcome-btn" aria-label="Get started">Get Started</button>
    </div>
  `;

  document.body.appendChild(overlay);

  const dismissBtn = overlay.querySelector('#welcome-dismiss');
  dismissBtn?.addEventListener('click', () => {
    localStorage.setItem(STORAGE_KEY, '1');
    overlay.remove();
  });

  overlay.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      localStorage.setItem(STORAGE_KEY, '1');
      overlay.remove();
    }
  });

  (dismissBtn as HTMLElement | null)?.focus();
}
