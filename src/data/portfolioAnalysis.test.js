import { describe, it, expect } from 'vitest';
import {
  LIMITS, allocation, concentration, buildClassifier, dailyReturns, pearson, correlationMatrix, averageCorrelation,
  correlatedPairs, portfolioRisk, longTermView, shortTermView, reviewHolding, portfolioNotes, ACTIONS, analysePortfolio,
} from './portfolioAnalysis';

const START = Date.UTC(2025, 0, 1);
const candles = (prices) => prices.map((p, i) => ({
  time: new Date(START + i * 86400000).toISOString().slice(0, 10), open: p, high: p * 1.01, low: p * 0.99, close: p, volume: 1000,
}));
const rising = candles(Array.from({ length: 250 }, (_, i) => 100 + i * 0.5));
const falling = candles(Array.from({ length: 250 }, (_, i) => 300 - i * 0.6));
// 200 bars at 105, 49 at 90, then a last bar at 120: above the 200-day average, but the 50-day sits below it
const weakening = candles([...Array(200).fill(105), ...Array(49).fill(90), 120]);
// 100 bars at 90, 149 at 130, last bar 100: below the 200-day average while the 50-day is still above it
const below200 = candles([...Array(100).fill(90), ...Array(149).fill(130), 100]);

describe('allocation and concentration', () => {
  const holdings = [
    { symbol: 'A', value: 600, sector: 'Bank' },
    { symbol: 'B', value: 300, sector: 'Bank' },
    { symbol: 'C', value: 100, sector: 'IT' },
    { symbol: 'D', value: null, sector: 'IT' },
    { symbol: 'E', value: 0, sector: 'IT' },
  ];
  it('groups priced holdings, biggest first, weights summing to 100', () => {
    const groups = allocation(holdings, (h) => h.sector);
    expect(groups.map((g) => [g.key, g.value, g.count])).toEqual([['Bank', 900, 2], ['IT', 100, 1]]);
    expect(groups[0].weightPct).toBeCloseTo(90);
    expect(groups.reduce((s, g) => s + g.weightPct, 0)).toBeCloseTo(100);
    expect(groups[0].symbols).toEqual(['A', 'B']);
  });
  it('uses a catch-all group and copes with nothing priced', () => {
    expect(allocation([{ symbol: 'A', value: 10 }], () => null)[0].key).toBe('Other / unclassified');
    expect(allocation([], () => 'x')).toEqual([]);
  });
  it('measures concentration', () => {
    const c = concentration(holdings);
    expect(c).toMatchObject({ count: 3 });
    expect(c.top1Pct).toBeCloseTo(60);
    expect(c.top3Pct).toBeCloseTo(100);
    expect(c.effectiveStocks).toBeCloseTo(1 / (0.36 + 0.09 + 0.01));
    const equal = concentration(Array.from({ length: 4 }, (_, i) => ({ symbol: `S${i}`, value: 50 })));
    expect(equal.effectiveStocks).toBeCloseTo(4);
    expect(concentration([])).toBeNull();
  });
});

describe('buildClassifier', () => {
  const classify = buildClassifier([
    { id: 'bank', label: 'Nifty Bank', symbols: ['HDFCBANK'] },
    { id: 'financeservices', label: 'Nifty Financial Services', symbols: ['HDFCBANK', 'BAJFINANCE'] },
    { id: 'it', label: 'Nifty IT', symbols: ['TCS'] },
    { id: 'nifty100', label: 'Nifty 100', symbols: ['HDFCBANK', 'TCS', 'BAJFINANCE'] },
    { id: 'midcap150', label: 'Nifty Midcap 150', symbols: ['MIDCO'] },
    { id: 'smallcap250', label: 'Nifty Smallcap 250', symbols: ['SMALLCO'] },
  ]);
  it('picks the specific sector over the broader one', () => {
    expect(classify('HDFCBANK').sector).toBe('Bank');
    expect(classify('BAJFINANCE').sector).toBe('Financial Services');
    expect(classify('TCS').sector).toBe('IT');
  });
  it('assigns size bands and a catch-all', () => {
    expect(classify('TCS').size).toBe('Large cap (Nifty 100)');
    expect(classify('MIDCO').size).toBe('Mid cap (Nifty Midcap 150)');
    expect(classify('SMALLCO').size).toBe('Small cap (Nifty Smallcap 250)');
    expect(classify('UNKNOWN')).toEqual({ sector: 'Other / unclassified', size: 'Other / not in these indices' });
  });
});

describe('returns and correlation', () => {
  it('computes daily returns from completed candles only', () => {
    const c = candles([100, 110, 99]);
    c.push({ ...c[2], time: '2025-01-04', close: 500, partial: true });
    const r = dailyReturns(c);
    expect([...r.values()].map((v) => +v.toFixed(4))).toEqual([0.1, -0.1]);
    expect(dailyReturns(null).size).toBe(0);
  });

  it('pearson handles perfect, inverse, flat and short inputs', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1);
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(pearson([1, 2], [1, 2])).toBeNull();
  });

  const series = (fn, n = 100, start = 0) => new Map(Array.from({ length: n }, (_, i) => [`d${String(i + start).padStart(3, '0')}`, fn(i)]));
  it('builds a symmetric matrix on shared dates and hides thin overlaps', () => {
    const base = (i) => Math.sin(i / 3) / 50;
    const corr = correlationMatrix(new Map([
      ['A', series(base)],
      ['B', series((i) => base(i) * 2)],
      ['C', series((i) => -base(i))],
      ['D', series(base, 100, 80)], // shares only 20 days with the others
    ]));
    expect(corr.symbols).toEqual(['A', 'B', 'C', 'D']);
    expect(corr.cells[0][1]).toBeCloseTo(1);
    expect(corr.cells[1][0]).toBeCloseTo(1);
    expect(corr.cells[0][2]).toBeCloseTo(-1);
    expect(corr.cells[0][3]).toBeNull();
    expect(corr.cells[3][0]).toBeNull();
    expect(corr.cells[2][2]).toBe(1);
  });

  it('summarises correlations', () => {
    const corr = { symbols: ['A', 'B', 'C'], cells: [[1, 0.9, 0.2], [0.9, 1, null], [0.2, null, 1]] };
    expect(averageCorrelation(corr)).toBeCloseTo(0.55);
    expect(correlatedPairs(corr)).toEqual([{ a: 'A', b: 'B', r: 0.9 }]);
    expect(correlatedPairs(corr, 0.1).map((p) => p.r)).toEqual([0.9, 0.2]);
    expect(averageCorrelation({ symbols: ['A'], cells: [[1]] })).toBeNull();
  });
});

describe('portfolioRisk', () => {
  const dates = (n) => Array.from({ length: n }, (_, i) => `d${String(i).padStart(3, '0')}`);
  const returns = (values) => new Map(dates(values.length).map((d, i) => [d, values[i]]));

  it('is zero-volatility for constant returns and reports the compounded return', () => {
    const r = portfolioRisk(new Map([['A', 1]]), new Map([['A', returns(Array(80).fill(0.001))]]));
    expect(r.volPct).toBeCloseTo(0, 6);
    expect(r.maxDrawdownPct).toBe(0);
    expect(r.returnPct).toBeCloseTo((1.001 ** 80 - 1) * 100, 6);
    expect(r.days).toBe(80);
  });

  it('measures the worst peak-to-trough fall', () => {
    const values = [0.1, -0.2, 0.05, ...Array(77).fill(0)];
    const r = portfolioRisk(new Map([['A', 1]]), new Map([['A', returns(values)]]));
    expect(r.maxDrawdownPct).toBeCloseTo(-20, 6);
  });

  it('blends stocks by weight and renormalises over the ones with data', () => {
    const a = returns(Array.from({ length: 80 }, (_, i) => (i % 2 ? 0.01 : -0.01)));
    const b = returns(Array.from({ length: 80 }, (_, i) => (i % 2 ? -0.01 : 0.01)));
    const mixed = portfolioRisk(new Map([['A', 1], ['B', 1]]), new Map([['A', a], ['B', b]]));
    expect(mixed.volPct).toBeCloseTo(0, 6); // perfectly offsetting
    const partial = portfolioRisk(new Map([['A', 3], ['B', 1], ['C', 6]]), new Map([['A', a], ['B', b]]));
    expect(partial.coveredWeightPct).toBeCloseTo(40);
    expect(partial.countedStocks).toBe(2);
  });

  it('returns null without enough shared days or any returns', () => {
    expect(portfolioRisk(new Map([['A', 1]]), new Map([['A', returns(Array(10).fill(0.01))]]))).toBeNull();
    expect(portfolioRisk(new Map([['A', 1]]), new Map())).toBeNull();
    expect(portfolioRisk(new Map(), new Map())).toBeNull();
  });
});

describe('longTermView', () => {
  it('classifies the four trend states', () => {
    expect(longTermView(rising).state).toBe('UPTREND');
    expect(longTermView(falling).state).toBe('DOWNTREND');
    expect(longTermView(weakening).state).toBe('WEAKENING');
    expect(longTermView(below200).state).toBe('BELOW_200');
  });
  it('reports distance from the 200-day average and the 52-week high', () => {
    const v = longTermView(rising);
    expect(v.vs200Pct).toBeGreaterThan(0);
    expect(v.from52wHighPct).toBeLessThanOrEqual(0);
    expect(v.from52wHighPct).toBeGreaterThan(-5);
    expect(longTermView(falling).vs200Pct).toBeLessThan(0);
  });
  it('declines to judge a short history', () => {
    const v = longTermView(candles(Array.from({ length: 100 }, (_, i) => 100 + i)));
    expect(v.state).toBe('INSUFFICIENT');
    expect(v.reasons[0]).toMatch(/100 daily bars/);
    expect(longTermView([]).state).toBe('INSUFFICIENT');
  });
  it('ignores the unfinished day', () => {
    const withPartial = [...rising, { ...rising.at(-1), time: '2999-01-01', close: 1, partial: true }];
    expect(longTermView(withPartial).state).toBe('UPTREND');
  });
});

describe('shortTermView', () => {
  const m = (extra = {}) => ({ rsi: 50, vsEma20Pct: 1, trend: 'mixed', swing: null, ...extra });
  const swing = (side, actionable = true) => ({ strategy: 'pullback', side, actionable, label: 'Active' });
  it('reads valid setups, ignoring expired ones', () => {
    expect(shortTermView(m({ swing: swing('BUY') })).state).toBe('SETUP_LONG');
    expect(shortTermView(m({ swing: swing('SELL_SHORT') })).state).toBe('SETUP_SHORT');
    expect(shortTermView(m({ swing: swing('BUY', false), trend: 'up' })).state).toBe('UP');
  });
  it('flags stretched and oversold readings', () => {
    expect(shortTermView(m({ rsi: 75 })).state).toBe('EXTENDED');
    expect(shortTermView(m({ vsEma20Pct: 9 })).state).toBe('EXTENDED');
    expect(shortTermView(m({ rsi: 25 })).state).toBe('OVERSOLD');
  });
  it('falls back to the averages, and to unknown without data', () => {
    expect(shortTermView(m({ trend: 'up' })).state).toBe('UP');
    expect(shortTermView(m({ trend: 'down' })).state).toBe('DOWN');
    expect(shortTermView(m()).state).toBe('MIXED');
    expect(shortTermView(null).state).toBe('UNKNOWN');
  });
});

describe('reviewHolding', () => {
  const m = (extra = {}) => ({ rsi: 50, vsEma20Pct: 1, trend: 'mixed', swing: null, ...extra });
  const buy = { strategy: 'pullback', side: 'BUY', actionable: true, label: 'Active' };
  const short = { strategy: 'breakdown', side: 'SELL_SHORT', actionable: true, label: 'Active' };
  const review = (cs, metrics, weightPct = 5, extra = {}) => reviewHolding({ holding: { symbol: 'X', weightPct, price: cs.at(-1).close }, candles: cs, metrics, ...extra });

  it('suggests adding only in an uptrend with a pullback or valid setup and room in the portfolio', () => {
    expect(review(rising, m({ swing: buy })).action).toBe('ADD');
    expect(review(rising, m({ rsi: 25 })).action).toBe('ADD');
    expect(review(rising, m({ swing: buy }), 12).action).toBe('HOLD_NO_ADD');
    expect(review(rising, m({ swing: buy }), 25).action).toBe('HOLD_NO_ADD');
  });
  it('keeps holding an uptrend through a short-term dip, and says so', () => {
    const r = review(rising, m({ trend: 'down' }));
    expect(r.action).toBe('HOLD');
    expect(r.reasons.join(' ')).toMatch(/pullback so far/);
  });
  it('holds an uptrend with nothing triggered, and does not add to a stretched or oversized one', () => {
    expect(review(rising, m({ trend: 'up' })).action).toBe('HOLD');
    expect(review(rising, m({ trend: 'up' }), 25).action).toBe('HOLD_NO_ADD');
    expect(review(rising, m({ rsi: 80 })).action).toBe('HOLD_NO_ADD');
    expect(review(rising, m({ rsi: 80 }), 25).action).toBe('TRIM');
  });
  it('flags a reduce/exit review only when long and short term both point down', () => {
    expect(review(falling, m({ trend: 'down' })).action).toBe('REDUCE');
    expect(review(falling, m({ swing: short })).action).toBe('REDUCE');
    expect(review(below200, m({ trend: 'down' })).action).toBe('REDUCE');
    const bounce = review(falling, m({ trend: 'up' }));
    expect(bounce.action).toBe('WATCH');
    expect(bounce.reasons.join(' ')).toMatch(/bounce/);
  });
  it('watches a weakening trend or a short history', () => {
    expect(review(weakening, m({ trend: 'up' })).action).toBe('WATCH');
    expect(review(candles(Array.from({ length: 80 }, (_, i) => 100 + i)), m({ trend: 'up' })).action).toBe('WATCH');
    expect(review(rising, null).action).toBe('HOLD');
  });
  it('explains itself and uses an optional cost price', () => {
    const r = review(falling, m({ trend: 'down' }), 5, { avgCost: 300 });
    expect(r.reasons.length).toBeGreaterThan(2);
    expect(r.pnlPct).toBeCloseTo(((falling.at(-1).close - 300) / 300) * 100);
    expect(r.reasons.join(' ')).toMatch(/below your average cost/);
    expect(review(rising, m({ trend: 'up' }), 5, { avgCost: -5 }).pnlPct).toBeNull();
    expect(review(rising, m({ trend: 'up' })).pnlPct).toBeNull();
  });
  it('has a label for every action it can return', () => {
    for (const key of ['ADD', 'HOLD', 'HOLD_NO_ADD', 'WATCH', 'TRIM', 'REDUCE']) expect(ACTIONS[key].label).toBeTruthy();
  });
});

describe('portfolioNotes', () => {
  const holdings = [
    { symbol: 'AAA', weightPct: 40 },
    { symbol: 'BBB', weightPct: 35 },
    { symbol: 'CCC', weightPct: 25 },
  ];
  it('flags concentration, sectors, correlated pairs and holdings to review', () => {
    const notes = portfolioNotes({
      holdings,
      sectors: [{ key: 'Bank', weightPct: 75, symbols: ['AAA', 'BBB'] }, { key: 'IT', weightPct: 25, symbols: ['CCC'] }],
      sizes: [{ key: 'Small cap (Nifty Smallcap 250)', weightPct: 40 }],
      reviews: new Map([['CCC', { action: 'REDUCE' }]]),
      pairs: [{ a: 'AAA', b: 'BBB', r: 0.91 }],
      avgCorr: 0.5,
      risk: { volPct: 21.3, maxDrawdownPct: -12.4, days: 120 },
      funds: { unallocatedBalance: 100 },
      totalValue: 900,
    });
    const text = notes.map((n) => n.text).join('\n');
    expect(text).toMatch(/AAA is 40.0% of the portfolio/);
    expect(text).toMatch(/Bank is 75.0%/);
    expect(text).toMatch(/AAA and BBB \(0.91\)/);
    expect(text).toMatch(/reduce or exit.*25.0%/);
    expect(text).toMatch(/small caps/);
    expect(text).toMatch(/21.3% a year/);
    expect(text).toMatch(/cash is about 10.0%/);
    expect(notes.filter((n) => n.level === 'warn').length).toBeGreaterThanOrEqual(5);
  });
  it('stays quiet for a balanced portfolio and says little when data is missing', () => {
    const balanced = Array.from({ length: 10 }, (_, i) => ({ symbol: `S${i}`, weightPct: 10 }));
    expect(portfolioNotes({ holdings: balanced })).toEqual([]);
    expect(portfolioNotes({ holdings: [] })).toEqual([]);
    expect(portfolioNotes({ holdings: holdings.slice(0, 2).map((h) => ({ ...h, weightPct: 10 })) }).map((n) => n.text)[0]).toMatch(/Only 2 holdings/);
  });
  it('does not flag the unclassified bucket as a sector', () => {
    const notes = portfolioNotes({ holdings: balancedHoldings(), sectors: [{ key: 'Other / unclassified', weightPct: 80, symbols: ['A'] }] });
    expect(notes).toEqual([]);
  });
  it('exposes its limits for the screen to quote', () => {
    expect(LIMITS.stockWarnPct).toBe(20);
  });
});

function balancedHoldings() {
  return Array.from({ length: 10 }, (_, i) => ({ symbol: `S${i}`, weightPct: 10 }));
}

describe('analysePortfolio', () => {
  const noise = (seed) => Array.from({ length: 250 }, (_, i) => 1 + 0.01 * Math.sin(i * seed));
  const trending = (seed, slope) => candles(noise(seed).map((n, i) => (100 + i * slope) * n));
  const holdings = [
    { symbol: 'UP1', code: 'u1', value: 5000, weightPct: 50, price: 225 },
    { symbol: 'UP2', code: 'u2', value: 3000, weightPct: 30, price: 225 },
    { symbol: 'DOWN', code: 'd', value: 2000, weightPct: 20, price: 150 },
    { symbol: null, code: 'XYZ', value: 100, weightPct: 1, price: 10 },
  ];
  const candlesBySymbol = new Map([['UP1', trending(1.3, 0.5)], ['UP2', trending(1.3, 0.4)], ['DOWN', trending(2.7, -0.4)]]);
  const classify = (s) => ({ sector: s === 'DOWN' ? 'IT' : 'Bank', size: 'Large cap (Nifty 100)' });
  const result = analysePortfolio({ holdings, candlesBySymbol, classify, funds: { unallocatedBalance: 500 }, totalValue: 10100, costs: { DOWN: 200 } });

  it('reviews every holding that has history and leaves the rest without a verdict', () => {
    expect(result.reviewed).toBe(3);
    expect(result.rows).toHaveLength(4);
    expect(result.rows[3].review).toBeNull();
    expect(result.rows[0].review.longTerm.state).toBe('UPTREND');
    expect(result.rows[2].review.longTerm.state).toBe('DOWNTREND');
    expect(result.rows[2].avgCost).toBe(200);
    expect(result.rows[2].review.pnlPct).toBeCloseTo(-25);
  });

  it('allocates by sector and size, and measures concentration', () => {
    expect(result.sectors.map((s) => s.key)).toEqual(['Bank', 'IT', 'Other / unclassified']); // a holding with no NSE symbol is unclassified
    expect(result.sectors[0].symbols).toEqual(['UP1', 'UP2']);
    expect(result.sectors[2].symbols).toEqual(['XYZ']);
    expect(result.sizes[0].key).toBe('Large cap (Nifty 100)');
    expect(result.concentration.top1Pct).toBeCloseTo((5000 / 10100) * 100);
  });

  it('computes correlation and risk from the stocks with history, and summarises actions', () => {
    expect(result.correlation.symbols).toEqual(['UP1', 'UP2', 'DOWN']);
    expect(result.correlation.cells[0][1]).toBeGreaterThan(0.9); // same wobble pattern
    expect(result.pairs.some((p) => p.a === 'UP1' && p.b === 'UP2')).toBe(true);
    expect(result.risk.countedStocks).toBe(3);
    expect(result.risk.volPct).toBeGreaterThan(0);
    expect(Object.values(result.actionShare).reduce((s, g) => s + g.count, 0)).toBe(3);
    expect(result.notes.map((n) => n.text).join(' ')).toMatch(/UP1 is 50.0%/);
  });

  it('copes with no history at all', () => {
    const empty = analysePortfolio({ holdings, candlesBySymbol: new Map(), classify });
    expect(empty.reviewed).toBe(0);
    expect(empty.correlation).toBeNull();
    expect(empty.risk).toBeNull();
    expect(empty.sectors.length).toBeGreaterThan(0);
  });
});
