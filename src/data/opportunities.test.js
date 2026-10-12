import { describe, it, expect } from 'vitest';
import { scoreRow, rankOpportunities, directionOf, SCORE_CRITERIA } from './opportunities';
import { liquidityTier, liquidityList, depthStats } from './orderFlow';
import { DEFAULT_FILTERS } from './screenFilters';

const metrics = (o = {}) => ({
  trend: 'up', diBias: 'up', adx: 30, relVol: 2.5, turnoverCr: 150, price: 100, changePct: 1, rsi: 55, atrPct: 2,
  asOf: '2026-10-12', setup: null, swing: null, aboveVwap: true, ...o,
});
const row = (symbol, o) => ({ symbol, name: symbol, sector: '', indices: ['Nifty 50'], metrics: metrics(o) });
const goodSwing = { side: 'BUY', actionable: true, rr: 3, ageBars: 0, status: 'ACTIVE' };

describe('scoreRow', () => {
  it('adds up every criterion exactly as documented (hand-checked)', () => {
    const r = scoreRow(row('A', { swing: goodSwing }), { lastSession: '2026-10-12' });
    // setup 25 + trend (10 + 5 + 10) + volume 15 + liquidity 15 + reward 10 + fresh 10 = 100
    expect(r.score).toBe(100);
    expect(r.direction).toBe('long');
    expect(r.breakdown.map((b) => [b.key, b.points])).toEqual([['setup', 25], ['trend', 25], ['volume', 15], ['liquidity', 15], ['reward', 10], ['fresh', 10]]);
    expect(SCORE_CRITERIA.reduce((s, c) => s + c.max, 0)).toBe(100);
  });

  it('scores a stock with no valid setup lower, and mid-range inputs at the middle tiers', () => {
    const r = scoreRow(row('B', { adx: 22, relVol: 1.2, turnoverCr: 30, asOf: '2026-10-10' }), { lastSession: '2026-10-12' });
    // setup 0 + trend (10 + 5 + 5) + volume 5 + liquidity 10 + reward 0 + fresh 5 (2 days old)
    expect(r.score).toBe(40);
  });

  it('does not credit a setup that is no longer valid', () => {
    const r = scoreRow(row('C', { swing: { ...goodSwing, actionable: false, status: 'STOPPED' } }), { lastSession: '2026-10-12' });
    expect(r.breakdown.find((b) => b.key === 'setup').points).toBe(0);
    expect(r.breakdown.find((b) => b.key === 'reward').points).toBe(0);
  });

  it('scores shorts against a downtrend, and gives nothing for missing inputs', () => {
    const s = scoreRow(row('D', { trend: 'down', diBias: 'down', adx: 26 }), { lastSession: '2026-10-12' });
    expect(s.direction).toBe('short');
    expect(s.breakdown.find((b) => b.key === 'trend').points).toBe(25);
    const none = scoreRow(row('E', { relVol: null, turnoverCr: null, adx: null, asOf: null }), { lastSession: null });
    expect(none.breakdown.find((b) => b.key === 'volume').points).toBe(0);
    expect(none.breakdown.find((b) => b.key === 'liquidity').points).toBe(0);
    expect(none.breakdown.find((b) => b.key === 'fresh').points).toBe(0);
  });

  it('has no direction for a mixed trend without a setup', () => {
    expect(scoreRow(row('F', { trend: 'mixed' }))).toBeNull();
    expect(directionOf(metrics({ trend: 'mixed', swing: { side: 'SELL_SHORT' } }))).toBe('short');
  });
});

describe('rankOpportunities', () => {
  const rows = [
    row('LOW', { relVol: 0.5, turnoverCr: 1, adx: 10 }),
    row('TOP', { swing: goodSwing }),
    row('MID', { relVol: 1.6 }),
    row('MIXED', { trend: 'mixed' }),
    { symbol: 'NOMETRICS', metrics: null },
  ];

  it('ranks by score, applies the filter first, counts rows with no direction, and applies a minimum score', () => {
    const r = rankOpportunities(rows, { lastSession: '2026-10-12' });
    expect(r.ranked.map((x) => x.symbol)).toEqual(['TOP', 'MID', 'LOW']);
    expect(r.undirected).toBe(1);
    expect(r.passedFilter).toBe(4);
    expect(r.ranked[0]).toMatchObject({ score: 100, target: 'swing' });
    expect(r.ranked[1].target).toBe('analysis');
    expect(rankOpportunities(rows, { lastSession: '2026-10-12', minScore: 60 }).ranked.map((x) => x.symbol)).toEqual(['TOP', 'MID']);
    expect(rankOpportunities(rows, { lastSession: '2026-10-12', filters: { ...DEFAULT_FILTERS, minRelVol: 2 } }).ranked.map((x) => x.symbol)).toEqual(['TOP']);
  });

  it('breaks ties by symbol so the order is stable', () => {
    const r = rankOpportunities([row('B', {}), row('A', {})], { lastSession: '2026-10-12' });
    expect(r.ranked.map((x) => x.symbol)).toEqual(['A', 'B']);
  });
});

describe('liquidity and depth', () => {
  it('assigns tiers by turnover', () => {
    expect(liquidityTier(150).id).toBe('high');
    expect(liquidityTier(20).id).toBe('medium');
    expect(liquidityTier(5).id).toBe('low');
    expect(liquidityTier(1).id).toBe('thin');
    expect(liquidityTier(null)).toBeNull();
  });

  it('ranks by turnover and leaves out stocks without it', () => {
    const rows = [row('A', { turnoverCr: 10 }), row('B', { turnoverCr: 500 }), row('C', { turnoverCr: null })];
    expect(liquidityList(rows).map((r) => r.symbol)).toEqual(['B', 'A']);
    expect(liquidityList(rows, 1)).toHaveLength(1);
  });

  it('works out spread and imbalance from depth levels (hand-checked)', () => {
    const levels = [{ bidPrice: 99.9, bidQty: 300, askPrice: 100.1, askQty: 100 }, { bidPrice: 99.8, bidQty: 100, askPrice: 100.2, askQty: 100 }];
    const d = depthStats(levels);
    expect(d.spread).toBeCloseTo(0.2, 6);
    expect(d.spreadPct).toBeCloseTo((0.2 / 100) * 100, 6);
    expect(d).toMatchObject({ bidQty: 400, askQty: 200, levels: 2 });
    expect(d.imbalance).toBeCloseTo(200 / 600, 10);
  });

  it('returns nothing for an unusable top of book instead of inventing figures', () => {
    expect(depthStats([])).toBeNull();
    expect(depthStats(null)).toBeNull();
    expect(depthStats([{ bidPrice: 0, askPrice: 100, bidQty: 1, askQty: 1 }])).toBeNull();
    expect(depthStats([{ bidPrice: 100, askPrice: 101, bidQty: 0, askQty: 0 }]).imbalance).toBeNull();
  });
});
