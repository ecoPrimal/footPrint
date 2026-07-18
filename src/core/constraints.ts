/**
 * ECS-aware constraint management.
 *
 * Bridges the pure math solver engine (solver.ts) with the entity store,
 * command history, and geometry modules.
 */

import type { EntityId } from './entity.js';
import { createEntity } from './entity.js';
import { store } from './store.js';
import { AddEntityCommand, UpdateComponentCommand, BatchCommand } from './commands.js';
import type { Command } from './commands.js';
import { execute } from './history.js';
import { extractCoords, rebuildGeometry } from './geometry.js';
import { exhaustive } from '../rustscript/exhaustive.js';
import { isSome } from '../rustscript/option.js';
import {
  SOLVER_MAX_ITERATIONS,
  SOLVER_TOLERANCE,
  SOLVER_SATISFIED_THRESHOLD,
} from '../constants.js';
import {
  fixedDistanceError,
  parallelError,
  perpendicularError,
  horizontalError,
  verticalError,
  coincidentError,
  pointOnLineError,
  gaussNewtonStep,
} from './solver.js';
import type { ConstraintError, SolverResult } from './solver.js';

export type { SolverResult } from './solver.js';

// ── Coordinate linearization ─────────────────────────

interface SolverState {
  readonly constraintEntities: readonly EntityId[];
  readonly entityOrder: EntityId[];
  readonly entityVertexOffsets: Map<EntityId, number>;
  readonly x: number[];
}

function buildSolverState(): SolverState | null {
  const constraintEntities = [...store.byKind('constraint')];
  if (constraintEntities.length === 0) return null;

  const shapeEntityIds = new Set<EntityId>();
  for (const cId of constraintEntities) {
    const cOpt = store.getEntity(cId);
    if (!isSome(cOpt)) continue;
    const comp = cOpt.value.components.constraint;
    if (!comp) continue;
    for (const eId of comp.entityIds) {
      shapeEntityIds.add(eId);
    }
  }

  const entityOrder: EntityId[] = [...shapeEntityIds];
  const entityVertexOffsets = new Map<EntityId, number>();
  let totalVars = 0;

  for (const eId of entityOrder) {
    const eOpt = store.getEntity(eId);
    if (!isSome(eOpt) || !eOpt.value.components.geometry) continue;
    entityVertexOffsets.set(eId, totalVars / 2);
    totalVars += extractCoords(eOpt.value.components.geometry).length * 2;
  }

  const x = new Array<number>(totalVars).fill(0);
  for (const eId of entityOrder) {
    const eOpt = store.getEntity(eId);
    if (!isSome(eOpt) || !eOpt.value.components.geometry) continue;
    const offset = entityVertexOffsets.get(eId) ?? 0;
    const coords = extractCoords(eOpt.value.components.geometry);
    for (let i = 0; i < coords.length; i++) {
      const c = coords[i];
      if (c) {
        x[(offset + i) * 2] = c[0];
        x[(offset + i) * 2 + 1] = c[1];
      }
    }
  }

  return { constraintEntities, entityOrder, entityVertexOffsets, x };
}

// ── Error evaluation per constraint ──────────────────

function evaluateConstraintErrors(
  constraintEntities: readonly EntityId[],
  entityVertexOffsets: ReadonlyMap<EntityId, number>,
  x: number[],
): ConstraintError[] {
  const errors: ConstraintError[] = [];

  for (const cId of constraintEntities) {
    const cOpt = store.getEntity(cId);
    if (!isSome(cOpt)) continue;
    const comp = cOpt.value.components.constraint;
    if (!comp) continue;

    const vi = comp.params.vertexIndices ?? [0, 1];
    const e0 = comp.entityIds[0];
    const e1 = comp.entityIds[1] ?? e0;
    if (!e0) continue;
    const off0 = entityVertexOffsets.get(e0) ?? 0;
    const off1 = e1 ? (entityVertexOffsets.get(e1) ?? 0) : off0;

    const v0 = (vi[0] ?? 0) + off0;
    const v1 = (vi[1] ?? 1) + (comp.entityIds.length > 1 ? off1 : off0);
    const v2 = vi[2] != null ? vi[2] + off0 : undefined;
    const v3 = vi[3] != null ? vi[3] + (comp.entityIds.length > 1 ? off1 : off0) : undefined;

    switch (comp.type) {
      case 'fixed-distance':
        errors.push(fixedDistanceError(x, v0, v1, comp.params.distance ?? 0));
        break;
      case 'parallel':
        if (v2 != null && v3 != null) errors.push(parallelError(x, v0, v1, v2, v3));
        break;
      case 'perpendicular':
        if (v2 != null && v3 != null) errors.push(perpendicularError(x, v0, v1, v2, v3));
        break;
      case 'horizontal':
        errors.push(horizontalError(x, v0, v1));
        break;
      case 'vertical':
        errors.push(verticalError(x, v0, v1));
        break;
      case 'coincident':
        errors.push(...coincidentError(x, v0, v1));
        break;
      case 'point-on-line':
        errors.push(...pointOnLineError(x, v0, v1, v2));
        break;
      case 'tangent':
      case 'symmetric':
      case 'setback':
        break;
      default: exhaustive(comp.type);
    }
  }

  return errors;
}

// ── Apply solved coordinates back to ECS ─────────────

function applySolverResult(
  state: SolverState,
  residual: number,
): void {
  const solverCommands: Command[] = [];

  for (const eId of state.entityOrder) {
    const eOpt = store.getEntity(eId);
    if (!isSome(eOpt) || !eOpt.value.components.geometry) continue;
    const offset = state.entityVertexOffsets.get(eId) ?? 0;
    const coords = extractCoords(eOpt.value.components.geometry);
    const newCoords: [number, number][] = [];

    for (let i = 0; i < coords.length; i++) {
      newCoords.push([
        state.x[(offset + i) * 2] ?? 0,
        state.x[(offset + i) * 2 + 1] ?? 0,
      ]);
    }

    solverCommands.push(new UpdateComponentCommand(
      eId, 'geometry', rebuildGeometry(eOpt.value.components.geometry, newCoords),
    ));
  }

  const satisfied = residual < SOLVER_SATISFIED_THRESHOLD;
  for (const cId of state.constraintEntities) {
    const cOpt = store.getEntity(cId);
    if (!isSome(cOpt)) continue;
    const comp = cOpt.value.components.constraint;
    if (comp) {
      solverCommands.push(new UpdateComponentCommand(cId, 'constraint', { ...comp, satisfied }));
    }
  }

  if (solverCommands.length > 0) {
    execute(new BatchCommand(solverCommands));
  }
}

// ── Public solver entry point ────────────────────────

export function solveConstraints(): SolverResult {
  const state = buildSolverState();
  if (!state) return { converged: true, iterations: 0, residual: 0 };

  let residual = Infinity;
  let iter = 0;

  for (; iter < SOLVER_MAX_ITERATIONS; iter++) {
    const errors = evaluateConstraintErrors(
      state.constraintEntities, state.entityVertexOffsets, state.x,
    );
    if (errors.length === 0) break;

    residual = Math.sqrt(errors.reduce((sum, e) => sum + e.error * e.error, 0));
    if (residual < SOLVER_TOLERANCE) break;

    if (!gaussNewtonStep(state.x, errors)) break;
  }

  applySolverResult(state, residual);
  return { converged: residual < SOLVER_TOLERANCE, iterations: iter, residual };
}

// ── Public API for creating constraints ──────────────

export function addFixedDistanceConstraint(
  entityId1: EntityId,
  vertex1: number,
  entityId2: EntityId,
  vertex2: number,
  distance: number,
): EntityId {
  const constraintEntity = createEntity('constraint', null);
  constraintEntity.components.constraint = {
    type: 'fixed-distance',
    entityIds: [entityId1, entityId2],
    params: { distance, vertexIndices: [vertex1, vertex2] },
    satisfied: false,
  };
  execute(new AddEntityCommand(constraintEntity));
  solveConstraints();
  return constraintEntity.id;
}
