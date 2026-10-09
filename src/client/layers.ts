import type { EntityId } from '../core/entity.js';
import { createEntity } from '../core/entity.js';
import { store } from '../core/store.js';
import { execute } from '../core/history.js';
import { AddEntityCommand, RemoveEntityCommand, UpdateComponentCommand } from '../core/commands.js';
import type { LayerId, HexColor } from '../types/brands.js';
import { layerId, hexColor } from '../types/brands.js';
import { parseHexColor } from '../types/brands.js';
import { unwrapOr } from '@protokarya/rustscript';
import type { SerializedLayers, SerializedLayerData } from '../types/layer.js';
import type { SerializedShapeProps } from '../types/shape.js';

interface DefaultLayerDef {
  readonly id: LayerId;
  readonly name: string;
  readonly color: HexColor;
}

const DEFAULT_LAYERS: readonly DefaultLayerDef[] = [
  { id: layerId('property'), name: 'Property Boundary', color: hexColor('#e74c3c') },
  { id: layerId('fencing'),  name: 'Fencing',           color: hexColor('#8B4513') },
  { id: layerId('landscape'), name: 'Landscaping',      color: hexColor('#27ae60') },
  { id: layerId('utilities'), name: 'Utilities',        color: hexColor('#f1c40f') },
  { id: layerId('notes'),    name: 'Notes',             color: hexColor('#3498db') },
];

let activeLayerId: EntityId | null = null;
let onLayerChange: ((layerEntityId: EntityId, color: HexColor) => void) | null = null;

// Map from LayerId (user-facing) to EntityId (store)
const layerIdToEntityId = new Map<string, EntityId>();

export function initLayers(
  _leafletMap: L.Map,
  changeCallback: (layerEntityId: EntityId, color: HexColor) => void,
): void {
  onLayerChange = changeCallback;

  for (const def of DEFAULT_LAYERS) {
    createLayerEntity(def.id, def.name, def.color);
  }
  const propEntityId = layerIdToEntityId.get('property');
  if (propEntityId) setActiveLayer(propEntityId);
  renderLayerList();
}

function createLayerEntity(id: LayerId, name: string, color: HexColor, throughHistory = true): EntityId {
  const existing = layerIdToEntityId.get(id);
  if (existing) return existing;

  const entity = createEntity('layer', null);
  entity.components.layer = { layerName: name, visible: true };
  entity.components.style = { color, weight: 3, opacity: 0.9, fillOpacity: 0.25 };

  if (throughHistory) {
    execute(new AddEntityCommand(entity));
  } else {
    store.add(entity);
  }
  layerIdToEntityId.set(id, entity.id);
  return entity.id;
}

export function getActiveLayerEntityId(): EntityId | undefined {
  return activeLayerId ?? undefined;
}

export function getActiveLayerColor(): HexColor | undefined {
  if (!activeLayerId) return undefined;
  const res = store.get(activeLayerId);
  if (!res.ok || res.value.kind !== 'layer') return undefined;
  return res.value.components.style.color;
}

export function setActiveLayer(entityId: EntityId): void {
  activeLayerId = entityId;
  renderLayerList();
  const res = store.get(entityId);
  const color = (res.ok && res.value.kind === 'layer') ? res.value.components.style.color : hexColor('#e94560');
  if (onLayerChange) onLayerChange(entityId, color);
}

export function toggleLayerVisibility(entityId: EntityId): void {
  const res = store.get(entityId);
  if (!res.ok || res.value.kind !== 'layer') return;
  const entity = res.value;
  const current = entity.components.layer.visible;
  execute(new UpdateComponentCommand(entityId, 'layer', {
    ...entity.components.layer,
    visible: !current,
  }));
  renderLayerList();
}

export function deleteLayer(entityId: EntityId): void {
  execute(new RemoveEntityCommand(entityId));

  // Remove from lookup
  for (const [key, val] of layerIdToEntityId) {
    if (val === entityId) { layerIdToEntityId.delete(key); break; }
  }

  if (activeLayerId === entityId) {
    const remaining = [...store.byKind('layer')];
    const first = remaining[0];
    if (first) setActiveLayer(first);
    else activeLayerId = null;
  }
  renderLayerList();
}

export function addCustomLayer(): void {
  const name = prompt('Layer name:');
  if (!name) return;
  const rawColor = prompt('Layer color (hex):', '#9b59b6') ?? '#9b59b6';
  const validatedColor = unwrapOr(parseHexColor(rawColor), hexColor('#9b59b6'));
  const id = layerId('custom_' + Date.now().toString());
  const entityId = createLayerEntity(id, name, validatedColor);
  setActiveLayer(entityId);
}

export function renderLayerList(): void {
  const ul = document.getElementById('layer-list');
  if (!ul) return;
  ul.innerHTML = '';

  for (const entityId of store.byKind('layer')) {
    const res = store.get(entityId);
    if (!res.ok || res.value.kind !== 'layer') continue;
    const entity = res.value;

    const layerComp = entity.components.layer;
    const style = entity.components.style;
    const li = document.createElement('li');
    if (entityId === activeLayerId) li.classList.add('active');

    li.innerHTML = `
      <span class="layer-color" style="background:${style.color}"></span>
      <span class="layer-name">${layerComp.layerName}</span>
      <button class="layer-visibility ${layerComp.visible ? '' : 'hidden-layer'}"
              title="Toggle visibility">${layerComp.visible ? '\u{1F441}' : '\u{1F441}\u200D\u{1F5E8}'}</button>
      <button class="layer-delete" title="Delete layer">&times;</button>
    `;

    const eid = entityId;
    li.querySelector('.layer-name')?.addEventListener('click', () => { setActiveLayer(eid); });
    li.querySelector('.layer-color')?.addEventListener('click', () => { setActiveLayer(eid); });
    li.querySelector('.layer-visibility')?.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      toggleLayerVisibility(eid);
    });
    li.querySelector('.layer-delete')?.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      if (confirm(`Delete layer "${layerComp.layerName}" and all its shapes?`)) {
        deleteLayer(eid);
      }
    });

    ul.appendChild(li);
  }
}

export function serializeLayers(): SerializedLayers {
  const data: Record<string, SerializedLayerData> = {};

  for (const layerEntityId of store.byKind('layer')) {
    const layerRes = store.get(layerEntityId);
    if (!layerRes.ok || layerRes.value.kind !== 'layer') continue;
    const layerEntity = layerRes.value;

    const features: GeoJSON.Feature[] = [];
    for (const childId of layerEntity.children) {
      const childRes = store.get(childId);
      if (!childRes.ok || childRes.value.kind !== 'shape') continue;
      const child = childRes.value;

      const geo = child.components.geometry;
      const meta = child.components.meta;
      const style = child.components.style;

      const geojsonGeometry = structuredClone(geo.geojson) as GeoJSON.Geometry;
      const props: Record<string, unknown> = {};
      if (meta) {
        props['label'] = meta.label;
        props['notes'] = meta.notes;
        props['status'] = meta.status;
        props['createdAt'] = meta.createdAt;
      }
      if (style) {
        props['color'] = style.color;
      }
      props['layerId'] = layerEntityId;
      props['_entityId'] = child.id;
      if (geo.shapeType === 'circle' && geo.radius != null) {
        props['_radius'] = geo.radius;
        props['_shapeType'] = 'circle';
      }

      features.push({
        type: 'Feature',
        geometry: geojsonGeometry,
        properties: props,
      });
    }

    let layerKey = layerEntityId as string;
    for (const [key, val] of layerIdToEntityId) {
      if (val === layerEntityId) { layerKey = key; break; }
    }

    data[layerKey] = {
      name: layerEntity.components.layer.layerName,
      color: layerEntity.components.style.color,
      features,
    };
  }
  return data;
}

export function deserializeLayers(data: SerializedLayers): void {
  store.clear();
  layerIdToEntityId.clear();
  activeLayerId = null;

  for (const [id, layerData] of Object.entries(data)) {
    // Deserialize bypasses history intentionally -- project load is not undoable
    const entityId = createLayerEntity(layerId(id), layerData.name, hexColor(layerData.color), false);

    for (const feature of layerData.features) {
      const props = (feature.properties ?? {}) as SerializedShapeProps;

      const shapeEntity = createEntity('shape', entityId);
      const shapeType = props._shapeType === 'circle' ? 'circle' as const
        : feature.geometry.type === 'Point' ? 'marker' as const
        : feature.geometry.type === 'LineString' ? 'polyline' as const
        : 'polygon' as const;

      shapeEntity.components.geometry = {
        geojson: feature.geometry,
        shapeType,
        ...(props._radius != null ? { radius: props._radius } : {}),
      };
      shapeEntity.components.style = {
        color: hexColor(props.color ?? layerData.color),
        weight: 3,
        opacity: 0.9,
        fillOpacity: 0.25,
      };
      shapeEntity.components.meta = {
        label: props.label ?? '',
        notes: props.notes ?? '',
        status: props.status ?? 'planned',
        createdAt: props.createdAt ?? new Date().toISOString(),
      };
      store.add(shapeEntity);
    }
  }

  const first = [...store.byKind('layer')][0];
  if (first) setActiveLayer(first);
  renderLayerList();
}
