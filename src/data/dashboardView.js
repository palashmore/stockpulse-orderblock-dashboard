import { computeBreadth, sectorPerformance } from './marketOverview';

// Dashboard maths over the selected universe (pure). Every figure here is computed from the quotes and the universe passed
// in, so changing the selected indices changes every number; nothing is carried over from a default list.
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export const NO_SECTOR = 'Unclassified';
export const DEFAULT_FILTERS = { sector: '', minPct: '', maxPct: '', minRelVol: '', signal: 'any' };
export const REL_VOL_OPTIONS = [1, 1.5, 2, 3];
export const SIGNAL_OPTIONS = [
  { id: 'any', label: 'Any signal status' },
  { id: 'long', label: 'Valid long setup' },
  { id: 'short', label: 'Valid short setup' },
  { id: 'none', label: 'No valid setup' },
];

/** Today's volume against its 3-month daily average. Early in the session this reads low (see the note on screen). */
export const relVolume = (q) => (isNum(q?.volume) && q.avgVolume > 0 ? q.volume / q.avgVolume : null);

/**
 * Join quotes with what the universe knows about each stock (name, sector, index membership).
 * Stocks without a usable price are left out; `unpriced` lists the universe stocks that got no quote.
 */
export function buildRows(quotes, stocks) {
  const meta = new Map((stocks || []).map((s) => [s.symbol, s]));
  const rows = [];
  const priced = new Set();
  for (const q of quotes || []) {
    if (!isNum(q?.price) || !isNum(q?.changePct)) continue;
    const m = meta.get(q.symbol);
    priced.add(q.symbol);
    rows.push({
      symbol: q.symbol,
      name: m?.name || q.name || q.symbol,
      sector: m?.sector || NO_SECTOR,
      indices: m?.indices ?? [],
      price: q.price,
      changePct: q.changePct,
      volume: isNum(q.volume) ? q.volume : null,
      relVolume: relVolume(q),
    });
  }
  const unpriced = (stocks || []).filter((s) => !priced.has(s.symbol)).map((s) => s.symbol);
  return { rows, unpriced };
}

/** Swing-setup status of a screener row's metrics: 'long' | 'short' | 'none'. Only a still-valid setup counts. */
export function signalOf(metrics) {
  const s = metrics?.swing;
  if (!s || !s.actionable) return 'none';
  return s.side === 'BUY' ? 'long' : 'short';
}

/** Map symbol -> 'long' | 'short' | 'none' from the daily scan rows. Symbols not in the scan are absent (unknown). */
export function signalMap(scanRows) {
  return new Map((scanRows || []).map((r) => [r.symbol, signalOf(r.metrics)]));
}

const numOrNull = (text) => {
  if (text === '' || text === null || text === undefined) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

/** True when any filter is set. */
export function filtersActive(filters) {
  return JSON.stringify({ ...DEFAULT_FILTERS, ...filters }) !== JSON.stringify(DEFAULT_FILTERS);
}

/**
 * Apply the dashboard filters. A signal filter needs the scan: stocks the scan did not cover are never shown as matching
 * "long", "short" or "none" (their status is unknown, not "none"), and are counted in `unknownSignal`.
 */
export function filterRows(rows, filters = DEFAULT_FILTERS, signals = new Map()) {
  const f = { ...DEFAULT_FILTERS, ...filters };
  const min = numOrNull(f.minPct);
  const max = numOrNull(f.maxPct);
  const rv = numOrNull(f.minRelVol);
  let unknownSignal = 0;
  const out = rows.filter((r) => {
    if (f.sector && r.sector !== f.sector) return false;
    if (min !== null && r.changePct < min) return false;
    if (max !== null && r.changePct > max) return false;
    if (rv !== null && !(isNum(r.relVolume) && r.relVolume >= rv)) return false;
    if (f.signal !== 'any') {
      const status = signals.get(r.symbol);
      if (status === undefined) {
        unknownSignal++;
        return false;
      }
      if (status !== f.signal) return false;
    }
    return true;
  });
  return { rows: out, unknownSignal };
}

/** Sectors present in the rows, biggest first, for the sector filter. */
export function sectorsOf(rows) {
  const counts = new Map();
  for (const r of rows) counts.set(r.sector, (counts.get(r.sector) ?? 0) + 1);
  return [...counts.entries()].map(([sector, count]) => ({ sector, count })).sort((a, b) => b.count - a.count || a.sector.localeCompare(b.sector));
}

/**
 * Breadth and sector averages for the whole selected universe (the filters only narrow the dot plot and list).
 * Sector change is the equal-weighted average of its stocks' day change; sectors with one stock are not listed.
 */
export function universeStats(rows) {
  const sectorMap = Object.fromEntries(rows.map((r) => [r.symbol, r.sector === NO_SECTOR ? null : r.sector]));
  return { breadth: computeBreadth(rows), sectors: sectorPerformance(rows, sectorMap) };
}

/**
 * One card per selected index: NSE's level and day change, with NSE's own advance/decline count for the full index.
 * An index NSE does not report is returned with `level: null` (and named), never filled in.
 */
export function indexCards(universe, labels, levels) {
  return (universe?.ids ?? []).map((id) => {
    const l = levels?.indices?.[id] ?? null;
    return {
      id,
      label: labels?.[id] ?? id,
      level: l ? l.last : null,
      change: l ? l.change : null,
      changePct: l ? l.changePct : null,
      advances: l ? l.advances : null,
      declines: l ? l.declines : null,
      unchanged: l ? l.unchanged : null,
    };
  });
}

/** Text for the data-coverage line under the header. */
export function coverageLine({ universeCount, pricedCount, unpriced = [], failedIds = [] }) {
  const parts = [`${pricedCount} of ${universeCount} stocks priced`];
  if (unpriced.length > 0) parts.push(`${unpriced.length} without a price${unpriced.length <= 5 ? ` (${unpriced.join(', ')})` : ''}`);
  if (failedIds.length > 0) parts.push(`${failedIds.length} selected ${failedIds.length === 1 ? 'index' : 'indices'} could not be loaded (${failedIds.join(', ')})`);
  return parts.join(' · ');
}

/** Dot size and vertical step so a large universe still fits in about `maxHeight` px. */
export function dotLayout(levelCount, count, maxHeight = 300) {
  const base = count > 300 ? 6 : count > 120 ? 8 : 10;
  const step = Math.max(3, Math.min(base + 2, Math.floor(maxHeight / Math.max(1, levelCount))));
  return { size: Math.max(2, step - 2), step };
}

/** Most movement first, for the list under the plot. Ties by symbol. */
export function byAbsMove(rows) {
  return [...rows].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct) || a.symbol.localeCompare(b.symbol));
}
