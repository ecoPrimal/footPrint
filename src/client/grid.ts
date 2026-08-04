// SPDX-License-Identifier: AGPL-3.0-or-later
import * as L from 'leaflet';
import { ftToMeters } from '../types/snap.js';
import { DEFAULT_GRID_SPACING_FT, GRID_MIN_ZOOM, GRID_COLOR, GRID_MAX_LINES } from '../constants.js';

let map: L.Map | null = null;
const gridLayer: L.LayerGroup = L.layerGroup();
let gridEnabled = false;
const spacingFt = DEFAULT_GRID_SPACING_FT;
let onGridChange: ((enabled: boolean, spacing: number) => void) | null = null;

export function initGrid(leafletMap: L.Map, changeCallback?: (enabled: boolean, spacing: number) => void): void {
  map = leafletMap;
  onGridChange = changeCallback ?? null;

  map.on('moveend', () => {
    if (gridEnabled) renderGrid();
  });
  map.on('zoomend', () => {
    if (gridEnabled) renderGrid();
  });
}

export function isGridEnabled(): boolean {
  return gridEnabled;
}

export function getGridSpacing(): number {
  return spacingFt;
}

export function toggleGrid(): boolean {
  gridEnabled = !gridEnabled;
  if (gridEnabled && map) {
    gridLayer.addTo(map);
    renderGrid();
  } else {
    gridLayer.clearLayers();
    if (map) map.removeLayer(gridLayer);
  }
  if (onGridChange) onGridChange(gridEnabled, spacingFt);
  return gridEnabled;
}

function renderGrid(): void {
  gridLayer.clearLayers();
  if (!map) return;

  const zoom = map.getZoom();
  if (zoom < GRID_MIN_ZOOM) return;

  const bounds = map.getBounds().pad(0.1);
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();

  const spacingM = ftToMeters(spacingFt);
  const spacingDegLat = spacingM / 111139;
  const midLat = (sw.lat + ne.lat) / 2;
  const spacingDegLng = spacingM / (111139 * Math.cos((midLat * Math.PI) / 180));

  const startLat = Math.floor(sw.lat / spacingDegLat) * spacingDegLat;
  const startLng = Math.floor(sw.lng / spacingDegLng) * spacingDegLng;

  let lineCount = 0;

  for (let lat = startLat; lat <= ne.lat; lat += spacingDegLat) {
    lineCount++;
    const latIdx = Math.round((lat - startLat) / spacingDegLat);
    const isMajor = latIdx % 5 === 0;

    L.polyline(
      [
        [lat, sw.lng],
        [lat, ne.lng],
      ],
      {
        color: GRID_COLOR,
        weight: isMajor ? 1 : 0.5,
        opacity: isMajor ? 0.3 : 0.12,
        interactive: false,
      },
    ).addTo(gridLayer);

    if (lineCount > GRID_MAX_LINES) break;
  }

  lineCount = 0;
  for (let lng = startLng; lng <= ne.lng; lng += spacingDegLng) {
    lineCount++;
    const lngIdx = Math.round((lng - startLng) / spacingDegLng);
    const isMajor = lngIdx % 5 === 0;

    L.polyline(
      [
        [sw.lat, lng],
        [ne.lat, lng],
      ],
      {
        color: GRID_COLOR,
        weight: isMajor ? 1 : 0.5,
        opacity: isMajor ? 0.3 : 0.12,
        interactive: false,
      },
    ).addTo(gridLayer);

    if (lineCount > GRID_MAX_LINES) break;
  }
}
