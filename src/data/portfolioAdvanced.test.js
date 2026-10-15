import { describe, expect, it } from 'vitest';
import { advancedPortfolio, advancedFindings, trailingReturn, drawdownFromHigh } from './portfolioAdvanced';

const day = (i) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
// closes from a list of daily returns
const candlesFrom = (rets, start = 100) => {
  let p = start;
  return [{ time: day(0), close: p }, ...rets.map((r, i) => ({ time: day(i + 1), close: (p *= 1 + r) }))];
};
const wave = (n, amp, phase = 0) => Array.from({ length: n }, (_, i) => amp * Math.sin(i / 3 + phase));
const N = 120;

describe('trailingReturn / drawdownFromHigh', () => {
  const c = candlesFrom([0.1, 0.1, -0.1]);
  it('measures over completed bars and needs enough history', () => {
    expect(trailingReturn(c, 3)).toBeCloseTo((c[3].close / c[0].close - 1) * 100, 6);
    expect(trailingReturn(c, 10)).toBeNull();
  });
  it('is the fall from the highest close', () => {
    expect(drawdownFromHigh(c)).toBeCloseTo(-10, 6);
  });
});

describe('advancedPortfolio', () => {
  const a = wave(N, 0.01);
  const holdings = [{ symbol: 'A', value: 60000 }, { symbol: 'B', value: 40000 }];

  it('refuses without enough shared history instead of guessing', () => {
    const r = advancedPortfolio({ holdings, candlesBySymbol: new Map([['A', candlesFrom(wave(20, 0.01))], ['B', candlesFrom(wave(20, 0.01))]]) });
    expect(r.ok).toBe(false);
    expect(advancedPortfolio({ holdings: [holdings[0]], candlesBySymbol: new Map() }).ok).toBe(false);
  });

  it('two identical stocks give no diversification and risk shares that match weights', () => {
    const r = advancedPortfolio({ holdings, candlesBySymbol: new Map([['A', candlesFrom(a)], ['B', candlesFrom(a)]]) });
    expect(r.ok).toBe(true);
    expect(r.diversificationRatio).toBeCloseTo(1, 6);
    const byS = Object.fromEntries(r.rows.map((x) => [x.symbol, x]));
    expect(byS.A.riskSharePct).toBeCloseTo(60, 4);
    expect(byS.B.riskSharePct).toBeCloseTo(40, 4);
    expect(r.rows.reduce((s, x) => s + x.riskSharePct, 0)).toBeCloseTo(100, 6);
  });

  it('opposite stocks diversify strongly and shrink volatility', () => {
    const neg = a.map((x) => -x);
    const r = advancedPortfolio({ holdings: [{ symbol: 'A', value: 50000 }, { symbol: 'B', value: 50000 }], candlesBySymbol: new Map([['A', candlesFrom(a)], ['B', candlesFrom(neg)]]) });
    expect(r.volPct).toBeLessThan(2);
    expect(r.diversificationRatio).toBeGreaterThan(5);
  });

  it('beta against a benchmark: a stock moving 2x the index has beta 2, and stress scales with it', () => {
    const bench = wave(N, 0.005);
    const twice = bench.map((x) => 2 * x);
    const r = advancedPortfolio({
      holdings: [{ symbol: 'A', value: 50000 }, { symbol: 'B', value: 50000 }],
      candlesBySymbol: new Map([['A', candlesFrom(twice)], ['B', candlesFrom(twice)]]),
      benchmarkCandles: candlesFrom(bench),
    });
    expect(r.beta).toBeCloseTo(2, 2);
    expect(r.correlation).toBeCloseTo(1, 3);
    expect(r.stress.find((s) => s.marketPct === -10).portfolioPct).toBeCloseTo(-20, 1);
    expect(r.stress.find((s) => s.marketPct === -10).amount).toBeCloseTo(-20000, -1);
  });

  it('has no beta or stress without a benchmark', () => {
    const r = advancedPortfolio({ holdings, candlesBySymbol: new Map([['A', candlesFrom(a)], ['B', candlesFrom(wave(N, 0.01, 1))]]) });
    expect(r.beta).toBeNull();
    expect(r.stress).toEqual([]);
  });

  it('reports the amount above the single-stock cap and the coverage of unpriced history', () => {
    const r = advancedPortfolio({
      holdings: [{ symbol: 'A', value: 60000 }, { symbol: 'B', value: 30000 }, { symbol: 'C', value: 10000 }],
      candlesBySymbol: new Map([['A', candlesFrom(a)], ['B', candlesFrom(wave(N, 0.01, 1))]]),
      capPct: 20,
    });
    expect(r.coveragePct).toBeCloseTo(90, 6);
    expect(r.overCap.map((o) => o.symbol)).toEqual(['A', 'B']);
    expect(r.overCap[0].excessValue).toBeCloseTo((66.6667 - 20) / 100 * 90000, 0);
  });

  it('value-at-risk is the 5th-percentile day and expected shortfall is no better than it', () => {
    const r = advancedPortfolio({ holdings, candlesBySymbol: new Map([['A', candlesFrom(a)], ['B', candlesFrom(wave(N, 0.01, 2))]]) });
    expect(r.es95Pct).toBeLessThanOrEqual(r.var95Pct);
    expect(r.worstDayPct).toBeLessThanOrEqual(r.var95Pct);
  });

  it('findings quote numbers and warn about low coverage', () => {
    const r = advancedPortfolio({ holdings: [{ symbol: 'A', value: 60000 }, { symbol: 'B', value: 20000 }, { symbol: 'C', value: 20000 }], candlesBySymbol: new Map([['A', candlesFrom(a)], ['B', candlesFrom(wave(N, 0.01, 1))]]) });
    const text = advancedFindings(r).map((f) => f.text).join(' ');
    expect(text).toMatch(/Only \d+% of your holdings/);
    expect(advancedFindings({ ok: false })).toEqual([]);
  });
});
