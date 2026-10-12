import { describe, it, expect } from 'vitest';
import { createCache } from './cache.js';
import {
  classifyQuoteStatus,
  classifyOptionsStatus,
  parseNseTimestamp,
  getMarketStatus,
} from './dataStatus.js';
import { computePCR, computeMaxPain, buildOptionsChain } from './options.js';
import { normalizeCandles, isValidSymbol } from './validators.js';

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
