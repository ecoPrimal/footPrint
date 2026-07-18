import * as L from 'leaflet';
import type {
  ElevationSample, TerrainGrid, ContourLine, SlopeAspect,
} from '../types/terrain.js';
import { batchElevation } from './sources/usgs.js';
import { METERS_PER_DEGREE_LAT, FEET_PER_METER, DEFAULT_CONTOUR_INTERVAL_FT } from '../constants.js';

let map: L.Map | null = null;
const contourLayer: L.LayerGroup = L.layerGroup();
const slopeLayer: L.LayerGroup = L.layerGroup();
const contourInterval = DEFAULT_CONTOUR_INTERVAL_FT;
let cachedGrid: TerrainGrid | null = null;

export function initTerrain(leafletMap: L.Map): void {
  map = leafletMap;
  contourLayer.addTo(map);
  slopeLayer.addTo(map);
}

export function getElevationAt(lat: number, lng: number): number | null {
  if (!cachedGrid) return null;
  const { samples, bounds, rows, cols } = cachedGrid;
  const latRange = bounds.ne[0] - bounds.sw[0];
  const lngRange = bounds.ne[1] - bounds.sw[1];
  if (latRange === 0 || lngRange === 0) return null;

  const r = ((lat - bounds.sw[0]) / latRange) * (rows - 1);
  const c = ((lng - bounds.sw[1]) / lngRange) * (cols - 1);

  if (r < 0 || r > rows - 1 || c < 0 || c > cols - 1) return null;

  // Bilinear interpolation
  const r0 = Math.floor(r);
  const c0 = Math.floor(c);
  const r1 = Math.min(r0 + 1, rows - 1);
  const c1 = Math.min(c0 + 1, cols - 1);
  const dr = r - r0;
  const dc = c - c0;

  const z00 = samples[r0 * cols + c0]?.elevation;
  const z01 = samples[r0 * cols + c1]?.elevation;
  const z10 = samples[r1 * cols + c0]?.elevation;
  const z11 = samples[r1 * cols + c1]?.elevation;

  if (z00 == null || z01 == null || z10 == null || z11 == null) return null;
  if (isNaN(z00) || isNaN(z01) || isNaN(z10) || isNaN(z11)) return null;

  return z00 * (1 - dr) * (1 - dc)
       + z01 * (1 - dr) * dc
       + z10 * dr * (1 - dc)
       + z11 * dr * dc;
}

export async function buildTerrainGrid(bounds: L.LatLngBounds, density = 8): Promise<TerrainGrid> {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const latStep = (ne.lat - sw.lat) / (density - 1);
  const lngStep = (ne.lng - sw.lng) / (density - 1);

  const points: { lat: number; lng: number }[] = [];
  for (let r = 0; r < density; r++) {
    for (let c = 0; c < density; c++) {
      points.push({
        lat: sw.lat + r * latStep,
        lng: sw.lng + c * lngStep,
      });
    }
  }

  const rawSamples = await batchElevation(points);

  // Preserve grid topology: failed samples get neighbor-interpolated or NaN-sentinel.
  // Index must stay rows*cols aligned.
  const samples: ElevationSample[] = rawSamples.map((s) => ({
    lat: s.lat,
    lng: s.lng,
    elevation: s.elevation ?? NaN,
  }));

  // Patch NaN cells with average of valid 4-neighbors
  for (let r = 0; r < density; r++) {
    for (let c = 0; c < density; c++) {
      const idx = r * density + c;
      const sample = samples[idx];
      if (sample && !isNaN(sample.elevation)) continue;
      const neighbors: number[] = [];
      if (r > 0) { const n = samples[(r - 1) * density + c]; if (n && !isNaN(n.elevation)) neighbors.push(n.elevation); }
      if (r < density - 1) { const n = samples[(r + 1) * density + c]; if (n && !isNaN(n.elevation)) neighbors.push(n.elevation); }
      if (c > 0) { const n = samples[r * density + (c - 1)]; if (n && !isNaN(n.elevation)) neighbors.push(n.elevation); }
      if (c < density - 1) { const n = samples[r * density + (c + 1)]; if (n && !isNaN(n.elevation)) neighbors.push(n.elevation); }
      if (neighbors.length > 0 && sample) {
        (samples[idx] as { elevation: number }).elevation = neighbors.reduce((a, b) => a + b, 0) / neighbors.length;
      }
    }
  }

  const validElevations = samples.filter((s) => !isNaN(s.elevation)).map((s) => s.elevation);
  const min = validElevations.length > 0 ? Math.min(...validElevations) : 0;
  const max = validElevations.length > 0 ? Math.max(...validElevations) : 0;
  const mean = validElevations.length > 0 ? validElevations.reduce((a, b) => a + b, 0) / validElevations.length : 0;

  const latDistM = (ne.lat - sw.lat) * METERS_PER_DEGREE_LAT;
  const resolution = density > 1 ? latDistM / (density - 1) : latDistM;

  const grid: TerrainGrid = {
    samples,
    rows: density,
    cols: density,
    bounds: { sw: [sw.lat, sw.lng], ne: [ne.lat, ne.lng] },
    resolution: Math.round(resolution * 10) / 10,
    stats: { min, max, mean: Math.round(mean * 10) / 10, range: max - min },
  };

  cachedGrid = grid;
  return grid;
}

export function generateContours(grid: TerrainGrid, interval: number): ContourLine[] {
  const { samples, rows, cols, bounds } = grid;
  if (samples.length < 4 || rows < 2 || cols < 2) return [];

  const elevations = samples.map((s) => s.elevation);
  const minElev = Math.min(...elevations);
  const maxElev = Math.max(...elevations);

  const startLevel = Math.ceil(minElev / interval) * interval;
  const contours: ContourLine[] = [];

  for (let level = startLevel; level <= maxElev; level += interval) {
    const segments = marchingSquares(samples, rows, cols, bounds, level);
    if (segments.length === 0) continue;

    const lines = chainSegments(segments);
    for (const coords of lines) {
      if (coords.length >= 2) {
        contours.push({
          elevation: level,
          geometry: { type: 'LineString', coordinates: coords },
          isMajor: level % (interval * 5) === 0,
        });
      }
    }
  }
  return contours;
}

interface Segment {
  a: [number, number];
  b: [number, number];
}

function marchingSquares(
  samples: readonly ElevationSample[],
  rows: number,
  cols: number,
  gridBounds: { sw: readonly [number, number]; ne: readonly [number, number] },
  level: number,
): Segment[] {
  const segments: Segment[] = [];
  const latRange = gridBounds.ne[0] - gridBounds.sw[0];
  const lngRange = gridBounds.ne[1] - gridBounds.sw[1];

  function val(r: number, c: number): number {
    return samples[r * cols + c]?.elevation ?? 0;
  }

  function interp(r1: number, c1: number, r2: number, c2: number): [number, number] {
    const v1 = val(r1, c1);
    const v2 = val(r2, c2);
    const denom = v2 - v1;
    const t = denom === 0 ? 0.5 : (level - v1) / denom;
    const lat = gridBounds.sw[0] + ((r1 + t * (r2 - r1)) / (rows - 1)) * latRange;
    const lng = gridBounds.sw[1] + ((c1 + t * (c2 - c1)) / (cols - 1)) * lngRange;
    return [lng, lat];
  }

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const tl = val(r + 1, c) >= level ? 8 : 0;
      const tr = val(r + 1, c + 1) >= level ? 4 : 0;
      const br = val(r, c + 1) >= level ? 2 : 0;
      const bl = val(r, c) >= level ? 1 : 0;
      const idx = tl | tr | br | bl;

      if (idx === 0 || idx === 15) continue;

      const top = (): [number, number] => interp(r + 1, c, r + 1, c + 1);
      const right = (): [number, number] => interp(r, c + 1, r + 1, c + 1);
      const bottom = (): [number, number] => interp(r, c, r, c + 1);
      const left = (): [number, number] => interp(r, c, r + 1, c);

      switch (idx) {
        case 1: case 14: segments.push({ a: left(), b: bottom() }); break;
        case 2: case 13: segments.push({ a: bottom(), b: right() }); break;
        case 3: case 12: segments.push({ a: left(), b: right() }); break;
        case 4: case 11: segments.push({ a: top(), b: right() }); break;
        case 5: segments.push({ a: left(), b: top() }); segments.push({ a: bottom(), b: right() }); break;
        case 6: case 9: segments.push({ a: bottom(), b: top() }); break;
        case 7: case 8: segments.push({ a: left(), b: top() }); break;
        case 10: segments.push({ a: top(), b: right() }); segments.push({ a: left(), b: bottom() }); break;
        default: break;
      }
    }
  }
  return segments;
}

const CHAIN_EPS = 1e-9;

function ptKey(p: [number, number]): string {
  return `${p[0].toFixed(10)},${p[1].toFixed(10)}`;
}

function ptsClose(a: [number, number], b: [number, number]): boolean {
  return Math.abs(a[0] - b[0]) < CHAIN_EPS && Math.abs(a[1] - b[1]) < CHAIN_EPS;
}

function chainSegments(segments: Segment[]): [number, number][][] {
  if (segments.length === 0) return [];

  // Build adjacency: endpoint -> list of segment indices that touch it
  const endpointMap = new Map<string, number[]>();
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg) continue;
    const ka = ptKey(seg.a);
    const kb = ptKey(seg.b);
    let listA = endpointMap.get(ka);
    if (!listA) { listA = []; endpointMap.set(ka, listA); }
    listA.push(i);
    let listB = endpointMap.get(kb);
    if (!listB) { listB = []; endpointMap.set(kb, listB); }
    listB.push(i);
  }

  const used = new Set<number>();
  const lines: [number, number][][] = [];

  for (let i = 0; i < segments.length; i++) {
    if (used.has(i)) continue;
    const startSeg = segments[i];
    if (!startSeg) continue;

    used.add(i);
    const chain: [number, number][] = [startSeg.a, startSeg.b];

    // Extend forward from chain tail
    let extended = true;
    while (extended) {
      extended = false;
      const tail = chain[chain.length - 1];
      if (!tail) break;
      const key = ptKey(tail);
      const candidates = endpointMap.get(key);
      if (!candidates) break;
      for (const ci of candidates) {
        if (used.has(ci)) continue;
        const candidate = segments[ci];
        if (!candidate) continue;
        if (ptsClose(candidate.a, tail)) {
          chain.push(candidate.b);
          used.add(ci);
          extended = true;
          break;
        } else if (ptsClose(candidate.b, tail)) {
          chain.push(candidate.a);
          used.add(ci);
          extended = true;
          break;
        }
      }
    }

    // Extend backward from chain head
    extended = true;
    while (extended) {
      extended = false;
      const head = chain[0];
      if (!head) break;
      const key = ptKey(head);
      const candidates = endpointMap.get(key);
      if (!candidates) break;
      for (const ci of candidates) {
        if (used.has(ci)) continue;
        const candidate = segments[ci];
        if (!candidate) continue;
        if (ptsClose(candidate.b, head)) {
          chain.unshift(candidate.a);
          used.add(ci);
          extended = true;
          break;
        } else if (ptsClose(candidate.a, head)) {
          chain.unshift(candidate.b);
          used.add(ci);
          extended = true;
          break;
        }
      }
    }

    lines.push(chain);
  }

  return lines;
}

export function computeSlopeAspect(grid: TerrainGrid): SlopeAspect[] {
  const { samples, rows, cols, resolution } = grid;
  if (rows < 3 || cols < 3) return [];

  const results: SlopeAspect[] = [];
  // Convert cell size to feet so rise/run are both in feet
  const cellSizeFt = resolution * FEET_PER_METER;

  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const z = (ri: number, ci: number): number => {
        const sample = samples[ri * cols + ci];
        return (sample && !isNaN(sample.elevation)) ? sample.elevation : 0;
      };

      // Horn's method: 3x3 neighborhood gradient, units: ft/ft (dimensionless)
      const dzdx = (z(r, c + 1) - z(r, c - 1)) / (2 * cellSizeFt);
      const dzdy = (z(r + 1, c) - z(r - 1, c)) / (2 * cellSizeFt);

      const slopeRad = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));
      const slopeDeg = slopeRad * (180 / Math.PI);

      const aspectRad = Math.atan2(-dzdy, dzdx);
      let aspectDeg = aspectRad * (180 / Math.PI);
      aspectDeg = (450 - aspectDeg) % 360;

      const drainDir = (aspectDeg + 180) % 360;

      const sample = samples[r * cols + c];
      if (sample && !isNaN(sample.elevation)) {
        results.push({
          lat: sample.lat,
          lng: sample.lng,
          slope: Math.round(slopeDeg * 10) / 10,
          aspect: Math.round(aspectDeg),
          drainageDirection: Math.round(drainDir),
        });
      }
    }
  }
  return results;
}

export function renderContours(grid: TerrainGrid): void {
  contourLayer.clearLayers();
  const contours = generateContours(grid, contourInterval);

  for (const c of contours) {
    const feature: GeoJSON.Feature = {
      type: 'Feature',
      geometry: c.geometry,
      properties: { elevation: c.elevation, isMajor: c.isMajor },
    };
    L.geoJSON(feature, {
      style: () => ({
        color: c.isMajor ? '#A1887F' : '#BCAAA4',
        weight: c.isMajor ? 2 : 1,
        opacity: c.isMajor ? 0.7 : 0.4,
      }),
      onEachFeature: (_f, layer) => {
        if (c.isMajor) {
          (layer as L.Path).bindTooltip(`${String(c.elevation)}'`, {
            permanent: true,
            direction: 'center',
            className: 'contour-label',
          });
        }
      },
    }).addTo(contourLayer);
  }
}

export function renderSlopeArrows(grid: TerrainGrid): void {
  slopeLayer.clearLayers();
  const slopeData = computeSlopeAspect(grid);

  for (const pt of slopeData) {
    if (pt.slope < 0.5) continue;
    const rad = (pt.drainageDirection - 90) * (Math.PI / 180);
    const len = Math.min(pt.slope * 0.00002, 0.0003);
    const endLat = pt.lat + Math.sin(rad) * len;
    const endLng = pt.lng + Math.cos(rad) * len;

    L.polyline(
      [[pt.lat, pt.lng], [endLat, endLng]],
      { color: '#4FC3F7', weight: 1.5, opacity: 0.6 },
    ).addTo(slopeLayer);
  }
}


