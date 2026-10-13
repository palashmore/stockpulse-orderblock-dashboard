// Bullish and Bearish boards (pure).
//
// Ranking is about the DAY'S MOVE only. For each stock:
//     move     = price now - today's open                      (signed, in rupees)
//     strength = move / average daily range over the last N days   (N is configurable)
// "Average daily range" is the mean true range of the last N completed daily bars, so strength says how many "typical days"
// of movement the stock has made since the open, in one direction. The same formula is applied to every stock.
//
// A strong move is NOT a trade signal. Confirmation (volume, liquidity, trend/VWAP, volatility) and setup validity
// (a still-valid swing setup in the same direction with acceptable risk/reward) are computed separately and shown beside
// the rank. A stock can top a board while its trading status is WAIT or NO_TRADE. When the data is not current (market
// closed, stale) every status is REVIEW: last session's ranking is history, not an opportunity.
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export const BOARDS_KEY = 'stockpulse.boards.v1';
export const WINDOWS = [5, 10, 14, 20, 30, 60];
export const HIDE_KEYS = ['volume', 'liquidity', 'trend', 'volatility', 'setup'];

export const DEFAULT_BOARD_CONFIG = {
  window: 14, // days in the average daily range
  minStrength: 0.5, // least strength (in average daily ranges) to be listed at all
  minRelVol: 1, // volume confirmation: today's volume vs the 3-month average
  minTurnoverCr: 5, // liquidity: 20-day average turnover, in rupees crore
  maxAtrPct: 6, // volatility: ATR(14) as % of price must not exceed this
  minRR: 1.5, // risk: a valid setup needs at least this reward-to-risk
  hide: { volume: false, liquidity: false, trend: false, volatility: false, setup: false }, // hide rows failing these
};

const clampNum = (v, lo, hi, fallback) => (isNum(v) && v >= lo && v <= hi ? v : fallback);

export function validateBoardConfig(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULT_BOARD_CONFIG;
  const hide = {};
  for (const k of HIDE_KEYS) hide[k] = typeof r.hide?.[k] === 'boolean' ? r.hide[k] : d.hide[k];
  return {
    window: WINDOWS.includes(r.window) ? r.window : d.window,
    minStrength: clampNum(r.minStrength, 0.1, 5, d.minStrength),
    minRelVol: clampNum(r.minRelVol, 0, 10, d.minRelVol),
    minTurnoverCr: clampNum(r.minTurnoverCr, 0, 100000, d.minTurnoverCr),
    maxAtrPct: clampNum(r.maxAtrPct, 0.5, 50, d.maxAtrPct),
    minRR: clampNum(r.minRR, 0.5, 10, d.minRR),
    hide,
  };
}

export function loadBoardConfig(storage) {
  try {
    return validateBoardConfig(JSON.parse(storage.getItem(BOARDS_KEY)));
  } catch {
    return validateBoardConfig(null);
  }
}

export function saveBoardConfig(config, storage) {
  try {
    storage.setItem(BOARDS_KEY, JSON.stringify(validateBoardConfig(config)));
    return true;
  } catch {
    return false;
  }
}

/** Mean of the last `window` daily true ranges, or null when fewer are available (no guessing from a short history). */
export function avgRange(ranges, window) {
  if (!Array.isArray(ranges) || ranges.length < window) return null;
  const recent = ranges.slice(-window);
  if (!recent.every((v) => isNum(v) && v >= 0)) return null;
  const mean = recent.reduce((s, v) => s + v, 0) / window;
  return mean > 0 ? mean : null;
}

/**
 * Directional strength of one row. `clean` is how much of today's range the move covers (1 = closed at the extreme in the
 * direction of the move, 0 = went nowhere), a hint of whether the move was one-directional or a round trip.
 */
export function directionalMove(row, range) {
  if (!isNum(row?.open) || !(row.open > 0) || !isNum(row.price) || !isNum(range) || !(range > 0)) return null;
  const move = row.price - row.open;
  const dayRange = isNum(row.high) && isNum(row.low) ? row.high - row.low : null;
  return {
    move,
    movePct: (move / row.open) * 100,
    strength: Math.abs(move) / range,
    direction: move > 0 ? 'BULLISH' : move < 0 ? 'BEARISH' : null,
    clean: dayRange > 0 ? Math.min(1, Math.abs(move) / dayRange) : null,
  };
}

const sameSide = (direction, side) => (direction === 'BULLISH' ? side === 'BUY' : side === 'SELL_SHORT');

/** Confirmation checks for one stock in one direction. Each is { pass, detail }; pass is null when the data is missing. */
export function confirmations(row, metrics, direction, cfg) {
  const up = direction === 'BULLISH';
  const volume = isNum(row.relVolume)
    ? { pass: row.relVolume >= cfg.minRelVol, detail: `${row.relVolume.toFixed(1)}x average (needs ${cfg.minRelVol}x)` }
    : { pass: null, detail: 'no volume figure' };
  const liquidity = isNum(metrics.turnoverCr)
    ? { pass: metrics.turnoverCr >= cfg.minTurnoverCr, detail: `₹${metrics.turnoverCr.toFixed(1)} Cr a day (needs ₹${cfg.minTurnoverCr} Cr)` }
    : { pass: null, detail: 'no turnover figure' };

  const trendOk = metrics.trend === (up ? 'up' : 'down');
  const vwapKnown = typeof metrics.aboveVwap === 'boolean';
  const vwapOk = !vwapKnown || metrics.aboveVwap === up;
  const trend = {
    pass: trendOk && vwapOk,
    detail: `daily trend ${metrics.trend}${vwapKnown ? `, price ${metrics.aboveVwap ? 'above' : 'below'} 20-day VWAP` : ''}`,
  };
  const volatility = isNum(metrics.atrPct)
    ? { pass: metrics.atrPct <= cfg.maxAtrPct, detail: `ATR ${metrics.atrPct.toFixed(1)}% of price (limit ${cfg.maxAtrPct}%)` }
    : { pass: null, detail: 'no volatility figure' };

  const swing = metrics.swing;
  const valid = Boolean(swing && swing.actionable && sameSide(direction, swing.side));
  const rrOk = valid && isNum(swing.rr) && swing.rr >= cfg.minRR;
  const setup = valid
    ? { pass: rrOk, detail: rrOk ? `valid ${swing.strategy} setup, ${swing.rr}R` : `valid ${swing.strategy} setup but only ${isNum(swing.rr) ? swing.rr : '?'}R (needs ${cfg.minRR}R)` }
    : { pass: false, detail: swing && swing.actionable ? `the valid setup points the other way (${swing.side === 'BUY' ? 'long' : 'short'})` : 'no valid swing setup' };
  return { volume, liquidity, trend, volatility, setup };
}

/**
 * SETUP: a valid same-direction setup with acceptable risk/reward and every confirmation passing.
 * WAIT: worth watching: a setup that is not fully confirmed, or no setup yet while trend, liquidity and volatility are fine.
 * NO_TRADE: liquidity or volatility fails, the trend disagrees with no setup, or a valid setup points the other way.
 * REVIEW: the data is not current; nothing here is a live opportunity.
 */
export function tradeStatus(checks, direction, metrics, fresh) {
  if (!fresh) return { code: 'REVIEW', reasons: ['Data is not current (market closed or stale): last session, for review only'] };
  const reasons = [];
  const fail = (key) => checks[key].pass === false;
  const unknown = (key) => checks[key].pass === null;
  const opposite = metrics.swing && metrics.swing.actionable && !sameSide(direction, metrics.swing.side);

  if (opposite) return { code: 'NO_TRADE', reasons: [checks.setup.detail] };
  if (fail('liquidity')) reasons.push(`Liquidity: ${checks.liquidity.detail}`);
  if (fail('volatility')) reasons.push(`Volatility: ${checks.volatility.detail}`);
  if (reasons.length > 0) return { code: 'NO_TRADE', reasons };

  const allPass = ['volume', 'liquidity', 'trend', 'volatility', 'setup'].every((k) => checks[k].pass === true);
  if (allPass) return { code: 'SETUP', reasons: [checks.setup.detail, 'volume, liquidity, trend and volatility confirm'] };

  for (const k of ['volume', 'trend', 'setup']) if (fail(k)) reasons.push(`${k[0].toUpperCase()}${k.slice(1)}: ${checks[k].detail}`);
  for (const k of ['volume', 'liquidity', 'volatility']) if (unknown(k)) reasons.push(`${k[0].toUpperCase()}${k.slice(1)}: ${checks[k].detail}`);
  if (!checks.trend.pass && !checks.setup.pass) return { code: 'NO_TRADE', reasons };
  return { code: 'WAIT', reasons };
}

/**
 * Build both boards.
 * @param rows            priced rows with open/high/low (see buildRows)
 * @param metricsBySymbol Map symbol -> screenerMetrics (daily history); stocks without it cannot be ranked
 * @param cfg             board configuration
 * @param fresh           whether the quotes are current (LIVE or DELAYED, last refresh succeeded)
 * @returns { bullish, bearish, counts, excluded }
 */
export function buildBoards(rows, metricsBySymbol, cfg, fresh) {
  const entries = [];
  const excluded = { noOpen: 0, noHistory: 0, weak: 0, flat: 0, hidden: 0 };
  for (const row of rows) {
    const metrics = metricsBySymbol.get(row.symbol);
    if (!metrics) { excluded.noHistory++; continue; }
    const range = avgRange(metrics.ranges, cfg.window);
    if (range === null) { excluded.noHistory++; continue; }
    const dm = directionalMove(row, range);
    if (!dm) { excluded.noOpen++; continue; }
    if (!dm.direction) { excluded.flat++; continue; }
    if (dm.strength < cfg.minStrength) { excluded.weak++; continue; }
    const checks = confirmations(row, metrics, dm.direction, cfg);
    const status = tradeStatus(checks, dm.direction, metrics, fresh);
    const failing = HIDE_KEYS.filter((k) => cfg.hide[k] && checks[k].pass !== true);
    if (failing.length > 0) { excluded.hidden++; continue; }
    entries.push({
      symbol: row.symbol,
      name: row.name,
      sector: row.sector,
      price: row.price,
      changePct: row.changePct,
      open: row.open,
      movePct: dm.movePct,
      strength: dm.strength,
      clean: dm.clean,
      direction: dm.direction,
      relVolume: row.relVolume,
      turnoverCr: isNum(metrics.turnoverCr) ? metrics.turnoverCr : null,
      trend: metrics.trend,
      aboveVwap: typeof metrics.aboveVwap === 'boolean' ? metrics.aboveVwap : null,
      checks,
      status: status.code,
      reasons: status.reasons,
    });
  }
  const byStrength = (a, b) => b.strength - a.strength || a.symbol.localeCompare(b.symbol);
  const bullish = entries.filter((e) => e.direction === 'BULLISH').sort(byStrength);
  const bearish = entries.filter((e) => e.direction === 'BEARISH').sort(byStrength);
  return { bullish, bearish, counts: { bullish: bullish.length, bearish: bearish.length }, excluded };
}

export const STATUS_STYLE = {
  SETUP: { label: 'SETUP', color: '#00e676', hint: 'A valid same-direction swing setup with acceptable risk/reward, and volume, liquidity, trend and volatility all confirm' },
  WAIT: { label: 'WAIT', color: '#ffd600', hint: 'Strong move, but not fully confirmed or no valid setup yet' },
  NO_TRADE: { label: 'NO TRADE', color: '#ff1744', hint: 'Liquidity or volatility fails, the trend disagrees, or a valid setup points the other way' },
  REVIEW: { label: 'REVIEW', color: '#94a3b8', hint: 'Data is not current: last session for review only, not a live opportunity' },
};
