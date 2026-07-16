import * as L from 'leaflet';
import { centroid } from '@turf/centroid';
import { distance } from '@turf/distance';
import { nearestPointOnLine } from '@turf/nearest-point-on-line';
import { buffer } from '@turf/buffer';
import { booleanIntersects } from '@turf/boolean-intersects';
import { lineIntersect } from '@turf/line-intersect';
import { bearing } from '@turf/bearing';
import { polygonToLine } from '@turf/polygon-to-line';
import { point } from '@turf/helpers';
import { FEET_PER_METER, CONFLICT_BUFFER_M } from '../constants.js';
import type { ProximityResult } from '../types/spatial.js';
import { escHtml } from './html.js';
import { layerToFeature } from './geojson.js';
import type { EntityId } from '../core/entity.js';
import { getAllSources } from './datasources.js';
import { batchElevation } from './sources/usgs.js';
import { getLeafletLayer } from '../core/renderer.js';

let map: L.Map | null = null;
let alertLayer: L.LayerGroup = L.layerGroup();

export function initIntelligence(leafletMap: L.Map): void {
  map = leafletMap;
  alertLayer.addTo(map);
}

/** Extract [lng, lat] pair from a GeoJSON Position or Turf point. */
function coordPair(coords: GeoJSON.Position): [number, number] {
  return [coords[0] ?? 0, coords[1] ?? 0];
}

/** Extract the `dist` property from a Turf nearest-point result. */
function snapDist(feat: GeoJSON.Feature): number {
  const d = feat.properties?.['dist'];
  return typeof d === 'number' ? d : 0;
}

export function computeProximity(shape: L.Layer): ProximityResult[] {
  const geo = layerToFeature(shape);
  if (!geo) return [];
  const shapeCenter = centroid(geo);

  let shapeBoundary: GeoJSON.Feature | null = null;
  if (geo.geometry.type === 'Polygon' || geo.geometry.type === 'MultiPolygon') {
    try {
      shapeBoundary = polygonToLine(
        geo as GeoJSON.Feature<GeoJSON.Polygon>,
      ) as GeoJSON.Feature;
    } catch {
      // fall back to centroid
    }
  }

  const results: ProximityResult[] = [];
  const sources = getAllSources();

  for (const src of Object.values(sources)) {
    if (!src.enabled || src.type !== 'vector') continue;

    const geoLayer = src.layer as L.GeoJSON;
    let nearest: ProximityResult | null = null;
    let nearestDist = Infinity;

    geoLayer.eachLayer((sub: L.Layer) => {
      const feat = layerToFeature(sub);
      if (!feat) return;

      try {
        let dist: number;
        let nearPt: [number, number];

        if (feat.geometry.type === 'Point') {
          const coords = coordPair(feat.geometry.coordinates);
          if (shapeBoundary) {
            const snapped = nearestPointOnLine(
              shapeBoundary as GeoJSON.Feature<GeoJSON.LineString>,
              point(coords),
              { units: 'meters' },
            );
            dist = snapDist(snapped);
          } else {
            dist = distance(shapeCenter, point(coords), { units: 'meters' });
          }
          nearPt = coords;
        } else if (feat.geometry.type === 'LineString') {
          if (shapeBoundary) {
            const snapped = nearestPointOnLine(
              feat as GeoJSON.Feature<GeoJSON.LineString>,
              shapeCenter,
              { units: 'meters' },
            );
            const snapCoords = coordPair(snapped.geometry.coordinates);
            const toShape = nearestPointOnLine(
              shapeBoundary as GeoJSON.Feature<GeoJSON.LineString>,
              point(snapCoords),
              { units: 'meters' },
            );
            dist = snapDist(toShape);
            nearPt = snapCoords;
          } else {
            const snapped = nearestPointOnLine(
              feat as GeoJSON.Feature<GeoJSON.LineString>,
              shapeCenter,
              { units: 'meters' },
            );
            dist = snapDist(snapped);
            nearPt = coordPair(snapped.geometry.coordinates);
          }
        } else if (feat.geometry.type === 'Polygon' || feat.geometry.type === 'MultiPolygon') {
          try {
            const featBoundary = polygonToLine(
              feat as GeoJSON.Feature<GeoJSON.Polygon>,
            ) as GeoJSON.Feature<GeoJSON.LineString>;
            if (shapeBoundary) {
              const snapped = nearestPointOnLine(featBoundary, shapeCenter, { units: 'meters' });
              const snapCoords = coordPair(snapped.geometry.coordinates);
              const toShape = nearestPointOnLine(
                shapeBoundary as GeoJSON.Feature<GeoJSON.LineString>,
                point(snapCoords),
                { units: 'meters' },
              );
              dist = snapDist(toShape);
              nearPt = snapCoords;
            } else {
              const snapped = nearestPointOnLine(featBoundary, shapeCenter, { units: 'meters' });
              dist = snapDist(snapped);
              nearPt = coordPair(snapped.geometry.coordinates);
            }
          } catch {
            const fc = centroid(feat);
            dist = distance(shapeCenter, fc, { units: 'meters' });
            nearPt = coordPair(fc.geometry.coordinates);
          }
        } else {
          const fc = centroid(feat);
          dist = distance(shapeCenter, fc, { units: 'meters' });
          nearPt = coordPair(fc.geometry.coordinates);
        }

        if (dist < nearestDist) {
          nearestDist = dist;
          const dir = bearing(shapeCenter, point(nearPt));
          nearest = {
            sourceId: src.id,
            sourceName: src.name,
            feature: feat,
            distance: Math.round(dist * 10) / 10,
            bearing: Math.round(dir),
            nearestPoint: nearPt,
          };
        }
      } catch {
        // skip malformed
      }
    });

    if (nearest) {
      results.push(nearest);
    }
  }

  results.sort((a, b) => a.distance - b.distance);
  return results;
}

function formatProximityHtml(results: ProximityResult[]): string {
  if (results.length === 0) return '';

  const rows = results.slice(0, 8).map((r) => {
    const distFt = Math.round(r.distance * FEET_PER_METER);
    const dir = compassDir(r.bearing);
    return `<div class="proximity-row">
      <span class="proximity-name">${escHtml(r.sourceName)}</span>
      <span class="proximity-dist">${String(distFt)} ft ${dir}</span>
    </div>`;
  });

  return `<div class="proximity-section">
    <div class="proximity-header">Nearby Features</div>
    ${rows.join('')}
  </div>`;
}

function compassDir(bearing: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(((bearing + 360) % 360) / 45) % 8;
  return dirs[idx] ?? 'N';
}

const UTILITY_SOURCE_IDS: readonly string[] = [
  'osm-power', 'osm-pipelines', 'osm-water',
  'osm-manholes', 'osm-hydrants', 'osm-poles',
];

function detectConflicts(shape: L.Layer): GeoJSON.Feature[] {
  const geo = layerToFeature(shape);
  if (!geo) return [];

  let buffered: GeoJSON.Feature;
  try {
    buffered = buffer(geo, CONFLICT_BUFFER_M, { units: 'meters' }) as GeoJSON.Feature;
  } catch {
    buffered = geo;
  }

  const conflicts: GeoJSON.Feature[] = [];
  const sources = getAllSources();

  for (const id of UTILITY_SOURCE_IDS) {
    const src = sources[id];
    if (!src?.enabled || src.type !== 'vector') continue;

    const geoLayer = src.layer as L.GeoJSON;
    geoLayer.eachLayer((sub: L.Layer) => {
      const feat = layerToFeature(sub);
      if (!feat) return;
      try {
        if (booleanIntersects(buffered, feat)) {
          conflicts.push(feat);
        }
      } catch {
        // skip
      }
    });
  }

  return conflicts;
}

export function renderConflicts(shape: L.Layer): void {
  alertLayer.clearLayers();
  const conflicts = detectConflicts(shape);

  const geo = layerToFeature(shape);
  if (!geo) return;

  for (const conflict of conflicts) {
    try {
      let intersectPt: [number, number] | null = null;

      if (conflict.geometry.type === 'LineString' && (geo.geometry.type === 'Polygon' || geo.geometry.type === 'LineString')) {
        const crossed = lineIntersect(
          geo as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.LineString>,
          conflict as GeoJSON.Feature<GeoJSON.LineString>,
        );
        const firstFeature = crossed.features[0];
        if (firstFeature) {
          intersectPt = coordPair(firstFeature.geometry.coordinates);
        }
      }

      if (!intersectPt) {
        const c = centroid(conflict);
        intersectPt = coordPair(c.geometry.coordinates);
      }

      L.marker([intersectPt[1], intersectPt[0]], {
        icon: L.divIcon({
          className: 'conflict-marker',
          html: '\u26A0',
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        }),
      }).addTo(alertLayer);
    } catch {
      // skip
    }
  }
}

export async function elevationAtVertices(shape: L.Layer): Promise<string> {
  const geo = layerToFeature(shape);
  if (!geo) return '';

  let coords: Array<[number, number]> = [];
  const g = geo.geometry;
  switch (g.type) {
    case 'Polygon': {
      const ring = g.coordinates[0];
      if (ring) coords = ring.map(coordPair);
      break;
    }
    case 'LineString':
      coords = g.coordinates.map(coordPair);
      break;
    case 'Point':
      coords = [coordPair(g.coordinates)];
      break;
    default:
      break;
  }

  if (coords.length === 0) return '';

  const points = coords.slice(0, 20).map((c) => ({ lat: c[1], lng: c[0] }));
  const samples = await batchElevation(points);
  const elevations = samples
    .filter((s): s is { lat: number; lng: number; elevation: number } => s.elevation !== null)
    .map((s) => s.elevation);

  if (elevations.length === 0) return '';

  const min = Math.min(...elevations);
  const max = Math.max(...elevations);
  const delta = max - min;

  return `<div class="elevation-section">
    <div class="proximity-header">Elevation</div>
    <div class="proximity-row">
      <span class="proximity-name">Min / Max</span>
      <span class="proximity-dist">${String(Math.round(min))}' / ${String(Math.round(max))}'</span>
    </div>
    <div class="proximity-row">
      <span class="proximity-name">Relief</span>
      <span class="proximity-dist">${String(Math.round(delta * 10) / 10)}'</span>
    </div>
  </div>`;
}

export function computeProximityForEntity(entityId: EntityId): string {
  const layer = getLeafletLayer(entityId);
  if (!layer) return '';
  const results = computeProximity(layer);
  return formatProximityHtml(results);
}

export function renderConflictsForEntity(entityId: EntityId): void {
  const layer = getLeafletLayer(entityId);
  if (!layer) return;
  renderConflicts(layer);
}

export async function elevationAtVerticesForEntity(entityId: EntityId): Promise<string> {
  const layer = getLeafletLayer(entityId);
  if (!layer) return '';
  return elevationAtVertices(layer);
}
