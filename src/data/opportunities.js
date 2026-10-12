import { screen, DEFAULT_FILTERS } from './screenFilters';

// "My Opportunities": the stocks in your universe that pass your chosen filter, ranked by a score
// whose every point is explained. The score summarises how well several independent conditions line
// up. It is not a probability of profit and says nothing about what a stock will do next.
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export const SCORE_CRITERIA = [
  { key: 'setup', label: 'Setup validity', max: 25, rule: 'A swing setup that is still valid (not stopped, past a target, stretched or expired): 25; none: 0' },
  { key: 'trend', label: 'Trend alignment', max: 25, rule: 'Daily trend matches the direction: 10; +DI/−DI agrees: 5; ADX ≥ 25: 10 (≥ 20: 5)' },
  { key: 'volume', label: 'Relative volume', max: 15, rule: 'Latest volume vs its 20-day average: ≥ 2x: 15; ≥ 1.5x: 10; ≥ 1x: 5' },
  { key: 'liquidity', label: 'Liquidity', max: 15, rule: '20-day average turnover: ≥ ₹100 Cr: 15; ≥ ₹20 Cr: 10; ≥ ₹5 Cr: 5' },
  { key: 'reward', label: 'Risk / reward', max: 10, rule: 'Target 2 distance in R for a valid setup: ≥ 3R: 10; ≥ 2R: 7; ≥ 1.5R: 4' },
  { key: 'fresh', label: 'Data freshness', max: 10, rule: 'Candles end on the last completed session: 10; within 3 days: 5; older or unknown: 0' },
];

/** Long, short or null from the setup (if any) or else the daily trend. */
export function directionOf(m) {
  if (m.swing) return m.swing.side === 'BUY' ? 'long' : 'short';
  if (m.trend === 'up') return 'long';
  if (m.trend === 'down') return 'short';
  return null;
}

/** Score one screener row. Returns { score, breakdown, direction } or null when it has no direction. */
export function scoreRow(row, { lastSession = null } = {}) {
  const m = row.metrics;
  const direction = directionOf(m);
  if (!direction) return null;
  const want = direction === 'long' ? 'up' : 'down';

  const pts = {};
  pts.setup = m.swing?.actionable ? 25 : 0;
  pts.trend = (m.trend === want ? 10 : 0) + (m.diBias === want ? 5 : 0) + (isNum(m.adx) ? (m.adx >= 25 ? 10 : m.adx >= 20 ? 5 : 0) : 0);
  pts.volume = isNum(m.relVol) ? (m.relVol >= 2 ? 15 : m.relVol >= 1.5 ? 10 : m.relVol >= 1 ? 5 : 0) : 0;
  pts.liquidity = isNum(m.turnoverCr) ? (m.turnoverCr >= 100 ? 15 : m.turnoverCr >= 20 ? 10 : m.turnoverCr >= 5 ? 5 : 0) : 0;
  pts.reward = m.swing?.actionable && isNum(m.swing.rr) ? (m.swing.rr >= 3 ? 10 : m.swing.rr >= 2 ? 7 : m.swing.rr >= 1.5 ? 4 : 0) : 0;
  if (!lastSession || !m.asOf) pts.fresh = 0;
  else if (m.asOf === lastSession) pts.fresh = 10;
  else pts.fresh = (Date.parse(`${lastSession}T00:00:00Z`) - Date.parse(`${m.asOf}T00:00:00Z`)) / 86400000 <= 3 ? 5 : 0;

  const breakdown = SCORE_CRITERIA.map((c) => ({ key: c.key, label: c.label, points: pts[c.key], max: c.max }));
  return { score: breakdown.reduce((s, b) => s + b.points, 0), breakdown, direction };
}

/**
 * Apply the filter, score what passes and rank it. `minScore` hides weak candidates; ties break by
 * symbol so the order is stable. Rows without a direction (a mixed trend and no setup) are skipped
 * and counted in `undirected`.
 */
export function rankOpportunities(rows, { filters = DEFAULT_FILTERS, starred = new Set(), minScore = 0, lastSession = null } = {}) {
  const passed = screen(rows, filters, starred, 'symbol', 'asc');
  const ranked = [];
  let undirected = 0;
  for (const row of passed) {
    const s = scoreRow(row, { lastSession });
    if (!s) { undirected++; continue; }
    if (s.score >= minScore) ranked.push({ ...row, ...s, target: row.metrics.swing?.actionable ? 'swing' : 'analysis' });
  }
  ranked.sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
  return { ranked, passedFilter: passed.length, undirected };
}
