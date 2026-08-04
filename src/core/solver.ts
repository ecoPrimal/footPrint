// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Damped Gauss-Newton constraint solver engine.
 *
 * Pure math — operates on flat coordinate arrays with no ECS or store dependency.
 * Constraint management (ECS integration, command dispatch) lives in constraints.ts.
 */

import { SOLVER_STEP_SIZE, SOLVER_DAMPING, SOLVER_DIST_EPSILON, SOLVER_PIVOT_EPSILON } from '../constants.js';

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

export function fixedDistanceError(coords: number[], i1: number, i2: number, targetDist: number): ConstraintError {
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

export function parallelError(coords: number[], a1: number, a2: number, b1: number, b2: number): ConstraintError {
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

export function perpendicularError(coords: number[], a1: number, a2: number, b1: number, b2: number): ConstraintError {
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
  return [horizontalError(coords, i1, i2), verticalError(coords, i1, i2)];
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
  jac[lineStart * 2 + 1] = abx - apx + (bx - px);
  jac[lineEnd * 2] = -apy;
  jac[lineEnd * 2 + 1] = apx;

  return [{ error: err, jacobian: jac, variableIndices: [] }];
}

/** Distance from a point to the infinite line through lineStart–lineEnd, with Jacobian. */
function pointLineDistanceDerivatives(
  coords: number[],
  point: number,
  lineStart: number,
  lineEnd: number,
): { dist: number; jac: number[] } {
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
  const cross = apx * aby - apy * abx;
  const len = Math.sqrt(abx * abx + aby * aby);

  const jac = new Array<number>(coords.length).fill(0);
  if (len <= SOLVER_DIST_EPSILON) {
    return { dist: 0, jac };
  }

  const invLen = 1 / len;
  const invLen3 = invLen * invLen * invLen;
  const dist = Math.abs(cross) * invLen;
  const sign = cross >= 0 ? 1 : -1;

  jac[point * 2] = sign * aby * invLen;
  jac[point * 2 + 1] = sign * -abx * invLen;
  jac[lineStart * 2] = sign * ((apy - aby) * invLen + cross * abx * invLen3);
  jac[lineStart * 2 + 1] = sign * ((abx - apx) * invLen + cross * aby * invLen3);
  jac[lineEnd * 2] = sign * apy * invLen - cross * abx * invLen3;
  jac[lineEnd * 2 + 1] = sign * -apx * invLen - cross * aby * invLen3;

  return { dist, jac };
}

/** Two circle/arcs are tangent: center distance equals sum or difference of radii. */
export function tangentError(coords: number[], c1: number, c2: number, targetDist: number): ConstraintError {
  return fixedDistanceError(coords, c1, c2, targetDist);
}

/** Two points are symmetric about the line through axisStart–axisEnd. */
export function symmetricError(
  coords: number[],
  p1: number,
  p2: number,
  axisStart: number,
  axisEnd: number,
): ConstraintError[] {
  const x1 = coords[p1 * 2] ?? 0;
  const y1 = coords[p1 * 2 + 1] ?? 0;
  const x2 = coords[p2 * 2] ?? 0;
  const y2 = coords[p2 * 2 + 1] ?? 0;
  const ax = coords[axisStart * 2] ?? 0;
  const ay = coords[axisStart * 2 + 1] ?? 0;
  const bx = coords[axisEnd * 2] ?? 0;
  const by = coords[axisEnd * 2 + 1] ?? 0;

  const abx = bx - ax;
  const aby = by - ay;
  const len = Math.sqrt(abx * abx + aby * aby);

  const midpointJac = new Array<number>(coords.length).fill(0);
  const distJac = new Array<number>(coords.length).fill(0);

  if (len <= SOLVER_DIST_EPSILON) {
    return [
      { error: 0, jacobian: midpointJac, variableIndices: [] },
      { error: 0, jacobian: distJac, variableIndices: [] },
    ];
  }

  const invLen = 1 / len;

  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const amx = mx - ax;
  const amy = my - ay;
  const midpointErr = amx * aby - amy * abx;

  midpointJac[p1 * 2] = 0.5 * aby;
  midpointJac[p1 * 2 + 1] = -0.5 * abx;
  midpointJac[p2 * 2] = 0.5 * aby;
  midpointJac[p2 * 2 + 1] = -0.5 * abx;

  const ap1x = x1 - ax;
  const ap1y = y1 - ay;
  const ap2x = x2 - ax;
  const ap2y = y2 - ay;
  const cross1 = ap1x * aby - ap1y * abx;
  const cross2 = ap2x * aby - ap2y * abx;
  const d1 = cross1 * invLen;
  const d2 = cross2 * invLen;
  const distanceErr = d1 + d2;

  const addSignedDistanceJac = (jac: number[], point: number): void => {
    const i = point * 2;
    jac[i] = (jac[i] ?? 0) + aby * invLen;
    jac[i + 1] = (jac[i + 1] ?? 0) - abx * invLen;
  };

  addSignedDistanceJac(distJac, p1);
  addSignedDistanceJac(distJac, p2);

  return [
    { error: midpointErr, jacobian: midpointJac, variableIndices: [] },
    { error: distanceErr, jacobian: distJac, variableIndices: [] },
  ];
}

/** Two points symmetric about a fixed axis (point + direction, not solver variables). */
export function symmetricErrorFixedAxis(
  coords: number[],
  p1: number,
  p2: number,
  axisPoint: readonly [number, number],
  axisDirection: readonly [number, number],
): ConstraintError[] {
  const ax = axisPoint[0] ?? 0;
  const ay = axisPoint[1] ?? 0;
  const dirx = axisDirection[0] ?? 0;
  const diry = axisDirection[1] ?? 0;
  const bx = ax + dirx;
  const by = ay + diry;

  const x1 = coords[p1 * 2] ?? 0;
  const y1 = coords[p1 * 2 + 1] ?? 0;
  const x2 = coords[p2 * 2] ?? 0;
  const y2 = coords[p2 * 2 + 1] ?? 0;

  const abx = bx - ax;
  const aby = by - ay;
  const len = Math.sqrt(abx * abx + aby * aby);

  const midpointJac = new Array<number>(coords.length).fill(0);
  const distJac = new Array<number>(coords.length).fill(0);

  if (len <= SOLVER_DIST_EPSILON) {
    return [
      { error: 0, jacobian: midpointJac, variableIndices: [] },
      { error: 0, jacobian: distJac, variableIndices: [] },
    ];
  }

  const invLen = 1 / len;

  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const amx = mx - ax;
  const amy = my - ay;
  const midpointErr = amx * aby - amy * abx;

  midpointJac[p1 * 2] = 0.5 * aby;
  midpointJac[p1 * 2 + 1] = -0.5 * abx;
  midpointJac[p2 * 2] = 0.5 * aby;
  midpointJac[p2 * 2 + 1] = -0.5 * abx;

  const ap1x = x1 - ax;
  const ap1y = y1 - ay;
  const ap2x = x2 - ax;
  const ap2y = y2 - ay;
  const d1 = (ap1x * aby - ap1y * abx) * invLen;
  const d2 = (ap2x * aby - ap2y * abx) * invLen;
  const distanceErr = d1 + d2;

  distJac[p1 * 2] = aby * invLen;
  distJac[p1 * 2 + 1] = -abx * invLen;
  distJac[p2 * 2] = aby * invLen;
  distJac[p2 * 2 + 1] = -abx * invLen;

  return [
    { error: midpointErr, jacobian: midpointJac, variableIndices: [] },
    { error: distanceErr, jacobian: distJac, variableIndices: [] },
  ];
}

/** Edge endpoints must stay at least minDistance from a reference line (inequality). */
export function setbackError(
  coords: number[],
  edgeStart: number,
  edgeEnd: number,
  refStart: number,
  refEnd: number,
  minDistance: number,
): ConstraintError[] {
  const errors: ConstraintError[] = [];

  for (const point of [edgeStart, edgeEnd]) {
    const { dist, jac } = pointLineDistanceDerivatives(coords, point, refStart, refEnd);
    const violation = minDistance - dist;
    if (violation <= 0) {
      errors.push({
        error: 0,
        jacobian: new Array<number>(coords.length).fill(0),
        variableIndices: [],
      });
    } else {
      const negJac = new Array<number>(coords.length).fill(0);
      negJac[point * 2] = -(jac[point * 2] ?? 0);
      negJac[point * 2 + 1] = -(jac[point * 2 + 1] ?? 0);
      errors.push({
        error: violation,
        jacobian: negJac,
        variableIndices: [point * 2, point * 2 + 1],
      });
    }
  }

  return errors;
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
      if (val > maxVal) {
        maxVal = val;
        maxRow = row;
      }
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

export function gaussNewtonStep(x: number[], errors: readonly ConstraintError[]): boolean {
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

  const dx = solveLinearSystem(
    jtj,
    jte.map((v) => -v),
    n,
  );
  if (!dx) return false;

  for (let i = 0; i < n; i++) {
    x[i] = (x[i] ?? 0) + SOLVER_STEP_SIZE * (dx[i] ?? 0);
  }
  return true;
}
