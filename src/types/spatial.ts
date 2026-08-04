// SPDX-License-Identifier: AGPL-3.0-or-later
import type { CoverageBounds, SourceManifest } from '../core/manifest.js';
import type { TerrainGrid } from './terrain.js';
import type { SourceRegistry } from './source.js';

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
  readonly samples: readonly GeoJSON.Feature[];
}

export interface DiscoveryReport {
  readonly propertyArea: number;
  readonly bufferRadius: number;
  readonly sources: readonly ScoredSource[];
  readonly terrain: TerrainGrid | null;
  readonly timestamp: string;
}

type CategoryBoost = Record<string, number>;

/** Intrinsic boosts for categories without regional coverage scope. */
const INTRINSIC_CATEGORY_BOOSTS: Readonly<CategoryBoost> = {
  OpenStreetMap: 0.9,
  Property: 0.85,
  FEMA: 0.7,
  USGS: 0.8,
  Soils: 0.7,
  Infrastructure: 1.0,
};

const COVERAGE_BOOST_MIN = 0.4;
const COVERAGE_BOOST_RANGE = 0.2;

function coverageArea(bounds: CoverageBounds): number {
  return Math.abs(bounds.north - bounds.south) * Math.abs(bounds.east - bounds.west);
}

/** Derive discovery relevance boosts from registered sources and manifest coverage. */
export function deriveCategoryBoosts(sources: SourceRegistry, manifests: readonly SourceManifest[]): CategoryBoost {
  const boosts: CategoryBoost = { ...INTRINSIC_CATEGORY_BOOSTS };
  const manifestById = new Map(manifests.map((m) => [m.id, m]));

  const coverageByCategory = new Map<string, CoverageBounds[]>();
  for (const [id, src] of Object.entries(sources)) {
    const coverage = manifestById.get(id)?.coverage;
    if (!coverage) continue;
    const existing = coverageByCategory.get(src.category);
    if (existing) {
      existing.push(coverage);
    } else {
      coverageByCategory.set(src.category, [coverage]);
    }
  }

  let maxArea = 0;
  for (const boundsList of coverageByCategory.values()) {
    for (const bounds of boundsList) {
      maxArea = Math.max(maxArea, coverageArea(bounds));
    }
  }

  for (const [category, boundsList] of coverageByCategory) {
    if (category in INTRINSIC_CATEGORY_BOOSTS) continue;
    const minArea = Math.min(...boundsList.map(coverageArea));
    const normalized = maxArea > 0 ? minArea / maxArea : 0;
    boosts[category] = COVERAGE_BOOST_MIN + COVERAGE_BOOST_RANGE * (1 - normalized);
  }

  return boosts;
}
