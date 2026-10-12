import { emaOfCloses, rsi, atr, adx, vwap, relativeVolume, priorHighLow } from './indicators';
import { swingSignals } from './strategies';

// One row of the daily-analysis screener, computed from a stock's completed daily candles.
// Everything is derived from those candles; a stock with too little or invalid history gets no row
// (`null`) and is counted as "not covered" rather than shown with guessed values.
const last = (a) => a[a.length - 1];
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export const MIN_CANDLES = 60;

/**
 * Metrics for one stock. `candles` may include the in-progress day (flagged `partial`); it is ignored.
 * `setup` is the swing setup that matched on the LAST completed bar ('pullback' | 'breakout' | null).
 */
export function screenerMetrics(candles) {
  const done = (candles || []).filter((c) => !c.partial);
  if (done.length < MIN_CANDLES || typeof done[0].time !== 'string') return null;
  const n = done.length;
  const c = last(done);
  const prev = done[n - 2];

  const e20 = last(emaOfCloses(done, 20));
  const e50 = last(emaOfCloses(done, 50));
  const r = last(rsi(done, 14));
  const a = adx(done, 14);
  const at = last(atr(done, 14));
  const rv = last(relativeVolume(done, 20));
  const vw = last(vwap(done, { window: 20 }));
  const ph = last(priorHighLow(done, 20).high);
  if (![e20, e50, r, at].every(isNum) || !(c.close > 0)) return null;

  const vols = done.slice(-20).filter((x) => isNum(x.volume));
  const avgVol = vols.length === 20 ? vols.reduce((s, x) => s + x.volume, 0) / 20 : null;

  // Swing setups use the default swing rules, so this column agrees with the Swing workspace
  const sig = swingSignals(done).find((s) => s.index === n - 1) ?? null;

  let trend = 'mixed';
  if (c.close > e20 && e20 > e50) trend = 'up';
  else if (c.close < e20 && e20 < e50) trend = 'down';

  return {
    asOf: c.time,
    price: c.close,
    changePct: prev && prev.close > 0 ? ((c.close - prev.close) / prev.close) * 100 : null,
    rsi: r,
    adx: isNum(last(a.adx)) ? last(a.adx) : null,
    diBias: isNum(last(a.plusDI)) ? (last(a.plusDI) > last(a.minusDI) ? 'up' : 'down') : null,
    atrPct: (at / c.close) * 100,
    relVol: isNum(rv) ? rv : null,
    vsEma20Pct: ((c.close - e20) / e20) * 100,
    vsEma50Pct: ((c.close - e50) / e50) * 100,
    trend,
    vwap20: isNum(vw) ? vw : null,
    aboveVwap: isNum(vw) ? c.close > vw : null,
    from20dHighPct: isNum(ph) ? ((c.close - ph) / ph) * 100 : null,
    turnoverCr: avgVol === null ? null : (avgVol * c.close) / 1e7,
    setup: sig ? sig.strategy : null,
    setupSide: sig ? sig.side : null,
  };
}
