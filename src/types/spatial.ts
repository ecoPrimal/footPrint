import type { TerrainGrid } from './terrain.js';

export interface ProximityResult {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly feature: GeoJSON.Feature;
  readonly distance: number;
  readonly bearing: number;
  readonly nearestPoint: readonly [number, number];
}

export interface ScoredSource {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly category: string;
  readonly featureCount: number;
  readonly relevanceScore: number;
  readonly nearestDistance: number;
  readonly avgDistance: number;
  readonly samples: ReadonlyArray<GeoJSON.Feature>;
}

export interface DiscoveryReport {
  readonly propertyArea: number;
  readonly bufferRadius: number;
  readonly sources: ReadonlyArray<ScoredSource>;
  readonly terrain: TerrainGrid | null;
  readonly timestamp: string;
}

export type CategoryBoost = Record<string, number>;

export const DEFAULT_CATEGORY_BOOSTS: Readonly<CategoryBoost> = {
  'OpenStreetMap': 0.9,
  'Property': 0.85,
  'FEMA': 0.7,
  'Lansing': 0.6,
  'USGS': 0.8,
  'Soils': 0.7,
  'Michigan': 0.4,
  'Infrastructure': 1.0,
};
