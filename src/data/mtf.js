import { emaOfCloses, rsi, macd, adx } from './indicators';

// Trend reading per timeframe for the multi-timeframe panel. Each reading uses completed candles only
// (the caller drops a forming bar and a partial daily/weekly candle), and says "unknown" when there
// is too little history, never a guessed direction.
export const MTF_FRAMES = [
  { id: '5m', label: '5 min', range: '1mo', interval: '5m', intraday: true, intervalMs: 300000 },
  { id: '15m', label: '15 min', range: '1mo', interval: '15m', intraday: true, intervalMs: 900000 },
  { id: '1H', label: '1 hour', range: '3mo', interval: '60m', intraday: true, intervalMs: 3600000 },
  { id: 'D', label: 'Daily', range: '1y', interval: '1d', intraday: false, intervalMs: 86400000 },
  { id: 'W', label: 'Weekly', range: '2y', interval: '1wk', intraday: false, intervalMs: 604800000 },
];

const last = (a) => a[a.length - 1];
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
export const MIN_CANDLES = 50;

/** Trend from price against the 20- and 50-period EMAs: up (close > EMA20 > EMA50), down (the reverse), else mixed. */
export function timeframeTrend(candles) {
  if (!candles || candles.length < MIN_CANDLES) return { state: 'unknown', candles: candles ? candles.length : 0 };
  const close = last(candles).close;
  const e20 = last(emaOfCloses(candles, 20));
  const e50 = last(emaOfCloses(candles, 50));
  const r = last(rsi(candles, 14));
  const m = macd(candles);
  const a = adx(candles, 14);
  let state = 'mixed';
  if (close > e20 && e20 > e50) state = 'up';
  else if (close < e20 && e20 < e50) state = 'down';
  return {
    state,
    candles: candles.length,
    close,
    ema20: e20,
    ema50: e50,
    rsi: isNum(r) ? r : null,
    macdHist: isNum(last(m.hist)) ? last(m.hist) : null,
    adx: isNum(last(a.adx)) ? last(a.adx) : null,
    asOf: last(candles).time,
  };
}

/** How many timeframes agree. Frames with unknown trend are counted separately and never as agreement. */
export function alignment(readings) {
  const count = (s) => readings.filter((r) => r.state === s).length;
  const up = count('up');
  const down = count('down');
  const mixed = count('mixed');
  const unknown = count('unknown');
  const known = readings.length - unknown;
  let label = 'No timeframe could be read';
  if (known > 0) {
    if (up === known) label = `All ${known} readable timeframes are up`;
    else if (down === known) label = `All ${known} readable timeframes are down`;
    else if (up > down && up >= mixed) label = `${up} of ${known} readable timeframes are up`;
    else if (down > up && down >= mixed) label = `${down} of ${known} readable timeframes are down`;
    else label = `Timeframes disagree (${up} up, ${down} down, ${mixed} mixed)`;
  }
  return { up, down, mixed, unknown, total: readings.length, label };
}
