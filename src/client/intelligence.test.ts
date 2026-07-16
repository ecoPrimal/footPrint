// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { compassDir } from './intelligence.js';

describe('compassDir', () => {
  it('returns N for 0°', () => expect(compassDir(0)).toBe('N'));
  it('returns N for 360°', () => expect(compassDir(360)).toBe('N'));
  it('returns E for 90°', () => expect(compassDir(90)).toBe('E'));
  it('returns S for 180°', () => expect(compassDir(180)).toBe('S'));
  it('returns W for 270°', () => expect(compassDir(270)).toBe('W'));
  it('returns NE for 45°', () => expect(compassDir(45)).toBe('NE'));
  it('returns SE for 135°', () => expect(compassDir(135)).toBe('SE'));
  it('returns SW for 225°', () => expect(compassDir(225)).toBe('SW'));
  it('returns NW for 315°', () => expect(compassDir(315)).toBe('NW'));
  it('handles negative bearings', () => expect(compassDir(-90)).toBe('W'));
  it('handles bearings above 360°', () => expect(compassDir(450)).toBe('E'));
  it('returns nearest direction for non-cardinal', () => {
    expect(compassDir(22)).toBe('N');
    expect(compassDir(23)).toBe('NE');
    expect(compassDir(67)).toBe('NE');
    expect(compassDir(68)).toBe('E');
  });
});
