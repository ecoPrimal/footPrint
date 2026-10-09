// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest';
import {
  entityId,
  parseEntityId,
  entityIdUnchecked,
  parseHexColor,
  hexColorUnchecked,
  layerId,
  projectName,
  dataSourceId,
} from './brands.js';
import { isOk, isErr } from '@protokarya/rustscript';

describe('EntityId', () => {
  it('generates unique IDs with e_ prefix', () => {
    const a = entityId();
    const b = entityId();
    expect(typeof a).toBe('string');
    expect(a.startsWith('e_')).toBe(true);
    expect(a).not.toBe(b);
  });

  it('parseEntityId accepts valid IDs', () => {
    const r = parseEntityId('e_abc_0');
    expect(isOk(r)).toBe(true);
  });

  it('parseEntityId rejects empty strings', () => {
    const r = parseEntityId('');
    expect(isErr(r)).toBe(true);
  });

  it('parseEntityId rejects IDs without e_ prefix', () => {
    const r = parseEntityId('x_abc_0');
    expect(isErr(r)).toBe(true);
  });

  it('entityIdUnchecked casts without validation', () => {
    const id = entityIdUnchecked('raw_id');
    expect(id).toBe('raw_id');
  });
});

describe('HexColor', () => {
  it('parseHexColor accepts #RGB', () => {
    const r = parseHexColor('#f0f');
    expect(isOk(r)).toBe(true);
  });

  it('parseHexColor accepts #RRGGBB', () => {
    const r = parseHexColor('#FF0000');
    expect(isOk(r)).toBe(true);
    if (r.ok) expect(r.value).toBe('#ff0000');
  });

  it('parseHexColor accepts #RRGGBBAA', () => {
    expect(isOk(parseHexColor('#FF000080'))).toBe(true);
  });

  it('parseHexColor rejects invalid strings', () => {
    expect(isErr(parseHexColor('red'))).toBe(true);
    expect(isErr(parseHexColor('#GG0000'))).toBe(true);
    expect(isErr(parseHexColor('#12'))).toBe(true);
  });

  it('hexColorUnchecked casts without validation', () => {
    expect(hexColorUnchecked('anything')).toBe('anything');
  });
});

describe('simple brands', () => {
  it('layerId creates a LayerId', () => {
    const id = layerId('base');
    expect(id).toBe('base');
  });

  it('projectName creates a ProjectName', () => {
    const name = projectName('my-home');
    expect(name).toBe('my-home');
  });

  it('dataSourceId creates a DataSourceId', () => {
    const id = dataSourceId('osm');
    expect(id).toBe('osm');
  });
});
