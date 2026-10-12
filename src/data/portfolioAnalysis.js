import { smaOfCloses } from './indicators';
import { screenerMetrics } from './screenerMetrics';

// Portfolio analysis (pure). Everything here is arithmetic on the holdings and on past daily prices.
//
// What this is: allocation, concentration, correlation, volatility and a rule-based review of each holding.
// What it is not: investment advice. It does not know your goals, time horizon, taxes or what you paid, and
// past prices do not predict future ones. Every label states the rule behind it so you can judge it yourself.
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const last = (a) => a[a.length - 1];

export const LIMITS = {
  stockWarnPct: 20, // one stock above this share of the portfolio is flagged
  sectorWarnPct: 35,
  addMaxWeightPct: 10, // "add" is only suggested below this weight
  corrHigh: 0.8, // pairs at or above this move together closely
  corrMinOverlap: 60, // trading days two stocks must share before a correlation is shown
  rsiHigh: 70,
  rsiLow: 30,
  extendedPct: 8, // price this far above its 20-day average counts as stretched
  deepLossPct: -20,
  maxCorrStocks: 15,
};

// ---------- allocation and concentration ----------

/** Groups priced holdings by `keyOf(holding)`: [{ key, value, weightPct, count, symbols }], biggest first. */
export function allocation(holdings, keyOf) {
  const priced = holdings.filter((h) => isNum(h.value) && h.value > 0);
  const total = priced.reduce((s, h) => s + h.value, 0);
  const groups = new Map();
  for (const h of priced) {
    const key = keyOf(h) || 'Other / unclassified';
    const g = groups.get(key) ?? { key, value: 0, count: 0, symbols: [] };
    g.value += h.value;
    g.count += 1;
    g.symbols.push(h.symbol || h.code);
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, weightPct: total > 0 ? (g.value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

/** Share held in the biggest positions, and the "effective number of stocks" (1 / sum of squared weights). */
export function concentration(holdings) {
  const priced = holdings.filter((h) => isNum(h.value) && h.value > 0).sort((a, b) => b.value - a.value);
  const total = priced.reduce((s, h) => s + h.value, 0);
  if (priced.length === 0 || total <= 0) return null;
  const w = priced.map((h) => h.value / total);
  const top = (n) => w.slice(0, n).reduce((s, x) => s + x, 0) * 100;
  const hhi = w.reduce((s, x) => s + x * x, 0);
  return { count: priced.length, top1Pct: top(1), top3Pct: top(3), top5Pct: top(5), effectiveStocks: 1 / hhi };
}

const SECTOR_ORDER = ['bank', 'it', 'auto', 'pharma', 'fmcg', 'metal', 'realty', 'media', 'consumerdurables', 'energy', 'oilgas', 'healthcare', 'financeservices', 'infra'];
const SIZE_BANDS = [
  ['nifty100', 'Large cap (Nifty 100)'],
  ['midcap150', 'Mid cap (Nifty Midcap 150)'],
  ['smallcap250', 'Small cap (Nifty Smallcap 250)'],
];

/**
 * Sector and size band from NSE index membership. `lists` is [{ id, label, symbols }]. The sector is the first
 * of the specific sector indices (in a fixed order, so a bank is "Nifty Bank" rather than "Financial Services")
 * that contains the stock; stocks in none are "Other / unclassified". This is a rough guide, not an official sector.
 */
export function buildClassifier(lists) {
  const members = new Map(lists.map((l) => [l.id, new Set(l.symbols)]));
  const labels = new Map(lists.map((l) => [l.id, l.label.replace(/^Nifty /, '')]));
  return (symbol) => {
    const sectorId = SECTOR_ORDER.find((id) => members.get(id)?.has(symbol));
    const band = SIZE_BANDS.find(([id]) => members.get(id)?.has(symbol));
    return { sector: sectorId ? labels.get(sectorId) : 'Other / unclassified', size: band ? band[1] : 'Other / not in these indices' };
  };
}

// ---------- returns, correlation, volatility ----------

/** Map of date -> daily close-to-close return, from completed daily candles. */
export function dailyReturns(candles) {
  const done = (candles || []).filter((c) => !c.partial && typeof c.time === 'string' && c.close > 0);
  const out = new Map();
  for (let i = 1; i < done.length; i++) out.set(done[i].time, done[i].close / done[i - 1].close - 1);
  return out;
}

export function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3 || ys.length !== n) return null;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx === 0 || syy === 0 ? null : sxy / Math.sqrt(sxx * syy);
}

/**
 * Pairwise correlation of daily returns on the dates both stocks share.
 * @param returnsBySymbol Map symbol -> Map(date -> return)
 * @returns { symbols, cells } where cells[i][j] is a number, or null when the pair shares fewer than `minOverlap` days
 */
export function correlationMatrix(returnsBySymbol, { minOverlap = LIMITS.corrMinOverlap } = {}) {
  const symbols = [...returnsBySymbol.keys()];
  const cells = symbols.map(() => symbols.map(() => null));
  for (let i = 0; i < symbols.length; i++) {
    cells[i][i] = 1;
    for (let j = i + 1; j < symbols.length; j++) {
      const a = returnsBySymbol.get(symbols[i]);
      const b = returnsBySymbol.get(symbols[j]);
      const xs = [];
      const ys = [];
      for (const [date, r] of a) {
        if (b.has(date)) { xs.push(r); ys.push(b.get(date)); }
      }
      const r = xs.length >= minOverlap ? pearson(xs, ys) : null;
      cells[i][j] = r;
      cells[j][i] = r;
    }
  }
  return { symbols, cells };
}

/** Mean of the pairwise correlations (each pair once), or null when none could be computed. */
export function averageCorrelation(corr) {
  const values = [];
  for (let i = 0; i < corr.symbols.length; i++) for (let j = i + 1; j < corr.symbols.length; j++) if (isNum(corr.cells[i][j])) values.push(corr.cells[i][j]);
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

/** Pairs at or above `threshold`, strongest first. */
export function correlatedPairs(corr, threshold = LIMITS.corrHigh) {
  const pairs = [];
  for (let i = 0; i < corr.symbols.length; i++) {
    for (let j = i + 1; j < corr.symbols.length; j++) {
      const r = corr.cells[i][j];
      if (isNum(r) && r >= threshold) pairs.push({ a: corr.symbols[i], b: corr.symbols[j], r });
    }
  }
  return pairs.sort((x, y) => y.r - x.r);
}

/**
 * Volatility and drawdown of the portfolio *as it is weighted today*, replayed over the dates every counted stock
 * has a return (constant current weights; it is not your actual past performance).
 * @param weights Map symbol -> weight (any scale; renormalised over the stocks that have returns)
 */
export function portfolioRisk(weights, returnsBySymbol, { minDays = LIMITS.corrMinOverlap } = {}) {
  const counted = [...weights.keys()].filter((s) => returnsBySymbol.has(s) && weights.get(s) > 0);
  if (counted.length === 0) return null;
  const totalWeight = [...weights.values()].reduce((s, w) => s + (w > 0 ? w : 0), 0);
  const countedWeight = counted.reduce((s, sym) => s + weights.get(sym), 0);
  let dates = [...returnsBySymbol.get(counted[0]).keys()];
  for (const sym of counted.slice(1)) dates = dates.filter((d) => returnsBySymbol.get(sym).has(d));
  dates.sort();
  if (dates.length < minDays) return null;

  const daily = dates.map((d) => counted.reduce((s, sym) => s + (weights.get(sym) / countedWeight) * returnsBySymbol.get(sym).get(d), 0));
  const mean = daily.reduce((s, r) => s + r, 0) / daily.length;
  const variance = daily.reduce((s, r) => s + (r - mean) ** 2, 0) / (daily.length - 1);
  let level = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const r of daily) {
    level *= 1 + r;
    peak = Math.max(peak, level);
    maxDrawdown = Math.min(maxDrawdown, level / peak - 1);
  }
  return {
    days: daily.length,
    from: dates[0],
    to: last(dates),
    volPct: Math.sqrt(variance) * Math.sqrt(252) * 100,
    maxDrawdownPct: maxDrawdown * 100,
    returnPct: (level - 1) * 100,
    coveredWeightPct: totalWeight > 0 ? (countedWeight / totalWeight) * 100 : 0,
    countedStocks: counted.length,
  };
}

// ---------- per-holding review ----------

/** Long-term trend from completed daily candles (needs about a year). */
export function longTermView(candles) {
  const done = (candles || []).filter((c) => !c.partial && c.close > 0);
  const n = done.length;
  const close = n ? last(done).close : null;
  const sma50 = n >= 50 ? last(smaOfCloses(done, 50)) : null;
  const sma200 = n >= 200 ? last(smaOfCloses(done, 200)) : null;
  const window = done.slice(-252);
  const high52 = window.length >= 120 ? Math.max(...window.map((c) => c.high ?? c.close)) : null;
  const low52 = window.length >= 120 ? Math.min(...window.map((c) => c.low ?? c.close)) : null;
  const base = {
    close, sma50, sma200,
    vs200Pct: isNum(sma200) && close ? ((close - sma200) / sma200) * 100 : null,
    from52wHighPct: isNum(high52) && close ? ((close - high52) / high52) * 100 : null,
    from52wLowPct: isNum(low52) && close ? ((close - low52) / low52) * 100 : null,
  };
  if (!isNum(sma200) || !isNum(sma50) || !close) {
    return { ...base, state: 'INSUFFICIENT', label: 'Not enough history', reasons: [`Only ${n} daily bars; a 200-day average needs 200.`] };
  }
  const above200 = close > sma200;
  const stacked = sma50 > sma200;
  const pct = (v) => `${Math.abs(v).toFixed(1)}%`;
  if (above200 && stacked) {
    return { ...base, state: 'UPTREND', label: 'Uptrend', reasons: [`Price is ${pct(base.vs200Pct)} above its 200-day average and the 50-day average is above the 200-day.`] };
  }
  if (above200) {
    return { ...base, state: 'WEAKENING', label: 'Weakening', reasons: ['Price is above its 200-day average but the 50-day average has slipped below it.'] };
  }
  if (stacked) {
    return { ...base, state: 'BELOW_200', label: 'Below 200-day', reasons: [`Price is ${pct(base.vs200Pct)} below its 200-day average, though the 50-day is still above it (a recent break).`] };
  }
  return { ...base, state: 'DOWNTREND', label: 'Downtrend', reasons: [`Price is ${pct(base.vs200Pct)} below its 200-day average and the 50-day average is below the 200-day.`] };
}

/** Short-term read from the screener metrics (swing rules, RSI, distance from the 20-day average). */
export function shortTermView(metrics, limits = LIMITS) {
  if (!metrics) return { state: 'UNKNOWN', label: 'Not enough data', reasons: ['Too little recent history to read the short-term trend.'] };
  const reasons = [];
  const swing = metrics.swing?.actionable ? metrics.swing : null;
  if (swing) {
    const long = swing.side === 'BUY';
    reasons.push(`A ${swing.strategy} swing setup (${long ? 'long' : 'short'}) is still valid: ${swing.label}.`);
    return { state: long ? 'SETUP_LONG' : 'SETUP_SHORT', label: long ? 'Bullish setup' : 'Bearish setup', reasons, rsi: metrics.rsi };
  }
  if (metrics.rsi >= limits.rsiHigh || metrics.vsEma20Pct >= limits.extendedPct) {
    reasons.push(metrics.rsi >= limits.rsiHigh ? `RSI is ${metrics.rsi.toFixed(0)} (${limits.rsiHigh}+ is overbought).` : `Price is ${metrics.vsEma20Pct.toFixed(1)}% above its 20-day average.`);
    return { state: 'EXTENDED', label: 'Stretched', reasons, rsi: metrics.rsi };
  }
  if (metrics.rsi <= limits.rsiLow) {
    reasons.push(`RSI is ${metrics.rsi.toFixed(0)} (${limits.rsiLow} or below is oversold).`);
    return { state: 'OVERSOLD', label: 'Oversold', reasons, rsi: metrics.rsi };
  }
  if (metrics.trend === 'up') return { state: 'UP', label: 'Short-term up', reasons: ['Price is above its 20-day average, which is above the 50-day.'], rsi: metrics.rsi };
  if (metrics.trend === 'down') return { state: 'DOWN', label: 'Short-term down', reasons: ['Price is below its 20-day average, which is below the 50-day.'], rsi: metrics.rsi };
  return { state: 'MIXED', label: 'Mixed', reasons: ['Short-term averages give no clear direction.'], rsi: metrics.rsi };
}

export const ACTIONS = {
  ADD: { label: 'Add: rule match', tone: 'good', detail: 'Uptrend, with a pullback or valid setup, and room in the portfolio' },
  HOLD: { label: 'Hold', tone: 'neutral', detail: 'Trend intact; no entry or exit rule is triggered' },
  HOLD_NO_ADD: { label: 'Hold, do not add', tone: 'warn', detail: 'Trend intact, but stretched or already a large position' },
  WATCH: { label: 'Hold, watch closely', tone: 'warn', detail: 'Trend is weakening or history is short' },
  TRIM: { label: 'Consider trimming', tone: 'caution', detail: 'Large position that looks stretched' },
  REDUCE: { label: 'Review: reduce or exit', tone: 'bad', detail: 'Long-term and short-term trends both point down' },
};

/**
 * Rule-based review of one holding. Returns { action, longTerm, shortTerm, reasons, pnlPct }.
 * @param holding { symbol, weightPct }
 * @param candles completed daily candles (about a year)
 * @param metrics screenerMetrics(candles)
 * @param avgCost optional average buy price the user typed in (the broker does not supply one)
 */
export function reviewHolding({ holding, candles, metrics, avgCost = null }, limits = LIMITS) {
  const longTerm = longTermView(candles);
  const shortTerm = shortTermView(metrics, limits);
  const weight = isNum(holding.weightPct) ? holding.weightPct : 0;
  const large = weight >= limits.stockWarnPct;
  const downShort = shortTerm.state === 'DOWN' || shortTerm.state === 'SETUP_SHORT';
  const reasons = [...longTerm.reasons, ...shortTerm.reasons];
  let action;

  switch (longTerm.state) {
    case 'UPTREND':
      if (shortTerm.state === 'EXTENDED') action = large ? 'TRIM' : 'HOLD_NO_ADD';
      else if ((shortTerm.state === 'SETUP_LONG' || shortTerm.state === 'OVERSOLD') && weight < limits.addMaxWeightPct) action = 'ADD';
      else if (shortTerm.state === 'SETUP_LONG' || shortTerm.state === 'OVERSOLD') action = 'HOLD_NO_ADD';
      else action = large ? 'HOLD_NO_ADD' : 'HOLD';
      if (downShort) reasons.push('Short-term weakness inside a long-term uptrend: a pullback so far. The 200-day average is the level to watch.');
      if (large && action === 'HOLD_NO_ADD' && shortTerm.state !== 'EXTENDED') reasons.push(`It is already ${weight.toFixed(1)}% of the portfolio (the flag level is ${limits.stockWarnPct}%).`);
      if (action === 'ADD') reasons.push(`It is ${weight.toFixed(1)}% of the portfolio, under the ${limits.addMaxWeightPct}% level where adding stops being suggested.`);
      break;
    case 'WEAKENING':
      action = 'WATCH';
      break;
    case 'BELOW_200':
      action = downShort ? 'REDUCE' : 'WATCH';
      break;
    case 'DOWNTREND':
      action = downShort ? 'REDUCE' : 'WATCH';
      if (action === 'WATCH') reasons.push('The short-term bounce has not changed the long-term downtrend.');
      break;
    default:
      action = 'WATCH';
  }
  if (action === 'TRIM') reasons.push(`It is ${weight.toFixed(1)}% of the portfolio and looks stretched.`);

  let pnlPct = null;
  if (isNum(avgCost) && avgCost > 0 && isNum(holding.price)) {
    pnlPct = ((holding.price - avgCost) / avgCost) * 100;
    if (pnlPct <= limits.deepLossPct && (longTerm.state === 'DOWNTREND' || longTerm.state === 'BELOW_200')) {
      reasons.push(`You are ${Math.abs(pnlPct).toFixed(1)}% below your average cost while the trend is still down.`);
    }
  }
  return { action, longTerm, shortTerm, reasons, pnlPct };
}

// ---------- portfolio-level notes ----------

/**
 * Plain-language observations about the whole portfolio: [{ level: 'warn' | 'info', text }].
 * @param input { holdings, sectors (allocation by sector), reviews (Map symbol -> review), correlation, avgCorr, pairs, risk, funds, totalValue }
 */
export function portfolioNotes({ holdings, sectors = [], sizes = [], reviews = new Map(), pairs = [], avgCorr = null, risk = null, funds = null, totalValue = null }, limits = LIMITS) {
  const notes = [];
  const priced = holdings.filter((h) => isNum(h.weightPct));
  for (const h of priced.filter((x) => x.weightPct >= limits.stockWarnPct)) {
    notes.push({ level: 'warn', text: `${h.symbol || h.code} is ${h.weightPct.toFixed(1)}% of the portfolio. One stock above ${limits.stockWarnPct}% makes the whole portfolio depend on it.` });
  }
  for (const s of sectors.filter((x) => x.weightPct >= limits.sectorWarnPct && x.key !== 'Other / unclassified')) {
    notes.push({ level: 'warn', text: `${s.key} is ${s.weightPct.toFixed(1)}% of the portfolio (${s.symbols.join(', ')}). Stocks in one sector tend to fall together.` });
  }
  if (pairs.length) {
    const shown = pairs.slice(0, 3).map((p) => `${p.a} and ${p.b} (${p.r.toFixed(2)})`).join(', ');
    notes.push({ level: 'warn', text: `Closely correlated pairs: ${shown}. Holding both adds less diversification than it seems.` });
  }
  if (isNum(avgCorr)) {
    notes.push({ level: 'info', text: `Average correlation between your holdings is ${avgCorr.toFixed(2)} (0 = unrelated, 1 = move together).` });
  }
  const down = priced.filter((h) => reviews.get(h.symbol || h.code)?.action === 'REDUCE');
  if (down.length) {
    const share = down.reduce((s, h) => s + h.weightPct, 0);
    notes.push({ level: 'warn', text: `${down.length} holding${down.length > 1 ? 's' : ''} (${down.map((h) => h.symbol || h.code).join(', ')}) match the "review: reduce or exit" rule, together ${share.toFixed(1)}% of the portfolio.` });
  }
  const small = sizes.find((s) => s.key.startsWith('Small'));
  if (small && small.weightPct >= 30) notes.push({ level: 'info', text: `${small.weightPct.toFixed(1)}% is in small caps, which swing more than large caps.` });
  if (risk) {
    notes.push({ level: 'info', text: `At today's weights the portfolio's past volatility was about ${risk.volPct.toFixed(1)}% a year, with a worst peak-to-trough fall of ${Math.abs(risk.maxDrawdownPct).toFixed(1)}% over ${risk.days} trading days.` });
  }
  if (funds && isNum(funds.unallocatedBalance) && isNum(totalValue) && totalValue > 0) {
    const cashPct = (funds.unallocatedBalance / (totalValue + funds.unallocatedBalance)) * 100;
    notes.push({ level: 'info', text: `Unallocated cash is about ${cashPct.toFixed(1)}% of holdings plus cash.` });
  }
  if (priced.length < 5 && priced.length > 0) {
    notes.push({ level: 'info', text: `Only ${priced.length} holding${priced.length > 1 ? 's' : ''}: a small number of stocks means each one matters a lot.` });
  }
  return notes;
}

// ---------- everything together ----------

/**
 * Full analysis of the holdings. Pure: the caller supplies the price history it managed to load.
 * @param holdings        [{ symbol, code, name, value, weightPct, price, ... }] from /api/portfolio
 * @param candlesBySymbol Map symbol -> daily candles (about a year). Symbols missing here get no review.
 * @param classify        (symbol) => { sector, size }  (see buildClassifier)
 * @param costs           { SYMBOL: average buy price } typed in by the user
 */
export function analysePortfolio({ holdings, candlesBySymbol, classify, funds = null, totalValue = null, costs = {} }, limits = LIMITS) {
  const rows = holdings.map((holding) => {
    const symbol = holding.symbol;
    const candles = symbol ? candlesBySymbol.get(symbol) ?? null : null;
    const cls = symbol ? classify(symbol) : { sector: 'Other / unclassified', size: 'Other / not in these indices' };
    const avgCost = symbol && isNum(costs[symbol]) ? costs[symbol] : null;
    const review = candles ? reviewHolding({ holding, candles, metrics: screenerMetrics(candles), avgCost }, limits) : null;
    return { holding, ...cls, avgCost, review };
  });

  const bySymbol = new Map(rows.filter((r) => r.review).map((r) => [r.holding.symbol, r.review]));
  const enriched = rows.map((r) => ({ ...r.holding, sector: r.sector, size: r.size }));
  const sectors = allocation(enriched, (h) => h.sector);
  const sizes = allocation(enriched, (h) => h.size);

  // Correlation and volatility use the largest holdings that have enough price history
  const byValue = [...rows].filter((r) => r.holding.symbol && candlesBySymbol.has(r.holding.symbol) && isNum(r.holding.value))
    .sort((a, b) => b.holding.value - a.holding.value);
  const returns = new Map();
  for (const r of byValue) {
    const rets = dailyReturns(candlesBySymbol.get(r.holding.symbol));
    if (rets.size >= limits.corrMinOverlap) returns.set(r.holding.symbol, rets);
  }
  const corrInput = new Map([...returns].slice(0, limits.maxCorrStocks));
  const correlation = corrInput.size >= 2 ? correlationMatrix(corrInput, { minOverlap: limits.corrMinOverlap }) : null;
  const avgCorr = correlation ? averageCorrelation(correlation) : null;
  const pairs = correlation ? correlatedPairs(correlation, limits.corrHigh) : [];
  const weights = new Map(byValue.filter((r) => returns.has(r.holding.symbol)).map((r) => [r.holding.symbol, r.holding.value]));
  const risk = portfolioRisk(weights, returns, { minDays: limits.corrMinOverlap });

  const actionShare = {};
  for (const r of rows) {
    if (!r.review) continue;
    const g = actionShare[r.review.action] ?? { count: 0, weightPct: 0 };
    g.count += 1;
    g.weightPct += isNum(r.holding.weightPct) ? r.holding.weightPct : 0;
    actionShare[r.review.action] = g;
  }

  return {
    rows,
    sectors,
    sizes,
    concentration: concentration(holdings),
    correlation,
    avgCorr,
    pairs,
    risk,
    actionShare,
    reviewed: bySymbol.size,
    notes: portfolioNotes({ holdings, sectors, sizes, reviews: bySymbol, pairs, avgCorr, risk, funds, totalValue }, limits),
  };
}
