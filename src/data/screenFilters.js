// Filtering, sorting, presets, saved filters and a local watchlist for the daily-analysis screener.
// Saved data lives in this browser and is validated on load.
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export const DEFAULT_FILTERS = {
  trend: 'ANY', // ANY | UP | DOWN
  setup: 'ANY', // ANY | ANY_SETUP | PULLBACK | BREAKOUT
  minRsi: null,
  maxRsi: null,
  minAdx: null,
  minRelVol: null,
  minAtrPct: null,
  maxAtrPct: null,
  minTurnoverCr: null,
  aboveVwap: false,
  starredOnly: false,
};

export const PRESETS = [
  { id: 'setups', label: 'Swing setups on the last bar', filters: { setup: 'ANY_SETUP' } },
  { id: 'breakout', label: 'Breakout on volume', filters: { setup: 'BREAKOUT', minRelVol: 1.5 } },
  { id: 'pullback', label: 'Pullback in an uptrend', filters: { setup: 'PULLBACK', trend: 'UP' } },
  { id: 'oversold', label: 'Oversold in an uptrend', filters: { trend: 'UP', maxRsi: 40 } },
  { id: 'volatile', label: 'High volatility', filters: { minAtrPct: 2.5 } },
  { id: 'liquid', label: 'Liquid trend leaders', filters: { trend: 'UP', minAdx: 25, minTurnoverCr: 100 } },
];

export function presetFilters(id) {
  const p = PRESETS.find((x) => x.id === id);
  return { ...DEFAULT_FILTERS, ...(p ? p.filters : {}) };
}

const NUMERIC = ['minRsi', 'maxRsi', 'minAdx', 'minRelVol', 'minAtrPct', 'maxAtrPct', 'minTurnoverCr'];
const ENUMS = { trend: ['ANY', 'UP', 'DOWN'], setup: ['ANY', 'ANY_SETUP', 'PULLBACK', 'BREAKOUT'] };

/** Coerce arbitrary input into a valid filter object. */
export function validateFilters(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const out = { ...DEFAULT_FILTERS };
  for (const [key, allowed] of Object.entries(ENUMS)) if (allowed.includes(r[key])) out[key] = r[key];
  for (const key of NUMERIC) out[key] = isNum(r[key]) ? r[key] : null;
  out.aboveVwap = r.aboveVwap === true;
  out.starredOnly = r.starredOnly === true;
  return out;
}

/** A row matches when it satisfies every set filter. A row missing a field a filter needs does not match. */
export function matchesRow(row, f, starred = new Set()) {
  const m = row.metrics;
  if (f.starredOnly && !starred.has(row.symbol)) return false;
  if (f.trend === 'UP' && m.trend !== 'up') return false;
  if (f.trend === 'DOWN' && m.trend !== 'down') return false;
  if (f.setup === 'ANY_SETUP' && !m.setup) return false;
  if (f.setup === 'PULLBACK' && m.setup !== 'pullback') return false;
  if (f.setup === 'BREAKOUT' && m.setup !== 'breakout' && m.setup !== 'breakdown') return false;
  if (isNum(f.minRsi) && !(m.rsi >= f.minRsi)) return false;
  if (isNum(f.maxRsi) && !(m.rsi <= f.maxRsi)) return false;
  if (isNum(f.minAdx) && !(isNum(m.adx) && m.adx >= f.minAdx)) return false;
  if (isNum(f.minRelVol) && !(isNum(m.relVol) && m.relVol >= f.minRelVol)) return false;
  if (isNum(f.minAtrPct) && !(m.atrPct >= f.minAtrPct)) return false;
  if (isNum(f.maxAtrPct) && !(m.atrPct <= f.maxAtrPct)) return false;
  if (isNum(f.minTurnoverCr) && !(isNum(m.turnoverCr) && m.turnoverCr >= f.minTurnoverCr)) return false;
  if (f.aboveVwap && m.aboveVwap !== true) return false;
  return true;
}

export const SORT_KEYS = ['symbol', 'price', 'changePct', 'rsi', 'adx', 'atrPct', 'relVol', 'turnoverCr', 'vsEma20Pct'];

/** Filter then sort rows ({ symbol, name, sector, metrics }). Rows with a missing sort value go last. */
export function screen(rows, filters, starred, sortKey = 'symbol', sortDir = 'asc') {
  const factor = sortDir === 'asc' ? 1 : -1;
  return rows
    .filter((r) => r.metrics && matchesRow(r, filters, starred))
    .sort((a, b) => {
      if (sortKey === 'symbol') return factor * a.symbol.localeCompare(b.symbol);
      const av = sortKey === 'price' ? a.metrics.price : a.metrics[sortKey];
      const bv = sortKey === 'price' ? b.metrics.price : b.metrics[sortKey];
      if (!isNum(av) && !isNum(bv)) return a.symbol.localeCompare(b.symbol);
      if (!isNum(av)) return 1;
      if (!isNum(bv)) return -1;
      return factor * (av - bv) || a.symbol.localeCompare(b.symbol);
    });
}

// ---- saved filters and watchlist (browser storage)
export const SAVED_KEY = 'stockpulse.screener.saved.v1';
export const WATCH_KEY = 'stockpulse.watchlist.v1';
const MAX_SAVED = 20;

export function loadSavedFilters(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(SAVED_KEY));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x.name === 'string' && x.name.trim() !== '')
      .slice(0, MAX_SAVED)
      .map((x) => ({ name: x.name.trim().slice(0, 40), filters: validateFilters(x.filters) }));
  } catch {
    return [];
  }
}

export function saveFilters(list, storage) {
  try {
    storage.setItem(SAVED_KEY, JSON.stringify(list.slice(0, MAX_SAVED)));
    return true;
  } catch {
    return false;
  }
}

/** Add or replace a saved filter by name (case-insensitive). Returns the new list, or null for a blank name. */
export function upsertSaved(list, name, filters) {
  const clean = String(name || '').trim().slice(0, 40);
  if (!clean) return null;
  const rest = list.filter((x) => x.name.toLowerCase() !== clean.toLowerCase());
  return [{ name: clean, filters: validateFilters(filters) }, ...rest].slice(0, MAX_SAVED);
}

export function loadWatchlist(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(WATCH_KEY));
    return Array.isArray(parsed) ? [...new Set(parsed.filter((s) => typeof s === 'string' && /^[A-Z0-9&.-]{1,20}$/.test(s)))].slice(0, 200) : [];
  } catch {
    return [];
  }
}

export function saveWatchlist(symbols, storage) {
  try {
    storage.setItem(WATCH_KEY, JSON.stringify([...symbols].slice(0, 200)));
    return true;
  } catch {
    return false;
  }
}
