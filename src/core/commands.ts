// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Entity, MutableEntity, EntityId, ComponentKey, ComponentMap } from './entity.js';
import { createEntity } from './entity.js';
import { hexColorUnchecked } from '../types/brands.js';
import { exhaustive } from '@protokarya/rustscript';
import { isSome } from '@protokarya/rustscript';
import type { Option } from '@protokarya/rustscript';
import { None } from '@protokarya/rustscript';
import { Cow } from '@protokarya/rustscript';
import type { EntityStore } from './store.js';

export interface Command {
  readonly type: string;
  execute(store: EntityStore): void;
  undo(store: EntityStore): void;
}

export class AddEntityCommand implements Command {
  readonly type = 'AddEntity';
  private entity: Entity | MutableEntity;

  constructor(entity: Entity | MutableEntity) {
    this.entity = entity;
  }

  execute(store: EntityStore): void {
    store.add(this.entity);
  }

  undo(store: EntityStore): void {
    store.remove(this.entity.id);
  }

  getEntityId(): EntityId {
    return this.entity.id;
  }

  getEntity(): Entity | MutableEntity {
    return this.entity;
  }
}

export class RemoveEntityCommand implements Command {
  readonly type = 'RemoveEntity';
  private entityId: EntityId;
  private subtreeSnapshot: Cow<Entity>[] = [];

  constructor(entityId: EntityId) {
    this.entityId = entityId;
  }

  execute(store: EntityStore): void {
    this.subtreeSnapshot = [];
    this.snapshotSubtree(store, this.entityId);
    store.remove(this.entityId);
    for (const cow of this.subtreeSnapshot) {
      cow.toOwned();
    }
  }

  undo(store: EntityStore): void {
    store.beginBatch();
    for (const cow of this.subtreeSnapshot) {
      store.add(cow.intoOwned());
    }
    this.subtreeSnapshot = [];
    store.endBatch();
  }

  private snapshotSubtree(store: EntityStore, id: EntityId): void {
    const opt = store.getEntity(id);
    if (!isSome(opt)) return;
    const entity = opt.value;

    this.subtreeSnapshot.push(
      Cow.borrowed({
        id: entity.id,
        kind: entity.kind,
        parentId: entity.parentId,
        children: new Set(entity.children),
        components: structuredClone(entity.components),
      }),
    );

    for (const childId of entity.children) {
      this.snapshotSubtree(store, childId);
    }
  }
}

export class UpdateComponentCommand<K extends ComponentKey> implements Command {
  readonly type = 'UpdateComponent';
  private entityId: EntityId;
  private key: K;
  private newValue: ComponentMap[K];
  private oldValue: Option<ComponentMap[K]> = None();

  constructor(entityId: EntityId, key: K, newValue: ComponentMap[K]) {
    this.entityId = entityId;
    this.key = key;
    this.newValue = structuredClone(newValue);
  }

  execute(store: EntityStore): void {
    const opt = store.getEntity(this.entityId);
    if (isSome(opt)) {
      const comp = opt.value.components[this.key];
      this.oldValue = comp != null ? { some: true as const, value: structuredClone(comp) } : None();
    }
    store.setComponent(this.entityId, this.key, this.newValue);
  }

  undo(store: EntityStore): void {
    if (isSome(this.oldValue)) {
      store.setComponent(this.entityId, this.key, this.oldValue.value);
    } else {
      store.removeComponent(this.entityId, this.key);
    }
  }
}

export class MoveGeometryCommand implements Command {
  readonly type = 'MoveGeometry';
  private entityId: EntityId;
  private deltaLng: number;
  private deltaLat: number;

  constructor(entityId: EntityId, deltaLng: number, deltaLat: number) {
    this.entityId = entityId;
    this.deltaLng = deltaLng;
    this.deltaLat = deltaLat;
  }

  execute(store: EntityStore): void {
    this.applyDelta(store, this.deltaLng, this.deltaLat);
  }

  undo(store: EntityStore): void {
    this.applyDelta(store, -this.deltaLng, -this.deltaLat);
  }

  private applyDelta(store: EntityStore, dx: number, dy: number): void {
    const opt = store.getEntity(this.entityId);
    if (!isSome(opt) || !opt.value.components.geometry) return;

    const geo = structuredClone(opt.value.components.geometry);
    translateGeometry(geo.geojson, dx, dy);
    store.setComponent(this.entityId, 'geometry', geo);
  }
}

export class BatchCommand implements Command {
  readonly type = 'Batch';
  private readonly commands: Command[];

  constructor(commands: Command[]) {
    this.commands = commands;
  }

  execute(store: EntityStore): void {
    store.beginBatch();
    for (const cmd of this.commands) {
      cmd.execute(store);
    }
    store.endBatch();
  }

  undo(store: EntityStore): void {
    store.beginBatch();
    for (let i = this.commands.length - 1; i >= 0; i--) {
      const cmd = this.commands[i];
      if (cmd) cmd.undo(store);
    }
    store.endBatch();
  }
}

function offsetCoord(c: GeoJSON.Position, dx: number, dy: number): void {
  if (c.length >= 2) {
    c[0] = (c[0] ?? 0) + dx;
    c[1] = (c[1] ?? 0) + dy;
  }
}

function translateGeometry(geojson: GeoJSON.Geometry, dx: number, dy: number): void {
  switch (geojson.type) {
    case 'Point':
      offsetCoord(geojson.coordinates, dx, dy);
      break;
    case 'LineString':
    case 'MultiPoint':
      for (const coord of geojson.coordinates) offsetCoord(coord, dx, dy);
      break;
    case 'Polygon':
    case 'MultiLineString':
      for (const ring of geojson.coordinates) {
        for (const coord of ring) offsetCoord(coord, dx, dy);
      }
      break;
    case 'MultiPolygon':
      for (const poly of geojson.coordinates) {
        for (const ring of poly) {
          for (const coord of ring) offsetCoord(coord, dx, dy);
        }
      }
      break;
    case 'GeometryCollection':
      for (const g of geojson.geometries) translateGeometry(g, dx, dy);
      break;
    default:
      exhaustive(geojson);
  }
}

export function createShapeEntity(
  geojson: GeoJSON.Geometry,
  shapeType: 'polygon' | 'polyline' | 'rectangle' | 'circle' | 'marker' | 'circlemarker',
  parentLayerId: EntityId,
  color: string,
  radius?: number,
): { entity: MutableEntity; command: AddEntityCommand } {
  const entity = createEntity('shape', parentLayerId);
  entity.components.geometry = { geojson, shapeType, ...(radius != null ? { radius } : {}) };
  entity.components.style = {
    color: hexColorUnchecked(color),
    weight: 3,
    opacity: 0.9,
    fillOpacity: 0.25,
  };
  entity.components.meta = {
    label: '',
    notes: '',
    status: 'planned',
    createdAt: new Date().toISOString(),
  };
  return { entity, command: new AddEntityCommand(entity) };
}
