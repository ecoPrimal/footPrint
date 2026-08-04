// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach } from 'vitest';
import { EntityStore } from './store.js';
import { createEntity } from './entity.js';
import type { EntityId, ConstraintType } from './entity.js';
import { AddEntityCommand } from './commands.js';
import { solveConstraints, addFixedDistanceConstraint } from './constraints.js';
import { hexColorUnchecked } from '../types/brands.js';

let store: EntityStore;

function getLineCoords(shapeId: EntityId): GeoJSON.Position[] {
  const res = store.get(shapeId);
  if (!res.ok || res.value.kind !== 'shape') throw new Error('not a shape');
  return (res.value.components.geometry.geojson as GeoJSON.LineString).coordinates;
}

function addTestShape(geo: GeoJSON.Geometry, parentId: EntityId | null = null): EntityId {
  const entity = createEntity('shape', parentId);
  entity.components.geometry = { geojson: geo, shapeType: 'polygon' };
  entity.components.style = { color: hexColorUnchecked('#ff0000'), weight: 1, opacity: 1, fillOpacity: 0.3 };
  entity.components.meta = { label: '', notes: '', status: 'planned', createdAt: '2026-01-01' };
  new AddEntityCommand(entity).execute(store);
  return entity.id;
}

function addTestCircle(center: GeoJSON.Position, radius: number): EntityId {
  const entity = createEntity('shape', null);
  entity.components.geometry = {
    geojson: { type: 'Point', coordinates: center },
    shapeType: 'circle',
    radius,
  };
  entity.components.style = { color: hexColorUnchecked('#ff0000'), weight: 1, opacity: 1, fillOpacity: 0.3 };
  entity.components.meta = { label: '', notes: '', status: 'planned', createdAt: '2026-01-01' };
  new AddEntityCommand(entity).execute(store);
  return entity.id;
}

function getPointCoords(shapeId: EntityId): GeoJSON.Position {
  const res = store.get(shapeId);
  if (!res.ok || res.value.kind !== 'shape') throw new Error('not a shape');
  return (res.value.components.geometry.geojson as GeoJSON.Point).coordinates;
}

function addConstraint(type: string, entityIds: EntityId[], params: Record<string, unknown> = {}): EntityId {
  const entity = createEntity('constraint', null);
  entity.components.constraint = {
    type: type as ConstraintType,
    entityIds,
    params: { vertexIndices: [0, 1], ...params },
    satisfied: false,
  };
  new AddEntityCommand(entity).execute(store);
  return entity.id;
}

describe('Constraint solver', () => {
  beforeEach(async () => {
    const mod = await import('./store.js');
    store = mod.store;
    store.clear();
  });

  it('returns converged with no constraints', () => {
    const result = solveConstraints();
    expect(result.converged).toBe(true);
    expect(result.iterations).toBe(0);
    expect(result.residual).toBe(0);
  });

  it('solves horizontal constraint (same latitude)', () => {
    const shapeId = addTestShape({
      type: 'LineString',
      coordinates: [
        [0, 0],
        [1, 0.5],
      ],
    });

    addConstraint('horizontal', [shapeId], { vertexIndices: [0, 1] });
    const result = solveConstraints();
    expect(result.converged).toBe(true);

    const coords = getLineCoords(shapeId);
    expect(Math.abs((coords[0]?.[1] ?? 0) - (coords[1]?.[1] ?? 0))).toBeLessThan(1e-6);
  });

  it('solves vertical constraint (same longitude)', () => {
    const shapeId = addTestShape({
      type: 'LineString',
      coordinates: [
        [0, 0],
        [0.5, 1],
      ],
    });

    addConstraint('vertical', [shapeId], { vertexIndices: [0, 1] });
    const result = solveConstraints();
    expect(result.converged).toBe(true);

    const coords = getLineCoords(shapeId);
    expect(Math.abs((coords[0]?.[0] ?? 0) - (coords[1]?.[0] ?? 0))).toBeLessThan(1e-6);
  });

  it('solves fixed-distance constraint', () => {
    const shapeId = addTestShape({
      type: 'LineString',
      coordinates: [
        [0, 0],
        [1, 0],
      ],
    });

    addConstraint('fixed-distance', [shapeId], {
      distance: 0.5,
      vertexIndices: [0, 1],
    });
    const result = solveConstraints();
    expect(result.converged).toBe(true);

    const coords = getLineCoords(shapeId);
    const dx = (coords[1]?.[0] ?? 0) - (coords[0]?.[0] ?? 0);
    const dy = (coords[1]?.[1] ?? 0) - (coords[0]?.[1] ?? 0);
    const dist = Math.sqrt(dx * dx + dy * dy);
    expect(dist).toBeCloseTo(0.5, 5);
  });

  it('marks constraints as satisfied after convergence', () => {
    const shapeId = addTestShape({
      type: 'LineString',
      coordinates: [
        [0, 0],
        [0, 1],
      ],
    });
    const constraintId = addConstraint('horizontal', [shapeId], { vertexIndices: [0, 1] });

    solveConstraints();

    const res = store.get(constraintId);
    expect(res.ok).toBe(true);
    if (res.ok && res.value.kind === 'constraint') {
      expect(res.value.components.constraint.satisfied).toBe(true);
    }
  });

  it('solves coincident constraint (two vertices merged)', () => {
    const shapeId = addTestShape({
      type: 'LineString',
      coordinates: [
        [0, 0],
        [1, 1],
      ],
    });

    addConstraint('coincident', [shapeId], { vertexIndices: [0, 1] });
    const result = solveConstraints();
    expect(result.converged).toBe(true);

    const coords = getLineCoords(shapeId);
    expect(Math.abs((coords[0]?.[0] ?? 0) - (coords[1]?.[0] ?? 0))).toBeLessThan(1e-5);
    expect(Math.abs((coords[0]?.[1] ?? 0) - (coords[1]?.[1] ?? 0))).toBeLessThan(1e-5);
  });

  it('solves external tangent constraint between two circles', () => {
    const c1 = addTestCircle([0, 0], 2);
    const c2 = addTestCircle([7, 0], 3);

    addConstraint('tangent', [c1, c2], { vertexIndices: [0, 0] });
    const result = solveConstraints();
    expect(result.converged).toBe(true);

    const p1 = getPointCoords(c1);
    const p2 = getPointCoords(c2);
    const dx = (p2[0] ?? 0) - (p1[0] ?? 0);
    const dy = (p2[1] ?? 0) - (p1[1] ?? 0);
    const dist = Math.sqrt(dx * dx + dy * dy);
    expect(dist).toBeCloseTo(5, 4);
  });

  it('solves internal tangent constraint between two circles', () => {
    const c1 = addTestCircle([0, 0], 5);
    const c2 = addTestCircle([4, 0], 2);

    addConstraint('tangent', [c1, c2], { vertexIndices: [0, 0], internal: true });
    const result = solveConstraints();
    expect(result.converged).toBe(true);

    const p1 = getPointCoords(c1);
    const p2 = getPointCoords(c2);
    const dx = (p2[0] ?? 0) - (p1[0] ?? 0);
    const dy = (p2[1] ?? 0) - (p1[1] ?? 0);
    const dist = Math.sqrt(dx * dx + dy * dy);
    expect(dist).toBeCloseTo(3, 4);
  });

  it('solves symmetric constraint about a horizontal axis on the same shape', () => {
    const shapeId = addTestShape({
      type: 'LineString',
      coordinates: [
        [1, 2],
        [1, -1],
        [-5, 0],
        [5, 0],
      ],
    });

    addConstraint('horizontal', [shapeId], { vertexIndices: [2, 3] });
    addConstraint('symmetric', [shapeId], { vertexIndices: [0, 1, 2, 3] });
    const result = solveConstraints();
    expect(result.converged).toBe(true);

    const coords = getLineCoords(shapeId);
    expect(coords[0]?.[0] ?? 0).toBeCloseTo(coords[1]?.[0] ?? 0, 4);
    expect(coords[0]?.[1] ?? 0).toBeCloseTo(-(coords[1]?.[1] ?? 0), 4);
  });

  it('solves symmetric constraint with fixed axis params', () => {
    const shapeId = addTestShape({
      type: 'LineString',
      coordinates: [
        [2, 3],
        [2, -2],
      ],
    });

    addConstraint('symmetric', [shapeId], {
      vertexIndices: [0, 1],
      axisPoint: [0, 0],
      axisDirection: [1, 0],
    });
    const result = solveConstraints();
    expect(result.converged).toBe(true);

    const coords = getLineCoords(shapeId);
    expect(coords[0]?.[1] ?? 0).toBeCloseTo(-(coords[1]?.[1] ?? 0), 4);
    expect(coords[0]?.[0] ?? 0).toBeCloseTo(coords[1]?.[0] ?? 0, 4);
  });

  it('solves setback constraint pushing edge away from boundary', () => {
    const edgeId = addTestShape({
      type: 'LineString',
      coordinates: [
        [0, 1],
        [2, 1],
      ],
    });
    const boundaryId = addTestShape({
      type: 'LineString',
      coordinates: [
        [0, 0],
        [10, 0],
      ],
    });

    addConstraint('horizontal', [boundaryId], { vertexIndices: [0, 1] });
    addConstraint('setback', [edgeId, boundaryId], {
      distance: 3,
      vertexIndices: [0, 1, 0, 1],
    });
    const result = solveConstraints();
    expect(result.converged).toBe(true);

    const edgeCoords = getLineCoords(edgeId);
    expect(edgeCoords[0]?.[1] ?? 0).toBeGreaterThanOrEqual(2.99);
    expect(edgeCoords[1]?.[1] ?? 0).toBeGreaterThanOrEqual(2.99);
  });
});

describe('addFixedDistanceConstraint', () => {
  beforeEach(async () => {
    const mod = await import('./store.js');
    store = mod.store;
    store.clear();
  });

  it('creates a constraint entity and solves', () => {
    const s1 = addTestShape({
      type: 'LineString',
      coordinates: [
        [0, 0],
        [2, 0],
      ],
    });
    const constraintId = addFixedDistanceConstraint(s1, 0, s1, 1, 1.0);

    expect(store.has(constraintId)).toBe(true);
    const res = store.get(constraintId);
    expect(res.ok).toBe(true);
    if (res.ok && res.value.kind === 'constraint') {
      expect(res.value.components.constraint.type).toBe('fixed-distance');
    }
  });
});
