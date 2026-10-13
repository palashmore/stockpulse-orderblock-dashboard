// Indicator library. Pure functions over candle arrays: { time, open, high, low, close, volume }.
//
// Conventions
// - Every series has the same length as the input and is aligned to it. Positions where the value
//   is not yet defined (not enough history) are null, never 0 and never a guess.
// - Everything is causal: the value at index i uses candles 0..i only, so a backtest that reads
//   position i cannot see the future. Swing pivots need `right` bars after the pivot to be confirmed;
//   they are reported at the bar where they become confirmed (`confirmedAt`), not where they occurred.
// - Averaging follows the standard definitions: SMA is the plain mean; EMA is seeded with the SMA of
//   the first `period` values and uses alpha = 2 / (period + 1); RSI, ATR and ADX use Wilder's
//   smoothing (seeded with a simple mean / sum over the first `period` values).

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const nulls = (n) => new Array(n).fill(null);

/** Simple moving average of a numeric array (nulls in the input make the window undefined). */
export function sma(values, period) {
  const out = nulls(values.length);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < values.length; i++) {
    if (isNum(values[i])) { sum += values[i]; count++; } else { sum = 0; count = 0; continue; }
    if (count > period) sum -= values[i - period];
    if (count >= period) out[i] = sum / period;
  }
  return out;
}

/** Exponential moving average, seeded with the SMA of the first `period` defined values. */
export function ema(values, period) {
  const out = nulls(values.length);
  const alpha = 2 / (period + 1);
  let prev = null;
  let seed = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!isNum(v)) { prev = null; seed = []; continue; }
    if (prev === null) {
      seed.push(v);
      if (seed.length === period) {
        prev = seed.reduce((s, x) => s + x, 0) / period;
        out[i] = prev;
      }
    } else {
      prev = alpha * v + (1 - alpha) * prev;
      out[i] = prev;
    }
  }
  return out;
}

const closes = (c) => c.map((x) => x.close);

export const emaOfCloses = (candles, period) => ema(closes(candles), period);
export const smaOfCloses = (candles, period) => sma(closes(candles), period);

/** Wilder's RSI. First value at index `period`. */
export function rsi(candles, period = 14) {
  const out = nulls(candles.length);
  if (candles.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = candles[i].close - candles[i - 1].close;
    if (d > 0) gain += d; else loss -= d;
  }
  gain /= period;
  loss /= period;
  const value = () => (loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss));
  out[period] = value();
  for (let i = period + 1; i < candles.length; i++) {
    const d = candles[i].close - candles[i - 1].close;
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = value();
  }
  return out;
}

export function trueRange(candles, i) {
  const c = candles[i];
  if (i === 0) return c.high - c.low;
  const pc = candles[i - 1].close;
  return Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
}

/** Wilder's ATR. First value at index period - 1 (mean of the first `period` true ranges). */
export function atr(candles, period = 14) {
  const out = nulls(candles.length);
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    const tr = trueRange(candles, i);
    if (i < period) {
      sum += tr;
      if (i === period - 1) out[i] = sum / period;
    } else {
      out[i] = (out[i - 1] * (period - 1) + tr) / period;
    }
  }
  return out;
}

/** MACD line, signal line and histogram (defaults 12, 26, 9). */
export function macd(candles, fast = 12, slow = 26, signalPeriod = 9) {
  const f = ema(closes(candles), fast);
  const s = ema(closes(candles), slow);
  const line = candles.map((_, i) => (isNum(f[i]) && isNum(s[i]) ? f[i] - s[i] : null));
  const signal = ema(line, signalPeriod);
  const hist = line.map((v, i) => (isNum(v) && isNum(signal[i]) ? v - signal[i] : null));
  return { macd: line, signal, hist };
}

/** Wilder's ADX with +DI / -DI. First ADX value at index 2 * period - 1. */
export function adx(candles, period = 14) {
  const n = candles.length;
  const out = { adx: nulls(n), plusDI: nulls(n), minusDI: nulls(n) };
  if (n <= period) return out;

  let trS = 0;
  let plusS = 0;
  let minusS = 0;
  const dx = nulls(n);
  for (let i = 1; i < n; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    const plus = up > down && up > 0 ? up : 0;
    const minus = down > up && down > 0 ? down : 0;
    const tr = trueRange(candles, i);
    if (i <= period) {
      trS += tr; plusS += plus; minusS += minus;
      if (i < period) continue;
    } else {
      trS = trS - trS / period + tr;
      plusS = plusS - plusS / period + plus;
      minusS = minusS - minusS / period + minus;
    }
    const pdi = trS === 0 ? 0 : (100 * plusS) / trS;
    const mdi = trS === 0 ? 0 : (100 * minusS) / trS;
    out.plusDI[i] = pdi;
    out.minusDI[i] = mdi;
    dx[i] = pdi + mdi === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / (pdi + mdi);
  }
  let seedSum = 0;
  let seedCount = 0;
  for (let i = period; i < n; i++) {
    if (!isNum(dx[i])) continue;
    if (seedCount < period) {
      seedSum += dx[i];
      seedCount++;
      if (seedCount === period) out.adx[i] = seedSum / period;
    } else {
      out.adx[i] = (out.adx[i - 1] * (period - 1) + dx[i]) / period;
    }
  }
  return out;
}

const dayOf = (candle) => (typeof candle.time === 'number' ? Math.floor(candle.time / 86400) : candle.time);

/**
 * VWAP from typical price (H+L+C)/3. Intraday candles (numeric epoch-second times) restart at each
 * trading day, which is the standard session VWAP. Daily candles use a rolling window (default 20).
 * Bars with no volume data are skipped; the value is null until some volume has traded.
 */
export function vwap(candles, { window = 20 } = {}) {
  const out = nulls(candles.length);
  const intraday = candles.length > 0 && typeof candles[0].time === 'number';
  let day = null;
  let pv = 0;
  let vol = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (intraday) {
      if (dayOf(c) !== day) { day = dayOf(c); pv = 0; vol = 0; }
      if (isNum(c.volume) && c.volume > 0) { pv += ((c.high + c.low + c.close) / 3) * c.volume; vol += c.volume; }
      out[i] = vol > 0 ? pv / vol : null;
    } else {
      let p = 0;
      let v = 0;
      for (let j = Math.max(0, i - window + 1); j <= i; j++) {
        const x = candles[j];
        if (isNum(x.volume) && x.volume > 0) { p += ((x.high + x.low + x.close) / 3) * x.volume; v += x.volume; }
      }
      out[i] = v > 0 ? p / v : null;
    }
  }
  return out;
}

/** Volume divided by the average volume of the previous `period` bars (excluding the current one). */
export function relativeVolume(candles, period = 20) {
  const out = nulls(candles.length);
  for (let i = period; i < candles.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = i - period; j < i; j++) {
      if (isNum(candles[j].volume) && candles[j].volume > 0) { sum += candles[j].volume; count++; }
    }
    if (count === period && isNum(candles[i].volume)) out[i] = candles[i].volume / (sum / count);
  }
  return out;
}

/**
 * Confirmed swing pivots. A swing high at i needs the highest high among bars i-left..i+right;
 * it is only known once bar i+right has closed, so it carries confirmedAt = i + right.
 * Ties count as a pivot only for the first bar of the tie.
 */
export function pivots(candles, left = 3, right = 3) {
  const highs = [];
  const lows = [];
  for (let i = left; i < candles.length - right; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (candles[j].high > candles[i].high || (j < i && candles[j].high === candles[i].high)) isHigh = false;
      if (candles[j].low < candles[i].low || (j < i && candles[j].low === candles[i].low)) isLow = false;
    }
    if (isHigh) highs.push({ index: i, price: candles[i].high, confirmedAt: i + right });
    if (isLow) lows.push({ index: i, price: candles[i].low, confirmedAt: i + right });
  }
  return { highs, lows };
}

/** Nearest confirmed support below and resistance above `price` as known at bar `at`. */
export function levelsAt(piv, at, price, maxAge = 120) {
  let support = null;
  let resistance = null;
  for (const p of piv.lows) {
    if (p.confirmedAt <= at && at - p.index <= maxAge && p.price < price && (support === null || p.price > support)) support = p.price;
  }
  for (const p of piv.highs) {
    if (p.confirmedAt <= at && at - p.index <= maxAge && p.price > price && (resistance === null || p.price < resistance)) resistance = p.price;
  }
  return { support, resistance };
}

/**
 * Fair value gaps: a three-candle imbalance. Bullish when candle[i-2].high < candle[i].low, bearish
 * when candle[i-2].low > candle[i].high. Known at bar i (the third candle). `filled` is computed
 * only from bars after i, and `filledAt` says when, so it can be replayed without look-ahead.
 */
export function fairValueGaps(candles) {
  const gaps = [];
  for (let i = 2; i < candles.length; i++) {
    const a = candles[i - 2];
    const c = candles[i];
    if (a.high < c.low) gaps.push({ type: 'bullish', index: i, low: a.high, high: c.low, filledAt: null });
    else if (a.low > c.high) gaps.push({ type: 'bearish', index: i, low: c.high, high: a.low, filledAt: null });
  }
  for (const g of gaps) {
    for (let j = g.index + 1; j < candles.length; j++) {
      if (g.type === 'bullish' ? candles[j].low <= g.low : candles[j].high >= g.high) { g.filledAt = j; break; }
    }
  }
  return gaps;
}

/**
 * Liquidity sweeps: a bar that trades beyond a confirmed pivot and closes back inside it.
 * A sweep of a swing low is bullish (stops taken below, price rejected); of a swing high, bearish.
 */
export function liquiditySweeps(candles, piv) {
  const sweeps = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    let lowest = null;
    for (const p of piv.lows) if (p.confirmedAt < i && i - p.index <= 60 && (lowest === null || p.price < lowest.price)) lowest = p;
    let low = null;
    for (const p of piv.lows) if (p.confirmedAt < i && i - p.index <= 60 && c.low < p.price && c.close > p.price && (low === null || p.price < low.price)) low = p;
    let high = null;
    for (const p of piv.highs) if (p.confirmedAt < i && i - p.index <= 60 && c.high > p.price && c.close < p.price && (high === null || p.price > high.price)) high = p;
    if (low) sweeps.push({ type: 'bullish', index: i, level: low.price });
    else if (high) sweeps.push({ type: 'bearish', index: i, level: high.price });
    void lowest;
  }
  return sweeps;
}

/** Highest high / lowest low of the previous `period` bars (excluding the current bar). */
export function priorHighLow(candles, period = 20) {
  const high = nulls(candles.length);
  const low = nulls(candles.length);
  for (let i = period; i < candles.length; i++) {
    let h = -Infinity;
    let l = Infinity;
    for (let j = i - period; j < i; j++) {
      if (candles[j].high > h) h = candles[j].high;
      if (candles[j].low < l) l = candles[j].low;
    }
    high[i] = h;
    low[i] = l;
  }
  return { high, low };
}

/**
 * Weekly candles from daily candles (daily `time` is YYYY-MM-DD). Each weekly candle is keyed by its
 * Monday, and carries `lastDay`, the date of its final daily bar, so callers can tell when it is complete.
 */
export function toWeekly(daily) {
  const weeks = [];
  let current = null;
  for (const d of daily) {
    if (typeof d.time !== 'string') return [];
    const dt = new Date(`${d.time}T00:00:00Z`);
    const monday = new Date(dt.getTime() - ((dt.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
    if (!current || current.time !== monday) {
      current = { time: monday, open: d.open, high: d.high, low: d.low, close: d.close, volume: isNum(d.volume) ? d.volume : null, lastDay: d.time };
      weeks.push(current);
    } else {
      current.high = Math.max(current.high, d.high);
      current.low = Math.min(current.low, d.low);
      current.close = d.close;
      if (isNum(d.volume)) current.volume = (current.volume ?? 0) + d.volume;
      current.lastDay = d.time;
    }
  }
  return weeks;
}

/**
 * Align a slower-timeframe series to a faster one without look-ahead: for each fast bar, the value
 * of the latest slow bar that was COMPLETE before that bar began. `completeBefore(slowBar, fastBar)`
 * decides completeness. Returns an array of slow-bar indices (or null).
 */
export function alignCompleted(fast, slow, completeBefore) {
  const out = nulls(fast.length);
  let k = -1;
  for (let i = 0; i < fast.length; i++) {
    while (k + 1 < slow.length && completeBefore(slow[k + 1], fast[i])) k++;
    out[i] = k >= 0 ? k : null;
  }
  return out;
}

/**
 * Supertrend (ATR-based trend follower).
 * Defaults: period = 10, multiplier = 3.
 * Returns: { supertrend, direction (1 = bullish/green, -1 = bearish/red), upperBand, lowerBand }
 */
export function supertrend(candles, period = 10, multiplier = 3) {
  const n = candles.length;
  const out = {
    supertrend: nulls(n),
    direction: nulls(n),
    upperBand: nulls(n),
    lowerBand: nulls(n),
  };
  if (n < period) return out;

  const atrVals = atr(candles, period);
  let prevUpper = null;
  let prevLower = null;
  let prevTrend = 1;

  for (let i = period - 1; i < n; i++) {
    const c = candles[i];
    const prevC = candles[i - 1];
    const atVal = atrVals[i];
    if (!isNum(atVal)) continue;

    const hl2 = (c.high + c.low) / 2;
    const basicUpper = hl2 + multiplier * atVal;
    const basicLower = hl2 - multiplier * atVal;

    let finalUpper = basicUpper;
    let finalLower = basicLower;

    if (prevUpper !== null) {
      if (basicUpper < prevUpper || (prevC && prevC.close > prevUpper)) {
        finalUpper = basicUpper;
      } else {
        finalUpper = prevUpper;
      }
    }

    if (prevLower !== null) {
      if (basicLower > prevLower || (prevC && prevC.close < prevLower)) {
        finalLower = basicLower;
      } else {
        finalLower = prevLower;
      }
    }

    let trend = prevTrend;
    if (prevTrend === 1) {
      if (c.close < finalLower) {
        trend = -1;
      }
    } else {
      if (c.close > finalUpper) {
        trend = 1;
      }
    }

    out.upperBand[i] = finalUpper;
    out.lowerBand[i] = finalLower;
    out.direction[i] = trend;
    out.supertrend[i] = trend === 1 ? finalLower : finalUpper;

    prevUpper = finalUpper;
    prevLower = finalLower;
    prevTrend = trend;
  }

  return out;
}

/**
 * Bollinger Bands (defaults: period = 20, multiplier = 2).
 * Returns: { upper, middle, lower, bandwidth, percentB }
 */
export function bollingerBands(candles, period = 20, multiplier = 2) {
  const n = candles.length;
  const out = {
    upper: nulls(n),
    middle: nulls(n),
    lower: nulls(n),
    bandwidth: nulls(n),
    percentB: nulls(n),
  };
  if (n < period) return out;

  const mid = smaOfCloses(candles, period);

  for (let i = period - 1; i < n; i++) {
    const m = mid[i];
    if (!isNum(m)) continue;

    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sumSq += Math.pow(candles[j].close - m, 2);
    }
    const stdDev = Math.sqrt(sumSq / period);
    const u = m + multiplier * stdDev;
    const l = m - multiplier * stdDev;
    const c = candles[i].close;

    out.middle[i] = m;
    out.upper[i] = u;
    out.lower[i] = l;
    out.bandwidth[i] = m !== 0 ? (u - l) / m : 0;
    out.percentB[i] = u !== l ? (c - l) / (u - l) : 0.5;
  }

  return out;
}

/**
 * RSI Divergence detector.
 * Identifies Regular Bullish (reversal up) and Regular Bearish (reversal down) divergences.
 */
export function rsiDivergences(candles, period = 14, lookback = 30) {
  const rsiVals = rsi(candles, period);
  const divs = [];
  const piv = pivots(candles, 2, 2);

  // Bullish divergence: price makes Lower Low, RSI makes Higher Low
  for (let k = 1; k < piv.lows.length; k++) {
    const curPiv = piv.lows[k];
    const prevPiv = piv.lows[k - 1];
    if (curPiv.index - prevPiv.index > lookback || curPiv.index - prevPiv.index < 3) continue;

    const price1 = prevPiv.price;
    const price2 = curPiv.price;
    const rsi1 = rsiVals[prevPiv.index];
    const rsi2 = rsiVals[curPiv.index];

    if (isNum(rsi1) && isNum(rsi2)) {
      if (price2 < price1 && rsi2 > rsi1 + 1.5) {
        divs.push({
          type: 'bullish',
          index: curPiv.index,
          confirmedAt: curPiv.confirmedAt,
          price: price2,
          rsi: rsi2,
          prevPrice: price1,
          prevRsi: rsi1,
          strength: Math.min(100, Math.round((rsi2 - rsi1) * 5 + ((price1 - price2) / price1) * 100)),
        });
      }
    }
  }

  // Bearish divergence: price makes Higher High, RSI makes Lower High
  for (let k = 1; k < piv.highs.length; k++) {
    const curPiv = piv.highs[k];
    const prevPiv = piv.highs[k - 1];
    if (curPiv.index - prevPiv.index > lookback || curPiv.index - prevPiv.index < 3) continue;

    const price1 = prevPiv.price;
    const price2 = curPiv.price;
    const rsi1 = rsiVals[prevPiv.index];
    const rsi2 = rsiVals[curPiv.index];

    if (isNum(rsi1) && isNum(rsi2)) {
      if (price2 > price1 && rsi2 < rsi1 - 1.5) {
        divs.push({
          type: 'bearish',
          index: curPiv.index,
          confirmedAt: curPiv.confirmedAt,
          price: price2,
          rsi: rsi2,
          prevPrice: price1,
          prevRsi: rsi1,
          strength: Math.min(100, Math.round((rsi1 - rsi2) * 5 + ((price2 - price1) / price1) * 100)),
        });
      }
    }
  }

  return divs;
}

/**
 * Stochastic Oscillator (%K, %D).
 * Defaults: kPeriod = 14, kSmooth = 3, dPeriod = 3.
 */
export function stochastic(candles, kPeriod = 14, kSmooth = 3, dPeriod = 3) {
  const n = candles.length;
  const rawK = nulls(n);
  for (let i = kPeriod - 1; i < n; i++) {
    let minLow = Infinity;
    let maxHigh = -Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (candles[j].low < minLow) minLow = candles[j].low;
      if (candles[j].high > maxHigh) maxHigh = candles[j].high;
    }
    const range = maxHigh - minLow;
    rawK[i] = range === 0 ? 50 : ((candles[i].close - minLow) / range) * 100;
  }
  const k = sma(rawK, kSmooth);
  const d = sma(k, dPeriod);
  return { k, d };
}

