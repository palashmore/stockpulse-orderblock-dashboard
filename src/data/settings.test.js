import { describe, it, expect } from 'vitest';
import { validateSettings, loadSettings, saveSettings, DEFAULT_SETTINGS, SETTINGS_KEY } from './settings';

const memory = (initial) => {
  const data = new Map(initial === undefined ? [] : [[SETTINGS_KEY, initial]]);
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
};

describe('settings', () => {
  it('falls back to defaults field by field for invalid values', () => {
    expect(validateSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(validateSettings({ defaultTimeframe: '7m', startTab: 'nope', hideAmounts: 'yes' })).toEqual(DEFAULT_SETTINGS);
    expect(validateSettings({ defaultTimeframe: '5m', startTab: 'screener', hideAmounts: false })).toEqual({ defaultTimeframe: '5m', startTab: 'screener', hideAmounts: false });
    expect(validateSettings({ defaultTimeframe: '5m', startTab: 'x' })).toMatchObject({ defaultTimeframe: '5m', startTab: 'orderblock' });
  });

  it('round-trips and survives corrupt or unavailable storage', () => {
    const s = memory();
    expect(saveSettings({ defaultTimeframe: '15m', startTab: 'scanner', hideAmounts: false }, s)).toBe(true);
    expect(loadSettings(s)).toEqual({ defaultTimeframe: '15m', startTab: 'scanner', hideAmounts: false });
    expect(loadSettings(memory('{not json'))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memory())).toEqual(DEFAULT_SETTINGS);
    const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } };
    expect(loadSettings(broken)).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings(DEFAULT_SETTINGS, broken)).toBe(false);
  });

  it('never stores anything outside the schema', () => {
    const s = memory();
    saveSettings({ defaultTimeframe: 'D', startTab: 'orderblock', hideAmounts: true, apiSecret: 'x' }, s);
    expect(s.getItem(SETTINGS_KEY)).not.toMatch(/apiSecret/);
  });
});
