import { scoreQuote } from './ranking';

/**
 * Scanner over the Nifty 50 quotes. Every metric comes from the quote fields; a stock missing
 * a field a rule needs does not match that rule (it is never treated as 0).
 *
 *   changePct    day % change
 *   gapPct       (open - previousClose) / previousClose * 100
 *   position     where price sits in the day's range, -1 (at the low) to +1 (at the high)
 *   relVolume    volume / 3-month average daily volume. Intraday volume is compared with a
 *                full-day average, so it understates early in the session.
 *   strength     0-100 ranking strength and direction, as on the Bullish/Bearish board
 */
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export const DEFAULT_CRITERIA = {
  direction: 'ANY', // ANY | BULLISH | BEARISH | CHOPPY
  minChangePct: null, // signed lower bound
  maxChangePct: null, // signed upper bound
  minRelVolume: null,
  minStrength: null,
  nearHigh: false, // position >= NEAR_EDGE
  nearLow: false, // position <= -NEAR_EDGE
  minGapPct: null, // signed lower bound on the opening gap
  maxGapPct: null,
};

export const NEAR_EDGE = 0.8;

export const PRESETS = [
  { id: 'volume', label: 'Volume spike', criteria: { minRelVolume: 2 } },
  { id: 'high', label: 'Near day high', criteria: { nearHigh: true, minChangePct: 0 } },
  { id: 'low', label: 'Near day low', criteria: { nearLow: true, maxChangePct: 0 } },
  { id: 'gapup', label: 'Gap up 1%+', criteria: { minGapPct: 1 } },
  { id: 'gapdown', label: 'Gap down 1%+', criteria: { maxGapPct: -1 } },
  { id: 'strong', label: 'Strong movers', criteria: { minStrength: 60 } },
];

/** Derive the scanner metrics for one quote, or null when it cannot be scored. */
export function scanMetrics(q) {
  const scored = scoreQuote(q);
  if (!scored) return null;
  return {
    symbol: q.symbol,
    name: q.name,
    price: q.price,
    changePct: q.changePct,
    gapPct: isNum(q.open) && q.previousClose > 0 ? ((q.open - q.previousClose) / q.previousClose) * 100 : null,
    position: scored.position,
    relVolume: scored.relVolume,
    strength: scored.strength,
    direction: scored.direction,
  };
}

/** True when the metrics satisfy every set criterion. */
export function matches(m, c) {
  if (c.direction && c.direction !== 'ANY' && m.direction !== c.direction) return false;
  if (isNum(c.minChangePct) && !(m.changePct >= c.minChangePct)) return false;
  if (isNum(c.maxChangePct) && !(m.changePct <= c.maxChangePct)) return false;
  if (isNum(c.minRelVolume) && !(isNum(m.relVolume) && m.relVolume >= c.minRelVolume)) return false;
  if (isNum(c.minStrength) && !(m.strength >= c.minStrength)) return false;
  if (c.nearHigh && !(isNum(m.position) && m.position >= NEAR_EDGE)) return false;
  if (c.nearLow && !(isNum(m.position) && m.position <= -NEAR_EDGE)) return false;
  if (isNum(c.minGapPct) && !(isNum(m.gapPct) && m.gapPct >= c.minGapPct)) return false;
  if (isNum(c.maxGapPct) && !(isNum(m.gapPct) && m.gapPct <= c.maxGapPct)) return false;
  return true;
}

export const SORT_KEYS = ['symbol', 'price', 'changePct', 'gapPct', 'relVolume', 'strength'];

/**
 * Filter and sort. Rows with a missing sort value go last in either direction; ties break by symbol.
 * Returns the matches plus how many quotes could not be scanned.
 */
export function runScan(quotes, criteria, sortKey = 'strength', sortDir = 'desc') {
  const rows = [];
  let unscannable = 0;
  for (const q of quotes || []) {
    const m = scanMetrics(q);
    if (!m) unscannable++;
    else if (matches(m, criteria)) rows.push(m);
  }

  const factor = sortDir === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    if (sortKey === 'symbol') return factor * a.symbol.localeCompare(b.symbol);
    const av = a[sortKey];
    const bv = b[sortKey];
    if (!isNum(av) && !isNum(bv)) return a.symbol.localeCompare(b.symbol);
    if (!isNum(av)) return 1;
    if (!isNum(bv)) return -1;
    return factor * (av - bv) || a.symbol.localeCompare(b.symbol);
  });

  return { rows, unscannable };
}

/** Criteria for a preset id on top of the defaults, or the defaults for an unknown id. */
export function presetCriteria(id) {
  const preset = PRESETS.find((p) => p.id === id);
  return { ...DEFAULT_CRITERIA, ...(preset ? preset.criteria : {}) };
}
