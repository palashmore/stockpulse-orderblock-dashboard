import { describe, it, expect } from 'vitest';
import {
  NO_SECTOR, DEFAULT_FILTERS, relVolume, buildRows, signalOf, signalMap, filtersActive, filterRows, sectorsOf, universeStats,
  indexCards, coverageLine, dotLayout, byAbsMove,
} from './dashboardView';

const stocks = [
  { symbol: 'AAA', name: 'Alpha Ltd', sector: 'Bank', indices: ['Nifty Bank'] },
  { symbol: 'BBB', name: 'Beta Ltd', sector: 'Bank', indices: ['Nifty Bank', 'Nifty 50'] },
  { symbol: 'CCC', name: 'Gamma Ltd', sector: 'IT', indices: ['Nifty IT'] },
  { symbol: 'DDD', name: 'Delta Ltd', sector: 'IT', indices: ['Nifty IT'] },
  { symbol: 'EEE', name: 'Eps Ltd', sector: '', indices: ['Custom'] },
  { symbol: 'GONE', name: 'No quote', sector: 'IT', indices: ['Nifty IT'] },
];
const quotes = [
  { symbol: 'AAA', price: 100, changePct: 2.5, volume: 3000, avgVolume: 1000 },
  { symbol: 'BBB', price: 200, changePct: -1.2, volume: 500, avgVolume: 1000 },
  { symbol: 'CCC', price: 300, changePct: 0, volume: null, avgVolume: 1000 },
  { symbol: 'DDD', price: 400, changePct: 0.8, volume: 1500, avgVolume: 1000 },
  { symbol: 'EEE', price: 50, changePct: -4, volume: 100, avgVolume: 0 },
  { symbol: 'BAD', price: null, changePct: 1 },
  { symbol: 'WORSE', price: 10, changePct: undefined },
];
const { rows, unpriced } = buildRows(quotes, stocks);
const syms = (r) => r.rows.map((x) => x.symbol);

describe('relVolume and buildRows', () => {
  it('computes relative volume only when both figures exist', () => {
    expect(relVolume({ volume: 3000, avgVolume: 1000 })).toBe(3);
    expect(relVolume({ volume: null, avgVolume: 1000 })).toBeNull();
    expect(relVolume({ volume: 5, avgVolume: 0 })).toBeNull();
    expect(relVolume(null)).toBeNull();
  });
  it('joins quotes with the universe and drops unpriced quotes', () => {
    expect(rows.map((r) => r.symbol)).toEqual(['AAA', 'BBB', 'CCC', 'DDD', 'EEE']);
    expect(rows[0]).toMatchObject({ name: 'Alpha Ltd', sector: 'Bank', indices: ['Nifty Bank'], relVolume: 3 });
    expect(rows[4].sector).toBe(NO_SECTOR);
    expect(rows[2].relVolume).toBeNull();
  });
  it('keeps open, high and low for the boards, and null when the quote has none', () => {
    const r = buildRows([{ symbol: 'AAA', price: 10, changePct: 1, open: 9, high: 11, low: 8.5 }, { symbol: 'BBB', price: 10, changePct: 1 }], stocks).rows;
    expect(r[0]).toMatchObject({ open: 9, high: 11, low: 8.5 });
    expect(r[1]).toMatchObject({ open: null, high: null, low: null });
  });
  it('lists the universe stocks that got no usable quote', () => {
    expect(unpriced).toEqual(['GONE']);
  });
  it('copes with empty input', () => {
    expect(buildRows(null, null)).toEqual({ rows: [], unpriced: [] });
  });
});

describe('signals', () => {
  const m = (side, actionable) => ({ swing: { side, actionable } });
  it('counts only a still-valid setup, by side', () => {
    expect(signalOf(m('BUY', true))).toBe('long');
    expect(signalOf(m('SELL_SHORT', true))).toBe('short');
    expect(signalOf(m('BUY', false))).toBe('none');
    expect(signalOf({ swing: null })).toBe('none');
    expect(signalOf(null)).toBe('none');
  });
  it('builds a map keyed by symbol', () => {
    const map = signalMap([{ symbol: 'AAA', metrics: m('BUY', true) }, { symbol: 'BBB', metrics: null }]);
    expect(map.get('AAA')).toBe('long');
    expect(map.get('BBB')).toBe('none');
    expect(map.has('CCC')).toBe(false);
  });
});

describe('filterRows', () => {
  it('returns everything with no filters', () => {
    expect(syms(filterRows(rows))).toEqual(['AAA', 'BBB', 'CCC', 'DDD', 'EEE']);
    expect(filtersActive(DEFAULT_FILTERS)).toBe(false);
  });
  it('filters by sector, including the unclassified bucket', () => {
    expect(syms(filterRows(rows, { sector: 'IT' }))).toEqual(['CCC', 'DDD']);
    expect(syms(filterRows(rows, { sector: NO_SECTOR }))).toEqual(['EEE']);
    expect(filtersActive({ sector: 'IT' })).toBe(true);
  });
  it('filters by percent-change range, inclusive, with either bound optional', () => {
    expect(syms(filterRows(rows, { minPct: '0.8' }))).toEqual(['AAA', 'DDD']);
    expect(syms(filterRows(rows, { maxPct: '0' }))).toEqual(['BBB', 'CCC', 'EEE']);
    expect(syms(filterRows(rows, { minPct: '-2', maxPct: '1' }))).toEqual(['BBB', 'CCC', 'DDD']);
    expect(syms(filterRows(rows, { minPct: 'abc' }))).toHaveLength(5); // an unreadable bound is ignored
  });
  it('filters by relative volume, never matching stocks without one', () => {
    expect(syms(filterRows(rows, { minRelVol: '1.5' }))).toEqual(['AAA', 'DDD']);
    expect(syms(filterRows(rows, { minRelVol: '3' }))).toEqual(['AAA']);
  });
  it('combines filters', () => {
    expect(syms(filterRows(rows, { sector: 'IT', minRelVol: '1.5', minPct: '0' }))).toEqual(['DDD']);
  });
  it('filters by signal status and counts stocks the scan did not cover as unknown, not as "none"', () => {
    const signals = new Map([['AAA', 'long'], ['BBB', 'short'], ['CCC', 'none']]);
    expect(syms(filterRows(rows, { signal: 'long' }, signals))).toEqual(['AAA']);
    expect(syms(filterRows(rows, { signal: 'short' }, signals))).toEqual(['BBB']);
    const none = filterRows(rows, { signal: 'none' }, signals);
    expect(syms(none)).toEqual(['CCC']);
    expect(none.unknownSignal).toBe(2); // DDD and EEE were not scanned
    expect(filterRows(rows, { signal: 'any' }, new Map()).unknownSignal).toBe(0);
  });
});

describe('sectorsOf and universeStats', () => {
  it('lists sectors biggest first', () => {
    expect(sectorsOf(rows)).toEqual([{ sector: 'Bank', count: 2 }, { sector: 'IT', count: 2 }, { sector: NO_SECTOR, count: 1 }]);
  });
  it('computes breadth and sector averages from exactly the rows given', () => {
    const { breadth, sectors } = universeStats(rows);
    expect(breadth).toMatchObject({ advancers: 2, decliners: 2, unchanged: 1, ratio: 1 });
    const bank = sectors.sectors.find((s) => s.sector === 'Bank');
    expect(bank).toMatchObject({ count: 2 });
    expect(bank.avgChangePct).toBeCloseTo((2.5 - 1.2) / 2);
    expect(sectors.sectors.find((s) => s.sector === 'IT').avgChangePct).toBeCloseTo(0.4);
    expect(sectors.uncovered).toBe(1); // the unclassified stock is left out of the sector view
  });
  it('changes with the universe: a different set of stocks gives different numbers', () => {
    const a = universeStats(rows.slice(0, 2));
    const b = universeStats(rows.slice(2));
    expect(a.breadth.advancers).toBe(1);
    expect(b.breadth.advancers).toBe(1);
    expect(a.breadth.decliners).toBe(1);
    expect(a.sectors.sectors.map((s) => s.sector)).toEqual(['Bank']);
    expect(b.sectors.sectors.map((s) => s.sector)).toEqual(['IT']);
  });
  it('handles an empty universe', () => {
    expect(universeStats([]).breadth).toMatchObject({ advancers: 0, decliners: 0, ratio: null });
  });
});

describe('indexCards', () => {
  const levels = { indices: { nifty50: { last: 22363.35, change: -157.2, changePct: -0.7, advances: 13, declines: 36, unchanged: 1 } }, missing: ['healthcare'] };
  it('gives one card per selected index with NSE levels, and null where NSE reports none', () => {
    const cards = indexCards({ ids: ['nifty50', 'healthcare'] }, { nifty50: 'Nifty 50', healthcare: 'Nifty Healthcare' }, levels);
    expect(cards[0]).toMatchObject({ id: 'nifty50', label: 'Nifty 50', level: 22363.35, changePct: -0.7, advances: 13, declines: 36 });
    expect(cards[1]).toMatchObject({ id: 'healthcare', label: 'Nifty Healthcare', level: null, changePct: null });
  });
  it('works before levels have loaded or with no selection', () => {
    expect(indexCards({ ids: ['bank'] }, {}, null)[0]).toMatchObject({ label: 'bank', level: null });
    expect(indexCards({ ids: [] }, {}, levels)).toEqual([]);
    expect(indexCards(null, {}, levels)).toEqual([]);
  });
});

describe('coverageLine, dotLayout and byAbsMove', () => {
  it('describes coverage and what is missing', () => {
    expect(coverageLine({ universeCount: 50, pricedCount: 50 })).toBe('50 of 50 stocks priced');
    expect(coverageLine({ universeCount: 50, pricedCount: 48, unpriced: ['A', 'B'], failedIds: ['bank'] })).toBe('48 of 50 stocks priced · 2 without a price (A, B) · 1 selected index could not be loaded (bank)');
    expect(coverageLine({ universeCount: 500, pricedCount: 490, unpriced: Array.from({ length: 10 }, (_, i) => `S${i}`) })).toBe('490 of 500 stocks priced · 10 without a price');
  });
  it('shrinks dots for a crowded plot but keeps them visible', () => {
    expect(dotLayout(4, 50)).toEqual({ size: 10, step: 12 });
    expect(dotLayout(60, 495).step).toBeLessThanOrEqual(8);
    const crowded = dotLayout(400, 495);
    expect(crowded.step).toBe(3);
    expect(crowded.size).toBe(2);
    expect(dotLayout(0, 0).step).toBeGreaterThanOrEqual(3);
  });
  it('orders by the size of the move', () => {
    expect(byAbsMove(rows).map((r) => r.symbol)).toEqual(['EEE', 'AAA', 'BBB', 'DDD', 'CCC']);
  });
});
