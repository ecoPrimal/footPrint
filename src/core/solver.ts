/**
 * Damped Gauss-Newton constraint solver engine.
 *
 * Pure math — operates on flat coordinate arrays with no ECS or store dependency.
 * Constraint management (ECS integration, command dispatch) lives in constraints.ts.
 */

import {
  SOLVER_STEP_SIZE,
  SOLVER_DAMPING,
  SOLVER_DIST_EPSILON,
  SOLVER_PIVOT_EPSILON,
} from '../constants.js';

// ── Types ────────────────────────────────────────────

export interface ConstraintError {
  error: number;
  jacobian: number[];
  variableIndices: number[];
}

export interface SolverResult {
  converged: boolean;
  iterations: number;
  residual: number;
}

// ── Error functions per constraint type ──────────────

export function fixedDistanceError(
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
  if (dist > SOLVER_DIST_EPSILON) {
    jac[i1 * 2] = -dx / dist;
    jac[i1 * 2 + 1] = -dy / dist;
    jac[i2 * 2] = dx / dist;
    jac[i2 * 2 + 1] = dy / dist;
  }

  return { error: err, jacobian: jac, variableIndices: [i1 * 2, i1 * 2 + 1, i2 * 2, i2 * 2 + 1] };
}

export function parallelError(
  coords: number[],
  a1: number, a2: number,
  b1: number, b2: number,
): ConstraintError {
  const ax = (coords[a2 * 2] ?? 0) - (coords[a1 * 2] ?? 0);
  const ay = (coords[a2 * 2 + 1] ?? 0) - (coords[a1 * 2 + 1] ?? 0);
  const bx = (coords[b2 * 2] ?? 0) - (coords[b1 * 2] ?? 0);
  const by = (coords[b2 * 2 + 1] ?? 0) - (coords[b1 * 2 + 1] ?? 0);

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

export function perpendicularError(
  coords: number[],
  a1: number, a2: number,
  b1: number, b2: number,
): ConstraintError {
  const ax = (coords[a2 * 2] ?? 0) - (coords[a1 * 2] ?? 0);
  const ay = (coords[a2 * 2 + 1] ?? 0) - (coords[a1 * 2 + 1] ?? 0);
  const bx = (coords[b2 * 2] ?? 0) - (coords[b1 * 2] ?? 0);
  const by = (coords[b2 * 2 + 1] ?? 0) - (coords[b1 * 2 + 1] ?? 0);

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

export function horizontalError(coords: number[], i1: number, i2: number): ConstraintError {
  const err = (coords[i2 * 2 + 1] ?? 0) - (coords[i1 * 2 + 1] ?? 0);
  const jac = new Array<number>(coords.length).fill(0);
  jac[i1 * 2 + 1] = -1;
  jac[i2 * 2 + 1] = 1;
  return { error: err, jacobian: jac, variableIndices: [i1 * 2 + 1, i2 * 2 + 1] };
}

export function verticalError(coords: number[], i1: number, i2: number): ConstraintError {
  const err = (coords[i2 * 2] ?? 0) - (coords[i1 * 2] ?? 0);
  const jac = new Array<number>(coords.length).fill(0);
  jac[i1 * 2] = -1;
  jac[i2 * 2] = 1;
  return { error: err, jacobian: jac, variableIndices: [i1 * 2, i2 * 2] };
}

export function coincidentError(coords: number[], i1: number, i2: number): ConstraintError[] {
  return [
    horizontalError(coords, i1, i2),
    verticalError(coords, i1, i2),
  ];
}

export function pointOnLineError(
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

// ── Linear system solver (Gauss elimination + partial pivoting) ──

export function solveLinearSystem(A: number[], b: number[], n: number): number[] | null {
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

    if (maxVal < SOLVER_PIVOT_EPSILON) continue;

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

// ── Damped Gauss-Newton step ─────────────────────────

export function gaussNewtonStep(
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
