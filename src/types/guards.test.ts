import { describe, it, expect } from 'vitest';
import { isOverpassNode, isOverpassWay, isOverpassRelation } from './overpass.js';
import type { OverpassElement } from './overpass.js';
import { isVectorSource, isTileSource, isWmsSource } from './source.js';
import type { DataSourceDef } from './source.js';
import { ftToMeters } from './snap.js';
import type { HexColor, DataSourceId } from './brands.js';

const dummyColor = '#000000' as HexColor;
const dummyId = 'test' as DataSourceId;

describe('Overpass type guards', () => {
  const node: OverpassElement = { type: 'node', id: 1, lat: 42, lon: -84 };
  const way: OverpassElement = { type: 'way', id: 2 };
  const rel: OverpassElement = { type: 'relation', id: 3 };

  it('isOverpassNode narrows correctly', () => {
    expect(isOverpassNode(node)).toBe(true);
    expect(isOverpassNode(way)).toBe(false);
    expect(isOverpassNode(rel)).toBe(false);
  });

  it('isOverpassWay narrows correctly', () => {
    expect(isOverpassWay(way)).toBe(true);
    expect(isOverpassWay(node)).toBe(false);
  });

  it('isOverpassRelation narrows correctly', () => {
    expect(isOverpassRelation(rel)).toBe(true);
    expect(isOverpassRelation(node)).toBe(false);
  });
});

describe('Source type guards', () => {
  const vec: DataSourceDef = {
    id: dummyId, name: 'v', category: 'c', color: dummyColor,
    fetch: () => Promise.resolve([]),
  };
  const tile: DataSourceDef = {
    id: dummyId, name: 't', category: 'c', color: dummyColor,
    type: 'tiles', tileUrl: 'https://example.com/{z}/{x}/{y}.png',
  };
  const wms: DataSourceDef = {
    id: dummyId, name: 'w', category: 'c', color: dummyColor,
    type: 'wms', wmsUrl: 'https://example.com/wms', wmsLayers: 'layer1',
  };

  it('isVectorSource identifies vector (no type) and rejects others', () => {
    expect(isVectorSource(vec)).toBe(true);
    expect(isVectorSource(tile)).toBe(false);
    expect(isVectorSource(wms)).toBe(false);
  });

  it('isTileSource identifies tiles', () => {
    expect(isTileSource(tile)).toBe(true);
    expect(isTileSource(vec)).toBe(false);
  });

  it('isWmsSource identifies wms', () => {
    expect(isWmsSource(wms)).toBe(true);
    expect(isWmsSource(tile)).toBe(false);
  });
});

describe('ftToMeters', () => {
  it('converts 1 foot to 0.3048 meters', () => {
    expect(ftToMeters(1)).toBeCloseTo(0.3048, 6);
  });

  it('converts 10 feet correctly', () => {
    expect(ftToMeters(10)).toBeCloseTo(3.048, 4);
  });

  it('converts 0 feet to 0', () => {
    expect(ftToMeters(0)).toBe(0);
  });
});
