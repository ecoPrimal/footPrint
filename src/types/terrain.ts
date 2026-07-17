export interface ElevationSample {
  readonly lat: number;
  readonly lng: number;
  readonly elevation: number;
}

export interface TerrainGridBounds {
  readonly sw: readonly [number, number];
  readonly ne: readonly [number, number];
}

export interface TerrainGridStats {
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly range: number;
}

export interface TerrainGrid {
  readonly samples: ReadonlyArray<ElevationSample>;
  readonly rows: number;
  readonly cols: number;
  readonly bounds: TerrainGridBounds;
  readonly resolution: number;
  readonly stats: TerrainGridStats;
}

export interface ContourLine {
  readonly elevation: number;
  readonly geometry: GeoJSON.LineString;
  readonly isMajor: boolean;
}

export interface SlopeAspect {
  readonly lat: number;
  readonly lng: number;
  readonly slope: number;
  readonly aspect: number;
  readonly drainageDirection: number;
}

export interface USGSElevationResponse {
  readonly value: number;
}
