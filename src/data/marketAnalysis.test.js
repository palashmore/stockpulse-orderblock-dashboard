import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  calculateATR,
  calculateRSI,
  calculateVWAP,
  calculateSMA,
  detectOrderBlocks,
  generateSignalsFromOptions,
  computeMetrics,
  classifyOIBuildup,
} from './marketAnalysis';

const candle = (i, open, close, high = Math.max(open, close) + 1, low = Math.min(open, close) - 1, volume = 1000) => ({
  time: `2026-01-${String(i + 1).padStart(2, '0')}`, open, high, low, close, volume,
});

// 20 flat-ish candles (past the 14-bar ATR warm-up), then a down candle followed by a strong up candle
function bullishFixture() {
  const candles = Array.from({ length: 20 }, (_, i) => candle(i, 100, 100.5));
  candles.push(candle(20, 100, 98));   // down candle (the order block)
  candles.push(candle(21, 98, 106, 107, 97, 5000)); // strong displacement up
  candles.push(candle(22, 106, 107));
  return candles;
}

const optionsData = {
  underlyingValue: 100, pcr: 1.1, maxPain: 100,
  totalCallOI: 1000, totalPutOI: 1100, totalCallOIChange: 10, totalPutOIChange: 20,
  support: [{ strike: 95, oi: 500, oiChange: 5 }, { strike: 90, oi: 300, oiChange: 1 }],
  resistance: [{ strike: 110, oi: 400, oiChange: 2 }, { strike: 115, oi: 300, oiChange: 1 }],
};

afterEach(() => vi.restoreAllMocks());

describe('no fabricated values', () => {
  it('never calls Math.random in analytics', () => {
    const spy = vi.spyOn(Math, 'random');
    const candles = bullishFixture();
    detectOrderBlocks(candles);
    generateSignalsFromOptions(optionsData, candles);
    computeMetrics(candles, null);
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns no signals without options data', () => {
    expect(generateSignalsFromOptions(null, bullishFixture())).toEqual([]);
    expect(generateSignalsFromOptions(optionsData, [])).toEqual([]);
  });

  it('is deterministic and uses real closes for the sparkline', () => {
    const candles = bullishFixture();
    const a = generateSignalsFromOptions(optionsData, candles);
    const b = generateSignalsFromOptions(optionsData, candles);
    expect(a).toEqual(b);
    expect(a[0].sparkData).toEqual(candles.slice(-20).map((c) => c.close));
    expect(a.filter((s) => s.type === 'BULL')).toHaveLength(2);
    expect(a.filter((s) => s.type === 'BEAR')).toHaveLength(2);
  });

  it('metrics carry no random rank', () => {
    expect(computeMetrics(bullishFixture(), null)).not.toHaveProperty('rank');
  });
});

describe('missing volume', () => {
  it('is never treated as zero volume', () => {
    const candles = bullishFixture().map((c) => ({ ...c, volume: null }));
    const metrics = computeMetrics(candles, null);
    expect(metrics.volume).toBeNull();
    expect(metrics.avgVolume).toBeNull();
    expect(metrics.vwap).toBeNull();
    expect(detectOrderBlocks(candles).every((b) => b.volumeConfirm === false)).toBe(true);
  });
});

describe('computeMetrics', () => {
  it('keeps a legitimate zero change from the quote instead of recomputing', () => {
    const m = computeMetrics(bullishFixture(), { price: 100, change: 0, changePct: 0 });
    expect(m.change).toBe('0.00');
    expect(m.changePct).toBe('0.00');
    expect(m.isPositive).toBe(true);
  });

  it('returns null with insufficient candles', () => {
    expect(computeMetrics([candle(0, 1, 2)], null)).toBeNull();
    expect(computeMetrics(null, null)).toBeNull();
  });
});

describe('indicators', () => {
  it('SMA matches a hand calculation', () => {
    const closes = [1, 2, 3, 4, 5];
    const sma = calculateSMA(closes.map((c, i) => candle(i, c, c)), 3);
    expect(sma.map((p) => p.value)).toEqual([2, 3, 4]);
  });

  it('ATR is Wilder-smoothed with an SMA seed and null before the lookback is complete', () => {
    const candles = [
      { time: 'a', open: 10, high: 12, low: 9, close: 11, volume: 1 },   // TR 3
      { time: 'b', open: 15, high: 16, low: 14, close: 15, volume: 1 },  // gap up: TR = 16 - 11 = 5
      { time: 'c', open: 16, high: 18, low: 15, close: 17, volume: 1 },  // TR 3
    ];
    // seed = (3 + 5) / 2 = 4; next = (4 * 1 + 3) / 2 = 3.5
    expect(calculateATR(candles, 2)).toEqual([null, 4, 3.5]);
    expect(calculateATR(candles, 14).every((v) => v === null)).toBe(true);
  });

  it('RSI is Wilder-smoothed (hand-checked) and null without enough history', () => {
    const closes = [10, 11, 10, 12];
    const candles = closes.map((c, i) => candle(i, c, c));
    // seed over first 2 changes (+1, -1): gain 0.5, loss 0.5
    // then +2: gain = (0.5 + 2) / 2 = 1.25, loss = 0.5 / 2 = 0.25 -> RS 5 -> 83.3
    expect(calculateRSI(candles, 2)).toBe(83.3);
    expect(calculateRSI(candles, 14)).toBeNull();
    expect(calculateRSI(Array.from({ length: 20 }, (_, i) => candle(i, 100 + i, 100 + i)))).toBe(100);
    expect(calculateRSI(Array.from({ length: 20 }, (_, i) => candle(i, 100, 100)))).toBe(50);
  });

  it('VWAP is a rolling typical-price average and skips windows without volume', () => {
    const c = (i, tp, volume) => ({ time: `d${i}`, open: tp, high: tp, low: tp, close: tp, volume });
    const series = calculateVWAP([c(0, 10, 1), c(1, 20, 3), c(2, 30, 1)], 2);
    expect(series.map((p) => p.value)).toEqual([10, 17.5, 22.5]);
    expect(calculateVWAP([c(0, 10, null), c(1, 20, 0)], 2)).toEqual([]);
  });
});

describe('detectOrderBlocks', () => {
  it('finds the bullish block (last down candle before an engulfing impulse)', () => {
    const blocks = detectOrderBlocks(bullishFixture());
    const bullish = blocks.filter((b) => b.type === 'bullish');
    expect(bullish).toHaveLength(1);
    expect(bullish[0].time).toBe('2026-01-21');
    expect(bullish[0].high).toBe(100);
    expect(bullish[0].low).toBe(98);
    expect(bullish[0].mitigated).toBe(false);
    expect(bullish[0].volumeConfirm).toBe(true);
  });

  it('marks a block mitigated once price closes below it', () => {
    const candles = [...bullishFixture(), candle(23, 107, 95, 107, 94)];
    const [block] = detectOrderBlocks(candles).filter((b) => b.type === 'bullish');
    expect(block.mitigated).toBe(true);
  });

  it('returns nothing for short history', () => {
    expect(detectOrderBlocks(bullishFixture().slice(0, 5))).toEqual([]);
  });
});

describe('classifyOIBuildup', () => {
  it('classifies the four price/OI quadrants', () => {
    expect(classifyOIBuildup(1, 1).type).toBe('LONG BUILD-UP');
    expect(classifyOIBuildup(-1, 1).type).toBe('SHORT BUILD-UP');
    expect(classifyOIBuildup(-1, -1).type).toBe('LONG UNWINDING');
    expect(classifyOIBuildup(1, -1).type).toBe('SHORT COVERING');
    expect(classifyOIBuildup(0, 0).type).toBe('NEUTRAL');
  });
});

describe('generateSignalsFromOptions without complete chain data', () => {
  const candles = Array.from({ length: 10 }, (_, i) => ({ time: i, open: 100, high: 101, low: 99, close: 100 + i }));
  const level = (strike, oi) => ({ strike, oi, oiChange: 0 });
  it('returns nothing when PCR is missing instead of assuming a neutral 1', () => {
    expect(generateSignalsFromOptions({ pcr: null, support: [level(90, 5)], resistance: [level(110, 5)], totalPutOI: 10, totalCallOI: 10 }, candles)).toEqual([]);
  });
  it('returns nothing when there are no support or resistance strikes (no invented levels)', () => {
    expect(generateSignalsFromOptions({ pcr: 1.1, support: [], resistance: [level(110, 5)], totalPutOI: 10, totalCallOI: 10 }, candles)).toEqual([]);
  });
  it('keeps a real PCR of 0.5 as 0.5 and uses only chain strikes', () => {
    const out = generateSignalsFromOptions({ pcr: 0.5, support: [level(90, 5)], resistance: [level(110, 5)], totalPutOI: 10, totalCallOI: 10 }, candles);
    expect(out[0].pcr).toBe(0.5);
    expect(out[0].s1).toBe('90.00');
    expect(out[0].s2).toBe('—');
  });
});
