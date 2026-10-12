import { emaOfCloses, smaOfCloses, rsi, atr, macd, adx, vwap, relativeVolume, pivots, toWeekly, ema } from './indicators';

// Normal market analysis: plain observations about a stock's history. It makes no buy/sell call and
// does not depend on any trading signal existing. Every figure is computed from completed daily
// candles; anything that cannot be computed (not enough history) is null and shown as "not available".

const last = (arr) => arr[arr.length - 1];
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Percentage return from `n` candles ago to the last close, or null with too little history. */
export function returnOver(candles, n) {
  if (candles.length <= n) return null;
  const from = candles[candles.length - 1 - n].close;
  return from > 0 ? ((last(candles).close - from) / from) * 100 : null;
}

/** Annualised volatility (%) from daily log returns over the last `window` returns (252 trading days). */
export function volatility(candles, window = 20) {
  if (candles.length < window + 1) return null;
  const rets = [];
  for (let i = candles.length - window; i < candles.length; i++) {
    if (candles[i - 1].close > 0 && candles[i].close > 0) rets.push(Math.log(candles[i].close / candles[i - 1].close));
  }
  if (rets.length < window) return null;
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

/**
 * Market structure from the last confirmed swing highs and lows:
 * higher highs + higher lows = uptrend structure, lower highs + lower lows = downtrend, otherwise mixed.
 */
export function marketStructure(candles) {
  const p = pivots(candles, 3, 3);
  const highs = p.highs.slice(-3);
  const lows = p.lows.slice(-3);
  if (highs.length < 2 || lows.length < 2) return { state: 'unclear', detail: 'Not enough confirmed swing points yet', highs, lows };
  const hh = highs.at(-1).price > highs.at(-2).price;
  const hl = lows.at(-1).price > lows.at(-2).price;
  let state = 'mixed';
  let detail = 'Highs and lows are not moving the same way';
  if (hh && hl) { state = 'uptrend'; detail = 'Higher highs and higher lows'; }
  else if (!hh && !hl) { state = 'downtrend'; detail = 'Lower highs and lower lows'; }
  return { state, detail, highs, lows };
}

/** Nearest confirmed support below and resistance above the last close (up to `count` each). */
export function keyLevels(candles, count = 3) {
  const price = last(candles).close;
  const p = pivots(candles, 3, 3);
  const supports = [...new Set(p.lows.filter((x) => x.price < price).map((x) => x.price))].sort((a, b) => b - a).slice(0, count);
  const resistances = [...new Set(p.highs.filter((x) => x.price > price).map((x) => x.price))].sort((a, b) => a - b).slice(0, count);
  return { supports, resistances };
}

/**
 * Full analysis of daily candles (oldest first, completed candles only).
 * Returns null when there are fewer than 30 candles, since most readings would be meaningless.
 */
export function analyse(candles) {
  if (!candles || candles.length < 30 || typeof candles[0].time !== 'string') return null;
  const n = candles.length;
  const close = last(candles).close;

  const sma20 = last(smaOfCloses(candles, 20));
  const sma50 = last(smaOfCloses(candles, 50));
  const e20 = last(emaOfCloses(candles, 20));
  const e50 = last(emaOfCloses(candles, 50));
  const e200 = last(emaOfCloses(candles, 200));
  const rsi14 = last(rsi(candles, 14));
  const atr14 = last(atr(candles, 14));
  const m = macd(candles);
  const a = adx(candles, 14);
  const rv = last(relativeVolume(candles, 20));
  const vw = last(vwap(candles, { window: 20 }));

  const weekly = toWeekly(candles);
  const completedWeekly = weekly.length && last(weekly).lastDay === last(candles).time && new Date(`${last(candles).time}T00:00:00Z`).getUTCDay() !== 5 ? weekly.slice(0, -1) : weekly;
  const wEma = ema(completedWeekly.map((w) => w.close), 10);
  const weeklyTrend = isNum(last(wEma)) ? (last(completedWeekly).close > last(wEma) ? 'up' : 'down') : null;

  const window52 = candles.slice(-252);
  const hi = Math.max(...window52.map((c) => c.high));
  const lo = Math.min(...window52.map((c) => c.low));

  const above = (v) => (isNum(v) ? close > v : null);
  let dailyTrend = 'mixed';
  if (isNum(e20) && isNum(e50)) {
    if (close > e20 && e20 > e50) dailyTrend = 'up';
    else if (close < e20 && e20 < e50) dailyTrend = 'down';
  } else dailyTrend = null;

  const avgVol20 = candles.slice(-20).filter((c) => isNum(c.volume)).map((c) => c.volume);
  return {
    asOf: last(candles).time,
    candles: n,
    close,
    dayChangePct: n > 1 ? returnOver(candles, 1) : null,
    trend: { daily: dailyTrend, weekly: weeklyTrend, structure: marketStructure(candles) },
    movingAverages: [
      { name: 'SMA 20', value: sma20, above: above(sma20) },
      { name: 'SMA 50', value: sma50, above: above(sma50) },
      { name: 'EMA 20', value: e20, above: above(e20) },
      { name: 'EMA 50', value: e50, above: above(e50) },
      { name: 'EMA 200', value: e200, above: above(e200) },
    ],
    levels: keyLevels(candles),
    volume: {
      last: isNum(last(candles).volume) ? last(candles).volume : null,
      average20: avgVol20.length === 20 ? avgVol20.reduce((s, v) => s + v, 0) / 20 : null,
      relative: isNum(rv) ? rv : null,
    },
    indicators: {
      rsi: isNum(rsi14) ? rsi14 : null,
      macd: isNum(last(m.macd)) ? { macd: last(m.macd), signal: last(m.signal), hist: last(m.hist) } : null,
      adx: isNum(last(a.adx)) ? { adx: last(a.adx), plusDI: last(a.plusDI), minusDI: last(a.minusDI) } : null,
      atr: isNum(atr14) ? atr14 : null,
      atrPct: isNum(atr14) ? (atr14 / close) * 100 : null,
      vwap20: isNum(vw) ? vw : null,
    },
    returns: { '1D': returnOver(candles, 1), '1W': returnOver(candles, 5), '1M': returnOver(candles, 21), '3M': returnOver(candles, 63), '6M': returnOver(candles, 126), '1Y': returnOver(candles, 252) },
    volatility: { d20: volatility(candles, 20), d60: volatility(candles, 60) },
    range52: n >= 200 ? { high: hi, low: lo, fromHighPct: ((close - hi) / hi) * 100, fromLowPct: ((close - lo) / lo) * 100, partial: false } : { high: hi, low: lo, fromHighPct: ((close - hi) / hi) * 100, fromLowPct: ((close - lo) / lo) * 100, partial: true },
  };
}

/**
 * Plain-language observations derived from the analysis. These describe the past; they are not
 * recommendations and never use the words buy or sell.
 */
export function observations(a) {
  if (!a) return [];
  const out = [];
  const f = (v, d = 1) => v.toFixed(d);
  if (a.trend.daily) out.push(`Daily trend is ${a.trend.daily === 'up' ? 'up (price above a rising pair of 20- and 50-day averages)' : a.trend.daily === 'down' ? 'down (price below 20- and 50-day averages in a falling order)' : 'mixed (price and the 20/50-day averages do not line up)'}.`);
  if (a.trend.weekly) out.push(`Weekly trend is ${a.trend.weekly}: the last completed weekly close is ${a.trend.weekly === 'up' ? 'above' : 'below'} its 10-week average.`);
  out.push(`Market structure: ${a.trend.structure.detail.toLowerCase()}.`);
  if (a.indicators.rsi !== null) out.push(`RSI(14) is ${f(a.indicators.rsi)}${a.indicators.rsi >= 70 ? ', in the overbought zone' : a.indicators.rsi <= 30 ? ', in the oversold zone' : ', in the neutral range'}.`);
  if (a.indicators.adx) out.push(`ADX is ${f(a.indicators.adx.adx)}, so the trend is ${a.indicators.adx.adx >= 25 ? 'strong' : a.indicators.adx.adx >= 20 ? 'moderate' : 'weak or absent'}.`);
  if (a.volume.relative !== null) out.push(`Latest volume is ${f(a.volume.relative, 2)}× its 20-day average.`);
  if (a.volatility.d20 !== null) out.push(`20-day annualised volatility is ${f(a.volatility.d20)}%${a.indicators.atrPct !== null ? `; the average daily range (ATR) is ${f(a.indicators.atrPct, 2)}% of price` : ''}.`);
  if (a.range52) out.push(`Price is ${f(Math.abs(a.range52.fromHighPct))}% below its ${a.range52.partial ? `${a.candles}-day` : '52-week'} high and ${f(a.range52.fromLowPct)}% above its ${a.range52.partial ? `${a.candles}-day` : '52-week'} low.`);
  return out;
}

/** Day change of a stock against the equal-weighted average of a peer group (e.g. its sector). */
export function relativeToPeers(symbol, quotes, peerSymbols) {
  const me = quotes.find((q) => q.symbol === symbol);
  if (!me || !isNum(me.changePct)) return null;
  const peers = quotes.filter((q) => q.symbol !== symbol && peerSymbols.includes(q.symbol) && isNum(q.changePct));
  if (peers.length < 2) return null;
  const avg = peers.reduce((s, q) => s + q.changePct, 0) / peers.length;
  return { stock: me.changePct, peerAverage: avg, difference: me.changePct - avg, peers: peers.length };
}
