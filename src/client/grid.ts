import * as L from 'leaflet';
import { ftToMeters } from '../types/snap.js';

let map: L.Map | null = null;
let gridLayer: L.LayerGroup = L.layerGroup();
let gridEnabled = false;
let spacingFt = 10;
let onGridChange: ((enabled: boolean, spacing: number) => void) | null = null;

const MIN_ZOOM = 17;

export function initGrid(
  leafletMap: L.Map,
  changeCallback?: (enabled: boolean, spacing: number) => void,
): void {
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
  if (gridEnabled) {
    gridLayer.addTo(map!);
    renderGrid();
  } else {
    gridLayer.clearLayers();
    if (map) map.removeLayer(gridLayer);
  }
  if (onGridChange) onGridChange(gridEnabled, spacingFt);
  return gridEnabled;
}

export function setGridSpacing(ft: number): void {
  spacingFt = ft;
  if (gridEnabled) renderGrid();
  if (onGridChange) onGridChange(gridEnabled, spacingFt);
}

function renderGrid(): void {
  gridLayer.clearLayers();
  if (!map) return;

  const zoom = map.getZoom();
  if (zoom < MIN_ZOOM) return;

  const bounds = map.getBounds().pad(0.1);
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();

  const spacingM = ftToMeters(spacingFt);
  const spacingDegLat = spacingM / 111139;
  const midLat = (sw.lat + ne.lat) / 2;
  const spacingDegLng = spacingM / (111139 * Math.cos(midLat * Math.PI / 180));

  const startLat = Math.floor(sw.lat / spacingDegLat) * spacingDegLat;
  const startLng = Math.floor(sw.lng / spacingDegLng) * spacingDegLng;

  let lineCount = 0;

  for (let lat = startLat; lat <= ne.lat; lat += spacingDegLat) {
    lineCount++;
    const latIdx = Math.round((lat - startLat) / spacingDegLat);
    const isMajor = latIdx % 5 === 0;

    L.polyline(
      [[lat, sw.lng], [lat, ne.lng]],
      {
        color: '#4FC3F7',
        weight: isMajor ? 1 : 0.5,
        opacity: isMajor ? 0.3 : 0.12,
        interactive: false,
      },
    ).addTo(gridLayer);

    if (lineCount > 500) break;
  }

  lineCount = 0;
  for (let lng = startLng; lng <= ne.lng; lng += spacingDegLng) {
    lineCount++;
    const lngIdx = Math.round((lng - startLng) / spacingDegLng);
    const isMajor = lngIdx % 5 === 0;

    L.polyline(
      [[sw.lat, lng], [ne.lat, lng]],
      {
        color: '#4FC3F7',
        weight: isMajor ? 1 : 0.5,
        opacity: isMajor ? 0.3 : 0.12,
        interactive: false,
      },
    ).addTo(gridLayer);

    if (lineCount > 500) break;
  }
}
