import * as L from 'leaflet';
import * as turf from '@turf/turf';
import '@geoman-io/leaflet-geoman-free';
import type { ScoredSource, DiscoveryReport } from '../types/spatial.js';
import { DEFAULT_CATEGORY_BOOSTS } from '../types/spatial.js';
import { getAllSources, fetchSource, enableSource, fetchAllEnabled } from './datasources.js';
import { buildTerrainGrid, renderContours, renderSlopeArrows } from './terrain.js';
import { boundedChannel } from '../rustscript/channel.js';
import { Owned, take } from '../rustscript/owned.js';
import { isSome } from '../rustscript/option.js';
import { isOk } from '../rustscript/result.js';

let map: L.Map | null = null;
let onDiscovery: ((report: DiscoveryReport) => void) | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const BUFFER_RADIUS_M = 100;
const DEBOUNCE_MS = 800;

const AUTO_ENABLE_IDS: readonly string[] = [
  'osm-buildings', 'osm-power', 'parcels', 'osm-fences',
  'osm-poles', 'osm-manholes', 'osm-hydrants',
];

export function initDiscover(
  leafletMap: L.Map,
  discoveryCallback?: (report: DiscoveryReport) => void,
): void {
  map = leafletMap;
  onDiscovery = discoveryCallback ?? null;

  map.on('pm:create', (e: { layer: L.Layer }) => {
    const shape = e.layer;
    setTimeout(() => {
      if (!shape._fpMeta || !map) return;

      let isPropertyLayer = false;
      map.eachLayer((layer: L.Layer) => {
        if (layer instanceof L.FeatureGroup && layer.hasLayer(shape)) {
          if (shape._fpMeta?.color === '#e74c3c') {
            isPropertyLayer = true;
          }
        }
      });

      if (!isPropertyLayer) return;

      let shapeBounds: L.LatLngBounds | null = null;
      if ('getBounds' in shape) {
        shapeBounds = (shape as L.Polyline).getBounds();
      } else if ('getLatLng' in shape) {
        const ll = (shape as L.Marker).getLatLng();
        shapeBounds = L.latLngBounds(ll, ll);
      }

      if (!shapeBounds) return;
      void runDiscovery(shape, shapeBounds);
    }, 200);
  });

  map.on('moveend', () => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void fetchAllEnabled();
    }, DEBOUNCE_MS);
  });
}

async function runDiscovery(shape: L.Layer, shapeBounds: L.LatLngBounds): Promise<void> {
  if (!map) return;

  // Auto-enable priority sources on property draw (from former autofetch.ts)
  const allSrc = getAllSources();
  for (const id of AUTO_ENABLE_IDS) {
    const src = allSrc[id];
    if (src && !src.enabled) {
      await enableSource(id);
    }
  }

  let propertyArea = 0;
  let propertyGeom: GeoJSON.Feature | null = null;
  if ('toGeoJSON' in shape) {
    const geo = (shape as L.Polyline).toGeoJSON() as GeoJSON.Feature;
    propertyGeom = geo;
    if (geo.geometry.type === 'Polygon' || geo.geometry.type === 'MultiPolygon') {
      propertyArea = turf.area(geo);
    }
  }

  const buffered = shapeBounds.pad(BUFFER_RADIUS_M / 111139 / (shapeBounds.getNorth() - shapeBounds.getSouth() || 0.001));
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
          if ('toGeoJSON' in sub) {
            features.push((sub as L.Path & { toGeoJSON(): GeoJSON.Feature }).toGeoJSON());
          }
        });

        if (features.length === 0) return;

        let totalDist = 0;
        let nearestDist = Infinity;

        if (propertyGeom && propertyGeom.geometry.type !== 'Point') {
          for (const f of features.slice(0, 50)) {
            try {
              let dist: number;
              if (f.geometry.type === 'Point') {
                const pt = f.geometry.coordinates as [number, number];
                dist = turf.distance(
                  turf.point(pt),
                  turf.centroid(propertyGeom),
                  { units: 'meters' },
                );
              } else {
                dist = turf.distance(
                  turf.centroid(f),
                  turf.centroid(propertyGeom),
                  { units: 'meters' },
                );
              }
              totalDist += dist;
              if (dist < nearestDist) nearestDist = dist;
            } catch {
              // skip malformed features
            }
          }
        }

        const avgDist = features.length > 0 ? totalDist / Math.min(features.length, 50) : 999;
        const categoryBoost = DEFAULT_CATEGORY_BOOSTS[src.category] ?? 0.5;
        const countScore = Math.min(features.length / 20, 1.0);
        const proximityScore = nearestDist < Infinity ? Math.max(0, 1 - nearestDist / 500) : 0;
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
    if (isSome({ some: true, value: owned })) {
      scored.push(take(owned));
    }
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
    propertyArea: Math.round(propertyArea * 10.7639),
    bufferRadius: BUFFER_RADIUS_M,
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
      ? `${String(Math.round(src.nearestDistance * 3.28084))}ft`
      : '--';
    const scoreBar = Math.round(src.relevanceScore * 100);

    li.innerHTML = `
      <span class="ds-color" style="background:${getSourceColor(src.sourceId)}"></span>
      <span class="ds-name">${src.sourceName}</span>
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
