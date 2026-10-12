import { useCallback, useSyncExternalStore } from 'react';
import { loadSettings, saveSettings } from '../data/settings';
import { resolveTheme, toggledPref, THEME_COLORS } from '../data/theme';

export const THEME_LABELS = { night: 'Night (dark)', day: 'Day (light)', auto: 'Follow my device' };

// The theme preference lives in the saved settings. This small store lets the top-bar button, the Settings
// screen and the chart all read and change it, and re-reads the device setting when "auto" is selected.
const listeners = new Set();
const query = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
let pref = null;

const readPref = () => (pref ??= loadSettings(window.localStorage).theme);
const prefersDark = () => (query ? query.matches : true);

function apply() {
  const resolved = resolveTheme(readPref(), prefersDark());
  document.documentElement.dataset.theme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[resolved]);
  return resolved;
}

const notify = () => { apply(); listeners.forEach((fn) => fn()); };

function subscribe(fn) {
  if (listeners.size === 0) query?.addEventListener?.('change', notify);
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) query?.removeEventListener?.('change', notify);
  };
}

// useSyncExternalStore compares snapshots: the pair "preference + resolved" is encoded in one string
const snapshot = () => `${readPref()}|${resolveTheme(readPref(), prefersDark())}`;

export function setThemePref(next) {
  if (next === pref) return;
  pref = next;
  saveSettings({ ...loadSettings(window.localStorage), theme: next }, window.localStorage);
  notify();
}

/** { pref, theme, setPref, toggle }: the saved preference, the theme in effect now, and ways to change it. */
export function useTheme() {
  const [current, resolved] = useSyncExternalStore(subscribe, snapshot, () => 'night|night').split('|');
  const toggle = useCallback(() => setThemePref(toggledPref(resolveTheme(readPref(), prefersDark()))), []);
  return { pref: current, theme: resolved, setPref: setThemePref, toggle };
}
