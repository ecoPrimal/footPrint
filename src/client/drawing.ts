import * as L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import type { EntityId, GeometryComponent } from '../core/entity.js';
import { execute } from '../core/history.js';
import { createShapeEntity, RemoveEntityCommand } from '../core/commands.js';
import { getLeafletLayer, getEntityIdForLayer } from '../core/renderer.js';
import type { HexColor } from '../types/brands.js';
import { layerToFeature } from './geojson.js';

let map: L.Map | null = null;
let onShapeSelect: ((entityId: EntityId | null) => void) | null = null;
let selectedEntityId: EntityId | null = null;
let activeLayerEntityId: EntityId | null = null;
let activeColor: HexColor | null = null;

export function initDrawing(
  leafletMap: L.Map,
  shapeSelectCallback: (entityId: EntityId | null) => void,
): void {
  map = leafletMap;
  onShapeSelect = shapeSelectCallback;

  map.pm.addControls({
    position: 'topleft',
    drawMarker: true,
    drawCircleMarker: false,
    drawPolyline: true,
    drawRectangle: true,
    drawPolygon: true,
    drawCircle: true,
    drawText: false,
    editMode: true,
    dragMode: true,
    cutPolygon: false,
    removalMode: true,
    rotateMode: false,
  });

  map.on('pm:create', (e: { layer: L.Layer; shape: string }) => {
    handleCreate(e.layer, e.shape);
  });

  map.on('pm:remove', (e: { layer: L.Layer }) => {
    const entId = getEntityIdForLayer(e.layer);
    if (entId) {
      if (selectedEntityId === entId) deselectShape();
      execute(new RemoveEntityCommand(entId));
    }
  });
}

export function setActiveLayerEntity(layerEntityId: EntityId, color: HexColor): void {
  activeLayerEntityId = layerEntityId;
  activeColor = color;
}

function handleCreate(layer: L.Layer, shapeType: string): void {
  if (!map || !activeLayerEntityId || !activeColor) return;

  map.removeLayer(layer);

  const geo = extractGeometry(layer);
  if (!geo) return;

  const mappedType = mapShapeType(shapeType);
  const radius = layer instanceof L.Circle ? layer.getRadius() : undefined;

  const { entity, command } = createShapeEntity(
    geo,
    mappedType,
    activeLayerEntityId,
    activeColor,
    radius,
  );

  execute(command);

  // Bind click on the rendered Leaflet layer
  setTimeout(() => {
    const leafletLayer = getLeafletLayer(entity.id);
    if (leafletLayer) {
      bindShapeClick(leafletLayer, entity.id);
    }
    selectShape(entity.id);
  }, 0);
}

function extractGeometry(layer: L.Layer): GeoJSON.Geometry | null {
  const feat = layerToFeature(layer);
  return feat?.geometry ?? null;
}

function mapShapeType(pmShape: string): GeometryComponent['shapeType'] {
  switch (pmShape.toLowerCase()) {
    case 'polygon': return 'polygon';
    case 'rectangle': return 'rectangle';
    case 'line': return 'polyline';
    case 'circle': return 'circle';
    case 'marker': return 'marker';
    case 'circlemarker': return 'circlemarker';
    default: return 'polygon';
  }
}

export function bindShapeClick(leafletLayer: L.Layer, entityId: EntityId): void {
  leafletLayer.on('click', (e: L.LeafletMouseEvent) => {
    L.DomEvent.stopPropagation(e);
    selectShape(entityId);
  });
}

export function selectShape(entityId: EntityId): void {
  if (selectedEntityId && selectedEntityId !== entityId) {
    const prevLayer = getLeafletLayer(selectedEntityId);
    if (prevLayer && 'setStyle' in prevLayer) {
      try { (prevLayer as L.Path).setStyle({ weight: 3 }); } catch { /* layer may already be gone */ }
    }
  }

  selectedEntityId = entityId;

  const layer = getLeafletLayer(entityId);
  if (layer && 'setStyle' in layer) {
    (layer as L.Path).setStyle({ weight: 5 });
  }

  if (onShapeSelect) onShapeSelect(entityId);
}

export function deselectShape(): void {
  if (selectedEntityId) {
    const layer = getLeafletLayer(selectedEntityId);
    if (layer && 'setStyle' in layer) {
      try { (layer as L.Path).setStyle({ weight: 3 }); } catch { /* layer may already be gone */ }
    }
  }
  selectedEntityId = null;
  if (onShapeSelect) onShapeSelect(null);
}

export function deleteSelectedShape(): void {
  if (!selectedEntityId) return;
  const id = selectedEntityId;
  deselectShape();
  execute(new RemoveEntityCommand(id));
}

