import * as L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import type { SnapConfig } from '../types/snap.js';
import { DEFAULT_SNAP_CONFIG } from '../types/snap.js';
import { getAllSources } from './datasources.js';
import { layerToFeature } from './geojson.js';
import { METERS_PER_DEGREE_LAT, SNAP_GRID_MAX_POINTS, SNAP_SOURCE_LABEL_RADIUS_M } from '../constants.js';

let map: L.Map | null = null;
const snapTargetGroup: L.LayerGroup = L.layerGroup();
const config: SnapConfig = { ...DEFAULT_SNAP_CONFIG };
let lastSnapInfo: string | null = null;
let onSnapChange: ((info: string | null) => void) | null = null;

export function initSnap(
  leafletMap: L.Map,
  snapCallback?: (info: string | null) => void,
): void {
  map = leafletMap;
  onSnapChange = snapCallback ?? null;
  snapTargetGroup.addTo(map);

  map.pm.setGlobalOptions({
    snappable: config.enabled,
    snapDistance: config.snapDistance,
    snapMiddle: config.snapToMidpoints,
    snapSegment: true,
    snapVertex: config.snapToVertices,
  });

  map.on('pm:snap' as string, (e: unknown) => {
    if (!e || typeof e !== 'object' || !('snapLatLng' in e)) return;
    const latlng = (e).snapLatLng;
    if (!(latlng instanceof L.LatLng)) return;
    const name = findNearestSourceName(latlng);
    lastSnapInfo = name ?? 'Feature';
    if (onSnapChange) onSnapChange(lastSnapInfo);
  });

  map.on('pm:unsnap' as string, () => {
    lastSnapInfo = null;
    if (onSnapChange) onSnapChange(null);
  });

  map.on('moveend', () => {
    if (config.enabled) rebuildSnapIndex();
  });

  rebuildSnapIndex();
}

export function getSnapConfig(): Readonly<SnapConfig> {
  return config;
}

export function setSnapEnabled(enabled: boolean): void {
  config.enabled = enabled;
  if (map) {
    map.pm.setGlobalOptions({ snappable: enabled });
  }
  if (enabled) rebuildSnapIndex();
}

export function toggleSnap(): boolean {
  setSnapEnabled(!config.enabled);
  return config.enabled;
}


export function rebuildSnapIndex(): void {
  snapTargetGroup.clearLayers();
  if (!config.enabled || !map) return;

  if (config.snapToFeatures) {
    const sources = getAllSources();
    for (const src of Object.values(sources)) {
      if (src.enabled && src.type === 'vector' && src.layer instanceof L.GeoJSON) {
        // Clone geometry into lightweight invisible polylines/markers for snap targets.
        // This avoids re-parenting the original layers out of their source GeoJSON.
        src.layer.eachLayer((sub: L.Layer) => {
          const geo = layerToFeature(sub);
          if (geo) {
            const clone = L.geoJSON(geo, {
              style: () => ({ opacity: 0, fillOpacity: 0, weight: 0, interactive: false }),
              pointToLayer: (_f, latlng) => L.circleMarker(latlng, {
                radius: 0, weight: 0, fillOpacity: 0, interactive: false,
              }),
            });
            clone.eachLayer((cloneSub: L.Layer) => {
              snapTargetGroup.addLayer(cloneSub);
            });
          }
        });
      }
    }
  }

  if (config.snapToGrid && map) {
    addGridSnapPoints();
  }
}

function addGridSnapPoints(): void {
  if (!map) return;
  const bounds = map.getBounds();
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();

  const spacingDeg = config.gridSpacing / METERS_PER_DEGREE_LAT;
  const startLat = Math.floor(sw.lat / spacingDeg) * spacingDeg;
  const startLng = Math.floor(sw.lng / spacingDeg) * spacingDeg;

  let count = 0;

  for (let lat = startLat; lat <= ne.lat; lat += spacingDeg) {
    for (let lng = startLng; lng <= ne.lng; lng += spacingDeg) {
      if (count >= SNAP_GRID_MAX_POINTS) return;
      const marker = L.circleMarker([lat, lng], {
        radius: 1,
        weight: 0,
        fillOpacity: 0,
        interactive: false,
      });
      snapTargetGroup.addLayer(marker);
      count++;
    }
  }
}

function findNearestSourceName(latlng: L.LatLng): string | null {
  const sources = getAllSources();
  let bestName: string | null = null;
  let bestDist = Infinity;

  for (const src of Object.values(sources)) {
    if (!src.enabled || src.type !== 'vector' || !(src.layer instanceof L.GeoJSON)) continue;

    src.layer.eachLayer((sub: L.Layer) => {
      let dist = Infinity;
      if (sub instanceof L.Marker) {
        dist = latlng.distanceTo(sub.getLatLng());
      } else if (sub instanceof L.Polyline) {
        const coords = sub.getLatLngs();
        const flat = (Array.isArray(coords[0]) && coords[0] instanceof L.LatLng)
          ? coords as L.LatLng[]
          : (coords as L.LatLng[][]).flat();
        for (const pt of flat) {
          if (pt instanceof L.LatLng) {
            const d = latlng.distanceTo(pt);
            if (d < dist) dist = d;
          }
        }
      }
      if (dist < bestDist) {
        bestDist = dist;
        bestName = src.name;
      }
    });
  }

  return bestDist < SNAP_SOURCE_LABEL_RADIUS_M ? bestName : null;
}
