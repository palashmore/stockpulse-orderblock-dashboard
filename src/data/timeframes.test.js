import { describe, it, expect } from 'vitest';
import { TIMEFRAMES, getTimeframe, aggregateCandles } from './timeframes';

const DAY = 86400;
const bar = (day, hour, o, h, l, c, volume) => ({ time: day * DAY + hour * 3600, open: o, high: h, low: l, close: c, volume });

describe('timeframes', () => {
  it('exposes the seven chart buttons in order', () => {
    expect(TIMEFRAMES.map((t) => t.id)).toEqual(['1m', '5m', '15m', '1H', '4H', 'D', 'W']);
  });

  it('maps every timeframe to a provider range/interval pair', () => {
    expect(getTimeframe('D')).toMatchObject({ range: '6mo', interval: '1d', intraday: false });
    expect(getTimeframe('W').interval).toBe('1wk');
    expect(getTimeframe('4H')).toMatchObject({ interval: '60m', aggregate: 4 });
    expect(getTimeframe('1m')).toMatchObject({ range: '5d', interval: '1m', intraday: true });
  });

  it('falls back to daily for an unknown id', () => {
    expect(getTimeframe('nope').id).toBe('D');
  });
});

describe('aggregateCandles', () => {
  // one session of six hourly bars (09:15..14:15 start), then the next day's first bar
  const session = [
    bar(100, 9, 10, 12, 9, 11, 1), bar(100, 10, 11, 13, 10, 12, 2), bar(100, 11, 12, 14, 11, 13, 3),
    bar(100, 12, 13, 15, 12, 14, 4), bar(100, 13, 14, 16, 13, 15, 5), bar(100, 14, 15, 17, 14, 16, 6),
    bar(101, 9, 20, 22, 19, 21, 7),
  ];

  it('builds OHLCV buckets of four bars per session without crossing days', () => {
    const out = aggregateCandles(session, 4);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ time: 100 * DAY + 9 * 3600, open: 10, high: 15, low: 9, close: 14, volume: 10 });
    expect(out[1]).toMatchObject({ open: 14, high: 17, low: 13, close: 16, volume: 11 });
    expect(out[2]).toMatchObject({ time: 101 * DAY + 9 * 3600, open: 20, close: 21, volume: 7 });
  });

  it('keeps volume null when no bar in the bucket has any', () => {
    const out = aggregateCandles([bar(1, 9, 1, 2, 1, 2, null), bar(1, 10, 2, 3, 2, 3, null)], 4);
    expect(out[0].volume).toBeNull();
  });

  it('sums only the bars that have volume', () => {
    const out = aggregateCandles([bar(1, 9, 1, 2, 1, 2, 5), bar(1, 10, 2, 3, 2, 3, null)], 4);
    expect(out[0].volume).toBe(5);
  });

  it('does not mutate its input and passes through for size 1 or empty input', () => {
    const copy = JSON.parse(JSON.stringify(session));
    aggregateCandles(session, 4);
    expect(session).toEqual(copy);
    expect(aggregateCandles(session, 1)).toBe(session);
    expect(aggregateCandles([], 4)).toEqual([]);
    expect(aggregateCandles(null, 4)).toEqual([]);
  });
});
