// SPDX-License-Identifier: AGPL-3.0-or-later
import * as L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import { distance as turfDistance } from '@turf/distance';
import { midpoint } from '@turf/midpoint';
import { bearing as turfBearing } from '@turf/bearing';
import { point } from '@turf/helpers';
import { FEET_PER_MILE } from '../constants.js';
import type { EntityId } from '../core/entity.js';
import { createEntity } from '../core/entity.js';
import { store } from '../core/store.js';
import { execute } from '../core/history.js';
import { AddEntityCommand, UpdateComponentCommand, BatchCommand } from '../core/commands.js';
import type { Command } from '../core/commands.js';
import { registerComputation } from '../core/reactive.js';
import type { DerivedComputation } from '../core/reactive.js';
import { extractCoords } from '../core/geometry.js';
import { Some, None } from '@protokarya/rustscript';

let map: L.Map | null = null;
const dimensionLayer: L.LayerGroup = L.layerGroup();
let liveLabel: L.Marker | null = null;
let vertices: L.LatLng[] = [];
let isDrawing = false;
let mouseMoveHandler: ((e: L.LeafletMouseEvent) => void) | null = null;

export function initDimensions(leafletMap: L.Map): void {
  map = leafletMap;
  dimensionLayer.addTo(map);

  map.on('pm:drawstart', (e: { workingLayer: L.Layer }) => {
    isDrawing = true;
    vertices = [];
    dimensionLayer.clearLayers();

    const wl = e.workingLayer;
    wl.on('pm:vertexadded' as string, (ve: L.LeafletEvent) => {
      if (!('latlng' in ve) || !((ve as { latlng: unknown }).latlng instanceof L.LatLng)) return;
      onVertexAdded((ve as { latlng: L.LatLng }).latlng);
    });

    mouseMoveHandler = (me: L.LeafletMouseEvent) => {
      if (!isDrawing || vertices.length === 0) return;
      updateLiveLabel(me.latlng);
    };
    map?.on('mousemove', mouseMoveHandler);
  });

  map.on('pm:drawend', () => {
    cleanupLive();
  });

  map.on('pm:create', () => {
    cleanupLive();
    setTimeout(() => {
      const shapeIds = [...store.byKind('shape')];
      const lastShapeId = shapeIds[shapeIds.length - 1];
      if (lastShapeId) {
        createDimensionEntities(lastShapeId);
      }
    }, 100);
  });

  // Register reactive computation for dimension updates
  registerComputation(dimensionReactiveComputation);
}

function createDimensionEntities(shapeEntityId: EntityId): void {
  const res = store.get(shapeEntityId);
  if (!res.ok || res.value.kind !== 'shape') return;
  const entity = res.value;

  const coords = extractCoords(entity.components.geometry);
  if (coords.length < 2) return;

  for (let i = 0; i < coords.length - 1; i++) {
    const from = coords[i];
    const to = coords[i + 1];
    if (!from || !to) continue;

    const dist = turfDistance(point(from), point(to), { units: 'feet' });

    const dimEntity = createEntity('dimension', shapeEntityId);
    dimEntity.components.dimension = {
      targetEntityId: shapeEntityId,
      fromVertex: i,
      toVertex: i + 1,
      value: Math.round(dist * 10) / 10,
      unit: 'ft',
    };

    execute(new AddEntityCommand(dimEntity));
  }
}

const dimensionReactiveComputation: DerivedComputation<Command[]> = {
  id: 'dimension-update',
  watchComponents: ['geometry'],

  dependencies(): EntityId[] {
    return store
      .withComponent('dimension')
      .filterMap((dimId) => {
        const res = store.get(dimId);
        if (!res.ok || res.value.kind !== 'dimension') return None();
        return Some(res.value.components.dimension.targetEntityId);
      })
      .collect();
  },

  compute(): Command[] {
    const cmds: Command[] = [];
    for (const dimId of store.byKind('dimension')) {
      const dimRes = store.get(dimId);
      if (!dimRes.ok || dimRes.value.kind !== 'dimension') continue;
      const dim = dimRes.value.components.dimension;

      const targetRes = store.get(dim.targetEntityId);
      if (!targetRes.ok || targetRes.value.kind !== 'shape') continue;
      const target = targetRes.value;

      const coords = extractCoords(target.components.geometry);
      const from = coords[dim.fromVertex];
      const to = coords[dim.toVertex];
      if (!from || !to) continue;

      const dist = turfDistance(point(from), point(to), { units: 'feet' });

      if (Math.abs(dist - dim.value) > 0.01) {
        cmds.push(
          new UpdateComponentCommand(dimId, 'dimension', {
            ...dim,
            value: Math.round(dist * 10) / 10,
          }),
        );
      }
    }
    return cmds;
  },

  apply(cmds: Command[]): void {
    if (cmds.length > 0) {
      execute(new BatchCommand(cmds));
    }
  },
};

function onVertexAdded(latlng: L.LatLng): void {
  vertices.push(latlng);

  if (vertices.length >= 2) {
    const prev = vertices[vertices.length - 2];
    const curr = vertices[vertices.length - 1];
    if (prev && curr) {
      addSegmentLabel(prev, curr);

      if (vertices.length >= 3) {
        const pprev = vertices[vertices.length - 3];
        if (pprev) {
          addAngleLabel(pprev, prev, curr);
        }
      }
    }
  }
}

function addSegmentLabel(from: L.LatLng, to: L.LatLng): void {
  const p1 = point([from.lng, from.lat]);
  const p2 = point([to.lng, to.lat]);
  const mid = midpoint(p1, p2);
  const dist = turfDistance(p1, p2, { units: 'feet' });

  const label = L.marker([mid.geometry.coordinates[1], mid.geometry.coordinates[0]] as L.LatLngTuple, {
    icon: L.divIcon({
      className: 'dimension-label',
      html: formatDist(dist),
      iconSize: [60, 16],
      iconAnchor: [30, 8],
    }),
    interactive: false,
  });
  dimensionLayer.addLayer(label);
}

function addAngleLabel(a: L.LatLng, vertex: L.LatLng, b: L.LatLng): void {
  const bearing1 = turfBearing(point([vertex.lng, vertex.lat]), point([a.lng, a.lat]));
  const bearing2 = turfBearing(point([vertex.lng, vertex.lat]), point([b.lng, b.lat]));
  let angle = Math.abs(bearing2 - bearing1);
  if (angle > 180) angle = 360 - angle;

  const label = L.marker([vertex.lat, vertex.lng], {
    icon: L.divIcon({
      className: 'dimension-angle',
      html: `${Math.round(angle)}\u00B0`,
      iconSize: [36, 16],
      iconAnchor: [18, -6],
    }),
    interactive: false,
  });
  dimensionLayer.addLayer(label);
}

function updateLiveLabel(cursor: L.LatLng): void {
  const last = vertices[vertices.length - 1];
  if (!last) return;

  const p1 = point([last.lng, last.lat]);
  const p2 = point([cursor.lng, cursor.lat]);
  const dist = turfDistance(p1, p2, { units: 'feet' });

  let totalDist = 0;
  for (let i = 1; i < vertices.length; i++) {
    const va = vertices[i - 1];
    const vb = vertices[i];
    if (va && vb) {
      totalDist += turfDistance(point([va.lng, va.lat]), point([vb.lng, vb.lat]), { units: 'feet' });
    }
  }
  totalDist += dist;

  const html = `${formatDist(dist)}<br><span style="opacity:0.6">Total: ${formatDist(totalDist)}</span>`;

  if (liveLabel) {
    dimensionLayer.removeLayer(liveLabel);
  }
  liveLabel = L.marker(cursor, {
    icon: L.divIcon({
      className: 'dimension-live',
      html,
      iconSize: [100, 32],
      iconAnchor: [-14, 16],
    }),
    interactive: false,
  });
  dimensionLayer.addLayer(liveLabel);
}

function cleanupLive(): void {
  isDrawing = false;
  vertices = [];
  if (liveLabel) {
    dimensionLayer.removeLayer(liveLabel);
    liveLabel = null;
  }
  if (mouseMoveHandler && map) {
    map.off('mousemove', mouseMoveHandler);
    mouseMoveHandler = null;
  }
  dimensionLayer.clearLayers();
}

function formatDist(feet: number): string {
  if (feet >= FEET_PER_MILE) return `${(feet / FEET_PER_MILE).toFixed(2)} mi`;
  if (feet >= 100) return `${Math.round(feet)} ft`;
  return `${feet.toFixed(1)} ft`;
}
