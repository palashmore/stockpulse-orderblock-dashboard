// Chart timeframes and the provider request each one maps to.
// `aggregate` builds the timeframe from smaller provider bars (Yahoo has no 4-hour interval).
export const TIMEFRAMES = [
  { id: '1m', range: '5d', interval: '1m', intraday: true },
  { id: '5m', range: '1mo', interval: '5m', intraday: true },
  { id: '15m', range: '1mo', interval: '15m', intraday: true },
  { id: '1H', range: '3mo', interval: '60m', intraday: true },
  { id: '4H', range: '6mo', interval: '60m', intraday: true, aggregate: 4 },
  { id: 'D', range: '6mo', interval: '1d', intraday: false },
  { id: 'W', range: '2y', interval: '1wk', intraday: false },
];

export const DEFAULT_TIMEFRAME = 'D';

export function getTimeframe(id) {
  return TIMEFRAMES.find((t) => t.id === id) || TIMEFRAMES.find((t) => t.id === DEFAULT_TIMEFRAME);
}

const SECONDS_PER_DAY = 86400;

/**
 * Combine consecutive intraday bars into larger ones, `size` bars at a time, restarting at each
 * trading day so a bucket never spans two sessions. Candle times are exchange-shifted epoch
 * seconds, so the day is floor(time / 86400). The last bucket of a day may hold fewer bars.
 * Volume is the sum of the bars that have volume, or null when none do.
 */
export function aggregateCandles(candles, size) {
  if (!candles || size <= 1) return candles || [];

  const out = [];
  let day = null;
  let count = 0;
  for (const c of candles) {
    const candleDay = Math.floor(c.time / SECONDS_PER_DAY);
    if (candleDay !== day || count === size) {
      out.push({ ...c, volume: Number.isFinite(c.volume) ? c.volume : null });
      day = candleDay;
      count = 1;
      continue;
    }
    const bucket = out[out.length - 1];
    bucket.high = Math.max(bucket.high, c.high);
    bucket.low = Math.min(bucket.low, c.low);
    bucket.close = c.close;
    if (Number.isFinite(c.volume)) bucket.volume = (bucket.volume ?? 0) + c.volume;
    count++;
  }
  return out;
}
