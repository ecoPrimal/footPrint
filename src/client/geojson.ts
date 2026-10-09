// SPDX-License-Identifier: AGPL-3.0-or-later
import type * as L from 'leaflet';

/**
 * Safely extract a GeoJSON Feature from a Leaflet layer.
 * Eliminates the repeated `(layer as L.Path & { toGeoJSON(): ... }).toGeoJSON() as ...`
 * cast pattern used across 6+ client modules.
 */
export function layerToFeature(layer: L.Layer): GeoJSON.Feature | null {
  if (!('toGeoJSON' in layer)) return null;
  return (layer as { toGeoJSON(): GeoJSON.Feature }).toGeoJSON();
}
