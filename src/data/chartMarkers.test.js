import { describe, it, expect } from 'vitest';
import { buildSignalMarkers, normaliseTime, OVERLAYS } from './chartConfig';

describe('signal markers', () => {
  const candles = [{ time: '2026-01-01' }, { time: '2026-01-02' }, { time: '2026-01-05' }, { time: '2026-01-06' }];
  const signals = [
    { id: 'a', time: '2026-01-02', side: 'BUY' },
    { id: 'b', time: '2026-01-05', side: 'SELL_SHORT' },
  ];
  const trades = [
    { side: 'BUY', exitIndex: 3, net: 50 },
    { side: 'SELL_SHORT', exitIndex: 3, net: -20 },
    { side: 'BUY', exitIndex: 99, net: 1 }, // exit bar is not on the chart: ignored
  ];

  it('plots BUY below the bar as an up arrow and SHORT above it as a down arrow', () => {
    const m = buildSignalMarkers(signals, [], candles);
    expect(m[0]).toMatchObject({ time: '2026-01-02', position: 'belowBar', shape: 'arrowUp', text: 'BUY', color: '#00e676' });
    expect(m[1]).toMatchObject({ time: '2026-01-05', position: 'aboveBar', shape: 'arrowDown', text: 'SHORT', color: '#ff1744' });
  });

  it('adds distinct exit markers coloured by outcome, and skips exits that are off the chart', () => {
    const m = buildSignalMarkers([], trades, candles);
    expect(m).toHaveLength(2);
    expect(m.map((x) => x.text).sort()).toEqual(['COVER', 'EXIT']);
    expect(m.find((x) => x.text === 'EXIT').color).toBe('#69f0ae');
    expect(m.find((x) => x.text === 'COVER').color).toBe('#ff8a80');
  });

  it('returns markers sorted by time and is empty with no input', () => {
    const m = buildSignalMarkers(signals, trades, candles);
    expect(m.map((x) => x.time)).toEqual([...m.map((x) => x.time)].sort());
    expect(buildSignalMarkers(null, null, [])).toEqual([]);
  });

  it('normalises chart click times', () => {
    expect(normaliseTime({ year: 2026, month: 1, day: 5 })).toBe('2026-01-05');
    expect(normaliseTime(1791278100)).toBe(1791278100);
    expect(normaliseTime('2026-01-05')).toBe('2026-01-05');
  });

  it('every overlay builds a series the same length as the candles', () => {
    const c = Array.from({ length: 30 }, (_, i) => ({ time: i, open: 1, high: 2, low: 1, close: 1 + i / 10, volume: 10 }));
    for (const o of OVERLAYS) expect(o.build(c)).toHaveLength(30);
  });
});
