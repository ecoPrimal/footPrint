export const SHAPE_STATUSES = ['planned', 'in-progress', 'complete'] as const;
export type ShapeStatus = typeof SHAPE_STATUSES[number];

const SHAPE_STATUS_SET: ReadonlySet<string> = new Set(SHAPE_STATUSES);

export interface SerializedShapeProps extends Record<string, unknown> {
  readonly label?: string;
  readonly notes?: string;
  readonly status?: ShapeStatus;
  readonly color?: string;
  readonly createdAt?: string;
  readonly layerId?: string;
  readonly _entityId?: string;
  readonly _radius?: number;
  readonly _shapeType?: 'circle';
}

function optStr(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/**
 * Parse untrusted JSON properties into a validated SerializedShapeProps.
 * Invalid fields are silently dropped (they're all optional).
 */
export function parseSerializedShapeProps(raw: unknown): SerializedShapeProps {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const status = optStr(r['status']);
  const out: Record<string, unknown> = {};
  const label = optStr(r['label']);
  if (label !== undefined) out['label'] = label;
  const notes = optStr(r['notes']);
  if (notes !== undefined) out['notes'] = notes;
  if (status && SHAPE_STATUS_SET.has(status)) out['status'] = status;
  const color = optStr(r['color']);
  if (color !== undefined) out['color'] = color;
  const createdAt = optStr(r['createdAt']);
  if (createdAt !== undefined) out['createdAt'] = createdAt;
  const lid = optStr(r['layerId']);
  if (lid !== undefined) out['layerId'] = lid;
  const eid = optStr(r['_entityId']);
  if (eid !== undefined) out['_entityId'] = eid;
  if (r['_shapeType'] === 'circle') {
    out['_shapeType'] = 'circle';
    if (typeof r['_radius'] === 'number') out['_radius'] = r['_radius'];
  }
  return out as SerializedShapeProps;
}
