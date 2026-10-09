import * as L from 'leaflet';
import { encode, cellBounds, decode, encodeGeohash, geohashBounds } from '../core/saywhere.js';

/**
 * Zoom level to SayWhere precision mapping.
 * Higher zoom = more words = smaller cells.
 */
function zoomToPrecision(zoom: number): number {
  if (zoom >= 18) return 5; // ~90cm cells
  if (zoom >= 15) return 4; // ~27m cells
  if (zoom >= 12) return 3; // ~900m cells
  if (zoom >= 9) return 2; // ~28km cells
  return 1; // ~900km cells
}

/**
 * SayWhereLayer — draws SayWhere cell grid on Leaflet map.
 */
export class SayWhereLayer extends L.LayerGroup {
  private map: L.Map | null = null;
  private precision = 3;

  onAdd(map: L.Map): this {
    super.onAdd(map);
    this.map = map;
    map.on('moveend zoomend', this.update, this);
    this.update();
    return this;
  }

  onRemove(map: L.Map): this {
    map.off('moveend zoomend', this.update, this);
    this.map = null;
    this.clearLayers();
    return super.onRemove(map);
  }

  private update(): void {
    if (!this.map) return;
    this.clearLayers();

    const zoom = this.map.getZoom();
    this.precision = zoomToPrecision(zoom);

    // Only show grid at zoom >= 9 (otherwise too many cells)
    if (zoom < 9) return;

    const bounds = this.map.getBounds();
    const geohashPrecision = this.precision * 2;

    // Calculate cell size at this precision for iteration
    const center = bounds.getCenter();
    const centerHash = encodeGeohash(center.lat, center.lng, geohashPrecision);
    const centerBounds = geohashBounds(centerHash);

    const cellLatSpan = centerBounds.maxLat - centerBounds.minLat;
    const cellLngSpan = centerBounds.maxLng - centerBounds.minLng;

    if (cellLatSpan <= 0 || cellLngSpan <= 0) return;

    // Iterate over grid cells visible in the viewport
    const startLat = Math.floor(bounds.getSouth() / cellLatSpan) * cellLatSpan;
    const startLng = Math.floor(bounds.getWest() / cellLngSpan) * cellLngSpan;

    const maxCells = 200;
    let cellCount = 0;

    for (let lat = startLat; lat <= bounds.getNorth() && cellCount < maxCells; lat += cellLatSpan) {
      for (let lng = startLng; lng <= bounds.getEast() && cellCount < maxCells; lng += cellLngSpan) {
        const cellLat = lat + cellLatSpan / 2;
        const cellLng = lng + cellLngSpan / 2;

        if (cellLat < -90 || cellLat > 90 || cellLng < -180 || cellLng > 180) continue;

        try {
          const phrase = encode(cellLat, cellLng, this.precision);
          const cb = cellBounds(phrase);

          const rect = L.rectangle(
            [[cb.minLat, cb.minLng], [cb.maxLat, cb.maxLng]],
            {
              color: '#58a6ff',
              weight: 1,
              fillOpacity: 0.05,
              interactive: true,
            },
          );

          const words = phrase.split('.');
          const displayLabel = this.precision <= 3
            ? phrase
            : words.slice(-2).join('.');

          const label = L.tooltip({
            permanent: true,
            direction: 'center',
            className: 'saywhere-label',
          }).setContent(displayLabel);

          rect.bindTooltip(label);

          rect.on('click', () => {
            const decoded = decode(phrase);
            const content = `
              <div style="font-family:monospace;font-size:0.85em">
                <div style="font-weight:600;color:#58a6ff;margin-bottom:4px">${phrase}</div>
                <div>Lat: ${decoded.lat.toFixed(6)}</div>
                <div>Lng: ${decoded.lng.toFixed(6)}</div>
                <div>Geohash: ${decoded.geohash}</div>
                <div>Precision: ${decoded.precision} words</div>
                <button onclick="navigator.clipboard.writeText('${phrase}')" style="margin-top:6px;cursor:pointer;background:#21262d;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;padding:2px 8px;font-size:0.8em">Copy phrase</button>
              </div>
            `;
            L.popup()
              .setLatLng([decoded.lat, decoded.lng])
              .setContent(content)
              .openOn(this.map!);
          });

          this.addLayer(rect);
          cellCount++;
        } catch {
          // skip invalid cells
        }
      }
    }
  }
}
