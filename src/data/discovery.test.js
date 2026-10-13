import { describe, it, expect } from 'vitest';
import {
  DISCOVERY_TABS, tradedValueCr, searchRows, sortRows, highVolumeList, gainersList, losersList, watchlistRows, restrictScanRows,
  restrictIntradayScans, validateView, loadView, saveView, DEFAULT_VIEW, VIEW_KEY,
} from './discovery';

const rows = [
  { symbol: 'AAA', name: 'Alpha Bank', sector: 'Bank', indices: ['Nifty Bank'], price: 100, changePct: 2, volume: 2e6, relVolume: 2.5 },
  { symbol: 'BBB', name: 'Beta Tech', sector: 'IT', indices: ['Nifty IT', 'Nifty 50'], price: 50, changePct: -1.5, volume: 1e6, relVolume: 0.8 },
  { symbol: 'CCC', name: 'Gamma Auto', sector: 'Auto', indices: ['Nifty Auto'], price: 400, changePct: 0, volume: null, relVolume: null },
  { symbol: 'DDD', name: 'Delta Tech', sector: 'IT', indices: ['Nifty IT'], price: 10, changePct: 5, volume: 5e6, relVolume: 1.6 },
];
const syms = (r) => r.map((x) => x.symbol);

describe('tabs', () => {
  it('has the eight tabs asked for, in order', () => {
    expect(DISCOVERY_TABS.map((t) => t.label)).toEqual(['High volume', 'Intraday signals', 'Swing trending', 'Gainers', 'Losers', 'Volume & liquidity', 'Watchlist', 'My opportunities']);
  });
});

describe('searchRows', () => {
  it('matches symbol, name, sector and index membership, all words required, case-insensitively', () => {
    expect(syms(searchRows(rows, 'tech'))).toEqual(['BBB', 'DDD']);
    expect(syms(searchRows(rows, 'tech nifty 50'))).toEqual(['BBB']);
    expect(syms(searchRows(rows, 'aaa'))).toEqual(['AAA']);
    expect(syms(searchRows(rows, 'bank'))).toEqual(['AAA']);
    expect(syms(searchRows(rows, 'nifty it'))).toEqual(['BBB', 'DDD']);
    expect(searchRows(rows, 'zzz')).toEqual([]);
  });
  it('returns everything for an empty search', () => {
    expect(searchRows(rows, '')).toBe(rows);
    expect(searchRows(rows, '   ')).toBe(rows);
    expect(searchRows(rows, null)).toBe(rows);
  });
});

describe('sortRows', () => {
  it('sorts by each column, biggest first by default, either direction', () => {
    expect(syms(sortRows(rows, 'change'))).toEqual(['DDD', 'AAA', 'CCC', 'BBB']);
    expect(syms(sortRows(rows, 'change', 'asc'))).toEqual(['BBB', 'CCC', 'AAA', 'DDD']);
    expect(syms(sortRows(rows, 'price'))).toEqual(['CCC', 'AAA', 'BBB', 'DDD']);
    expect(syms(sortRows(rows, 'value'))).toEqual(['AAA', 'BBB', 'DDD', 'CCC']); // 20 Cr, then a 5 Cr tie broken by symbol, then no volume
  });
  it('puts rows without the value last in both directions', () => {
    expect(syms(sortRows(rows, 'relVolume')).at(-1)).toBe('CCC');
    expect(syms(sortRows(rows, 'relVolume', 'asc')).at(-1)).toBe('CCC');
  });
  it('sorts by symbol and leaves the tab default order alone', () => {
    expect(syms(sortRows(rows, 'symbol', 'asc'))).toEqual(['AAA', 'BBB', 'CCC', 'DDD']);
    expect(syms(sortRows(rows, 'symbol', 'desc'))).toEqual(['DDD', 'CCC', 'BBB', 'AAA']);
    expect(sortRows(rows, 'default')).toBe(rows);
  });
  it('does not change the input', () => {
    const copy = [...rows];
    sortRows(rows, 'price');
    expect(rows).toEqual(copy);
  });
});

describe('lists', () => {
  it('computes traded value in crore', () => {
    expect(tradedValueCr(rows[0])).toBeCloseTo(20); // 100 x 2,000,000 = 200,000,000 = 20 Cr
    expect(tradedValueCr(rows[2])).toBeNull();
  });
  it('lists high-volume stocks by relative volume, with a threshold', () => {
    expect(syms(highVolumeList(rows))).toEqual(['AAA', 'DDD']);
    expect(syms(highVolumeList(rows, 2))).toEqual(['AAA']);
    expect(highVolumeList(rows, 10)).toEqual([]);
  });
  it('lists gainers and losers, strongest first, leaving out unchanged stocks', () => {
    expect(syms(gainersList(rows))).toEqual(['DDD', 'AAA']);
    expect(syms(losersList(rows))).toEqual(['BBB']);
  });
  it('lists watchlist stocks in the universe and names the ones outside it', () => {
    const w = watchlistRows(rows, new Set(['BBB', 'ZZZ', 'AAA', 'YYY']));
    expect(syms(w.rows)).toEqual(['AAA', 'BBB']);
    expect(w.outside).toEqual(['YYY', 'ZZZ']);
    expect(watchlistRows(rows, new Set())).toEqual({ rows: [], outside: [] });
  });
});

describe('restricting scans to the filtered symbols', () => {
  const allowed = new Set(['AAA', 'DDD']);
  it('keeps only allowed daily rows and intraday scans', () => {
    expect(syms(restrictScanRows([{ symbol: 'AAA' }, { symbol: 'BBB' }, { symbol: 'DDD' }], allowed))).toEqual(['AAA', 'DDD']);
    expect(syms(restrictIntradayScans([{ symbol: 'BBB' }, { symbol: 'DDD' }], allowed))).toEqual(['DDD']);
    expect(restrictScanRows([], allowed)).toEqual([]);
  });
});

describe('saved view', () => {
  it('has defaults and validates every field', () => {
    expect(validateView(null)).toEqual(DEFAULT_VIEW);
    const v = validateView({ tab: 'losers', search: 'bank', sort: 'price', dir: 'asc', filters: { sector: 'IT', minPct: '1', maxPct: '', minRelVol: '1.5', signal: 'long' } });
    expect(v).toMatchObject({ tab: 'losers', search: 'bank', sort: 'price', dir: 'asc', filters: { sector: 'IT', minPct: '1', signal: 'long' } });
    expect(validateView({ tab: 'nope', sort: 'x', dir: 'sideways', filters: { signal: 'maybe', sector: 5 } })).toEqual(DEFAULT_VIEW);
  });
  it('trims long text and ignores non-strings', () => {
    expect(validateView({ search: 'x'.repeat(500) }).search).toHaveLength(60);
    expect(validateView({ search: 7 }).search).toBe('');
  });
  it('round-trips through storage and survives corrupt or blocked storage', () => {
    let value = null;
    const storage = { getItem: () => value, setItem: (_k, v) => { value = v; } };
    expect(saveView({ ...DEFAULT_VIEW, tab: 'swing', search: 'it' }, storage)).toBe(true);
    expect(loadView(storage)).toMatchObject({ tab: 'swing', search: 'it' });
    expect(loadView({ getItem: () => '{bad' })).toEqual(DEFAULT_VIEW);
    expect(loadView({ getItem: () => { throw new Error('blocked'); } })).toEqual(DEFAULT_VIEW);
    expect(saveView(DEFAULT_VIEW, { setItem: () => { throw new Error('full'); } })).toBe(false);
    expect(VIEW_KEY).toMatch(/dashboard/);
  });
});
