import { describe, it, expect } from 'vitest';
import {
  fixedDistanceError,
  parallelError,
  perpendicularError,
  horizontalError,
  verticalError,
  coincidentError,
  pointOnLineError,
  solveLinearSystem,
  gaussNewtonStep,
} from './solver.js';

function coords2d(...pts: [number, number][]): number[] {
  return pts.flatMap(([x, y]) => [x, y]);
}

describe('solver error functions', () => {
  describe('fixedDistanceError', () => {
    it('returns zero error when distance matches target', () => {
      const c = coords2d([0, 0], [3, 4]);
      const result = fixedDistanceError(c, 0, 1, 5);
      expect(result.error).toBeCloseTo(0, 10);
    });

    it('returns positive error when too far apart', () => {
      const c = coords2d([0, 0], [6, 0]);
      const result = fixedDistanceError(c, 0, 1, 4);
      expect(result.error).toBeCloseTo(2, 10);
    });

    it('returns negative error when too close', () => {
      const c = coords2d([0, 0], [1, 0]);
      const result = fixedDistanceError(c, 0, 1, 3);
      expect(result.error).toBeCloseTo(-2, 10);
    });

    it('produces correct Jacobian length', () => {
      const c = coords2d([0, 0], [3, 4]);
      const result = fixedDistanceError(c, 0, 1, 5);
      expect(result.jacobian).toHaveLength(c.length);
    });
  });

  describe('horizontalError', () => {
    it('returns zero for points at the same Y', () => {
      const c = coords2d([1, 5], [7, 5]);
      expect(horizontalError(c, 0, 1).error).toBeCloseTo(0, 10);
    });

    it('returns Y difference as error', () => {
      const c = coords2d([0, 2], [5, 8]);
      expect(horizontalError(c, 0, 1).error).toBeCloseTo(6, 10);
    });
  });

  describe('verticalError', () => {
    it('returns zero for points at the same X', () => {
      const c = coords2d([3, 1], [3, 9]);
      expect(verticalError(c, 0, 1).error).toBeCloseTo(0, 10);
    });

    it('returns X difference as error', () => {
      const c = coords2d([2, 0], [7, 0]);
      expect(verticalError(c, 0, 1).error).toBeCloseTo(5, 10);
    });
  });

  describe('coincidentError', () => {
    it('returns two errors (horizontal + vertical)', () => {
      const c = coords2d([1, 2], [3, 4]);
      const errors = coincidentError(c, 0, 1);
      expect(errors).toHaveLength(2);
    });

    it('returns zero errors for coincident points', () => {
      const c = coords2d([5, 5], [5, 5]);
      const errors = coincidentError(c, 0, 1);
      expect(errors[0]!.error).toBeCloseTo(0, 10);
      expect(errors[1]!.error).toBeCloseTo(0, 10);
    });
  });

  describe('parallelError', () => {
    it('returns zero for parallel segments', () => {
      const c = coords2d([0, 0], [4, 0], [0, 3], [4, 3]);
      expect(parallelError(c, 0, 1, 2, 3).error).toBeCloseTo(0, 10);
    });

    it('returns non-zero for non-parallel segments', () => {
      const c = coords2d([0, 0], [4, 0], [0, 0], [0, 4]);
      expect(Math.abs(parallelError(c, 0, 1, 2, 3).error)).toBeGreaterThan(0.01);
    });
  });

  describe('perpendicularError', () => {
    it('returns zero for perpendicular segments', () => {
      const c = coords2d([0, 0], [4, 0], [0, 0], [0, 4]);
      expect(perpendicularError(c, 0, 1, 2, 3).error).toBeCloseTo(0, 10);
    });

    it('returns non-zero for non-perpendicular segments', () => {
      const c = coords2d([0, 0], [4, 0], [0, 0], [4, 4]);
      expect(Math.abs(perpendicularError(c, 0, 1, 2, 3).error)).toBeGreaterThan(0.01);
    });
  });

  describe('pointOnLineError', () => {
    it('returns zero when point lies on the line', () => {
      const c = coords2d([0, 0], [10, 0], [5, 0]);
      const errors = pointOnLineError(c, 2, 0, 1);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.error).toBeCloseTo(0, 10);
    });

    it('returns non-zero when point is off the line', () => {
      const c = coords2d([0, 0], [10, 0], [5, 3]);
      const errors = pointOnLineError(c, 2, 0, 1);
      expect(Math.abs(errors[0]!.error)).toBeGreaterThan(0.01);
    });

    it('returns empty array when lineEnd is undefined', () => {
      const c = coords2d([0, 0], [5, 5]);
      expect(pointOnLineError(c, 1, 0, undefined)).toEqual([]);
    });
  });
});

describe('solveLinearSystem', () => {
  it('solves a 2x2 identity system', () => {
    const A = [1, 0, 0, 1];
    const b = [3, 7];
    const x = solveLinearSystem(A, b, 2);
    expect(x).not.toBeNull();
    expect(x![0]).toBeCloseTo(3, 10);
    expect(x![1]).toBeCloseTo(7, 10);
  });

  it('solves a 2x2 non-trivial system', () => {
    const A = [2, 1, 5, 3];
    const b = [11, 29];
    const x = solveLinearSystem(A, b, 2);
    expect(x).not.toBeNull();
    expect(x![0]).toBeCloseTo(4, 10);
    expect(x![1]).toBeCloseTo(3, 10);
  });

  it('solves a 3x3 system', () => {
    const A = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const b = [2, 4, 6];
    const x = solveLinearSystem(A, b, 3);
    expect(x).not.toBeNull();
    expect(x![0]).toBeCloseTo(2, 10);
    expect(x![1]).toBeCloseTo(4, 10);
    expect(x![2]).toBeCloseTo(6, 10);
  });

  it('handles near-singular matrix gracefully', () => {
    const A = [0, 0, 0, 0];
    const b = [1, 1];
    const x = solveLinearSystem(A, b, 2);
    expect(x).not.toBeNull();
  });
});

describe('gaussNewtonStep', () => {
  it('moves coords toward satisfying a distance constraint', () => {
    const x = [0, 0, 6, 0];
    const target = 4;
    const err = fixedDistanceError(x, 0, 1, target);
    const moved = gaussNewtonStep(x, [err]);
    expect(moved).toBe(true);
    const newDist = Math.sqrt((x[2]! - x[0]!) ** 2 + (x[3]! - x[1]!) ** 2);
    expect(Math.abs(newDist - target)).toBeLessThan(2);
  });

  it('converges a horizontal constraint in multiple steps', () => {
    const x = [0, 0, 5, 3];
    for (let i = 0; i < 20; i++) {
      const err = horizontalError(x, 0, 1);
      if (Math.abs(err.error) < 1e-10) break;
      gaussNewtonStep(x, [err]);
    }
    expect(Math.abs((x[3] ?? 0) - (x[1] ?? 0))).toBeLessThan(0.01);
  });
});
