import * as L from 'leaflet';
import { area } from '@turf/area';
import { centroid } from '@turf/centroid';
import { length as turfLength } from '@turf/length';
import { midpoint } from '@turf/midpoint';
import { polygonToLine } from '@turf/polygon-to-line';
import { lineString, point, polygon } from '@turf/helpers';
import {
  FEET_PER_METER,
  SQ_FEET_PER_SQ_METER,
  FEET_PER_MILE,
  SQ_FEET_PER_ACRE,
} from '../constants.js';
import { layerToFeature } from './geojson.js';

function toLatLng(pos: readonly number[]): L.LatLngTuple {
  return [pos[1] ?? 0, pos[0] ?? 0];
}

let map: L.Map | null = null;
let measureMode = false;
let measurePoints: Array<[number, number]> = [];
const measureLayers: L.FeatureGroup = L.featureGroup();
let tempLine: L.Polyline | null = null;

export function initMeasurement(leafletMap: L.Map): void {
  map = leafletMap;
  measureLayers.addTo(map);

  const btn = document.getElementById('btn-measure');
  if (btn) btn.addEventListener('click', () => { toggleMeasureMode(); });
}

function toggleMeasureMode(): void {
  if (!map) return;
  measureMode = !measureMode;
  const btn = document.getElementById('btn-measure');

  if (measureMode) {
    btn?.classList.add('active');
    map.getContainer().style.cursor = 'crosshair';
    map.pm.disableDraw();
    map.on('click', onMeasureClick);
    map.on('mousemove', onMeasureMove);
    map.on('contextmenu', finishMeasure);
  } else {
    btn?.classList.remove('active');
    map.getContainer().style.cursor = '';
    map.off('click', onMeasureClick);
    map.off('mousemove', onMeasureMove);
    map.off('contextmenu', finishMeasure);
    clearMeasure();
  }
}

function onMeasureClick(e: L.LeafletMouseEvent): void {
  measurePoints.push([e.latlng.lng, e.latlng.lat]);

  const marker = L.circleMarker(e.latlng, {
    radius: 4,
    color: '#ff6b81',
    fillColor: '#ff6b81',
    fillOpacity: 1,
  });
  measureLayers.addLayer(marker);

  if (measurePoints.length >= 2) {
    updateMeasureLine();
  }
}

function onMeasureMove(e: L.LeafletMouseEvent): void {
  if (measurePoints.length === 0) return;
  const tooltip = document.getElementById('measure-tooltip');
  if (!tooltip) return;

  const currentPts: Array<[number, number]> = [...measurePoints, [e.latlng.lng, e.latlng.lat]];
  const line = lineString(currentPts);
  const length = turfLength(line, { units: 'feet' });

  tooltip.classList.remove('hidden');
  tooltip.style.left = e.originalEvent.clientX + 14 + 'px';
  tooltip.style.top = e.originalEvent.clientY - 14 + 'px';
  tooltip.textContent = formatLength(length);

  if (tempLine) measureLayers.removeLayer(tempLine);
  tempLine = L.polyline(
    currentPts.map(toLatLng),
    { color: '#ff6b81', weight: 2, dashArray: '6 4' },
  );
  measureLayers.addLayer(tempLine);
}

function updateMeasureLine(): void {
  if (tempLine) measureLayers.removeLayer(tempLine);

  const latlngs: L.LatLngTuple[] = measurePoints.map(toLatLng);
  const line = L.polyline(latlngs, { color: '#ff6b81', weight: 2 });
  measureLayers.addLayer(line);

  const a = measurePoints[measurePoints.length - 2];
  const b = measurePoints[measurePoints.length - 1];
  if (!a || !b) return;
  const seg = lineString([a, b]);
  const segLen = turfLength(seg, { units: 'feet' });
  const mid = midpoint(point(a), point(b));

  const label = L.marker(
    toLatLng(mid.geometry.coordinates),
    {
      icon: L.divIcon({ className: 'measure-label', html: formatLength(segLen) }),
      interactive: false,
    },
  );
  measureLayers.addLayer(label);
}

function finishMeasure(e: L.LeafletEvent): void {
  if ('preventDefault' in e && typeof e.preventDefault === 'function') {
    (e as { preventDefault(): void }).preventDefault();
  }
  const tooltip = document.getElementById('measure-tooltip');
  tooltip?.classList.add('hidden');

  if (measurePoints.length >= 3) {
    const closed: Array<[number, number]> = [...measurePoints, measurePoints[0]!];
    const poly = polygon([closed]);
    const polyArea = area(poly);
    const areaSqFt = polyArea * SQ_FEET_PER_SQ_METER;
    const center = centroid(poly);

    const areaLabel = L.marker(
      toLatLng(center.geometry.coordinates),
      {
        icon: L.divIcon({ className: 'measure-label', html: `Area: ${formatArea(areaSqFt)}` }),
        interactive: false,
      },
    );
    measureLayers.addLayer(areaLabel);
  }

  if (measurePoints.length >= 2) {
    const line = lineString(measurePoints);
    const totalLen = turfLength(line, { units: 'feet' });
    const last = measurePoints[measurePoints.length - 1];
    if (last) {
      const totalLabel = L.marker(toLatLng(last), {
        icon: L.divIcon({ className: 'measure-label', html: `Total: ${formatLength(totalLen)}` }),
        interactive: false,
      });
      measureLayers.addLayer(totalLabel);
    }
  }

  measurePoints = [];
  tempLine = null;
}

function clearMeasure(): void {
  measureLayers.clearLayers();
  measurePoints = [];
  tempLine = null;
  document.getElementById('measure-tooltip')?.classList.add('hidden');
}

export function computeMeasurement(shape: L.Layer): string | null {
  try {
    if (shape instanceof L.Circle && shape.getRadius) {
      const r = shape.getRadius();
      const rFt = r * FEET_PER_METER;
      const areaSqFt = Math.PI * rFt * rFt;
      const circumFt = 2 * Math.PI * rFt;
      return `Radius: <span>${formatLength(rFt)}</span> · Area: <span>${formatArea(areaSqFt)}</span> · Circumference: <span>${formatLength(circumFt)}</span>`;
    }

    const geo = layerToFeature(shape);
    if (!geo) return null;
    const g = geo.geometry;

    switch (g.type) {
      case 'LineString':
      case 'MultiLineString': {
        const len = turfLength({ type: 'Feature', properties: {}, geometry: g }, { units: 'feet' });
        return `Length: <span>${formatLength(len)}</span>`;
      }
      case 'Polygon': {
        const polyArea = area({ type: 'Feature', properties: {}, geometry: g });
        const areaSqFt = polyArea * SQ_FEET_PER_SQ_METER;
        const lineFeature = polygonToLine({ type: 'Feature', properties: {}, geometry: g });
        const perimeter = turfLength(lineFeature, { units: 'feet' });
        return `Area: <span>${formatArea(areaSqFt)}</span> · Perimeter: <span>${formatLength(perimeter)}</span>`;
      }
      case 'MultiPolygon': {
        const polyArea = area({ type: 'Feature', properties: {}, geometry: g });
        const areaSqFt = polyArea * SQ_FEET_PER_SQ_METER;
        return `Area: <span>${formatArea(areaSqFt)}</span>`;
      }
      case 'Point': {
        const lng = g.coordinates[0];
        const lat = g.coordinates[1];
        if (lng != null && lat != null) {
          return `Position: <span>${lat.toFixed(6)}, ${lng.toFixed(6)}</span>`;
        }
        break;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function formatLength(feet: number): string {
  if (feet >= FEET_PER_MILE) return `${(feet / FEET_PER_MILE).toFixed(2)} mi`;
  if (feet >= 100) return `${Math.round(feet)} ft`;
  return `${feet.toFixed(1)} ft`;
}

function formatArea(sqFt: number): string {
  if (sqFt >= SQ_FEET_PER_ACRE) return `${(sqFt / SQ_FEET_PER_ACRE).toFixed(2)} acres`;
  return `${Math.round(sqFt).toLocaleString()} sq ft`;
}
