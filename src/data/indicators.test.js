import { describe, it, expect } from 'vitest';
import {
  sma, ema, rsi, atr, macd, adx, vwap, relativeVolume, pivots, levelsAt, fairValueGaps,
  liquiditySweeps, priorHighLow, toWeekly, alignCompleted,
} from './indicators';

const bar = (time, o, h, l, c, volume = 100) => ({ time, open: o, high: h, low: l, close: c, volume });
const flat = (closesArr) => closesArr.map((c, i) => bar(i, c, c, c, c));

describe('moving averages', () => {
  it('SMA matches a hand calculation and is null before the window fills', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it('EMA is seeded with the SMA and uses alpha = 2/(n+1)', () => {
    // seed = (1+2+3)/3 = 2; alpha = 0.5: next = 0.5*4 + 0.5*2 = 3; then 0.5*5 + 0.5*3 = 4
    expect(ema([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it('restarts across gaps in the input', () => {
    expect(sma([1, 2, null, 4, 5, 6], 2)).toEqual([null, 1.5, null, null, 4.5, 5.5]);
  });
});

describe('RSI', () => {
  it('Wilder RSI on a hand-checked series', () => {
    // period 2, closes 10,11,10,12: seed gain .5 loss .5 -> RSI 50; then +2: gain 1.25 loss .25 -> 100-100/6
    const r = rsi(flat([10, 11, 10, 12]), 2);
    expect(r[0]).toBeNull();
    expect(r[1]).toBeNull();
    expect(r[2]).toBeCloseTo(50, 10);
    expect(r[3]).toBeCloseTo(100 - 100 / 6, 10);
  });

  it('is 100 for a pure rise, 50 for a flat series, and null with too little history', () => {
    expect(rsi(flat([1, 2, 3, 4, 5, 6]), 3).at(-1)).toBe(100);
    expect(rsi(flat([5, 5, 5, 5, 5]), 3).at(-1)).toBe(50);
    expect(rsi(flat([1, 2]), 14).every((v) => v === null)).toBe(true);
  });
});

describe('ATR', () => {
  it('Wilder ATR seeds with the mean true range and includes gaps', () => {
    const c = [bar(0, 10, 12, 9, 11), bar(1, 15, 16, 14, 15), bar(2, 16, 18, 15, 17)];
    // TR: 3, max(2,5,3)=5, max(3,3,0)... c2: high-low 3, |18-15|=3, |15-15|=0 -> 3
    expect(atr(c, 2)).toEqual([null, 4, 3.5]);
  });
});

describe('MACD', () => {
  it('equals EMA(fast) - EMA(slow), with the signal line from the MACD values', () => {
    const data = flat(Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 4) * 5 + i * 0.2));
    const m = macd(data, 5, 10, 4);
    const f = ema(data.map((d) => d.close), 5);
    const s = ema(data.map((d) => d.close), 10);
    expect(m.macd[20]).toBeCloseTo(f[20] - s[20], 10);
    expect(m.macd[8]).toBeNull();
    expect(m.signal[11]).toBeNull(); // MACD starts at index 9, so a 4-bar signal starts at 12
    expect(m.signal[12]).not.toBeNull();
    expect(m.hist[30]).toBeCloseTo(m.macd[30] - m.signal[30], 10);
  });
});

describe('ADX', () => {
  it('is high with +DI above -DI in a steady uptrend, and low in a flat range', () => {
    const up = Array.from({ length: 60 }, (_, i) => bar(i, 100 + i, 101 + i, 99.5 + i, 100.8 + i));
    const a = adx(up, 14);
    expect(a.adx.at(-1)).toBeGreaterThan(40);
    expect(a.plusDI.at(-1)).toBeGreaterThan(a.minusDI.at(-1));
    const range = Array.from({ length: 80 }, (_, i) => bar(i, 100, 101, 99, 100 + (i % 2 ? 0.3 : -0.3)));
    expect(adx(range, 14).adx.at(-1)).toBeLessThan(20);
  });

  it('first ADX value appears at index 2*period-1 and nothing earlier', () => {
    const data = Array.from({ length: 40 }, (_, i) => bar(i, 100 + i, 102 + i, 99 + i, 101 + i));
    const a = adx(data, 5);
    expect(a.adx.findIndex((v) => v !== null)).toBe(9);
  });
});

describe('VWAP', () => {
  it('daily candles: rolling typical-price VWAP, skipping bars without volume', () => {
    const c = [bar('2026-01-01', 10, 10, 10, 10, 1), bar('2026-01-02', 20, 20, 20, 20, 3), bar('2026-01-03', 30, 30, 30, 30, 1)];
    expect(vwap(c, { window: 2 })).toEqual([10, 17.5, 22.5]);
    expect(vwap([bar('2026-01-01', 1, 1, 1, 1, null)], { window: 2 })).toEqual([null]);
  });

  it('intraday candles restart at each trading day', () => {
    const d1 = 100 * 86400;
    const d2 = 101 * 86400;
    const c = [bar(d1 + 3600, 10, 10, 10, 10, 1), bar(d1 + 7200, 20, 20, 20, 20, 1), bar(d2 + 3600, 50, 50, 50, 50, 1)];
    expect(vwap(c)).toEqual([10, 15, 50]);
  });
});

describe('relative volume', () => {
  it('compares to the previous bars only, never including the current one', () => {
    const c = [100, 100, 100, 300].map((v, i) => bar(i, 1, 1, 1, 1, v));
    expect(relativeVolume(c, 3)).toEqual([null, null, null, 3]);
  });
});

describe('pivots (confirmed, no look-ahead)', () => {
  const data = [1, 2, 3, 5, 3, 2, 1, 2, 3, 2, 1].map((h, i) => bar(i, h, h, h - 0.5, h - 0.25));

  it('finds the swing high and swing low and reports them only at confirmation', () => {
    const p = pivots(data, 2, 2);
    expect(p.highs).toEqual([
      expect.objectContaining({ index: 3, price: 5, confirmedAt: 5 }),
      expect.objectContaining({ index: 8, price: 3, confirmedAt: 10 }),
    ]);
    expect(p.lows.map((x) => x.index)).toContain(6);
    expect(p.lows.find((x) => x.index === 6).confirmedAt).toBe(8);
  });

  it('levelsAt only uses pivots confirmed by that bar', () => {
    const p = pivots(data, 2, 2);
    expect(levelsAt(p, 4, 3.9).resistance).toBeNull(); // the swing high at index 3 is not confirmed until bar 5
    expect(levelsAt(p, 5, 3.9).resistance).toBe(5);
    expect(levelsAt(p, 9, 3.9).support).not.toBeNull();
  });

  it('is causal: adding later bars never changes a pivot confirmed earlier', () => {
    const early = pivots(data.slice(0, 8), 2, 2).highs.filter((h) => h.confirmedAt < 8);
    const full = pivots(data, 2, 2).highs.filter((h) => h.confirmedAt < 8);
    expect(full).toEqual(early);
  });
});

describe('fair value gaps and sweeps', () => {
  it('detects a bullish gap, and when later trading fills it', () => {
    const c = [bar(0, 10, 11, 9, 10), bar(1, 11, 15, 11, 14), bar(2, 14, 16, 12.5, 15), bar(3, 15, 15.5, 10.5, 12)]; // low 10.5 trades through the whole gap (11 to 12.5)
    const gaps = fairValueGaps(c);
    expect(gaps).toEqual([{ type: 'bullish', index: 2, low: 11, high: 12.5, filledAt: 3 }]);
  });

  it('detects a bearish gap and leaves an untouched gap unfilled', () => {
    const c = [bar(0, 20, 21, 19, 20), bar(1, 19, 19, 14, 15), bar(2, 15, 16, 13, 14)];
    expect(fairValueGaps(c)).toEqual([{ type: 'bearish', index: 2, low: 16, high: 19, filledAt: null }]);
  });

  it('flags a sweep of a confirmed swing low that closes back above it', () => {
    const lows = [5, 4, 3, 2, 3, 4, 5, 6, 5, 6, 7];
    const c = lows.map((l, i) => bar(i, l + 1, l + 2, l, l + 1));
    c.push(bar(11, 6, 7, 1.5, 4)); // wicks below the swing low at 2 (bar 3) and closes above it
    const piv = pivots(c, 2, 2);
    expect(liquiditySweeps(c, piv).some((s) => s.type === 'bullish' && s.index === 11 && s.level === 2)).toBe(true);
  });
});

describe('prior high/low, weekly bars and alignment', () => {
  it('priorHighLow excludes the current bar', () => {
    const c = [bar(0, 1, 5, 1, 2), bar(1, 1, 6, 0, 2), bar(2, 1, 9, 1, 2)];
    const p = priorHighLow(c, 2);
    expect(p.high).toEqual([null, null, 6]);
    expect(p.low).toEqual([null, null, 0]);
  });

  it('builds Monday-keyed weekly candles and records the last day seen', () => {
    const d = [bar('2026-10-08', 1, 5, 1, 2, 10), bar('2026-10-09', 2, 6, 0, 3, 20), bar('2026-10-12', 3, 4, 3, 4, 5)];
    const w = toWeekly(d);
    expect(w).toHaveLength(2);
    expect(w[0]).toMatchObject({ time: '2026-10-05', open: 1, high: 6, low: 0, close: 3, volume: 30, lastDay: '2026-10-09' });
    expect(w[1]).toMatchObject({ time: '2026-10-12', lastDay: '2026-10-12' });
  });

  it('aligns a slower series using only bars that were complete before the fast bar', () => {
    const fast = [{ t: 1 }, { t: 2 }, { t: 3 }, { t: 4 }];
    const slow = [{ end: 1.5 }, { end: 3.5 }];
    expect(alignCompleted(fast, slow, (s, f) => s.end < f.t)).toEqual([null, 0, 0, 1]);
  });
});
