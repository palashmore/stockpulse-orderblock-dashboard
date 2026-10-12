const SYMBOL_PATTERN = /^[A-Z0-9&.-]{1,20}$/;
const RANGES = new Set(['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', 'ytd', 'max']);
const INTERVALS = new Set(['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h', '1d', '5d', '1wk', '1mo', '3mo']);

export function isValidSymbol(symbol) {
  return SYMBOL_PATTERN.test(symbol);
}

export function isValidRange(range) {
  return RANGES.has(range);
}

export function isValidInterval(interval) {
  return INTERVALS.has(interval);
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Build candles from Yahoo's parallel arrays, dropping anything that cannot be trusted:
 * null/non-numeric OHLC, impossible OHLC relationships, and duplicate or out-of-order days.
 * Candle dates are calendar dates in the exchange timezone (`gmtOffsetSec`, default IST),
 * not UTC. Missing volume is null, never an invented 0.
 */
const IST_OFFSET_SEC = 19800;

export function normalizeCandles(timestamps, ohlcv, adjClose = [], gmtOffsetSec = IST_OFFSET_SEC) {
  const candles = [];
  let dropped = 0;
  let lastTime = '';

  for (let i = 0; i < timestamps.length; i++) {
    const open = ohlcv.open?.[i];
    const high = ohlcv.high?.[i];
    const low = ohlcv.low?.[i];
    const close = ohlcv.close?.[i];
    const volume = ohlcv.volume?.[i];

    const valid =
      isNum(open) && isNum(high) && isNum(low) && isNum(close) &&
      low > 0 && high >= low && high >= Math.max(open, close) && low <= Math.min(open, close);
    if (!valid) {
      dropped++;
      continue;
    }

    const offset = Number.isFinite(gmtOffsetSec) ? gmtOffsetSec : IST_OFFSET_SEC;
    const time = new Date((timestamps[i] + offset) * 1000).toISOString().split('T')[0];
    if (time < lastTime) {
      dropped++;
      continue;
    }

    const candle = {
      time,
      open: round2(open),
      high: round2(high),
      low: round2(low),
      close: round2(close),
      volume: isNum(volume) ? volume : null,
      adjClose: isNum(adjClose[i]) ? round2(adjClose[i]) : null,
    };

    if (time === lastTime) {
      candles[candles.length - 1] = candle; // duplicate day: keep the later observation
      dropped++;
    } else {
      candles.push(candle);
    }
    lastTime = time;
  }

  return { candles, dropped };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
