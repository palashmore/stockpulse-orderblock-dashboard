import {
  emaOfCloses, ema, rsi, atr, macd, adx, vwap, relativeVolume, pivots, levelsAt, priorHighLow, toWeekly, alignCompleted,
} from './indicators';
import { aggregateCandles } from './timeframes';

// Rule-based setup engines. A "signal" means a rule set matched on a completed bar, with the entry,
// stop, targets and the reasons that led to it. It is not a forecast and not advice: whether a rule
// set has any edge is what the backtester measures. Two engines (swing, intraday) share the
// indicator library but have separate configurations and keep no shared mutable state.
//
// Look-ahead: every condition reads values at bar i or earlier. The property test in
// strategies.test.js re-runs the engine on truncated data and checks that earlier signals do not change.

export const SWING_DEFAULTS = {
  capital: 100000, riskPct: 1, leverage: 1,
  emaFast: 20, emaMid: 50, emaSlow: 200,
  rsiPeriod: 14, adxPeriod: 14, adxMin: 20, atrPeriod: 14,
  stopAtr: 2, target1R: 1.5, target2R: 3, minRR: 1.5,
  breakoutLookback: 20, relVolMin: 1.5, pullbackAtr: 0.5,
  weeklyFilter: true, allowShort: false, maxHoldBars: 30, cooldownBars: 5,
  pullback: true, breakout: true,
  validBars: 3, // a setup may still be acted on this many daily bars after it fires
};

export const INTRADAY_DEFAULTS = {
  capital: 100000, riskPct: 0.5, leverage: 1,
  emaFast: 9, emaSlow: 21, adxPeriod: 14, adxMin: 20, atrPeriod: 14,
  stopAtr: 1.5, target1R: 1, target2R: 2, minRR: 1.5,
  relVolMin: 1.2, htfMultiple: 3, htfEma: 20, orMinutes: 15,
  entryStartMin: 9 * 60 + 30, entryEndMin: 14 * 60 + 45, exitMin: 15 * 60 + 15,
  maxTradesPerDay: 3, maxDailyLossR: 2, minAtrPct: 0.1, maxAtrPct: 2,
  allowShort: true, cooldownBars: 6,
  emaCross: true, openingRange: true,
  validBars: 12, // a setup may still be acted on this many bars after it fires (12 x 5 min = 1 hour)
};

/** Limits for each numeric parameter, so a bad stored value can never break the engine. */
const LIMITS = {
  capital: [1000, 1e9], riskPct: [0.05, 5], leverage: [1, 10],
  emaFast: [2, 100], emaMid: [5, 200], emaSlow: [20, 400], emaSlow2: [2, 100],
  rsiPeriod: [2, 50], adxPeriod: [2, 50], adxMin: [0, 60], atrPeriod: [2, 50],
  stopAtr: [0.3, 6], target1R: [0.3, 10], target2R: [0.5, 20], minRR: [0.5, 10],
  breakoutLookback: [5, 100], relVolMin: [0, 10], pullbackAtr: [0, 3],
  maxHoldBars: [1, 250], cooldownBars: [0, 50], validBars: [1, 100],
  htfMultiple: [2, 12], htfEma: [3, 100], orMinutes: [5, 60],
  entryStartMin: [540, 930], entryEndMin: [540, 930], exitMin: [540, 930],
  maxTradesPerDay: [1, 20], maxDailyLossR: [0.25, 20], minAtrPct: [0, 10], maxAtrPct: [0.1, 20],
};

/** Merge stored values over defaults, clamping numbers and keeping booleans. Unknown keys are dropped. */
export function validateConfig(raw, defaults) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const [key, def] of Object.entries(defaults)) {
    const v = r[key];
    if (typeof def === 'boolean') out[key] = typeof v === 'boolean' ? v : def;
    else if (typeof v === 'number' && Number.isFinite(v)) {
      const [lo, hi] = LIMITS[key] ?? [-Infinity, Infinity];
      out[key] = Math.min(hi, Math.max(lo, v));
    } else out[key] = def;
  }
  if (out.target2R < out.target1R) out.target2R = out.target1R;
  if ('entryEndMin' in out && out.entryEndMin <= out.entryStartMin) { out.entryStartMin = defaults.entryStartMin; out.entryEndMin = defaults.entryEndMin; }
  return out;
}

const minuteOfDay = (time) => (typeof time === 'number' ? Math.floor((time % 86400) / 60) : null);
const dayKey = (candle) => (typeof candle.time === 'number' ? Math.floor(candle.time / 86400) : candle.time);
const addDays = (key, n) => new Date(Date.parse(`${key}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const fmt = (n) => (Number.isFinite(n) ? n.toFixed(2) : '—');

function makeSignal({ candles, i, mode, strategy, dir, atrValue, cfg, confirmations, explanation, extra = {} }) {
  const c = candles[i];
  const entry = c.close;
  const risk = cfg.stopAtr * atrValue;
  const stop = entry - dir * risk;
  const target1 = entry + dir * cfg.target1R * risk;
  const target2 = entry + dir * cfg.target2R * risk;
  return {
    id: `${mode}-${strategy}-${c.time}`,
    index: i,
    time: c.time,
    mode,
    strategy,
    side: dir > 0 ? 'BUY' : 'SELL_SHORT',
    entry,
    entryZone: dir > 0 ? [entry, entry + 0.25 * atrValue] : [entry - 0.25 * atrValue, entry],
    stop,
    target1,
    target2,
    risk,
    rr: cfg.target2R,
    atr: atrValue,
    confirmations,
    explanation,
    invalidation: dir > 0
      ? `Closes below ${fmt(stop)}, or the setup is older than ${mode === 'swing' ? `${cfg.maxHoldBars} bars` : 'the session'} without reaching a target.`
      : `Closes above ${fmt(stop)}, or the setup is older than ${mode === 'swing' ? `${cfg.maxHoldBars} bars` : 'the session'} without reaching a target.`,
    ...extra,
  };
}

/** Shared indicator arrays for the swing engine (daily candles). */
export function swingContext(candles, cfg) {
  const weekly = toWeekly(candles);
  const weeklyEma = ema(weekly.map((w) => w.close), 10);
  // A weekly bar counts once the next week has begun, never while it is still forming
  const weekAt = alignCompleted(candles, weekly, (w, d) => addDays(w.time, 7) <= d.time);
  return {
    ema20: emaOfCloses(candles, cfg.emaFast),
    ema50: emaOfCloses(candles, cfg.emaMid),
    ema200: emaOfCloses(candles, cfg.emaSlow),
    rsi: rsi(candles, cfg.rsiPeriod),
    atr: atr(candles, cfg.atrPeriod),
    adx: adx(candles, cfg.adxPeriod),
    relVol: relativeVolume(candles, 20),
    prior: priorHighLow(candles, cfg.breakoutLookback),
    piv: pivots(candles, 3, 3),
    weekly, weeklyEma, weekAt,
  };
}

/**
 * Swing setups on daily candles: trend pullback to the fast EMA, and breakout above the prior N-day
 * high on strong volume. Weekly trend confirmation uses only completed weeks.
 */
export function swingSignals(candles, userConfig = {}) {
  const cfg = validateConfig(userConfig, SWING_DEFAULTS);
  if (!candles || candles.length < cfg.emaMid + 5 || typeof candles[0].time !== 'string') return [];
  const x = swingContext(candles, cfg);
  const signals = [];
  const lastSignal = { 1: -1e9, '-1': -1e9 };

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const a = x.atr[i];
    if (a === null || a <= 0 || x.ema20[i] === null || x.ema50[i] === null || x.adx.adx[i] === null || x.rsi[i] === null) continue;

    for (const dir of cfg.allowShort ? [1, -1] : [1]) {
      if (i - lastSignal[dir] < cfg.cooldownBars) continue;
      const confirmations = [];
      const trendOk = dir > 0
        ? c.close > x.ema50[i] && x.ema20[i] > x.ema50[i] && (x.ema200[i] === null || c.close > x.ema200[i])
        : c.close < x.ema50[i] && x.ema20[i] < x.ema50[i] && (x.ema200[i] === null || c.close < x.ema200[i]);
      if (!trendOk) continue;
      confirmations.push(`Daily trend ${dir > 0 ? 'up' : 'down'}: close ${dir > 0 ? 'above' : 'below'} EMA${cfg.emaMid} and EMA${cfg.emaFast} ${dir > 0 ? 'above' : 'below'} EMA${cfg.emaMid}`);
      if (x.ema200[i] === null) confirmations.push(`EMA${cfg.emaSlow} not available (history too short), so it was not used`);

      if (cfg.weeklyFilter) {
        const w = x.weekAt[i];
        const we = w === null ? null : x.weeklyEma[w];
        if (we !== null) {
          const ok = dir > 0 ? x.weekly[w].close > we : x.weekly[w].close < we;
          if (!ok) continue;
          confirmations.push(`Weekly trend agrees: last completed weekly close ${dir > 0 ? 'above' : 'below'} its 10-week EMA`);
        } else confirmations.push('Weekly confirmation not available (fewer than 10 completed weeks), so it was not used');
      }

      const strong = x.adx.adx[i] >= cfg.adxMin && (dir > 0 ? x.adx.plusDI[i] > x.adx.minusDI[i] : x.adx.minusDI[i] > x.adx.plusDI[i]);
      if (!strong) continue;
      confirmations.push(`ADX ${fmt(x.adx.adx[i])} ≥ ${cfg.adxMin} with ${dir > 0 ? '+DI above −DI' : '−DI above +DI'}`);

      let strategy = null;
      let explanation = '';
      if (cfg.pullback) {
        const touched = dir > 0 ? c.low <= x.ema20[i] + cfg.pullbackAtr * a : c.high >= x.ema20[i] - cfg.pullbackAtr * a;
        const reclaimed = dir > 0 ? c.close > x.ema20[i] && c.close > c.open : c.close < x.ema20[i] && c.close < c.open;
        const rsiOk = dir > 0 ? x.rsi[i] >= 40 && x.rsi[i] <= 65 && x.rsi[i] > x.rsi[i - 1] : x.rsi[i] <= 60 && x.rsi[i] >= 35 && x.rsi[i] < x.rsi[i - 1];
        if (touched && reclaimed && rsiOk) {
          strategy = 'pullback';
          explanation = `Price pulled back to the EMA${cfg.emaFast} inside an established ${dir > 0 ? 'uptrend' : 'downtrend'} and closed back ${dir > 0 ? 'above' : 'below'} it with RSI ${fmt(x.rsi[i])} turning ${dir > 0 ? 'up' : 'down'}.`;
          confirmations.push(`Pullback to EMA${cfg.emaFast} (within ${cfg.pullbackAtr} ATR) and reclaim`, `RSI ${fmt(x.rsi[i])} ${dir > 0 ? 'rising' : 'falling'} in the 35–65 zone`);
        }
      }
      if (!strategy && cfg.breakout && dir > 0 && x.prior.high[i] !== null && x.relVol[i] !== null) {
        if (c.close > x.prior.high[i] && x.relVol[i] >= cfg.relVolMin) {
          strategy = 'breakout';
          explanation = `Close above the prior ${cfg.breakoutLookback}-day high (${fmt(x.prior.high[i])}) on ${fmt(x.relVol[i])}× average volume.`;
          confirmations.push(`Close above ${cfg.breakoutLookback}-day high`, `Relative volume ${fmt(x.relVol[i])}× ≥ ${cfg.relVolMin}×`);
        }
      }
      if (!strategy && cfg.breakout && dir < 0 && x.prior.low[i] !== null && x.relVol[i] !== null) {
        if (c.close < x.prior.low[i] && x.relVol[i] >= cfg.relVolMin) {
          strategy = 'breakdown';
          explanation = `Close below the prior ${cfg.breakoutLookback}-day low (${fmt(x.prior.low[i])}) on ${fmt(x.relVol[i])}× average volume.`;
          confirmations.push(`Close below ${cfg.breakoutLookback}-day low`, `Relative volume ${fmt(x.relVol[i])}× ≥ ${cfg.relVolMin}×`);
        }
      }
      if (!strategy) continue;

      // Room to run: the nearest confirmed level in the trade's direction must be far enough away
      const risk = cfg.stopAtr * a;
      const lv = levelsAt(x.piv, i, c.close);
      const wall = dir > 0 ? lv.resistance : lv.support;
      if (wall !== null && Math.abs(wall - c.close) < cfg.minRR * risk) continue;
      confirmations.push(wall === null ? 'No confirmed swing level blocks the path to the targets' : `Nearest confirmed ${dir > 0 ? 'resistance' : 'support'} ${fmt(wall)} leaves room for ≥ ${cfg.minRR}R`);

      signals.push(makeSignal({ candles, i, mode: 'swing', strategy, dir, atrValue: a, cfg, confirmations, explanation, extra: { rsi: x.rsi[i], adx: x.adx.adx[i] } }));
      lastSignal[dir] = i;
    }
  }
  return signals;
}

/** Higher-timeframe trend for intraday bars: completed N-bar buckets, trend = bucket close vs its EMA. */
export function intradayContext(candles, cfg) {
  const buckets = aggregateCandles(candles, cfg.htfMultiple);
  // aggregateCandles keeps each bucket's first bar time; find each bucket's last base index
  const ends = [];
  let idx = 0;
  const counts = [];
  for (let b = 0; b < buckets.length; b++) {
    let n = 0;
    const day = dayKey(buckets[b]);
    while (idx < candles.length && n < cfg.htfMultiple && dayKey(candles[idx]) === day) { idx++; n++; }
    counts.push(n);
    ends.push(idx - 1);
  }
  const complete = buckets.map((_, b) => counts[b] === cfg.htfMultiple);
  const htf = buckets.filter((_, b) => complete[b]);
  const htfEnds = ends.filter((_, b) => complete[b]);
  const htfEma = ema(htf.map((b) => b.close), cfg.htfEma);
  const htfAt = alignCompleted(candles.map((_, i) => i), htf.map((_, b) => htfEnds[b]), (end, i) => end < i);
  return {
    ema9: emaOfCloses(candles, cfg.emaFast),
    ema21: emaOfCloses(candles, cfg.emaSlow),
    atr: atr(candles, cfg.atrPeriod),
    adx: adx(candles, cfg.adxPeriod),
    macd: macd(candles),
    vwap: vwap(candles),
    relVol: relativeVolume(candles, 20),
    htf, htfEma, htfAt,
  };
}

/**
 * Intraday setups on 1/5/15-minute candles: EMA fast/slow cross or opening-range break, confirmed by
 * VWAP, ADX/DI, MACD histogram, relative volume and the higher-timeframe trend, only inside the entry window.
 */
export function intradaySignals(candles, userConfig = {}) {
  const cfg = validateConfig(userConfig, INTRADAY_DEFAULTS);
  if (!candles || candles.length < 60 || typeof candles[0].time !== 'number') return [];
  const x = intradayContext(candles, cfg);
  const signals = [];
  const lastSignal = { 1: -1e9, '-1': -1e9 };
  const perDay = new Map();

  // Opening range per day (high/low of bars from 09:15 up to orMinutes), known only once that window has closed
  const openRange = new Map();
  for (let i = 0; i < candles.length; i++) {
    const m = minuteOfDay(candles[i].time);
    const d = dayKey(candles[i]);
    if (m >= 9 * 60 + 15 && m < 9 * 60 + 15 + cfg.orMinutes) {
      const o = openRange.get(d) ?? { high: -Infinity, low: Infinity, lastIndex: i };
      o.high = Math.max(o.high, candles[i].high);
      o.low = Math.min(o.low, candles[i].low);
      o.lastIndex = i;
      openRange.set(d, o);
    }
  }

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const m = minuteOfDay(c.time);
    if (m < cfg.entryStartMin || m > cfg.entryEndMin) continue;
    const a = x.atr[i];
    const day = dayKey(c);
    if (a === null || a <= 0 || x.ema9[i] === null || x.ema21[i] === null || x.adx.adx[i] === null || x.vwap[i] === null || x.macd.hist[i] === null || x.relVol[i] === null) continue;
    const atrPct = (a / c.close) * 100;
    if (atrPct < cfg.minAtrPct || atrPct > cfg.maxAtrPct) continue;
    if ((perDay.get(day) ?? 0) >= cfg.maxTradesPerDay) continue;
    const h = x.htfAt[i];
    const htfEma = h === null ? null : x.htfEma[h];
    if (htfEma === null) continue;

    for (const dir of cfg.allowShort ? [1, -1] : [1]) {
      if (i - lastSignal[dir] < cfg.cooldownBars) continue;
      const side = dir > 0;
      const confirmations = [];
      const htfOk = side ? x.htf[h].close > htfEma : x.htf[h].close < htfEma;
      if (!htfOk) continue;
      confirmations.push(`Higher timeframe (${cfg.htfMultiple}× bars) ${side ? 'up' : 'down'}: completed close ${side ? 'above' : 'below'} its EMA${cfg.htfEma}`);
      if (!(side ? c.close > x.vwap[i] : c.close < x.vwap[i])) continue;
      confirmations.push(`Price ${side ? 'above' : 'below'} session VWAP (${fmt(x.vwap[i])})`);
      if (!(side ? x.adx.plusDI[i] > x.adx.minusDI[i] : x.adx.minusDI[i] > x.adx.plusDI[i]) || x.adx.adx[i] < cfg.adxMin) continue;
      confirmations.push(`ADX ${fmt(x.adx.adx[i])} ≥ ${cfg.adxMin} with ${side ? '+DI above −DI' : '−DI above +DI'}`);
      if (!(side ? x.macd.hist[i] > 0 : x.macd.hist[i] < 0)) continue;
      confirmations.push(`MACD histogram ${side ? 'positive' : 'negative'}`);
      if (x.relVol[i] < cfg.relVolMin) continue;
      confirmations.push(`Relative volume ${fmt(x.relVol[i])}× ≥ ${cfg.relVolMin}×`);

      let strategy = null;
      let explanation = '';
      if (cfg.emaCross && x.ema9[i - 1] !== null && x.ema21[i - 1] !== null) {
        const crossed = side ? x.ema9[i] > x.ema21[i] && x.ema9[i - 1] <= x.ema21[i - 1] : x.ema9[i] < x.ema21[i] && x.ema9[i - 1] >= x.ema21[i - 1];
        if (crossed) {
          strategy = 'ema-cross';
          explanation = `EMA${cfg.emaFast} crossed ${side ? 'above' : 'below'} EMA${cfg.emaSlow} with the trend, VWAP, momentum and volume filters agreeing.`;
          confirmations.push(`EMA${cfg.emaFast} crossed ${side ? 'above' : 'below'} EMA${cfg.emaSlow} on this bar`);
        }
      }
      const or = openRange.get(day);
      if (!strategy && cfg.openingRange && or && or.lastIndex < i) {
        const prev = candles[i - 1].close;
        const broke = side ? c.close > or.high && prev <= or.high : c.close < or.low && prev >= or.low;
        if (broke) {
          strategy = 'opening-range';
          explanation = `Close ${side ? 'above' : 'below'} the opening range ${side ? 'high' : 'low'} (${fmt(side ? or.high : or.low)}) with the trend, VWAP, momentum and volume filters agreeing.`;
          confirmations.push(`Opening-range ${side ? 'breakout' : 'breakdown'} (first ${cfg.orMinutes} minutes)`);
        }
      }
      if (!strategy) continue;

      signals.push(makeSignal({ candles, i, mode: 'intraday', strategy, dir, atrValue: a, cfg, confirmations, explanation, extra: { vwap: x.vwap[i], adx: x.adx.adx[i] } }));
      lastSignal[dir] = i;
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }
  }
  return signals;
}
