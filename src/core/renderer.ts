import * as L from 'leaflet';
import type { EntityId, ReadonlyEntity, ShapeEntity, DimensionEntity, AnnotationEntity } from './entity.js';
import type { DeepReadonly } from '../rustscript/types.js';
import type { StoreEvent } from './store.js';
import { store } from './store.js';
import { extractCoords, toLngLat } from './geometry.js';
import { exhaustive } from '../rustscript/exhaustive.js';

const layerMap = new Map<EntityId, L.Layer>();
let map: L.Map | null = null;
let layerGroups = new Map<EntityId, L.FeatureGroup>();

export function initRenderer(leafletMap: L.Map): void {
  map = leafletMap;

  store.on((event: StoreEvent) => {
    switch (event.type) {
      case 'add': onEntityAdded(event.entityId); break;
      case 'remove': onEntityRemoved(event.entityId); break;
      case 'update': onEntityUpdated(event.entityId, event.componentKey); break;
      default: exhaustive(event.type);
    }
  });
}

export function getLeafletLayer(id: EntityId): L.Layer | undefined {
  return layerMap.get(id);
}

export function getEntityIdForLayer(layer: L.Layer): EntityId | undefined {
  for (const [id, l] of layerMap) {
    if (l === layer) return id;
  }
  return undefined;
}

function onEntityAdded(id: EntityId): void {
  const res = store.get(id);
  if (!res.ok || !map) return;
  const entity = res.value;

  switch (entity.kind) {
    case 'layer': {
      const group = L.featureGroup();
      if (entity.components.layer.visible) group.addTo(map);
      layerGroups.set(id, group);
      break;
    }
    case 'shape': {
      const leafletLayer = buildLeafletLayer(entity);
      if (!leafletLayer) break;
      layerMap.set(id, leafletLayer);
      addToParentGroup(entity, leafletLayer);
      break;
    }
    case 'dimension': {
      const dimLayer = buildDimensionLayer(entity);
      if (!dimLayer) break;
      layerMap.set(id, dimLayer);
      dimLayer.addTo(map);
      break;
    }
    case 'annotation': {
      const annotLayer = buildAnnotationLayer(entity);
      if (!annotLayer) break;
      layerMap.set(id, annotLayer);
      annotLayer.addTo(map);
      break;
    }
    case 'constraint':
      break;
    default: exhaustive(entity);
  }
}

function onEntityRemoved(id: EntityId): void {
  const leafletLayer = layerMap.get(id);
  if (leafletLayer && map) {
    map.removeLayer(leafletLayer);
    if (leafletLayer instanceof L.FeatureGroup) {
      leafletLayer.eachLayer((sub: L.Layer) => { map?.removeLayer(sub); });
    }
  }
  layerMap.delete(id);

  const group = layerGroups.get(id);
  if (group && map) {
    map.removeLayer(group);
  }
  layerGroups.delete(id);
}

function onEntityUpdated(id: EntityId, componentKey?: string): void {
  const res = store.get(id);
  if (!res.ok || !map) return;
  const entity = res.value;

  switch (entity.kind) {
    case 'layer': {
      if (componentKey !== 'layer') break;
      const group = layerGroups.get(id);
      const layerComp = entity.components.layer;
      if (group) {
        if (layerComp.visible && !map.hasLayer(group)) group.addTo(map);
        else if (!layerComp.visible && map.hasLayer(group)) map.removeLayer(group);
      }
      break;
    }
    case 'shape': {
      if (componentKey === 'style') applyStyle(id, entity);
      else if (componentKey === 'geometry') rebuildShapeLayer(id, entity);
      break;
    }
    case 'dimension': {
      const existing = layerMap.get(id);
      if (existing) map.removeLayer(existing);
      const dimLayer = buildDimensionLayer(entity);
      if (dimLayer) {
        layerMap.set(id, dimLayer);
        dimLayer.addTo(map);
      }
      break;
    }
    case 'annotation':
    case 'constraint':
      break;
    default: exhaustive(entity);
  }
}

function buildLeafletLayer(entity: DeepReadonly<ShapeEntity>): L.Layer | null {
  const geo = entity.components.geometry;
  const style = entity.components.style;

  const color: string = style.color;
  const weight = style.weight;
  const opacity = style.opacity;
  const fillOpacity = style.fillOpacity;

  if (geo.shapeType === 'circle' && geo.radius != null && geo.geojson.type === 'Point') {
    const [lng, lat] = toLngLat(geo.geojson.coordinates);
    return L.circle([lat, lng], { radius: geo.radius, color, weight, opacity, fillOpacity });
  }

  if (geo.shapeType === 'marker' && geo.geojson.type === 'Point') {
    const [lng, lat] = toLngLat(geo.geojson.coordinates);
    return L.marker([lat, lng]);
  }

  if (geo.shapeType === 'circlemarker' && geo.geojson.type === 'Point') {
    const [lng, lat] = toLngLat(geo.geojson.coordinates);
    return L.circleMarker([lat, lng], {
      radius: 6, color, fillColor: color, fillOpacity: 0.6,
    });
  }

  const feature: GeoJSON.Feature = { type: 'Feature', geometry: structuredClone(geo.geojson) as GeoJSON.Geometry, properties: {} };
  let result: L.Layer | null = null;
  L.geoJSON(feature, {
    style: () => ({ color, weight, opacity, fillOpacity }),
  }).eachLayer((layer: L.Layer) => {
    if (!result) result = layer;
  });
  return result;
}

function buildDimensionLayer(entity: DeepReadonly<DimensionEntity>): L.Layer | null {
  const dim = entity.components.dimension;

  const targetRes = store.get(dim.targetEntityId);
  if (!targetRes.ok) return null;
  const target = targetRes.value;
  if (target.kind !== 'shape') return null;

  const coords = extractCoords(target.components.geometry);
  const from = coords[dim.fromVertex];
  const to = coords[dim.toVertex];
  if (!from || !to) return null;

  const midLat = (from[1] + to[1]) / 2;
  const midLng = (from[0] + to[0]) / 2;

  const unitLabel = dim.unit === 'ft' ? 'ft' : 'm';
  const valStr = dim.value >= 100
    ? `${Math.round(dim.value)} ${unitLabel}`
    : `${dim.value.toFixed(1)} ${unitLabel}`;

  // Check if this dimension has a constraint (parametric)
  const hasConstraint = isConstrained(entity.id);
  const className = hasConstraint ? 'dimension-label dimension-constrained' : 'dimension-label dimension-editable';

  const marker = L.marker([midLat, midLng], {
    icon: L.divIcon({
      className,
      html: valStr,
      iconSize: [70, 16],
      iconAnchor: [35, 8],
    }),
    interactive: true,
  });

  marker.on('click', () => {
    if (onDimensionClick) onDimensionClick(entity.id);
  });

  return marker;
}

function isConstrained(dimensionEntityId: EntityId): boolean {
  const dimRes = store.get(dimensionEntityId);
  if (!dimRes.ok || dimRes.value.kind !== 'dimension') return false;
  const dimComp = dimRes.value.components.dimension;

  for (const cId of store.byKind('constraint')) {
    const cRes = store.get(cId);
    if (!cRes.ok || cRes.value.kind !== 'constraint') continue;
    const comp = cRes.value.components.constraint;

    if (
      comp.type === 'fixed-distance' &&
      comp.entityIds.includes(dimComp.targetEntityId)
    ) {
      const vi = comp.params.vertexIndices;
      if (vi && vi[0] === dimComp.fromVertex && vi[1] === dimComp.toVertex) {
        return true;
      }
    }
  }
  return false;
}

let onDimensionClick: ((entityId: EntityId) => void) | null = null;

export function setDimensionClickHandler(handler: (entityId: EntityId) => void): void {
  onDimensionClick = handler;
}

function buildAnnotationLayer(_entity: DeepReadonly<AnnotationEntity>): L.Layer | null {
  return null;
}

function addToParentGroup(entity: ReadonlyEntity, leafletLayer: L.Layer): void {
  if (!map) return;
  if (entity.parentId) {
    const group = layerGroups.get(entity.parentId);
    if (group) {
      group.addLayer(leafletLayer);
      return;
    }
  }
  leafletLayer.addTo(map);
}

function applyStyle(id: EntityId, entity: DeepReadonly<ShapeEntity>): void {
  const leafletLayer = layerMap.get(id);
  if (!leafletLayer) return;
  const style = entity.components.style;

  if ('setStyle' in leafletLayer) {
    (leafletLayer as L.Path).setStyle({
      color: style.color as string,
      weight: style.weight,
      opacity: style.opacity,
      fillOpacity: style.fillOpacity,
    });
  }
}

function rebuildShapeLayer(id: EntityId, entity: DeepReadonly<ShapeEntity>): void {
  if (!map) return;
  const existing = layerMap.get(id);
  if (existing) {
    if (entity.parentId) {
      const group = layerGroups.get(entity.parentId);
      if (group) group.removeLayer(existing);
      else map.removeLayer(existing);
    } else {
      map.removeLayer(existing);
    }
  }

  const newLayer = buildLeafletLayer(entity);
  if (newLayer) {
    layerMap.set(id, newLayer);
    addToParentGroup(entity, newLayer);
  }
}
