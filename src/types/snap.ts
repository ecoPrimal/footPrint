import { DEFAULT_SNAP_DISTANCE, METERS_PER_FOOT, DEFAULT_GRID_SPACING_FT } from '../constants.js';

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
  snapDistance: DEFAULT_SNAP_DISTANCE,
  snapToGrid: false,
  snapToFeatures: true,
  snapToVertices: true,
  snapToMidpoints: true,
  gridSpacing: METERS_PER_FOOT * DEFAULT_GRID_SPACING_FT,
};

export function ftToMeters(ft: number): number {
  return ft * METERS_PER_FOOT;
}
