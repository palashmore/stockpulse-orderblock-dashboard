import { describe, it, expect, vi } from 'vitest';
import { scoreQuote, rankStocks, zoneLevels, MIN_SCORE } from './ranking';

const q = (symbol, changePct, price, low, high, extra = {}) => ({ symbol, name: symbol, changePct, price, low, high, ...extra });

describe('scoreQuote', () => {
  it('matches the documented formula (hand-checked)', () => {
    // move = 1.5/3 = 0.5; position = 2*(108-100)/(110-100) - 1 = 0.6; score = 0.3 + 0.24 = 0.54
    const s = scoreQuote(q('A', 1.5, 108, 100, 110));
    expect(s.score).toBeCloseTo(0.54, 10);
    expect(s.strength).toBe(54);
    expect(s.direction).toBe('BULLISH');
  });

  it('saturates the move at +-3% and caps strength at 100', () => {
    expect(scoreQuote(q('A', 9, 110, 100, 110)).strength).toBe(100);
    expect(scoreQuote(q('B', -9, 100, 100, 110)).direction).toBe('BEARISH');
  });

  it('calls a stock choppy when move and range position disagree', () => {
    // up 1% but closing at the bottom of its range: 0.6*0.333 + 0.4*(-1) = -0.2 -> choppy
    expect(scoreQuote(q('A', 1, 100, 100, 110)).direction).toBe('CHOPPY');
  });

  it('falls back to the day move when the range is unknown or flat', () => {
    expect(scoreQuote({ symbol: 'A', price: 10, changePct: 3 }).score).toBe(1);
    expect(scoreQuote(q('A', -1.5, 10, 10, 10)).score).toBe(-0.5);
  });

  it('returns null instead of guessing when price or change is missing', () => {
    expect(scoreQuote({ symbol: 'A', price: null, changePct: 1 })).toBeNull();
    expect(scoreQuote({ symbol: 'A', price: 1 })).toBeNull();
    expect(scoreQuote(null)).toBeNull();
  });

  it('reports relative volume only when the average is known, and keeps it out of the score', () => {
    const base = q('A', 1.5, 108, 100, 110);
    expect(scoreQuote({ ...base, volume: 300, avgVolume: 100 }).relVolume).toBe(3);
    expect(scoreQuote({ ...base, volume: 300 }).relVolume).toBeNull();
    expect(scoreQuote({ ...base, volume: 300, avgVolume: 100 }).score).toBe(scoreQuote(base).score);
  });
});

describe('rankStocks', () => {
  const quotes = [
    q('B1', 2, 109, 100, 110),
    q('B2', 3, 110, 100, 110),
    q('S1', -2, 101, 100, 110),
    q('FLAT', 0.1, 105, 100, 110),
    { symbol: 'BAD', price: null, changePct: null },
  ];

  it('sorts each board by strength and excludes choppy and unrankable stocks', () => {
    const r = rankStocks(quotes);
    expect(r.bullish.map((s) => s.symbol)).toEqual(['B2', 'B1']);
    expect(r.bearish.map((s) => s.symbol)).toEqual(['S1']);
    expect(r.counts).toEqual({ bullish: 2, bearish: 1, choppy: 1, unrankable: 1 });
  });

  it('limits board size but counts the full universe, with deterministic tie order', () => {
    const many = Array.from({ length: 5 }, (_, i) => q(`T${5 - i}`, 3, 110, 100, 110));
    const r = rankStocks(many, 2);
    expect(r.bullish.map((s) => s.symbol)).toEqual(['T1', 'T2']);
    expect(r.counts.bullish).toBe(5);
  });

  it('handles empty input and never uses randomness', () => {
    const spy = vi.spyOn(Math, 'random');
    expect(rankStocks(null).counts.bullish).toBe(0);
    rankStocks(quotes);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('keeps the threshold exposed for the UI', () => {
    expect(MIN_SCORE).toBe(0.25);
  });
});

describe('zoneLevels', () => {
  const candles = [
    { high: 120, low: 90 }, { high: 115, low: 95 }, { high: 112, low: 98 },
  ];
  const blocks = [
    { type: 'bullish', high: 100, low: 98, time: 'd1', mitigated: false },
    { type: 'bullish', high: 104, low: 102, time: 'd2', mitigated: true },
    { type: 'bullish', high: 99, low: 97, time: 'd3', mitigated: false },
    { type: 'bearish', high: 118, low: 116, time: 'd4', mitigated: false },
    { type: 'bearish', high: 125, low: 122, time: 'd5', mitigated: false },
  ];

  it('picks the nearest unmitigated blocks around price', () => {
    const z = zoneLevels(candles, blocks, 108);
    expect(z.demandZone).toEqual({ low: 98, high: 100, time: 'd1' });
    expect(z.supplyZone).toEqual({ low: 116, high: 118, time: 'd4' });
    expect(z.resistance).toBe(120);
    expect(z.support).toBe(90);
  });

  it('returns null levels rather than inventing them', () => {
    const z = zoneLevels(candles, [], 108);
    expect(z.demandZone).toBeNull();
    expect(z.supplyZone).toBeNull();
    expect(zoneLevels([], blocks, 108)).toBeNull();
    expect(zoneLevels(candles, blocks, 130).resistance).toBeNull(); // price above the 20-candle high
  });
});
