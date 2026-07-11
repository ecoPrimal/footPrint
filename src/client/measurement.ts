import * as L from 'leaflet';
import * as turf from '@turf/turf';
import {
  FEET_PER_METER,
  SQ_FEET_PER_SQ_METER,
  FEET_PER_MILE,
  SQ_FEET_PER_ACRE,
} from '../constants.js';

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
  const line = turf.lineString(currentPts);
  const length = turf.length(line, { units: 'feet' });

  tooltip.classList.remove('hidden');
  tooltip.style.left = e.originalEvent.clientX + 14 + 'px';
  tooltip.style.top = e.originalEvent.clientY - 14 + 'px';
  tooltip.textContent = formatLength(length);

  if (tempLine) measureLayers.removeLayer(tempLine);
  tempLine = L.polyline(
    currentPts.map((p) => [p[1], p[0]] as L.LatLngTuple),
    { color: '#ff6b81', weight: 2, dashArray: '6 4' },
  );
  measureLayers.addLayer(tempLine);
}

function updateMeasureLine(): void {
  if (tempLine) measureLayers.removeLayer(tempLine);

  const latlngs: L.LatLngTuple[] = measurePoints.map((p) => [p[1], p[0]] as L.LatLngTuple);
  const line = L.polyline(latlngs, { color: '#ff6b81', weight: 2 });
  measureLayers.addLayer(line);

  const lastTwo = measurePoints.slice(-2) as [[number, number], [number, number]];
  const seg = turf.lineString(lastTwo);
  const segLen = turf.length(seg, { units: 'feet' });
  const mid = turf.midpoint(turf.point(lastTwo[0]), turf.point(lastTwo[1]));

  const label = L.marker(
    [mid.geometry.coordinates[1], mid.geometry.coordinates[0]] as L.LatLngTuple,
    {
      icon: L.divIcon({ className: 'measure-label', html: formatLength(segLen) }),
      interactive: false,
    },
  );
  measureLayers.addLayer(label);
}

function finishMeasure(e: L.LeafletEvent): void {
  L.DomEvent.preventDefault(e as unknown as Event);
  const tooltip = document.getElementById('measure-tooltip');
  tooltip?.classList.add('hidden');

  if (measurePoints.length >= 3) {
    const closed: Array<[number, number]> = [...measurePoints, measurePoints[0]!];
    const poly = turf.polygon([closed]);
    const area = turf.area(poly);
    const areaSqFt = area * SQ_FEET_PER_SQ_METER;
    const centroid = turf.centroid(poly);

    const areaLabel = L.marker(
      [centroid.geometry.coordinates[1], centroid.geometry.coordinates[0]] as L.LatLngTuple,
      {
        icon: L.divIcon({ className: 'measure-label', html: `Area: ${formatArea(areaSqFt)}` }),
        interactive: false,
      },
    );
    measureLayers.addLayer(areaLabel);
  }

  if (measurePoints.length >= 2) {
    const line = turf.lineString(measurePoints);
    const totalLen = turf.length(line, { units: 'feet' });
    const last = measurePoints[measurePoints.length - 1];
    if (last) {
      const totalLabel = L.marker([last[1], last[0]] as L.LatLngTuple, {
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

    if (!('toGeoJSON' in shape)) return null;
    const geo = (shape as L.Layer & { toGeoJSON(): GeoJSON.Feature }).toGeoJSON() as GeoJSON.Feature;
    const gtype = geo.geometry.type;

    if (gtype === 'LineString' || gtype === 'MultiLineString') {
      const len = turf.length(geo as GeoJSON.Feature<GeoJSON.LineString | GeoJSON.MultiLineString>, { units: 'feet' });
      return `Length: <span>${formatLength(len)}</span>`;
    }

    if (gtype === 'Polygon' || gtype === 'MultiPolygon') {
      const polyFeature = geo as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
      const area = turf.area(polyFeature);
      const areaSqFt = area * SQ_FEET_PER_SQ_METER;
      const lineFeature = turf.polygonToLine(polyFeature as GeoJSON.Feature<GeoJSON.Polygon>);
      const perimeter = turf.length(lineFeature, { units: 'feet' });
      return `Area: <span>${formatArea(areaSqFt)}</span> · Perimeter: <span>${formatLength(perimeter)}</span>`;
    }

    if (gtype === 'Point') {
      const coords = (geo.geometry as GeoJSON.Point).coordinates;
      const lng = coords[0];
      const lat = coords[1];
      if (lng != null && lat != null) {
        return `Position: <span>${lat.toFixed(6)}, ${lng.toFixed(6)}</span>`;
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
