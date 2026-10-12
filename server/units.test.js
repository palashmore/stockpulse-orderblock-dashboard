import { describe, it, expect } from 'vitest';
import { createCache } from './cache.js';
import {
  classifyQuoteStatus,
  classifyOptionsStatus,
  parseNseTimestamp,
  getMarketStatus,
} from './dataStatus.js';
import { computePCR, computeMaxPain, buildOptionsChain } from './options.js';
import { normalizeCandles, isValidSymbol, isSupportedCombination, isIntradayInterval } from './validators.js';
import { classifyHistoryStatus, classifyClosedMarketData } from './dataStatus.js';
import { getMarketState, markPartialCandles } from './marketCalendar.js';
import { NIFTY50_SYMBOLS } from './app.js';
import { NIFTY_STOCKS } from '../src/data/stockData.js';

describe('cache', () => {
  it('separates freshness from the stale window and evicts expired entries', () => {
    let t = 0;
    const cache = createCache(() => t);
    cache.set('k', 'v');
    t = 999;
    expect(cache.getFresh('k', 1000)).toBe('v');
    t = 1000;
    expect(cache.getFresh('k', 1000)).toBeNull();
    expect(cache.getStale('k', 5000)).toEqual({ entry: 'v', ageMs: 1000 });
    t = 5000;
    expect(cache.getStale('k', 5000)).toBeNull();
    expect(cache.size()).toBe(0);
  });

  it('lets a partial entry ask to be refreshed sooner than the normal lifetime, but never later', () => {
    let t = 0;
    const cache = createCache(() => t);
    cache.set('partial', { value: 1, freshForMs: 20 });
    cache.set('complete', { value: 2 });
    cache.set('longer', { value: 3, freshForMs: 5000 });
    t = 19;
    expect(cache.getFresh('partial', 1000)).toEqual({ value: 1, freshForMs: 20 });
    t = 20;
    expect(cache.getFresh('partial', 1000)).toBeNull();
    expect(cache.getFresh('complete', 1000)).toEqual({ value: 2 });
    expect(cache.getFresh('longer', 1000)).toEqual({ value: 3, freshForMs: 5000 }); // capped by the policy's own lifetime
    t = 1000;
    expect(cache.getFresh('longer', 1000)).toBeNull();
    expect(cache.getFresh('missing', 1000)).toBeNull();
  });
});

describe('data status', () => {
  const now = 10_000_000;
  it('classifies quotes', () => {
    expect(classifyQuoteStatus({ marketState: 'CLOSED', quoteTimeMs: now - 1e8, nowMs: now })).toBe('HISTORICAL');
    expect(classifyQuoteStatus({ marketState: 'REGULAR', quoteTimeMs: now - 60_000, nowMs: now })).toBe('DELAYED');
    expect(classifyQuoteStatus({ marketState: 'REGULAR', quoteTimeMs: now - 21 * 60_000, nowMs: now })).toBe('STALE');
    expect(classifyQuoteStatus({ marketState: 'REGULAR', quoteTimeMs: null, nowMs: now })).toBe('STALE');
  });

  it('never reports LIVE', () => {
    for (const marketState of ['REGULAR', 'CLOSED', 'PRE', 'POST']) {
      expect(classifyQuoteStatus({ marketState, quoteTimeMs: now, nowMs: now })).not.toBe('LIVE');
    }
  });

  it('classifies options', () => {
    expect(classifyOptionsStatus({ marketOpen: false, asOfMs: now, nowMs: now })).toBe('HISTORICAL');
    expect(classifyOptionsStatus({ marketOpen: true, asOfMs: now - 60_000, nowMs: now })).toBe('DELAYED');
    expect(classifyOptionsStatus({ marketOpen: true, asOfMs: now - 30 * 60_000, nowMs: now })).toBe('STALE');
    expect(classifyOptionsStatus({ marketOpen: true, asOfMs: null, nowMs: now })).toBe('DELAYED');
  });

  it('parses NSE timestamps as IST', () => {
    expect(parseNseTimestamp('12-Oct-2026 10:58:00')).toBe(Date.UTC(2026, 9, 12, 5, 28));
    expect(parseNseTimestamp('garbage')).toBeNull();
    expect(parseNseTimestamp(undefined)).toBeNull();
  });

  it('knows session boundaries (IST)', () => {
    const at = (h, m, d = 12) => new Date(Date.UTC(2026, 9, d, h, m) - 5.5 * 3600 * 1000);
    expect(getMarketStatus(at(9, 14)).isOpen).toBe(false);
    expect(getMarketStatus(at(9, 14)).isPreOpen).toBe(true);
    expect(getMarketStatus(at(9, 15)).isOpen).toBe(true);
    expect(getMarketStatus(at(15, 30)).isOpen).toBe(true);
    expect(getMarketStatus(at(15, 31)).isOpen).toBe(false);
    expect(getMarketStatus(at(11, 0, 10)).isOpen).toBe(false); // Saturday
  });
});

describe('options analytics', () => {
  const rows = [
    { strike: 100, callOI: 10, putOI: 30 },
    { strike: 110, callOI: 20, putOI: 20 },
    { strike: 120, callOI: 30, putOI: 10 },
  ];

  it('computes PCR and guards zero call OI', () => {
    expect(computePCR(150, 100)).toBe(1.5);
    expect(computePCR(1, 3)).toBe(0.33);
    expect(computePCR(10, 0)).toBeNull();
  });

  it('computes max pain by hand-checked fixture', () => {
    // K=100: puts above pay 20*10 + 10*20 = 400
    // K=110: calls below pay 10*10 = 100, puts above pay 10*10 = 100 -> 200
    // K=120: calls below pay 10*20 + 20*10 = 400
    expect(computeMaxPain(rows)).toBe(110);
  });

  it('returns null for an empty chain and picks the lowest strike on ties', () => {
    expect(computeMaxPain([])).toBeNull();
    expect(computeMaxPain([{ strike: 1, callOI: 0, putOI: 0 }, { strike: 2, callOI: 0, putOI: 0 }])).toBe(1);
  });

  it('rejects malformed chains instead of returning zeros', () => {
    expect(() => buildOptionsChain({}, 'X')).toThrow(/no option chain/);
    expect(() => buildOptionsChain({ records: { expiryDates: ['a'], data: [] } }, 'X')).toThrow();
    const noCalls = { records: { expiryDates: ['a'], data: [{ strikePrice: 1, expiryDate: 'a', PE: { openInterest: 5 } }] } };
    expect(() => buildOptionsChain(noCalls, 'X')).toThrow(/call open interest/);
  });
});

describe('candle validation', () => {
  const t = (d) => Math.floor(Date.UTC(2026, 0, d, 4) / 1000);

  it('drops invalid OHLC, duplicates and out-of-order days', () => {
    const { candles, dropped } = normalizeCandles(
      [t(1), t(2), t(3), t(3), t(2), t(4)],
      {
        open: [10, 10, 10, 11, 10, null],
        high: [12, 12, 5, 13, 12, 12],
        low: [9, 9, 9, 10, 9, 9],
        close: [11, 11, 11, 12, 11, 11],
        volume: [1, 2, 3, 4, 5, 6],
      }
    );
    expect(candles.map((c) => c.time)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    expect(dropped).toBe(3);
  });

  it('uses exchange-timezone calendar dates and keeps missing volume null', () => {
    // 2026-01-01 20:00 UTC is already 2026-01-02 01:30 in IST
    const ts = Math.floor(Date.UTC(2026, 0, 1, 20, 0) / 1000);
    const one = { open: [10], high: [12], low: [9], close: [11], volume: [null] };
    expect(normalizeCandles([ts], one).candles[0].time).toBe('2026-01-02');
    expect(normalizeCandles([ts], one, [], 0).candles[0].time).toBe('2026-01-01');
    expect(normalizeCandles([ts], one).candles[0].volume).toBeNull();
    expect(normalizeCandles([ts], { ...one, volume: [0] }).candles[0].volume).toBe(0);
  });

  it('validates symbols', () => {
    expect(isValidSymbol('M&M')).toBe(true);
    expect(isValidSymbol('BAJAJ-AUTO')).toBe(true);
    expect(isValidSymbol('a b')).toBe(false);
    expect(isValidSymbol('')).toBe(false);
    expect(isValidSymbol('X'.repeat(21))).toBe(false);
  });
});

describe('intraday candles', () => {
  const t0 = Date.UTC(2026, 9, 12, 3, 45) / 1000; // 09:15 IST

  it('keeps bar start as exchange-shifted epoch seconds and allows many bars per day', () => {
    const ohlcv = {
      open: [10, 11, 12], high: [12, 13, 14], low: [9, 10, 11], close: [11, 12, 13], volume: [1, 2, null],
    };
    const { candles } = normalizeCandles([t0, t0 + 3600, t0 + 7200], ohlcv, [], 19800, true);
    expect(candles.map((c) => c.time)).toEqual([t0 + 19800, t0 + 3600 + 19800, t0 + 7200 + 19800]);
    expect(candles[2].volume).toBeNull();
  });

  it('drops out-of-order and duplicate intraday bars', () => {
    const ohlcv = { open: [10, 10, 10], high: [12, 12, 12], low: [9, 9, 9], close: [11, 11, 11], volume: [1, 2, 3] };
    const { candles } = normalizeCandles([t0 + 60, t0, t0 + 60], ohlcv, [], 19800, true);
    expect(candles).toHaveLength(1);
  });

  it('only accepts range/interval pairs Yahoo serves', () => {
    expect(isSupportedCombination('5d', '1m')).toBe(true);
    expect(isSupportedCombination('1mo', '1m')).toBe(false);
    expect(isSupportedCombination('1mo', '5m')).toBe(true);
    expect(isSupportedCombination('6mo', '5m')).toBe(false);
    expect(isSupportedCombination('6mo', '60m')).toBe(true);
    expect(isSupportedCombination('max', '60m')).toBe(false);
    expect(isSupportedCombination('2y', '1wk')).toBe(true);
    expect(isIntradayInterval('1mo')).toBe(false);
    expect(isIntradayInterval('60m')).toBe(true);
  });

  it('classifies history status from the newest bar', () => {
    const nowMs = 10_000_000;
    const base = { intraday: true, marketOpen: true, intervalMs: 60_000, nowMs };
    expect(classifyHistoryStatus({ ...base, lastBarMs: nowMs - 60_000 })).toBe('DELAYED');
    expect(classifyHistoryStatus({ ...base, lastBarMs: nowMs - 30 * 60_000 })).toBe('STALE');
    expect(classifyHistoryStatus({ ...base, lastBarMs: null })).toBe('STALE');
    expect(classifyHistoryStatus({ ...base, marketOpen: false, lastBarMs: nowMs })).toBe('HISTORICAL');
    expect(classifyHistoryStatus({ ...base, intraday: false })).toBe('HISTORICAL');
  });
});

describe('sector coverage', () => {
  it('maps every Nifty 50 symbol the server queries to a name and sector', () => {
    const bySymbol = new Map(NIFTY_STOCKS.map((s) => [s.symbol, s]));
    const missing = NIFTY50_SYMBOLS.filter((sym) => !bySymbol.get(sym)?.sector);
    expect(missing).toEqual([]);
    expect(new Set(NIFTY_STOCKS.map((s) => s.symbol)).size).toBe(NIFTY_STOCKS.length);
  });
});

describe('closed-market data status', () => {
  const ist = (y, mo, d, h, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) - 19800000;
  const saturday = getMarketState(ist(2026, 10, 10, 11), null); // last session: Fri 9 Oct

  it('MARKET_CLOSED for the last session, STALE when older, HISTORICAL when untimed', () => {
    expect(classifyClosedMarketData(ist(2026, 10, 9, 15, 29), saturday)).toBe('MARKET_CLOSED');
    expect(classifyClosedMarketData(ist(2026, 10, 8, 15, 29), saturday)).toBe('STALE');
    expect(classifyClosedMarketData(null, saturday)).toBe('HISTORICAL');
  });

  it('quote status follows the exchange clock, not the provider state', () => {
    const base = { marketState: 'REGULAR', quoteTimeMs: ist(2026, 10, 9, 15, 29), nowMs: ist(2026, 10, 10, 11), market: saturday };
    expect(classifyQuoteStatus(base)).toBe('MARKET_CLOSED');
    const open = getMarketState(ist(2026, 10, 12, 11), null);
    expect(classifyQuoteStatus({ ...base, market: open, quoteTimeMs: ist(2026, 10, 12, 10, 59), nowMs: ist(2026, 10, 12, 11) })).toBe('DELAYED');
  });

  it('a pre-open quote stamped today is not called stale', () => {
    const preOpen = getMarketState(ist(2026, 10, 12, 9, 5), null);
    expect(classifyClosedMarketData(ist(2026, 10, 12, 9, 4), preOpen)).toBe('MARKET_CLOSED');
  });
});

describe('markPartialCandles', () => {
  const ist = (y, mo, d, h, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) - 19800000;
  const daily = (...days) => days.map((d) => ({ time: `2026-10-${String(d).padStart(2, '0')}` }));

  it('daily: only today\'s candle, only while a session is in progress', () => {
    const open = getMarketState(ist(2026, 10, 12, 11), null);
    expect(markPartialCandles(daily(8, 9, 12), '1d', open).map((c) => !!c.partial)).toEqual([false, false, true]);
    const closed = getMarketState(ist(2026, 10, 12, 16), null);
    expect(markPartialCandles(daily(8, 9, 12), '1d', closed).some((c) => c.partial)).toBe(false);
  });

  it('weekly: partial mid-week, complete after the last trading day of the week closes', () => {
    const week = (monday) => [{ time: monday }];
    const wednesday = getMarketState(ist(2026, 10, 14, 16), null);
    expect(markPartialCandles(week('2026-10-12'), '1wk', wednesday)[0].partial).toBe(true);
    const fridayEvening = getMarketState(ist(2026, 10, 16, 16), null);
    expect(markPartialCandles(week('2026-10-12'), '1wk', fridayEvening)[0].partial).toBeUndefined();
    const fridayOpen = getMarketState(ist(2026, 10, 16, 11), null);
    expect(markPartialCandles(week('2026-10-12'), '1wk', fridayOpen)[0].partial).toBe(true);
    const nextMonday = getMarketState(ist(2026, 10, 19, 8), null);
    expect(markPartialCandles(week('2026-10-12'), '1wk', nextMonday)[0].partial).toBeUndefined();
  });

  it('leaves intraday, empty and non-date series alone', () => {
    const open = getMarketState(ist(2026, 10, 12, 11), null);
    expect(markPartialCandles([{ time: 1791278100 }], '5m', open)[0].partial).toBeUndefined();
    expect(markPartialCandles([], '1d', open)).toEqual([]);
  });
});
