// SPDX-License-Identifier: AGPL-3.0-or-later
import * as L from 'leaflet';
import { getElevationAt } from './terrain.js';

let map: L.Map | null = null;

export function initStatusBar(leafletMap: L.Map): void {
  map = leafletMap;

  map.on('mousemove', (e: L.LeafletMouseEvent) => {
    updateCoords(e.latlng);
  });

  map.on('zoomend', () => {
    updateZoom();
  });

  updateZoom();
}

function updateCoords(latlng: L.LatLng): void {
  const el = document.getElementById('status-coords');
  if (el) {
    el.textContent = `Lat: ${latlng.lat.toFixed(6)}  Lng: ${latlng.lng.toFixed(6)}`;
  }

  const elevEl = document.getElementById('status-elev');
  if (elevEl) {
    const elev = getElevationAt(latlng.lat, latlng.lng);
    elevEl.textContent = elev !== null ? `Elev: ${String(Math.round(elev))}'` : 'Elev: --';
  }
}

function updateZoom(): void {
  if (!map) return;
  const zoom = map.getZoom();

  const zoomEl = document.getElementById('status-zoom');
  if (zoomEl) {
    zoomEl.textContent = `Zoom: ${String(zoom)}`;
  }

  const scaleEl = document.getElementById('status-scale');
  if (scaleEl) {
    const metersPerPixel = (40075016.686 * Math.cos((map.getCenter().lat * Math.PI) / 180)) / Math.pow(2, zoom + 8);
    const scale = Math.round((metersPerPixel * 96) / 0.0254);
    scaleEl.textContent = `1:${scale.toLocaleString()}`;
  }
}

export function updateSnapStatus(info: string | null): void {
  const el = document.getElementById('status-snap');
  if (el) {
    el.textContent = info ? `Snap: ${info}` : 'Snap: ON';
  }
}

export function updateSnapEnabled(enabled: boolean): void {
  const el = document.getElementById('status-snap');
  if (el) {
    el.textContent = enabled ? 'Snap: ON' : 'Snap: OFF';
  }
}

export function updateGridStatus(enabled: boolean, spacingFt: number): void {
  const el = document.getElementById('status-grid');
  if (el) {
    el.textContent = enabled ? `Grid: ${String(spacingFt)}ft` : 'Grid: OFF';
  }
}

export function updateCasStatus(available: boolean): void {
  const el = document.getElementById('status-cas');
  if (el) {
    el.textContent = available ? 'CAS: ON' : 'CAS: OFF';
  }
}
