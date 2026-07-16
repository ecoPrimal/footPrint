import * as L from 'leaflet';
import type { USGSElevationResponse } from '../../types/terrain.js';
import { dataSourceId, hexColorUnchecked } from '../../types/brands.js';
import { registerSource } from '../datasources.js';
import { EPQS_BASE_URL, MAX_ELEVATION_CONCURRENT, ELEVATION_THROTTLE_MS } from '../../constants.js';
import { proxyUrl } from '../api.js';

function gridDensityForZoom(zoom: number): number {
  if (zoom >= 19) return 8;
  if (zoom >= 18) return 6;
  if (zoom >= 17) return 5;
  if (zoom >= 16) return 4;
  return 3;
}

async function throttledFetch(url: string): Promise<number | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = (await resp.json()) as USGSElevationResponse;
    return typeof data.value === 'number' ? data.value : null;
  } catch {
    return null;
  }
}

async function batchElevation(
  points: ReadonlyArray<{ lat: number; lng: number }>,
): Promise<Array<{ lat: number; lng: number; elevation: number | null }>> {
  const results: Array<{ lat: number; lng: number; elevation: number | null }> = [];
  const queue = [...points];

  while (queue.length > 0) {
    const batch = queue.splice(0, MAX_ELEVATION_CONCURRENT);
    const batchResults = await Promise.allSettled(
      batch.map(async (pt) => {
        const url = proxyUrl(
          `${EPQS_BASE_URL}?x=${pt.lng}&y=${pt.lat}&wkid=4326&units=Feet&includeDate=false`
        );
        const elev = await throttledFetch(url);
        return { lat: pt.lat, lng: pt.lng, elevation: elev };
      }),
    );
    for (const r of batchResults) {
      results.push(r.status === 'fulfilled' ? r.value : { lat: 0, lng: 0, elevation: null });
    }
    if (queue.length > 0) {
      await new Promise((resolve) => { setTimeout(resolve, ELEVATION_THROTTLE_MS); });
    }
  }
  return results;
}

export function registerUSGSSource(): void {
  registerSource({
    id: dataSourceId('usgs-elevation'),
    name: 'Elevation Points',
    category: 'USGS',
    color: hexColorUnchecked('#795548'),
    minZoom: 16,
    fetch: async (bounds: L.LatLngBounds): Promise<ReadonlyArray<GeoJSON.Feature>> => {
      const zoom = 18;
      const density = gridDensityForZoom(zoom);
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      const latStep = (ne.lat - sw.lat) / density;
      const lngStep = (ne.lng - sw.lng) / density;

      const points: Array<{ lat: number; lng: number }> = [];
      for (let r = 0; r <= density; r++) {
        for (let c = 0; c <= density; c++) {
          points.push({
            lat: sw.lat + r * latStep,
            lng: sw.lng + c * lngStep,
          });
        }
      }

      const samples = await batchElevation(points);
      const features: GeoJSON.Feature[] = [];
      for (const s of samples) {
        if (s.elevation !== null) {
          features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
            properties: {
              elevation: Math.round(s.elevation * 10) / 10,
              unit: 'ft',
              _source: 'USGS EPQS',
            },
          });
        }
      }
      return features;
    },
    pointToLayer: (feat: GeoJSON.Feature, latlng: L.LatLng) => {
      const elev = (feat.properties as Record<string, unknown>)['elevation'];
      return L.marker(latlng, {
        icon: L.divIcon({
          className: 'elevation-label',
          html: `${String(elev)}'`,
          iconSize: [40, 16],
          iconAnchor: [20, 8],
        }),
        interactive: false,
      });
    },
    popupContent: (f) => {
      const p = f.properties as Record<string, unknown>;
      return `<b>Elevation: ${String(p['elevation'])} ft</b><br>Source: USGS 3DEP`;
    },
  });
}

export { batchElevation };
