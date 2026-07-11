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
  SOLVER_STEP_SIZE,
  SOLVER_DAMPING,
} from '../constants.js';

interface ConstraintError {
  error: number;
  jacobian: number[];
  variableIndices: number[];
}

// ── Error functions per constraint type ──────────────

function fixedDistanceError(
  coords: number[],
  i1: number,
  i2: number,
  targetDist: number,
): ConstraintError {
  const x1 = coords[i1 * 2] ?? 0;
  const y1 = coords[i1 * 2 + 1] ?? 0;
  const x2 = coords[i2 * 2] ?? 0;
  const y2 = coords[i2 * 2 + 1] ?? 0;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const err = dist - targetDist;

  const jac = new Array<number>(coords.length).fill(0);
  if (dist > 1e-12) {
    jac[i1 * 2] = -dx / dist;
    jac[i1 * 2 + 1] = -dy / dist;
    jac[i2 * 2] = dx / dist;
    jac[i2 * 2 + 1] = dy / dist;
  }

  return { error: err, jacobian: jac, variableIndices: [i1 * 2, i1 * 2 + 1, i2 * 2, i2 * 2 + 1] };
}

function parallelError(
  coords: number[],
  a1: number, a2: number,
  b1: number, b2: number,
): ConstraintError {
  const ax = (coords[a2 * 2] ?? 0) - (coords[a1 * 2] ?? 0);
  const ay = (coords[a2 * 2 + 1] ?? 0) - (coords[a1 * 2 + 1] ?? 0);
  const bx = (coords[b2 * 2] ?? 0) - (coords[b1 * 2] ?? 0);
  const by = (coords[b2 * 2 + 1] ?? 0) - (coords[b1 * 2 + 1] ?? 0);

  // Cross product = 0 for parallel
  const err = ax * by - ay * bx;
  const jac = new Array<number>(coords.length).fill(0);

  jac[a1 * 2] = -by;
  jac[a1 * 2 + 1] = bx;
  jac[a2 * 2] = by;
  jac[a2 * 2 + 1] = -bx;
  jac[b1 * 2] = ay;
  jac[b1 * 2 + 1] = -ax;
  jac[b2 * 2] = -ay;
  jac[b2 * 2 + 1] = ax;

  return { error: err, jacobian: jac, variableIndices: [] };
}

function perpendicularError(
  coords: number[],
  a1: number, a2: number,
  b1: number, b2: number,
): ConstraintError {
  const ax = (coords[a2 * 2] ?? 0) - (coords[a1 * 2] ?? 0);
  const ay = (coords[a2 * 2 + 1] ?? 0) - (coords[a1 * 2 + 1] ?? 0);
  const bx = (coords[b2 * 2] ?? 0) - (coords[b1 * 2] ?? 0);
  const by = (coords[b2 * 2 + 1] ?? 0) - (coords[b1 * 2 + 1] ?? 0);

  // Dot product = 0 for perpendicular
  const err = ax * bx + ay * by;
  const jac = new Array<number>(coords.length).fill(0);

  jac[a1 * 2] = -bx;
  jac[a1 * 2 + 1] = -by;
  jac[a2 * 2] = bx;
  jac[a2 * 2 + 1] = by;
  jac[b1 * 2] = -ax;
  jac[b1 * 2 + 1] = -ay;
  jac[b2 * 2] = ax;
  jac[b2 * 2 + 1] = ay;

  return { error: err, jacobian: jac, variableIndices: [] };
}

function horizontalError(coords: number[], i1: number, i2: number): ConstraintError {
  const err = (coords[i2 * 2 + 1] ?? 0) - (coords[i1 * 2 + 1] ?? 0);
  const jac = new Array<number>(coords.length).fill(0);
  jac[i1 * 2 + 1] = -1;
  jac[i2 * 2 + 1] = 1;
  return { error: err, jacobian: jac, variableIndices: [i1 * 2 + 1, i2 * 2 + 1] };
}

function verticalError(coords: number[], i1: number, i2: number): ConstraintError {
  const err = (coords[i2 * 2] ?? 0) - (coords[i1 * 2] ?? 0);
  const jac = new Array<number>(coords.length).fill(0);
  jac[i1 * 2] = -1;
  jac[i2 * 2] = 1;
  return { error: err, jacobian: jac, variableIndices: [i1 * 2, i2 * 2] };
}

function coincidentError(coords: number[], i1: number, i2: number): ConstraintError[] {
  return [
    horizontalError(coords, i1, i2),
    verticalError(coords, i1, i2),
  ];
}

function pointOnLineError(
  coords: number[],
  point: number,
  lineStart: number,
  lineEnd: number | undefined,
): ConstraintError[] {
  if (lineEnd == null) return [];
  const px = coords[point * 2] ?? 0;
  const py = coords[point * 2 + 1] ?? 0;
  const ax = coords[lineStart * 2] ?? 0;
  const ay = coords[lineStart * 2 + 1] ?? 0;
  const bx = coords[lineEnd * 2] ?? 0;
  const by = coords[lineEnd * 2 + 1] ?? 0;

  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;

  // Cross product (AP x AB) = 0 means point lies on the line
  const err = apx * aby - apy * abx;
  const jac = new Array<number>(coords.length).fill(0);

  jac[point * 2] = aby;
  jac[point * 2 + 1] = -abx;
  jac[lineStart * 2] = -(aby - apy) + (py - by);
  jac[lineStart * 2 + 1] = (abx - apx) + (bx - px);
  jac[lineEnd * 2] = -apy;
  jac[lineEnd * 2 + 1] = apx;

  return [{ error: err, jacobian: jac, variableIndices: [] }];
}

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

// ── Damped Gauss-Newton step ─────────────────────────

function gaussNewtonStep(
  x: number[],
  errors: readonly ConstraintError[],
): boolean {
  const n = x.length;
  const jtj = new Array<number>(n * n).fill(0);
  const jte = new Array<number>(n).fill(0);

  for (const err of errors) {
    const j = err.jacobian;
    for (let r = 0; r < n; r++) {
      const jr = j[r] ?? 0;
      if (jr === 0) continue;
      for (let c = 0; c < n; c++) {
        const jc = j[c] ?? 0;
        if (jc === 0) continue;
        const idx = r * n + c;
        jtj[idx] = (jtj[idx] ?? 0) + jr * jc;
      }
      jte[r] = (jte[r] ?? 0) + jr * err.error;
    }
  }

  for (let i = 0; i < n; i++) {
    const diagIdx = i * n + i;
    jtj[diagIdx] = (jtj[diagIdx] ?? 0) + SOLVER_DAMPING;
  }

  const dx = solveLinearSystem(jtj, jte.map((v) => -v), n);
  if (!dx) return false;

  for (let i = 0; i < n; i++) {
    x[i] = (x[i] ?? 0) + SOLVER_STEP_SIZE * (dx[i] ?? 0);
  }
  return true;
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
    const newCoords: Array<[number, number]> = [];

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

  const satisfied = residual < SOLVER_TOLERANCE * 100;
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

export interface SolverResult {
  converged: boolean;
  iterations: number;
  residual: number;
}

export function solveConstraints(): SolverResult {
  const state = buildSolverState();
  if (!state) return { converged: true, iterations: 0, residual: 0 };

  let residual = Infinity;
  let iter = 0;

  for (iter = 0; iter < SOLVER_MAX_ITERATIONS; iter++) {
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

function solveLinearSystem(A: number[], b: number[], n: number): number[] | null {
  // In-place Gauss elimination with partial pivoting
  const aug = new Array<number>(n * (n + 1));
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      aug[r * (n + 1) + c] = A[r * n + c] ?? 0;
    }
    aug[r * (n + 1) + n] = b[r] ?? 0;
  }

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    let maxVal = Math.abs(aug[col * (n + 1) + col] ?? 0);
    for (let row = col + 1; row < n; row++) {
      const val = Math.abs(aug[row * (n + 1) + col] ?? 0);
      if (val > maxVal) { maxVal = val; maxRow = row; }
    }

    if (maxVal < 1e-15) continue;

    if (maxRow !== col) {
      for (let c = 0; c <= n; c++) {
        const tmp = aug[col * (n + 1) + c] ?? 0;
        aug[col * (n + 1) + c] = aug[maxRow * (n + 1) + c] ?? 0;
        aug[maxRow * (n + 1) + c] = tmp;
      }
    }

    const pivot = aug[col * (n + 1) + col] ?? 1;
    for (let row = col + 1; row < n; row++) {
      const factor = (aug[row * (n + 1) + col] ?? 0) / pivot;
      for (let c = col; c <= n; c++) {
        aug[row * (n + 1) + c] = (aug[row * (n + 1) + c] ?? 0) - factor * (aug[col * (n + 1) + c] ?? 0);
      }
    }
  }

  // Back substitution
  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = aug[row * (n + 1) + n] ?? 0;
    for (let c = row + 1; c < n; c++) {
      sum -= (aug[row * (n + 1) + c] ?? 0) * (x[c] ?? 0);
    }
    const diag = aug[row * (n + 1) + row] ?? 0;
    x[row] = diag !== 0 ? sum / diag : 0;
  }

  return x;
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

export function addParallelConstraint(
  entityId1: EntityId,
  v1a: number, v1b: number,
  entityId2: EntityId,
  v2a: number, v2b: number,
): EntityId {
  const constraintEntity = createEntity('constraint', null);
  constraintEntity.components.constraint = {
    type: 'parallel',
    entityIds: [entityId1, entityId2],
    params: { vertexIndices: [v1a, v1b, v2a, v2b] },
    satisfied: false,
  };
  execute(new AddEntityCommand(constraintEntity));
  solveConstraints();
  return constraintEntity.id;
}

export function addPerpendicularConstraint(
  entityId1: EntityId,
  v1a: number, v1b: number,
  entityId2: EntityId,
  v2a: number, v2b: number,
): EntityId {
  const constraintEntity = createEntity('constraint', null);
  constraintEntity.components.constraint = {
    type: 'perpendicular',
    entityIds: [entityId1, entityId2],
    params: { vertexIndices: [v1a, v1b, v2a, v2b] },
    satisfied: false,
  };
  execute(new AddEntityCommand(constraintEntity));
  solveConstraints();
  return constraintEntity.id;
}

export function addHorizontalConstraint(entityId: EntityId, v1: number, v2: number): EntityId {
  const constraintEntity = createEntity('constraint', null);
  constraintEntity.components.constraint = {
    type: 'horizontal',
    entityIds: [entityId],
    params: { vertexIndices: [v1, v2] },
    satisfied: false,
  };
  execute(new AddEntityCommand(constraintEntity));
  solveConstraints();
  return constraintEntity.id;
}

export function addVerticalConstraint(entityId: EntityId, v1: number, v2: number): EntityId {
  const constraintEntity = createEntity('constraint', null);
  constraintEntity.components.constraint = {
    type: 'vertical',
    entityIds: [entityId],
    params: { vertexIndices: [v1, v2] },
    satisfied: false,
  };
  execute(new AddEntityCommand(constraintEntity));
  solveConstraints();
  return constraintEntity.id;
}
