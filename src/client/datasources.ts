import * as L from 'leaflet';
import type { DataSourceDef, DataSourceState, SourceRegistry, SourceUpdateCallback, VectorSourceDef, TileSourceDef } from '../types/source.js';

let map: L.Map | null = null;
const sources: SourceRegistry = {};
let onSourceUpdate: SourceUpdateCallback | null = null;

export function initDataSources(leafletMap: L.Map, updateCallback: SourceUpdateCallback): void {
  map = leafletMap;
  onSourceUpdate = updateCallback;
}

export function registerSource(def: DataSourceDef): DataSourceState {
  const sourceType = def.type ?? 'vector';

  let layer: L.TileLayer | L.GeoJSON;

  if (sourceType === 'tiles') {
    const tileDef = def as TileSourceDef;
    layer = L.tileLayer(tileDef.tileUrl, {
      maxZoom: 20,
      opacity: tileDef.opacity ?? 0.6,
      attribution: tileDef.attribution ?? '',
    });
  } else {
    const vecDef = def as VectorSourceDef;
    layer = L.geoJSON(undefined, {
      style: vecDef.style ?? (() => ({
        color: vecDef.color,
        weight: 2,
        opacity: 0.8,
        fillOpacity: 0.15,
      })),
      pointToLayer: vecDef.pointToLayer ?? ((_feat: GeoJSON.Feature, latlng: L.LatLng) =>
        L.circleMarker(latlng, {
          radius: 5,
          color: vecDef.color,
          fillColor: vecDef.color,
          fillOpacity: 0.5,
          weight: 1,
        })
      ),
      onEachFeature: (feature: GeoJSON.Feature, featureLayer: L.Layer) => {
        if (vecDef.popupContent) {
          (featureLayer as L.Path).bindPopup(vecDef.popupContent(feature), {
            maxWidth: 300,
            className: 'data-popup',
          });
        } else {
          const props = feature.properties ?? {};
          const rows = Object.entries(props as Record<string, unknown>)
            .filter(([k]) => !k.startsWith('_'))
            .slice(0, 12)
            .map(([k, v]) => `<tr><td>${k}</td><td>${String(v ?? '')}</td></tr>`)
            .join('');
          if (rows) {
            (featureLayer as L.Path).bindPopup(
              `<div class="data-popup-content"><table>${rows}</table></div>`,
              { maxWidth: 300, className: 'data-popup' },
            );
          }
        }
      },
    });
  }

  const state: DataSourceState = {
    id: def.id,
    name: def.name,
    category: def.category,
    color: def.color,
    type: sourceType,
    minZoom: 'minZoom' in def ? def.minZoom : undefined,
    enabled: false,
    loading: false,
    featureCount: 0,
    layer,
    lastBounds: null,
    error: null,
    fetch: 'fetch' in def ? def.fetch : undefined,
    style: 'style' in def ? def.style : undefined,
    pointToLayer: 'pointToLayer' in def ? def.pointToLayer : undefined,
    popupContent: 'popupContent' in def ? def.popupContent : undefined,
    tileUrl: 'tileUrl' in def ? (def as TileSourceDef).tileUrl : undefined,
    opacity: 'opacity' in def ? (def as TileSourceDef).opacity : undefined,
    attribution: 'attribution' in def ? (def as TileSourceDef).attribution : undefined,
  };

  sources[state.id] = state;
  notify();
  return state;
}

export function getSource(id: string): DataSourceState | undefined {
  return sources[id];
}

export function getAllSources(): SourceRegistry {
  return sources;
}

export async function toggleSource(id: string): Promise<void> {
  const src = sources[id];
  if (!src) return;

  if (src.enabled) {
    disableSource(id);
  } else {
    await enableSource(id);
  }
}

export async function enableSource(id: string): Promise<void> {
  const src = sources[id];
  if (!src || src.enabled || !map) return;

  src.enabled = true;
  src.layer.addTo(map);

  if (src.type === 'vector') {
    await fetchSource(id);
  }
  notify();
}

export function disableSource(id: string): void {
  const src = sources[id];
  if (!src || !src.enabled || !map) return;

  src.enabled = false;
  map.removeLayer(src.layer);
  notify();
}

export async function fetchSource(id: string, forceBounds?: L.LatLngBounds): Promise<void> {
  const src = sources[id];
  if (!src || !src.enabled || src.type !== 'vector' || !map) return;

  const zoom = map.getZoom();
  if (src.minZoom != null && zoom < src.minZoom) {
    src.error = `Zoom in to level ${String(src.minZoom)}+ to load`;
    notify();
    return;
  }

  const bounds = forceBounds ?? map.getBounds();
  const boundsKey = bounds.toBBoxString();
  if (src.lastBounds === boundsKey && src.featureCount > 0) return;

  src.loading = true;
  src.error = null;
  notify();

  try {
    if (!src.fetch) return;
    const result = await src.fetch(bounds);
    const geoLayer = src.layer as L.GeoJSON;
    geoLayer.clearLayers();

    const features = Array.isArray(result) ? result : [];
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: features as GeoJSON.Feature[],
    };
    geoLayer.addData(fc);
    src.featureCount = features.length;
    src.lastBounds = boundsKey;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Fetch failed';
    console.error(`[DataSource:${id}] fetch failed:`, err);
    src.error = message;
  } finally {
    src.loading = false;
    notify();
  }
}

export async function fetchAllEnabled(forceBounds?: L.LatLngBounds): Promise<void> {
  const tasks = Object.keys(sources)
    .filter((id) => {
      const src = sources[id];
      return src?.enabled && src.type === 'vector';
    })
    .map((id) => fetchSource(id, forceBounds));
  await Promise.allSettled(tasks);
}

function notify(): void {
  if (onSourceUpdate) onSourceUpdate(sources);
}
