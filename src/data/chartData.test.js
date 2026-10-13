import { describe, it, expect } from 'vitest';
import { dataKey, needsRefit, REFIT_LENGTH_JUMP } from './chartData';

const bars = (n, start = 1000, last = {}) => Array.from({ length: n }, (_, i) => ({ time: start + i * 60, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10, ...(i === n - 1 ? last : {}) }));

describe('dataKey', () => {
  it('stays the same for a new array with the same content', () => {
    expect(dataKey(bars(50))).toBe(dataKey(bars(50)));
  });
  it('changes when the last candle changes (a live tick) or a bar is added', () => {
    expect(dataKey(bars(50, 1000, { close: 1.6 }))).not.toBe(dataKey(bars(50)));
    expect(dataKey(bars(51))).not.toBe(dataKey(bars(50)));
    expect(dataKey(bars(50, 1000, { volume: 11 }))).not.toBe(dataKey(bars(50)));
  });
  it('handles empty input', () => {
    expect(dataKey([])).toBe('empty');
    expect(dataKey(null)).toBe('empty');
  });
});

describe('needsRefit', () => {
  const applied = (resetKey, data) => ({ key: needsRefit.keyOf(resetKey, data), length: data.length });

  it('refits the first time, and when nothing has been applied yet', () => {
    expect(needsRefit(null, { resetKey: 'A', data: bars(50) })).toBe(true);
    expect(needsRefit({ key: '', length: 0 }, { resetKey: 'A', data: bars(50) })).toBe(true);
  });
  it('keeps the zoom for live updates: the last candle changing or one new bar', () => {
    const before = applied('A', bars(50));
    expect(needsRefit(before, { resetKey: 'A', data: bars(50, 1000, { close: 9 }) })).toBe(false);
    expect(needsRefit(before, { resetKey: 'A', data: bars(51) })).toBe(false);
    expect(needsRefit(before, { resetKey: 'A', data: bars(50 + REFIT_LENGTH_JUMP) })).toBe(false);
  });
  it('refits for another stock or timeframe, by key', () => {
    expect(needsRefit(applied('RELIANCE|D', bars(50)), { resetKey: 'TCS|D', data: bars(50) })).toBe(true);
    expect(needsRefit(applied('RELIANCE|D', bars(50)), { resetKey: 'RELIANCE|W', data: bars(50) })).toBe(true);
  });
  it('refits when the history starts at a different bar or its size jumps, even without a key', () => {
    expect(needsRefit(applied('', bars(50, 1000)), { resetKey: '', data: bars(50, 5000) })).toBe(true);
    expect(needsRefit(applied('', bars(50)), { resetKey: '', data: bars(120) })).toBe(true);
    expect(needsRefit(applied('', bars(120)), { resetKey: '', data: bars(50) })).toBe(true);
  });
});
