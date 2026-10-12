// Pure builders for the "Stock Lists" screen: movers, order-block zones, swing and intraday setups.
// Each list is a rule-based view of data already loaded. A list entry means a rule matched; it is
// not a recommendation to trade, and an empty list is a normal result.
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * The nearest still-valid (unmitigated) demand and supply order blocks around `price`.
 * Demand = bullish block with its bottom at or below the price; supply = bearish block with its top
 * at or above it. `distancePct` is 0 when price is inside the zone, otherwise the gap to the nearest
 * edge as a percent of price. Mitigated blocks (price later closed through them) are never returned.
 */
export function nearestBlocks(blocks, price, barsInSeries = null) {
  let demand = null;
  let supply = null;
  for (const b of blocks || []) {
    if (b.mitigated || !isNum(b.low) || !isNum(b.high) || !(price > 0)) continue;
    const age = barsInSeries !== null && isNum(b.index) ? barsInSeries - 1 - b.index : null;
    if (b.type === 'bullish' && b.low <= price) {
      const distancePct = price <= b.high ? 0 : ((price - b.high) / price) * 100;
      if (!demand || distancePct < demand.distancePct || (distancePct === demand.distancePct && b.strength > demand.strength)) {
        demand = { low: b.low, high: b.high, time: b.time, strength: b.strength, tested: Boolean(b.tested), volumeConfirm: Boolean(b.volumeConfirm), distancePct, inside: distancePct === 0, ageBars: age };
      }
    } else if (b.type === 'bearish' && b.high >= price) {
      const distancePct = price >= b.low ? 0 : ((b.low - price) / price) * 100;
      if (!supply || distancePct < supply.distancePct || (distancePct === supply.distancePct && b.strength > supply.strength)) {
        supply = { low: b.low, high: b.high, time: b.time, strength: b.strength, tested: Boolean(b.tested), volumeConfirm: Boolean(b.volumeConfirm), distancePct, inside: distancePct === 0, ageBars: age };
      }
    }
  }
  return { demand, supply };
}

/** Gainers, losers and volume leaders from batch quotes. Stocks without a price or change are left out. */
export function moversFromQuotes(quotes, limit = 15) {
  const valid = (quotes || []).filter((q) => isNum(q.price) && isNum(q.changePct));
  const withVol = valid.map((q) => ({ ...q, relVolume: isNum(q.volume) && q.avgVolume > 0 ? q.volume / q.avgVolume : null }));
  const bySym = (a, b) => a.symbol.localeCompare(b.symbol);
  return {
    gainers: withVol.filter((q) => q.changePct > 0).sort((a, b) => b.changePct - a.changePct || bySym(a, b)).slice(0, limit),
    losers: withVol.filter((q) => q.changePct < 0).sort((a, b) => a.changePct - b.changePct || bySym(a, b)).slice(0, limit),
    // Volume leaders by traded value (price x volume) so a cheap stock with huge share counts does not dominate
    volume: withVol.filter((q) => isNum(q.volume) && q.volume > 0).sort((a, b) => b.price * b.volume - a.price * a.volume || bySym(a, b)).slice(0, limit),
    relVolume: withVol.filter((q) => isNum(q.relVolume)).sort((a, b) => b.relVolume - a.relVolume || bySym(a, b)).slice(0, limit),
    counts: { total: (quotes || []).length, ranked: valid.length, up: valid.filter((q) => q.changePct > 0).length, down: valid.filter((q) => q.changePct < 0).length },
  };
}

/**
 * Order-block list from screener rows. side 'demand' lists stocks with a valid demand zone within
 * `maxDistancePct` of the price; 'supply' the same for supply zones. Sorted by proximity, then strength.
 */
export function orderBlockList(rows, side, maxDistancePct = 2) {
  return rows
    .filter((r) => r.metrics?.orderBlocks?.[side] && r.metrics.orderBlocks[side].distancePct <= maxDistancePct)
    .map((r) => ({ symbol: r.symbol, name: r.name, sector: r.sector, indices: r.indices, price: r.metrics.price, changePct: r.metrics.changePct, trend: r.metrics.trend, zone: r.metrics.orderBlocks[side] }))
    .sort((a, b) => a.zone.distancePct - b.zone.distancePct || b.zone.strength - a.zone.strength || a.symbol.localeCompare(b.symbol));
}

/**
 * Stocks whose swing rules matched within the last few daily bars, newest first. By default only
 * setups that are still valid (not stopped, past a target, stretched or expired); pass
 * { actionable: false } for the ones that are no longer valid.
 */
export function swingSetupList(rows, { actionable = true } = {}) {
  return rows
    .filter((r) => r.metrics?.swing && Boolean(r.metrics.swing.actionable) === actionable)
    .map((r) => ({ symbol: r.symbol, name: r.name, sector: r.sector, indices: r.indices, price: r.metrics.price, changePct: r.metrics.changePct, adx: r.metrics.adx, rsi: r.metrics.rsi, signal: r.metrics.swing }))
    .sort((a, b) => a.signal.ageBars - b.signal.ageBars || a.symbol.localeCompare(b.symbol));
}

/** Stocks in a strong, aligned trend (ADX at least `minAdx`, +DI/-DI agreeing with the EMA order), strongest first. */
export function trendingList(rows, direction, minAdx = 25) {
  return rows
    .filter((r) => r.metrics && isNum(r.metrics.adx) && r.metrics.adx >= minAdx && r.metrics.trend === direction && r.metrics.diBias === direction)
    .map((r) => ({ symbol: r.symbol, name: r.name, sector: r.sector, indices: r.indices, price: r.metrics.price, changePct: r.metrics.changePct, adx: r.metrics.adx, rsi: r.metrics.rsi, from20dHighPct: r.metrics.from20dHighPct, vsEma20Pct: r.metrics.vsEma20Pct }))
    .sort((a, b) => b.adx - a.adx || a.symbol.localeCompare(b.symbol));
}

/**
 * Intraday list from per-stock signal scans, newest first. `actionable` true keeps only signals that
 * are still valid (see signalLifecycle); false keeps the rest (stopped, past a target, expired,
 * stretched, or from an earlier session), for review.
 */
export function intradayList(scans, { actionable = true } = {}) {
  return scans
    .filter((s) => s.latest && Boolean(s.latest.lifecycle?.actionable) === actionable)
    .sort((a, b) => a.latest.ageBars - b.latest.ageBars || a.symbol.localeCompare(b.symbol));
}
