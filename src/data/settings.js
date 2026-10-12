import { TIMEFRAMES } from './timeframes';

// Non-secret user preferences, kept in this browser. Credentials and tokens never live here: they
// stay in the server's .env file and memory. Stored data is validated on load, so a corrupt or
// outdated entry falls back to defaults field by field instead of breaking the app.
export const SETTINGS_KEY = 'stockpulse.settings.v1';

export const START_TABS = ['orderblock', 'intraday', 'swing', 'analysis', 'dashboard', 'screener', 'scanner', 'watchlist', 'alerts', 'portfolio'];

export const DEFAULT_SETTINGS = {
  defaultTimeframe: 'D',
  startTab: 'orderblock',
  hideAmounts: true,
};

export function validateSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    defaultTimeframe: TIMEFRAMES.some((t) => t.id === r.defaultTimeframe) ? r.defaultTimeframe : DEFAULT_SETTINGS.defaultTimeframe,
    startTab: START_TABS.includes(r.startTab) ? r.startTab : DEFAULT_SETTINGS.startTab,
    hideAmounts: typeof r.hideAmounts === 'boolean' ? r.hideAmounts : DEFAULT_SETTINGS.hideAmounts,
  };
}

export function loadSettings(storage) {
  try {
    return validateSettings(JSON.parse(storage.getItem(SETTINGS_KEY)));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Save settings; returns false when storage is full or blocked. */
export function saveSettings(settings, storage) {
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(validateSettings(settings)));
    return true;
  } catch {
    return false;
  }
}
