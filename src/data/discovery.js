import { DEFAULT_FILTERS } from './dashboardView';

// Discovery tabs on the Dashboard (pure). Every tab works on the stocks of the selected universe after the Dashboard's
// own filters (sector, % change, relative volume, signal) and the search box have been applied, so they always agree.
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export const DISCOVERY_TABS = [
  { id: 'volume', label: 'High volume' },
  { id: 'intraday', label: 'Intraday signals' },
  { id: 'swing', label: 'Swing trending' },
  { id: 'gainers', label: 'Gainers' },
  { id: 'losers', label: 'Losers' },
  { id: 'liquidity', label: 'Volume & liquidity' },
  { id: 'watchlist', label: 'Watchlist' },
  { id: 'opps', label: 'My opportunities' },
];
export const SORTS = [
  { id: 'default', label: 'Tab default' },
  { id: 'change', label: 'Day change' },
  { id: 'relVolume', label: 'Relative volume' },
  { id: 'value', label: 'Traded value' },
  { id: 'price', label: 'Price' },
  { id: 'symbol', label: 'Symbol' },
];
const TAB_IDS = new Set(DISCOVERY_TABS.map((t) => t.id));
const SORT_IDS = new Set(SORTS.map((s) => s.id));

/** Traded value so far today in rupees crore (price x volume), or null without a volume. */
export const tradedValueCr = (row) => (isNum(row.price) && isNum(row.volume) ? (row.price * row.volume) / 1e7 : null);

/** Rows whose symbol, name, sector or index membership contains every word typed. */
export function searchRows(rows, query) {
  const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return rows;
  return rows.filter((r) => {
    const hay = `${r.symbol} ${r.name ?? ''} ${r.sector ?? ''} ${(r.indices ?? []).join(' ')}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

const VALUE = {
  change: (r) => r.changePct,
  relVolume: (r) => r.relVolume,
  value: (r) => tradedValueCr(r),
  price: (r) => r.price,
};

/** Sort by a column, biggest first (or smallest first with dir 'asc'). Rows without the value always go last. Ties by symbol. */
export function sortRows(rows, sort = 'default', dir = 'desc') {
  if (sort === 'symbol') return [...rows].sort((a, b) => (dir === 'asc' ? 1 : -1) * a.symbol.localeCompare(b.symbol));
  const get = VALUE[sort];
  if (!get) return rows;
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = get(a);
    const y = get(b);
    if (!isNum(x) && !isNum(y)) return a.symbol.localeCompare(b.symbol);
    if (!isNum(x)) return 1;
    if (!isNum(y)) return -1;
    return sign * (x - y) || a.symbol.localeCompare(b.symbol);
  });
}

/** Stocks trading on unusually high volume: relative volume at least `minRelVolume`, highest first. */
export function highVolumeList(rows, minRelVolume = 1.5) {
  return rows.filter((r) => isNum(r.relVolume) && r.relVolume >= minRelVolume).sort((a, b) => b.relVolume - a.relVolume || a.symbol.localeCompare(b.symbol));
}
export const gainersList = (rows) => rows.filter((r) => r.changePct > 0).sort((a, b) => b.changePct - a.changePct || a.symbol.localeCompare(b.symbol));
export const losersList = (rows) => rows.filter((r) => r.changePct < 0).sort((a, b) => a.changePct - b.changePct || a.symbol.localeCompare(b.symbol));

/** Rows that are on the watchlist (a Set of symbols). Watchlist stocks outside the selected universe are listed in `outside`. */
export function watchlistRows(rows, symbols) {
  const have = new Set(rows.map((r) => r.symbol));
  return { rows: rows.filter((r) => symbols.has(r.symbol)), outside: [...symbols].filter((s) => !have.has(s)).sort() };
}

/** Keep only the daily-scan rows for allowed symbols (a Set), so deeper tabs follow the filters. */
export const restrictScanRows = (scanRows, allowed) => scanRows.filter((r) => allowed.has(r.symbol));
/** Same for intraday scan results. */
export const restrictIntradayScans = (scans, allowed) => scans.filter((r) => allowed.has(r.symbol));

// ---------- saved view (kept across navigation to a chart and back) ----------
export const VIEW_KEY = 'stockpulse.dashboard.view.v1';
export const DEFAULT_VIEW = { tab: 'gainers', search: '', sort: 'default', dir: 'desc', filters: DEFAULT_FILTERS };

export function validateView(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const f = r.filters && typeof r.filters === 'object' ? r.filters : {};
  const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  return {
    tab: TAB_IDS.has(r.tab) ? r.tab : DEFAULT_VIEW.tab,
    search: text(r.search, 60),
    sort: SORT_IDS.has(r.sort) ? r.sort : DEFAULT_VIEW.sort,
    dir: r.dir === 'asc' ? 'asc' : 'desc',
    filters: {
      sector: text(f.sector, 60),
      minPct: text(f.minPct, 8),
      maxPct: text(f.maxPct, 8),
      minRelVol: text(f.minRelVol, 4),
      signal: ['any', 'long', 'short', 'none'].includes(f.signal) ? f.signal : 'any',
    },
  };
}

export function loadView(storage) {
  try {
    return validateView(JSON.parse(storage.getItem(VIEW_KEY)));
  } catch {
    return validateView(null);
  }
}

export function saveView(view, storage) {
  try {
    storage.setItem(VIEW_KEY, JSON.stringify(validateView(view)));
    return true;
  } catch {
    return false;
  }
}
