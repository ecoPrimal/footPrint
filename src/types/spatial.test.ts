// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach } from 'vitest';
import { deriveCategoryBoosts } from './spatial.js';
import { dataSourceId, hexColorUnchecked } from './brands.js';
import type { SourceRegistry } from './source.js';
import { clearManifestRegistry, registerSourceManifest, setManifestDefaultsInitializer } from '../core/manifest.js';
import { registerDefaultManifests, LANSING_METRO_COVERAGE, MICHIGAN_COVERAGE } from '../core/manifest-defaults.js';

beforeEach(() => {
  clearManifestRegistry();
  setManifestDefaultsInitializer(registerDefaultManifests);
});

describe('deriveCategoryBoosts', () => {
  it('returns intrinsic boosts for universal categories', () => {
    const sources: SourceRegistry = {
      [dataSourceId('osm-buildings')]: {
        id: dataSourceId('osm-buildings'),
        name: 'Buildings',
        category: 'OpenStreetMap',
        color: hexColorUnchecked('#000'),
        type: 'vector',
        enabled: false,
        loading: false,
        featureCount: 0,
        layer: {} as never,
        lastBounds: null,
        error: null,
      },
    };

    const boosts = deriveCategoryBoosts(sources, []);
    expect(boosts['OpenStreetMap']).toBe(0.9);
    expect(boosts['Infrastructure']).toBe(1.0);
  });

  it('derives regional category boosts from manifest coverage area', () => {
    registerSourceManifest({
      id: 'lansing-zoning',
      capabilities: [],
      coverage: LANSING_METRO_COVERAGE,
    });
    registerSourceManifest({
      id: 'mi-roads',
      capabilities: [],
      coverage: MICHIGAN_COVERAGE,
    });

    const sources: SourceRegistry = {
      [dataSourceId('lansing-zoning')]: {
        id: dataSourceId('lansing-zoning'),
        name: 'Zoning',
        category: 'Lansing',
        color: hexColorUnchecked('#000'),
        type: 'vector',
        enabled: false,
        loading: false,
        featureCount: 0,
        layer: {} as never,
        lastBounds: null,
        error: null,
      },
      [dataSourceId('mi-roads')]: {
        id: dataSourceId('mi-roads'),
        name: 'Roads',
        category: 'Michigan',
        color: hexColorUnchecked('#000'),
        type: 'vector',
        enabled: false,
        loading: false,
        featureCount: 0,
        layer: {} as never,
        lastBounds: null,
        error: null,
      },
    };

    const boosts = deriveCategoryBoosts(sources, [
      { id: 'lansing-zoning', capabilities: [], coverage: LANSING_METRO_COVERAGE },
      { id: 'mi-roads', capabilities: [], coverage: MICHIGAN_COVERAGE },
    ]);

    expect(boosts['Lansing']).toBeCloseTo(0.6, 1);
    expect(boosts['Michigan']).toBeCloseTo(0.4, 1);
    expect(boosts['Lansing']).toBeGreaterThan(boosts['Michigan']!);
  });
});
