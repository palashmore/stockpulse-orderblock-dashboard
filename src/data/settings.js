import { TIMEFRAMES } from './timeframes';
import { OVERLAYS, PANES, DEFAULT_INDICATORS } from './chartConfig';

// Non-secret user preferences, kept in this browser. Credentials and tokens never live here: they
// stay in the server's .env file and memory. Stored data is validated on load, so a corrupt or
// outdated entry falls back to defaults field by field instead of breaking the app.
export const SETTINGS_KEY = 'stockpulse.settings.v1';

export const START_TABS = ['lists', 'multichart', 'orderblock', 'intraday', 'swing', 'analysis', 'dashboard', 'books', 'screener', 'scanner', 'watchlist', 'alerts', 'portfolio'];

export const DEFAULT_SETTINGS = {
  defaultTimeframe: 'D',
  startTab: 'orderblock',
  hideAmounts: true,
  chartIndicators: DEFAULT_INDICATORS,
  index: 'nifty50',
};

const INDICATOR_KEYS = [...OVERLAYS, ...PANES].map((o) => o.key);

/** Keep only known indicator switches, as booleans; anything else is dropped. */
export function validateIndicators(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_INDICATORS };
  const out = {};
  for (const key of INDICATOR_KEYS) if (raw[key] === true) out[key] = true;
  return out;
}

export function validateSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    defaultTimeframe: TIMEFRAMES.some((t) => t.id === r.defaultTimeframe) ? r.defaultTimeframe : DEFAULT_SETTINGS.defaultTimeframe,
    startTab: START_TABS.includes(r.startTab) ? r.startTab : DEFAULT_SETTINGS.startTab,
    hideAmounts: typeof r.hideAmounts === 'boolean' ? r.hideAmounts : DEFAULT_SETTINGS.hideAmounts,
    chartIndicators: validateIndicators(r.chartIndicators),
    index: typeof r.index === 'string' && /^[a-z0-9]{2,30}$/.test(r.index) ? r.index : DEFAULT_SETTINGS.index,
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
