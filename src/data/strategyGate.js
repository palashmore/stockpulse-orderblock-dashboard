// Rules that decide whether a signal may be treated as actionable right now. Separate from the
// signal engines so that stale data, a closed market or breached risk limits can only ever
// switch actions OFF: they never create or alter a signal.

const BAD_STATUSES = new Set(['STALE', 'UNAVAILABLE', 'SIMULATED']);
const IST_OFFSET_S = 19800;

/**
 * Drop the newest bar when it may still be forming, so signals are only evaluated on completed bars.
 * Intraday candle times are IST-shifted epoch seconds, so the bar began at (time - 19800).
 */
export function dropFormingBar(candles, intervalMs, nowMs) {
  const last = candles?.[candles.length - 1];
  if (!last || typeof last.time !== 'number') return candles || [];
  const startMs = (last.time - IST_OFFSET_S) * 1000;
  return nowMs - startMs < intervalMs ? candles.slice(0, -1) : candles;
}

/**
 * Today's simulated activity for the intraday risk panel: trades taken and R lost on the day of
 * the newest candle. `trades` come from the backtester (simulated, not broker data).
 */
export function dayRisk(trades, candles, config) {
  const last = candles?.[candles.length - 1];
  if (!last || typeof last.time !== 'number') return { trades: 0, netR: 0, net: 0, tradesLeft: config.maxTradesPerDay, lossRLeft: config.maxDailyLossR };
  const day = Math.floor(last.time / 86400);
  const today = trades.filter((t) => Math.floor(t.entryTime / 86400) === day);
  const netR = today.reduce((s, t) => s + t.rMultiple, 0);
  return {
    trades: today.length,
    netR,
    net: today.reduce((s, t) => s + t.net, 0),
    tradesLeft: Math.max(0, config.maxTradesPerDay - today.length),
    lossRLeft: Math.max(0, config.maxDailyLossR + Math.min(0, netR)),
  };
}

/**
 * Whether new entries are allowed. Returns { actionable, reasons } where reasons explain every block.
 *   mode        'intraday' | 'swing'
 *   dataStatus  status label of the candles in use
 *   marketOpen  exchange open now (from the market-state endpoint), or null when unknown
 *   risk        dayRisk() result (intraday only)
 */
export function entryGate({ mode, dataStatus, marketOpen, risk, config }) {
  const reasons = [];
  if (!dataStatus || BAD_STATUSES.has(dataStatus)) reasons.push(`Data is ${dataStatus ? dataStatus.toLowerCase() : 'unavailable'}, so no new entries are offered`);
  if (mode === 'intraday') {
    if (marketOpen === false) reasons.push('The market is closed: intraday entries are only valid during the session');
    if (marketOpen === null || marketOpen === undefined) reasons.push('Market state is unknown, so intraday entries are not offered');
    if (risk && risk.tradesLeft <= 0) reasons.push(`Maximum trades for the day reached (${config.maxTradesPerDay})`);
    if (risk && risk.lossRLeft <= 0) reasons.push(`Daily loss limit reached (${config.maxDailyLossR}R)`);
  }
  return { actionable: reasons.length === 0, reasons };
}

/** Position size for a signal from the risk budget, capped by capital (and leverage). Null when it rounds to zero. */
export function positionSize(signal, config) {
  const risk = Math.abs(signal.entry - signal.stop);
  if (!(risk > 0)) return null;
  const byRisk = Math.floor((config.capital * config.riskPct) / 100 / risk);
  const byCapital = Math.floor((config.capital * (config.leverage ?? 1)) / signal.entry);
  const qty = Math.min(byRisk, byCapital);
  if (qty < 1) return null;
  return { qty, outlay: qty * signal.entry, riskAmount: qty * risk, cappedByCapital: byCapital < byRisk };
}
