import type { ShapeMeta } from './types/shape.js';
import type { EntityId } from './core/entity.js';

declare module 'leaflet' {
  interface Layer {
    _fpMeta?: ShapeMeta;
    _fpClickBound?: boolean;
    _fpEntityId?: EntityId;
  }
}
