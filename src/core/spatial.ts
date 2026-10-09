/**
 * Grid-based spatial index for entity queries.
 *
 * Divides the map into a uniform grid of cells. Each cell holds a RustVec
 * of EntityIds whose bounding box intersects that cell. Queries return
 * Iter<EntityId> for lazy pipeline composition.
 *
 * Not a full R-tree -- this is a simple, fast spatial index suitable for
 * the entity counts in a home improvement project (hundreds, not millions).
 * Exercises RustVec and Iter in a performance-relevant context.
 */

import type { EntityId } from './entity.js';
import type { Option } from '@protokarya/rustscript';
import { Some, None, isSome, Iter, RustVec } from '@protokarya/rustscript';

export interface BBox {
  readonly minLng: number;
  readonly minLat: number;
  readonly maxLng: number;
  readonly maxLat: number;
}

interface GridCell {
  readonly entities: RustVec<EntityId>;
}

export class SpatialIndex {
  private readonly cells: GridCell[];
  private readonly cols: number;
  private readonly rows: number;
  private readonly bounds: BBox;
  private readonly cellWidth: number;
  private readonly cellHeight: number;
  private readonly entityCells = new Map<EntityId, number[]>();

  constructor(bounds: BBox, resolution = 32) {
    this.bounds = bounds;
    this.cols = resolution;
    this.rows = resolution;
    this.cellWidth = (bounds.maxLng - bounds.minLng) / resolution;
    this.cellHeight = (bounds.maxLat - bounds.minLat) / resolution;
    this.cells = [];
    for (let i = 0; i < resolution * resolution; i++) {
      this.cells.push({ entities: RustVec.empty<EntityId>() });
    }
  }

  private cellIndex(col: number, row: number): Option<number> {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return None();
    return Some(row * this.cols + col);
  }

  private bboxToCells(bbox: BBox): Array<[number, number]> {
    const minCol = Math.max(0, Math.floor((bbox.minLng - this.bounds.minLng) / this.cellWidth));
    const maxCol = Math.min(this.cols - 1, Math.floor((bbox.maxLng - this.bounds.minLng) / this.cellWidth));
    const minRow = Math.max(0, Math.floor((bbox.minLat - this.bounds.minLat) / this.cellHeight));
    const maxRow = Math.min(this.rows - 1, Math.floor((bbox.maxLat - this.bounds.minLat) / this.cellHeight));

    const result: Array<[number, number]> = [];
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        result.push([c, r]);
      }
    }
    return result;
  }

  /** Insert an entity with its bounding box. */
  insert(id: EntityId, bbox: BBox): void {
    this.remove(id);
    const cellCoords = this.bboxToCells(bbox);
    const indices: number[] = [];

    for (const [col, row] of cellCoords) {
      const idx = this.cellIndex(col, row);
      if (isSome(idx)) {
        const cell = this.cells[idx.value];
        if (cell) {
          cell.entities.push(id);
          indices.push(idx.value);
        }
      }
    }
    this.entityCells.set(id, indices);
  }

  /** Remove an entity from the index. */
  remove(id: EntityId): void {
    const indices = this.entityCells.get(id);
    if (!indices) return;

    for (const idx of indices) {
      const cell = this.cells[idx];
      if (cell) {
        const pos = cell.entities.iter().enumerate().find(([, eid]) => eid === id);
        if (isSome(pos)) {
          cell.entities.removeAt(pos.value[0]);
        }
      }
    }
    this.entityCells.delete(id);
  }

  /** Query all entities whose bounding boxes intersect the given area. */
  query(area: BBox): Iter<EntityId> {
    const cellCoords = this.bboxToCells(area);
    const seen = new Set<EntityId>();
    const results = RustVec.empty<EntityId>();

    for (const [col, row] of cellCoords) {
      const idx = this.cellIndex(col, row);
      if (!isSome(idx)) continue;
      const cell = this.cells[idx.value];
      if (!cell) continue;

      for (const id of cell.entities) {
        if (!seen.has(id)) {
          seen.add(id);
          results.push(id);
        }
      }
    }

    return results.iter();
  }

  /** Query entities near a point within a radius (in degrees). */
  queryRadius(lng: number, lat: number, radius: number): Iter<EntityId> {
    return this.query({
      minLng: lng - radius,
      minLat: lat - radius,
      maxLng: lng + radius,
      maxLat: lat + radius,
    });
  }

  /** Number of indexed entities. */
  get size(): number {
    return this.entityCells.size;
  }

  /** Clear the entire index. */
  clear(): void {
    for (const cell of this.cells) {
      cell.entities.clear();
    }
    this.entityCells.clear();
  }
}
