import * as L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import { area } from '@turf/area';
import { distance } from '@turf/distance';
import { centroid } from '@turf/centroid';
import type { ScoredSource, DiscoveryReport } from '../types/spatial.js';
import { DEFAULT_CATEGORY_BOOSTS } from '../types/spatial.js';
import { getAllSources, fetchSource, enableSource, fetchAllEnabled } from './datasources.js';
import { buildTerrainGrid, renderContours, renderSlopeArrows } from './terrain.js';
import { boundedChannel } from '../rustscript/channel.js';
import { Owned, take } from '../rustscript/owned.js';
import { isOk } from '../rustscript/result.js';
import {
  SQ_FEET_PER_SQ_METER, FEET_PER_METER, METERS_PER_DEGREE_LAT,
  DISCOVERY_DEBOUNCE_MS, DISCOVERY_BUFFER_RADIUS_M,
  DISCOVERY_MAX_FEATURE_SAMPLE, DISCOVERY_PROXIMITY_RADIUS_M,
} from '../constants.js';
import { store } from '../core/store.js';
import { extractCoords } from '../core/geometry.js';
import { escHtml } from './html.js';
import { layerToFeature } from './geojson.js';

let map: L.Map | null = null;
let onDiscovery: ((report: DiscoveryReport) => void) | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;


const AUTO_ENABLE_IDS: readonly string[] = [
  'osm-buildings', 'osm-power', 'parcels', 'osm-fences',
  'osm-poles', 'osm-manholes', 'osm-hydrants',
];

function isPropertyLayerEntity(entityId: string): boolean {
  const res = store.get(entityId as import('../types/brands.js').EntityId);
  if (!res.ok) return false;
  const entity = res.value;
  if (entity.kind !== 'layer') return false;
  return entity.components.layer.layerName === 'Property Boundary';
}

export function initDiscover(
  leafletMap: L.Map,
  discoveryCallback?: (report: DiscoveryReport) => void,
): void {
  map = leafletMap;
  onDiscovery = discoveryCallback ?? null;

  store.on((event) => {
    if (event.type !== 'add') return;
    if (!map) return;

    const res = store.get(event.entityId);
    if (!res.ok) return;
    const entity = res.value;

    if (entity.kind !== 'shape') return;
    if (!entity.parentId || !isPropertyLayerEntity(entity.parentId)) return;

    const geo = entity.components.geometry;
    if (!geo) return;

    const coords = extractCoords(geo);
    if (coords.length < 2) return;

    const bounds = L.latLngBounds(
      coords.map(c => L.latLng(c[1], c[0])),
    );

    void runDiscovery(bounds, {
      type: 'Feature',
      properties: {},
      geometry: geo.geojson as unknown as GeoJSON.Geometry,
    });
  });

  map.on('moveend', () => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void fetchAllEnabled();
    }, DISCOVERY_DEBOUNCE_MS);
  });
}

async function runDiscovery(
  shapeBounds: L.LatLngBounds,
  propertyGeom: GeoJSON.Feature | null,
): Promise<void> {
  if (!map) return;

  const allSrc = getAllSources();
  for (const id of AUTO_ENABLE_IDS) {
    const src = allSrc[id];
    if (src && !src.enabled) {
      await enableSource(id);
    }
  }

  let propertyArea = 0;
  if (propertyGeom) {
    const geomType = propertyGeom.geometry.type;
    if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
      propertyArea = area(propertyGeom);
    }
  }

  const padRatio = DISCOVERY_BUFFER_RADIUS_M / METERS_PER_DEGREE_LAT / (shapeBounds.getNorth() - shapeBounds.getSouth() || 0.001);
  const buffered = shapeBounds.pad(padRatio);
  const sources = getAllSources();

  const sourceEntries = Object.entries(sources).filter(([, src]) => src.type === 'vector' && src.fetch);
  const [tx, rx] = boundedChannel<ScoredSource>(sourceEntries.length || 1);

  const fetchTasks: Array<Promise<void>> = [];

  for (const [id, src] of sourceEntries) {
    fetchTasks.push((async () => {
      try {
        if (!src.enabled) {
          await enableSource(id);
        }
        await fetchSource(id, buffered);

        const geoLayer = src.layer as L.GeoJSON;
        const features: GeoJSON.Feature[] = [];
        geoLayer.eachLayer((sub: L.Layer) => {
          const feat = layerToFeature(sub);
          if (feat) features.push(feat);
        });

        if (features.length === 0) return;

        let totalDist = 0;
        let nearestDist = Infinity;

        if (propertyGeom && propertyGeom.geometry.type !== 'Point') {
          for (const f of features.slice(0, DISCOVERY_MAX_FEATURE_SAMPLE)) {
            try {
              const dist = distance(
                centroid(f),
                centroid(propertyGeom),
                { units: 'meters' },
              );
              totalDist += dist;
              if (dist < nearestDist) nearestDist = dist;
            } catch {
              // skip malformed features
            }
          }
        }

        const avgDist = features.length > 0 ? totalDist / Math.min(features.length, DISCOVERY_MAX_FEATURE_SAMPLE) : 999;
        const categoryBoost = DEFAULT_CATEGORY_BOOSTS[src.category] ?? 0.5;
        const countScore = Math.min(features.length / 20, 1.0);
        const proximityScore = nearestDist < Infinity ? Math.max(0, 1 - nearestDist / DISCOVERY_PROXIMITY_RADIUS_M) : 0;
        const relevance = 0.3 * countScore + 0.4 * proximityScore + 0.3 * categoryBoost;

        const result: ScoredSource = {
          sourceId: id,
          sourceName: src.name,
          category: src.category,
          featureCount: features.length,
          relevanceScore: Math.round(relevance * 100) / 100,
          nearestDistance: Math.round(nearestDist * 10) / 10,
          avgDistance: Math.round(avgDist * 10) / 10,
          samples: features.slice(0, 5),
        };

        const sendResult = tx.send(Owned.of(result));
        if (!isOk(sendResult)) {
          console.warn(`[Discover] channel full for ${id}`);
        }
      } catch (err) {
        console.warn(`[Discover] source ${id} failed:`, err);
      }
    })());
  }

  await Promise.allSettled(fetchTasks);
  using _txDone = tx;

  const scored: ScoredSource[] = [];
  for (const owned of rx) {
    scored.push(take(owned));
  }
  using _rxDone = rx;

  scored.sort((a, b) => b.relevanceScore - a.relevanceScore);

  let terrainGrid = null;
  try {
    terrainGrid = await buildTerrainGrid(shapeBounds.pad(0.2), 10);
    renderContours(terrainGrid);
    renderSlopeArrows(terrainGrid);
  } catch (err) {
    console.warn('[Discover] terrain build failed:', err);
  }

  const report: DiscoveryReport = {
    propertyArea: Math.round(propertyArea * SQ_FEET_PER_SQ_METER),
    bufferRadius: DISCOVERY_BUFFER_RADIUS_M,
    sources: scored,
    terrain: terrainGrid,
    timestamp: new Date().toISOString(),
  };

  if (onDiscovery) onDiscovery(report);
  renderDiscoveryPanel(report);
}

function renderDiscoveryPanel(report: DiscoveryReport): void {
  const panel = document.getElementById('discovery-panel');
  const list = document.getElementById('discovery-list');
  if (!panel || !list) return;

  panel.classList.remove('hidden');
  list.innerHTML = '';

  if (report.terrain) {
    const terrLi = document.createElement('li');
    terrLi.className = 'discovery-terrain';
    const stats = report.terrain.stats;
    terrLi.innerHTML = `
      <span class="ds-color" style="background:#795548"></span>
      <span class="ds-name">Terrain: ${String(stats.min)}'-${String(stats.max)}' (${String(stats.range)}' range)</span>
    `;
    list.appendChild(terrLi);
  }

  for (const src of report.sources) {
    if (src.featureCount === 0) continue;
    const li = document.createElement('li');
    const distStr = src.nearestDistance < Infinity
      ? `${String(Math.round(src.nearestDistance * FEET_PER_METER))}ft`
      : '--';
    const scoreBar = Math.round(src.relevanceScore * 100);

    li.innerHTML = `
      <span class="ds-color" style="background:${escHtml(getSourceColor(src.sourceId))}"></span>
      <span class="ds-name">${escHtml(src.sourceName)}</span>
      <span class="discovery-count">${String(src.featureCount)}</span>
      <span class="discovery-dist">${distStr}</span>
      <span class="discovery-score" title="Relevance: ${String(scoreBar)}%">
        <span class="score-bar" style="width:${String(scoreBar)}%"></span>
      </span>
    `;
    list.appendChild(li);
  }

  const dismissBtn = document.getElementById('btn-dismiss-discover');
  dismissBtn?.addEventListener('click', () => {
    panel.classList.add('hidden');
  }, { once: true });
}

function getSourceColor(sourceId: string): string {
  const src = getAllSources()[sourceId];
  return src?.color ?? '#999';
}
