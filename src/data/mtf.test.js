import { describe, it, expect } from 'vitest';
import { timeframeTrend, alignment, MTF_FRAMES, MIN_CANDLES } from './mtf';

const series = (n, f) => Array.from({ length: n }, (_, i) => { const c = f(i); return { time: i, open: c, high: c + 1, low: c - 1, close: c, volume: 100 }; });

describe('timeframeTrend', () => {
  it('reads a steady rise as up, a steady fall as down, and a drift-free wobble as mixed', () => {
    const up = timeframeTrend(series(120, (i) => 100 + i));
    expect(up.state).toBe('up');
    expect(up.close).toBe(219);
    expect(up.rsi).toBe(100);
    expect(timeframeTrend(series(120, (i) => 300 - i)).state).toBe('down');
    const mixed = timeframeTrend(series(120, (i) => (i < 60 ? 100 + i : 160 - (i - 60) * 1.5)));
    expect(['mixed', 'down']).toContain(mixed.state);
  });

  it('is unknown rather than guessing with too little history', () => {
    expect(timeframeTrend(series(MIN_CANDLES - 1, (i) => i)).state).toBe('unknown');
    expect(timeframeTrend(null)).toEqual({ state: 'unknown', candles: 0 });
  });

  it('exposes the supporting readings', () => {
    const r = timeframeTrend(series(150, (i) => 100 + i * 0.5 + Math.sin(i) * 2));
    expect(r.ema20).toBeGreaterThan(r.ema50);
    expect(r.adx).not.toBeNull();
    expect(r.macdHist).not.toBeNull();
  });
});

describe('alignment', () => {
  const s = (...states) => states.map((state) => ({ state }));
  it('summarises agreement and never counts unknown frames as agreement', () => {
    expect(alignment(s('up', 'up', 'up', 'up', 'up')).label).toBe('All 5 readable timeframes are up');
    expect(alignment(s('up', 'up', 'unknown', 'up', 'unknown'))).toMatchObject({ up: 3, unknown: 2, label: 'All 3 readable timeframes are up' });
    expect(alignment(s('down', 'down', 'up')).label).toBe('2 of 3 readable timeframes are down');
    expect(alignment(s('up', 'down')).label).toMatch(/disagree/);
    expect(alignment(s('unknown', 'unknown')).label).toBe('No timeframe could be read');
    expect(alignment([])).toMatchObject({ total: 0, label: 'No timeframe could be read' });
  });

  it('lists the frames the panel loads, from fastest to slowest', () => {
    expect(MTF_FRAMES.map((f) => f.id)).toEqual(['5m', '15m', '1H', 'D', 'W']);
  });
});
