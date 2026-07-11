import type { HexColor } from './brands.js';

export const SHAPE_STATUSES = ['planned', 'in-progress', 'complete'] as const;
export type ShapeStatus = typeof SHAPE_STATUSES[number];

export interface ShapeMeta {
  label: string;
  notes: string;
  status: ShapeStatus;
  color: HexColor;
  readonly createdAt: string;
}

export interface SerializedShapeProps extends Record<string, unknown> {
  readonly label?: string;
  readonly notes?: string;
  readonly status?: ShapeStatus;
  readonly color?: string;
  readonly createdAt?: string;
  readonly layerId?: string;
  readonly _radius?: number;
  readonly _shapeType?: 'circle';
}
