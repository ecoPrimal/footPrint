export interface SnapConfig {
  enabled: boolean;
  snapDistance: number;
  snapToGrid: boolean;
  snapToFeatures: boolean;
  snapToVertices: boolean;
  snapToMidpoints: boolean;
  gridSpacing: number;
}

export const DEFAULT_SNAP_CONFIG: Readonly<SnapConfig> = {
  enabled: true,
  snapDistance: 20,
  snapToGrid: false,
  snapToFeatures: true,
  snapToVertices: true,
  snapToMidpoints: true,
  gridSpacing: 3.048,
};

export const GRID_SPACINGS_FT: readonly number[] = [1, 5, 10, 25, 50, 100];

export function ftToMeters(ft: number): number {
  return ft * 0.3048;
}
