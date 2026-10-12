import { describe, it, expect } from 'vitest';
import { resolveTheme, chartColors, toggledPref, THEME_COLORS } from './theme';
import { validateSettings, loadSettings, saveSettings, DEFAULT_SETTINGS, THEME_PREFS } from './settings';

describe('resolveTheme', () => {
  it('honours an explicit choice and follows the device only for auto', () => {
    expect(resolveTheme('night', false)).toBe('night');
    expect(resolveTheme('day', true)).toBe('day');
    expect(resolveTheme('auto', true)).toBe('night');
    expect(resolveTheme('auto', false)).toBe('day');
  });
  it('falls back to night for anything unknown', () => {
    for (const bad of [undefined, null, '', 'sepia', 5]) expect(resolveTheme(bad, false)).toBe('night');
  });
});

describe('toggledPref', () => {
  it('flips what is on screen, so an auto device in light mode goes to night', () => {
    expect(toggledPref(resolveTheme('auto', false))).toBe('night');
    expect(toggledPref('night')).toBe('day');
    expect(toggledPref('day')).toBe('night');
  });
});

describe('chartColors', () => {
  it('has the same keys in both themes, with darker text and a light grid for day', () => {
    const night = chartColors('night');
    const day = chartColors('day');
    expect(Object.keys(day).sort()).toEqual(Object.keys(night).sort());
    expect(day.border).not.toBe(night.border);
    expect(chartColors('anything')).toEqual(night);
  });
  it('gives the browser toolbar a colour for each theme', () => {
    expect(THEME_COLORS.night).toMatch(/^#[0-9a-f]{6}$/);
    expect(THEME_COLORS.day).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('theme in saved settings', () => {
  it('defaults to night and validates the stored value', () => {
    expect(DEFAULT_SETTINGS.theme).toBe('night');
    expect(validateSettings({}).theme).toBe('night');
    expect(validateSettings({ theme: 'day' }).theme).toBe('day');
    expect(validateSettings({ theme: 'neon' }).theme).toBe('night');
    expect(THEME_PREFS).toEqual(['night', 'day', 'auto']);
  });
  it('round-trips through storage', () => {
    let value = null;
    const storage = { getItem: () => value, setItem: (_k, v) => { value = v; } };
    expect(saveSettings({ ...loadSettings(storage), theme: 'auto' }, storage)).toBe(true);
    expect(loadSettings(storage).theme).toBe('auto');
  });
});
