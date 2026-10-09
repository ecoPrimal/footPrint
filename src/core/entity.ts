// SPDX-License-Identifier: AGPL-3.0-or-later
import type { HexColor } from '../types/brands.js';
import type { ShapeStatus } from '../types/shape.js';
import type { DeepReadonly } from '@protokarya/rustscript';
import type { EntityId } from '../types/brands.js';
import { entityId } from '../types/brands.js';

export type { EntityId } from '../types/brands.js';
export { entityId, entityIdUnchecked as entityIdFrom } from '../types/brands.js';

/**
 * Compile-time immutable view of an Entity. Rust's `&Entity`.
 * Discriminated union -- narrow on `entity.kind` to access kind-specific components.
 */
export type ReadonlyEntity = DeepReadonly<TypedEntity>;

export const ENTITY_KINDS = ['shape', 'layer', 'dimension', 'constraint', 'annotation'] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export interface GeometryComponent {
  geojson: GeoJSON.Geometry;
  shapeType: 'polygon' | 'polyline' | 'rectangle' | 'circle' | 'marker' | 'circlemarker';
  radius?: number | undefined;
}

export interface StyleComponent {
  color: HexColor;
  weight: number;
  opacity: number;
  fillOpacity: number;
}

export interface MetaComponent {
  label: string;
  notes: string;
  status: ShapeStatus;
  createdAt: string;
}

export interface LayerComponent {
  layerName: string;
  visible: boolean;
}

export interface DimensionComponent {
  targetEntityId: EntityId;
  fromVertex: number;
  toVertex: number;
  value: number;
  unit: 'ft' | 'm';
}

export interface ConstraintComponent {
  type: ConstraintType;
  entityIds: EntityId[];
  params: ConstraintParams;
  satisfied: boolean;
}

export interface ElevationComponent {
  vertices: readonly { index: number; elevation: number }[];
  min: number;
  max: number;
}

export const CONSTRAINT_TYPES = [
  'fixed-distance',
  'parallel',
  'perpendicular',
  'point-on-line',
  'coincident',
  'horizontal',
  'vertical',
  'tangent',
  'symmetric',
  'setback',
] as const;
export type ConstraintType = (typeof CONSTRAINT_TYPES)[number];

export interface ConstraintParams {
  distance?: number;
  angle?: number;
  axisPoint?: [number, number];
  axisDirection?: [number, number];
  vertexIndices?: number[];
  /** Tangent: use internal (difference of radii) vs external (sum of radii). */
  internal?: boolean;
  /** Tangent: fallback radii when not stored on geometry. */
  radius1?: number;
  radius2?: number;
}

export interface ComponentMap {
  geometry?: GeometryComponent;
  style?: StyleComponent;
  meta?: MetaComponent;
  layer?: LayerComponent;
  dimension?: DimensionComponent;
  constraint?: ConstraintComponent;
  elevation?: ElevationComponent;
}

export type ComponentKey = keyof ComponentMap;

// ── Discriminated TypedEntity union (Rust enum-of-structs) ──────────

interface EntityBase {
  readonly id: EntityId;
  parentId: EntityId | null;
  readonly children: Set<EntityId>;
}

export interface ShapeEntity extends EntityBase {
  readonly kind: 'shape';
  readonly components: Readonly<{
    geometry: GeometryComponent;
    style: StyleComponent;
    meta: MetaComponent;
    elevation?: ElevationComponent;
  }>;
}

export interface LayerEntity extends EntityBase {
  readonly kind: 'layer';
  readonly components: Readonly<{
    layer: LayerComponent;
    style: StyleComponent;
  }>;
}

export interface DimensionEntity extends EntityBase {
  readonly kind: 'dimension';
  readonly components: Readonly<{
    dimension: DimensionComponent;
  }>;
}

export interface ConstraintEntity extends EntityBase {
  readonly kind: 'constraint';
  readonly components: Readonly<{
    constraint: ConstraintComponent;
  }>;
}

export interface AnnotationEntity extends EntityBase {
  readonly kind: 'annotation';
  readonly components: Readonly<{
    meta?: MetaComponent;
    style?: StyleComponent;
  }>;
}

/**
 * Discriminated union of all entity kinds.
 * After narrowing on `entity.kind`, the compiler knows exactly which components exist.
 */
export type TypedEntity = ShapeEntity | LayerEntity | DimensionEntity | ConstraintEntity | AnnotationEntity;

// ── Internal store types (loose, for mutation infrastructure) ──────────

export interface Entity {
  readonly id: EntityId;
  readonly kind: EntityKind;
  parentId: EntityId | null;
  readonly children: Set<EntityId>;
  readonly components: Readonly<ComponentMap>;
}

export interface SerializedEntity {
  readonly id: string;
  readonly kind: EntityKind;
  readonly parentId: string | null;
  readonly children: readonly string[];
  readonly components: ComponentMap;
}

export interface MutableEntity {
  readonly id: EntityId;
  readonly kind: EntityKind;
  parentId: EntityId | null;
  readonly children: Set<EntityId>;
  components: ComponentMap;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const SHAPE_TYPES: ReadonlySet<string> = new Set([
  'polygon',
  'polyline',
  'rectangle',
  'circle',
  'marker',
  'circlemarker',
]);

/**
 * Runtime check that a value is a plausible component for the given key.
 * Validates top-level field types; does NOT deep-clone.
 */
export function isValidComponentValue(key: ComponentKey, value: unknown): boolean {
  if (!isObj(value)) return false;
  switch (key) {
    case 'geometry':
      return isObj(value['geojson']) && typeof value['shapeType'] === 'string' && SHAPE_TYPES.has(value['shapeType']);
    case 'style':
      return typeof value['color'] === 'string' && typeof value['weight'] === 'number';
    case 'meta':
      return typeof value['label'] === 'string' && typeof value['status'] === 'string';
    case 'layer':
      return typeof value['layerName'] === 'string' && typeof value['visible'] === 'boolean';
    case 'dimension':
      return typeof value['targetEntityId'] === 'string' && typeof value['value'] === 'number';
    case 'constraint':
      return typeof value['type'] === 'string' && Array.isArray(value['entityIds']);
    case 'elevation':
      return Array.isArray(value['vertices']) && typeof value['min'] === 'number';
    default:
      return false;
  }
}

export function createEntity(kind: EntityKind, parentId: EntityId | null = null): MutableEntity {
  return {
    id: entityId(),
    kind,
    parentId,
    children: new Set(),
    components: {},
  };
}
