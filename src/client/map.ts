import * as L from 'leaflet';
import type { NominatimResult } from '../types/nominatim.js';

const DEFAULT_CENTER: L.LatLngTuple = [42.7085, -84.5537];
const DEFAULT_ZOOM = 18;

let map: L.Map;

const tileLayers = {
  satellite: L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Tiles &copy; Esri', maxZoom: 20 },
  ),
  street: L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 },
  ),
  labels: L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Labels &copy; Esri', maxZoom: 20, opacity: 0.7 },
  ),
} as const;

export function initMap(): L.Map {
  map = L.map('map', {
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
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
  return map;
}

function initGeocoder(): void {
  const input = document.getElementById('geocoder-input') as HTMLInputElement | null;
  const btn = document.getElementById('geocoder-btn');
  if (!input || !btn) return;

  async function doSearch(): Promise<void> {
    if (!input) return;
    const q = input.value.trim();
    if (!q) return;

    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`,
        { headers: { 'User-Agent': 'FootPrint-HomePlanner/1.0' } },
      );
      const results = (await resp.json()) as ReadonlyArray<NominatimResult>;
      if (results.length > 0) {
        const first = results[0];
        if (first) {
          map.setView([parseFloat(first.lat), parseFloat(first.lon)], 18);
          input.value = first.display_name;
        }
      } else {
        input.style.borderColor = '#c0392b';
        setTimeout(() => { input.style.borderColor = ''; }, 1500);
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

export function getMap(): L.Map {
  return map;
}
