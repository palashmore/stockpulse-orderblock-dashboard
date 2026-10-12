/**
 * Bullish / Bearish ranking over a quote universe (Nifty 50 here).
 *
 * Inputs per quote: price, changePct, high, low, volume, avgVolume (from /api/nifty50).
 * Everything is derived from the quote itself; nothing is random or estimated.
 *
 *   move     = clamp(changePct / 3, -1, 1)               day % change, saturating at +-3%
 *   position = 2 * (price - low) / (high - low) - 1      where price sits in today's range
 *   score    = 0.6 * move + 0.4 * position               (move alone if the range is unknown)
 *   strength = round(|score| * 100)
 *
 * |score| < MIN_SCORE is CHOPPY and kept off the boards. Relative volume
 * (volume / 3-month average daily volume) is shown but NOT part of the score, because
 * intraday volume is compared with a full-day average and would bias early-session ranks.
 * This is a descriptive ranking of today's move, not a prediction.
 */
export const MIN_SCORE = 0.25;
export const BOARD_SIZE = 10;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Score one quote, or null when it lacks the fields needed to rank it. */
export function scoreQuote(q) {
  if (!q || !isNum(q.price) || !isNum(q.changePct)) return null;

  const move = clamp(q.changePct / 3, -1, 1);
  const range = q.high - q.low;
  const hasRange = isNum(q.high) && isNum(q.low) && range > 0;
  const position = hasRange ? clamp((2 * (q.price - q.low)) / range - 1, -1, 1) : null;
  const score = position === null ? move : 0.6 * move + 0.4 * position;

  const direction = score >= MIN_SCORE ? 'BULLISH' : score <= -MIN_SCORE ? 'BEARISH' : 'CHOPPY';
  return {
    symbol: q.symbol,
    name: q.name,
    price: q.price,
    changePct: q.changePct,
    score,
    strength: Math.round(Math.abs(score) * 100),
    direction,
    relVolume: isNum(q.volume) && q.avgVolume > 0 ? q.volume / q.avgVolume : null,
  };
}

/** Split a quote list into ranked bullish/bearish boards plus counts. Ties break by symbol. */
export function rankStocks(quotes, size = BOARD_SIZE) {
  const scored = [];
  let unrankable = 0;
  for (const q of quotes || []) {
    const s = scoreQuote(q);
    if (s) scored.push(s);
    else unrankable++;
  }

  const byStrength = (a, b) => b.strength - a.strength || a.symbol.localeCompare(b.symbol);
  const bullishAll = scored.filter((s) => s.direction === 'BULLISH').sort(byStrength);
  const bearishAll = scored.filter((s) => s.direction === 'BEARISH').sort(byStrength);

  return {
    bullish: bullishAll.slice(0, size),
    bearish: bearishAll.slice(0, size),
    counts: {
      bullish: bullishAll.length,
      bearish: bearishAll.length,
      choppy: scored.length - bullishAll.length - bearishAll.length,
      unrankable,
    },
  };
}

/**
 * Key levels for one stock from daily candles and detected order blocks:
 * nearest unmitigated demand block below price, nearest unmitigated supply block above it,
 * and the 20-candle high/low as resistance/support. Any level that cannot be derived is null.
 */
export function zoneLevels(candles, orderBlocks, price) {
  if (!candles || candles.length === 0 || !isNum(price)) return null;

  const recent = candles.slice(-20);
  const resistance = Math.max(...recent.map((c) => c.high));
  const support = Math.min(...recent.map((c) => c.low));

  const active = (orderBlocks || []).filter((b) => !b.mitigated);
  const demand = active
    .filter((b) => b.type === 'bullish' && b.high <= price)
    .sort((a, b) => b.high - a.high)[0] || null;
  const supply = active
    .filter((b) => b.type === 'bearish' && b.low >= price)
    .sort((a, b) => a.low - b.low)[0] || null;

  return {
    resistance: resistance >= price ? resistance : null,
    support: support <= price ? support : null,
    demandZone: demand && { low: demand.low, high: demand.high, time: demand.time },
    supplyZone: supply && { low: supply.low, high: supply.high, time: supply.time },
  };
}
