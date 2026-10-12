/**
 * Market overview metrics over a quote universe. All values come from the quotes passed in;
 * stocks without a finite changePct are excluded from every figure and counted as `unknown`.
 */
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export const DOT_AXIS_LIMIT = 3; // % move at the edges of the dot plot; larger moves are pinned there
export const DOT_BIN = 0.25; // % width of one stacking bin

/** Advancers (>0), decliners (<0) and unchanged (=0) by day % change. */
export function computeBreadth(quotes) {
  let advancers = 0;
  let decliners = 0;
  let unchanged = 0;
  let unknown = 0;
  for (const q of quotes || []) {
    if (!isNum(q?.changePct)) unknown++;
    else if (q.changePct > 0) advancers++;
    else if (q.changePct < 0) decliners++;
    else unchanged++;
  }
  return {
    advancers,
    decliners,
    unchanged,
    unknown,
    ratio: decliners > 0 ? Math.round((advancers / decliners) * 100) / 100 : null,
  };
}

/**
 * Equal-weighted average % change per sector (not market-cap weighted), sorted best first.
 * Sectors with fewer than `minStocks` ranked members are left out as too thin to call, and
 * symbols missing from `sectorMap` are counted in `uncovered`.
 */
export function sectorPerformance(quotes, sectorMap, minStocks = 2) {
  const groups = new Map();
  let uncovered = 0;
  for (const q of quotes || []) {
    if (!isNum(q?.changePct)) continue;
    const sector = sectorMap[q.symbol];
    if (!sector) {
      uncovered++;
      continue;
    }
    const g = groups.get(sector) || { sum: 0, count: 0 };
    g.sum += q.changePct;
    g.count++;
    groups.set(sector, g);
  }

  const sectors = [...groups.entries()]
    .filter(([, g]) => g.count >= minStocks)
    .map(([sector, g]) => ({ sector, avgChangePct: g.sum / g.count, count: g.count }))
    .sort((a, b) => b.avgChangePct - a.avgChangePct || a.sector.localeCompare(b.sector));

  return {
    sectors,
    leading: sectors.length >= 2 ? sectors[0] : null,
    lagging: sectors.length >= 2 ? sectors[sectors.length - 1] : null,
    uncovered,
  };
}

/**
 * Dot-plot layout: x is the position (0-100) along a -3%..+3% axis, level is the stack height
 * within a 0.25% bin (symbol order, so the layout is deterministic). `pinned` marks moves that
 * were beyond the axis and drawn at its edge.
 */
export function binDots(quotes) {
  const valid = (quotes || []).filter((q) => isNum(q?.changePct)).sort((a, b) => a.symbol.localeCompare(b.symbol));
  const levels = new Map();
  return valid.map((q) => {
    const clamped = Math.min(DOT_AXIS_LIMIT, Math.max(-DOT_AXIS_LIMIT, q.changePct));
    const bin = Math.round(clamped / DOT_BIN);
    const level = levels.get(bin) || 0;
    levels.set(bin, level + 1);
    return {
      symbol: q.symbol,
      name: q.name,
      changePct: q.changePct,
      x: ((clamped + DOT_AXIS_LIMIT) / (2 * DOT_AXIS_LIMIT)) * 100,
      level,
      pinned: clamped !== q.changePct,
    };
  });
}
