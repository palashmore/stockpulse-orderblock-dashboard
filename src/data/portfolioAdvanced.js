import { dailyReturns } from './portfolioAnalysis';

// Advanced portfolio statistics (pure). Everything here is arithmetic on the holdings' weights and on past
// daily closes. It describes how the portfolio behaved over the window; it does not predict, and it is not advice.
// Portfolio history is the CURRENT weights applied to past returns (what today's mix would have done), not your
// actual past performance, which depends on when you bought and sold.

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const variance = (a) => { const m = mean(a); return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1); };
const cov = (a, b) => { const ma = mean(a); const mb = mean(b); return a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0) / (a.length - 1); };
export const MIN_DAYS = 60;
export const STRESS_SHOCKS = [-5, -10, -20];

/** Trailing return over `days` completed daily bars, or null when there is not enough history. */
export function trailingReturn(candles, days) {
  const done = (candles || []).filter((c) => !c.partial && c.close > 0);
  if (done.length <= days) return null;
  return (done[done.length - 1].close / done[done.length - 1 - days].close - 1) * 100;
}

/** Fall from the highest close of the window to the latest close, in %. */
export function drawdownFromHigh(candles) {
  const done = (candles || []).filter((c) => !c.partial && c.close > 0);
  if (done.length < 2) return null;
  const high = Math.max(...done.map((c) => c.close));
  return (done[done.length - 1].close / high - 1) * 100;
}

const sharedDates = (maps) => {
  let dates = [...maps[0].keys()];
  for (const m of maps.slice(1)) dates = dates.filter((d) => m.has(d));
  return dates.sort();
};

/**
 * @param holdings          priced holdings { symbol, value, ... }
 * @param candlesBySymbol   Map symbol -> daily candles (about a year)
 * @param benchmarkCandles  daily candles of the market index (optional; beta needs it)
 * @param capPct            single-stock weight above which the excess is reported
 */
export function advancedPortfolio({ holdings, candlesBySymbol, benchmarkCandles = null, capPct = 15 }) {
  const priced = (holdings || []).filter((h) => h.symbol && isNum(h.value) && h.value > 0);
  const totalValue = priced.reduce((s, h) => s + h.value, 0);
  const usable = priced.filter((h) => candlesBySymbol.has(h.symbol));
  const usableValue = usable.reduce((s, h) => s + h.value, 0);
  if (usable.length < 2 || usableValue <= 0) return { ok: false, reason: 'Need price history for at least two holdings.' };

  const returns = new Map(usable.map((h) => [h.symbol, dailyReturns(candlesBySymbol.get(h.symbol))]));
  const dates = sharedDates([...returns.values()]);
  if (dates.length < MIN_DAYS) return { ok: false, reason: `Only ${dates.length} trading days are shared by your holdings (need ${MIN_DAYS}).` };

  const symbols = usable.map((h) => h.symbol);
  const w = usable.map((h) => h.value / usableValue);
  const series = symbols.map((s) => dates.map((d) => returns.get(s).get(d)));
  const port = dates.map((_, t) => w.reduce((s, wi, i) => s + wi * series[i][t], 0));

  const sigmaP2 = variance(port);
  const sigmaP = Math.sqrt(sigmaP2);
  const annual = (sd) => sd * Math.sqrt(252) * 100;

  // Risk contribution: share of portfolio variance each holding is responsible for
  const covWithPort = series.map((r) => cov(r, port));
  const riskShare = covWithPort.map((c, i) => (w[i] * c) / sigmaP2 * 100);
  const vols = series.map((r) => Math.sqrt(variance(r)));
  const diversificationRatio = sigmaP > 0 ? w.reduce((s, wi, i) => s + wi * vols[i], 0) / sigmaP : null;

  // Market sensitivity
  let benchByDate = null;
  if (benchmarkCandles) benchByDate = dailyReturns(benchmarkCandles);
  const withBench = benchByDate ? dates.filter((d) => benchByDate.has(d)) : [];
  const useBench = withBench.length >= MIN_DAYS;
  const idx = useBench ? new Map(dates.map((d, i) => [d, i])) : null;
  const benchSeries = useBench ? withBench.map((d) => benchByDate.get(d)) : null;
  const betaOf = (r) => {
    if (!useBench) return null;
    const x = withBench.map((d) => r[idx.get(d)]);
    const v = variance(benchSeries);
    return v > 0 ? cov(x, benchSeries) / v : null;
  };
  const beta = betaOf(port);
  const correlation = useBench ? cov(withBench.map((d) => port[idx.get(d)]), benchSeries) / (Math.sqrt(variance(withBench.map((d) => port[idx.get(d)]))) * Math.sqrt(variance(benchSeries))) : null;

  // Tail risk from the window's own daily outcomes
  const sorted = [...port].sort((a, b) => a - b);
  const cut = Math.max(1, Math.floor(sorted.length * 0.05));
  const var95 = sorted[cut - 1] * 100;
  const es95 = mean(sorted.slice(0, cut)) * 100;

  let level = 1;
  let peak = 1;
  let maxDd = 0;
  for (const r of port) { level *= 1 + r; peak = Math.max(peak, level); maxDd = Math.min(maxDd, level / peak - 1); }

  const rows = usable.map((h, i) => {
    const candles = candlesBySymbol.get(h.symbol);
    return {
      symbol: h.symbol,
      name: h.name,
      value: h.value,
      weightPct: w[i] * 100,
      riskSharePct: riskShare[i],
      riskVsWeight: w[i] > 0 ? riskShare[i] / (w[i] * 100) : null,
      volPct: annual(vols[i]),
      beta: betaOf(series[i]),
      ret1m: trailingReturn(candles, 21),
      ret3m: trailingReturn(candles, 63),
      ret6m: trailingReturn(candles, 126),
      ret1y: trailingReturn(candles, 245),
      fromHighPct: drawdownFromHigh(candles),
    };
  }).sort((a, b) => b.riskSharePct - a.riskSharePct);

  const overCap = rows.filter((r) => r.weightPct > capPct).map((r) => ({ symbol: r.symbol, weightPct: r.weightPct, excessValue: (r.weightPct - capPct) / 100 * usableValue }));

  return {
    ok: true,
    window: { days: dates.length, from: dates[0], to: dates[dates.length - 1] },
    coveragePct: totalValue > 0 ? (usableValue / totalValue) * 100 : 0,
    stocks: usable.length,
    volPct: annual(sigmaP),
    var95Pct: var95,
    es95Pct: es95,
    maxDrawdownPct: maxDd * 100,
    returnPct: (level - 1) * 100,
    bestDayPct: sorted[sorted.length - 1] * 100,
    worstDayPct: sorted[0] * 100,
    beta,
    correlation,
    benchmarkDays: useBench ? withBench.length : 0,
    diversificationRatio,
    stress: beta === null ? [] : STRESS_SHOCKS.map((shock) => ({ marketPct: shock, portfolioPct: beta * shock, amount: (beta * shock / 100) * totalValue })),
    capPct,
    overCap,
    rows,
  };
}

/** Plain-language findings, each stating the number and rule behind it. */
export function advancedFindings(a) {
  if (!a?.ok) return [];
  const out = [];
  const top = a.rows[0];
  if (top && top.riskSharePct > 25) out.push({ level: 'warn', text: `${top.symbol} is ${top.weightPct.toFixed(1)}% of the money but ${top.riskSharePct.toFixed(1)}% of the portfolio's risk (share of variance).` });
  for (const r of a.rows.filter((x) => x.riskVsWeight !== null && x.riskVsWeight > 1.5 && x.weightPct >= 5 && x !== top).slice(0, 2)) {
    out.push({ level: 'info', text: `${r.symbol} carries ${r.riskVsWeight.toFixed(1)}x more risk than its ${r.weightPct.toFixed(1)}% weight suggests (volatility ${r.volPct.toFixed(0)}% a year).` });
  }
  if (a.diversificationRatio !== null && a.diversificationRatio < 1.2) out.push({ level: 'warn', text: `Diversification ratio is ${a.diversificationRatio.toFixed(2)}: holdings tend to move together, so diversification is doing little (1.0 means none).` });
  if (a.beta !== null) out.push({ level: a.beta > 1.2 ? 'warn' : 'info', text: `Beta ${a.beta.toFixed(2)} versus the market index: a 10% market fall has typically meant about a ${(a.beta * 10).toFixed(1)}% fall here.` });
  if (a.overCap.length > 0) out.push({ level: 'info', text: `${a.overCap.map((o) => `${o.symbol} ${o.weightPct.toFixed(1)}%`).join(', ')} above the ${a.capPct}% single-stock cap.` });
  out.push({ level: 'info', text: `On ${a.window.days} trading days, a bad day (worst 5%) has cost ${Math.abs(a.var95Pct).toFixed(2)}% or more; the worst was ${a.worstDayPct.toFixed(2)}%.` });
  if (a.coveragePct < 90) out.push({ level: 'warn', text: `Only ${a.coveragePct.toFixed(0)}% of your holdings by value had enough price history, so these figures describe that part only.` });
  return out;
}
