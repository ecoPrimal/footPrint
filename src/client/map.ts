import * as L from 'leaflet';
import type { NominatimResult } from '../types/nominatim.js';
import {
  DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, NOMINATIM_SEARCH_URL,
  BASEMAP_SATELLITE_URL, BASEMAP_STREET_URL, BASEMAP_LABELS_URL,
  GEOCODER_ZOOM, GEOCODER_ERROR_FLASH_MS, KNOWN_LOCATIONS,
} from '../constants.js';
import { proxyGet } from './api.js';

let map: L.Map;

const tileLayers = {
  satellite: L.tileLayer(BASEMAP_SATELLITE_URL, { attribution: 'Tiles &copy; Esri', maxZoom: 20 }),
  street: L.tileLayer(BASEMAP_STREET_URL, { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }),
  labels: L.tileLayer(BASEMAP_LABELS_URL, { attribution: 'Labels &copy; Esri', maxZoom: 20, opacity: 0.7 }),
} as const;

export function initMap(): L.Map {
  const startLocation = resolveStartLocation();

  map = L.map('map', {
    center: [...startLocation.center] as L.LatLngTuple,
    zoom: startLocation.zoom,
    zoomControl: true,
    layers: [tileLayers.satellite],
  });

  const baseLayers: Record<string, L.TileLayer> = {
    'Satellite': tileLayers.satellite,
    'Street': tileLayers.street,
  };
  const overlays: Record<string, L.TileLayer> = {
    'Road Labels': tileLayers.labels,
  };
  L.control.layers(baseLayers, overlays, { position: 'topright' }).addTo(map);

  initGeocoder();
  initLocationPicker();
  return map;
}

function resolveStartLocation(): { center: readonly [number, number]; zoom: number } {
  const hash = location.hash.replace('#', '');
  if (hash) {
    const loc = KNOWN_LOCATIONS.find(l => l.id === hash);
    if (loc) return loc;
  }
  return { center: DEFAULT_MAP_CENTER, zoom: DEFAULT_MAP_ZOOM };
}

function initLocationPicker(): void {
  const picker = document.getElementById('location-picker');
  if (!(picker instanceof HTMLSelectElement)) return;

  for (const loc of KNOWN_LOCATIONS) {
    const opt = document.createElement('option');
    opt.value = loc.id;
    opt.textContent = loc.name;
    picker.appendChild(opt);
  }

  picker.addEventListener('change', () => {
    const loc = KNOWN_LOCATIONS.find(l => l.id === picker.value);
    if (loc) {
      map.setView([...loc.center] as L.LatLngTuple, loc.zoom);
      location.hash = loc.id;
      picker.value = '';
    }
  });

  window.addEventListener('hashchange', () => {
    const hash = location.hash.replace('#', '');
    const loc = KNOWN_LOCATIONS.find(l => l.id === hash);
    if (loc) {
      map.setView([...loc.center] as L.LatLngTuple, loc.zoom);
    }
  });
}

function initGeocoder(): void {
  const inputEl = document.getElementById('geocoder-input');
  const btn = document.getElementById('geocoder-btn');
  if (!(inputEl instanceof HTMLInputElement) || !btn) return;
  const input = inputEl;

  async function doSearch(): Promise<void> {
    if (!input) return;
    const q = input.value.trim();
    if (!q) return;

    try {
      const results = await proxyGet<ReadonlyArray<NominatimResult>>(
        `${NOMINATIM_SEARCH_URL}?format=json&q=${encodeURIComponent(q)}&limit=1`,
      );
      if (results.length > 0) {
        const first = results[0];
        if (first) {
          map.setView([parseFloat(first.lat), parseFloat(first.lon)], GEOCODER_ZOOM);
          input.value = first.display_name;
        }
      } else {
        input.style.borderColor = '#c0392b';
        setTimeout(() => { input.style.borderColor = ''; }, GEOCODER_ERROR_FLASH_MS);
      }
    } catch {
      console.error('Geocoder request failed');
    }
  }

  btn.addEventListener('click', () => { void doSearch(); });
  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') void doSearch();
  });
}

