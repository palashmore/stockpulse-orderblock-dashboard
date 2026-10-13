import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockedSignals = [];
vi.mock('./strategies', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, intradaySignals: () => mockedSignals };
});

const { swingStatus, intradayStatus, summariseStock } = await import('./quickView');

const swing = (extra = {}) => ({ strategy: 'pullback', side: 'BUY', actionable: true, label: 'Active', ageBars: 0, entry: 100, stop: 95, target1: 105, target2: 110, rr: 2, ...extra });

describe('swingStatus', () => {
  it('shows levels and the invalidation only for a valid setup on current data', () => {
    const s = swingStatus({ swing: swing() }, true);
    expect(s.state).toBe('VALID');
    expect(s.levels).toEqual({ entry: 100, stop: 95, target1: 105, target2: 110, rr: 2 });
    expect(s.invalidation).toMatch(/95\.00/);
    expect(s.label).toMatch(/Valid long pullback/);
  });
  it('withholds levels for a setup that is no longer valid, with the reason', () => {
    const s = swingStatus({ swing: swing({ actionable: false, label: 'Stopped out' }) }, true);
    expect(s).toMatchObject({ state: 'INVALID', levels: null });
    expect(s.label).toMatch(/Stopped out/);
  });
  it('withholds levels when the data is not current', () => {
    expect(swingStatus({ swing: swing() }, false)).toMatchObject({ state: 'REVIEW', levels: null });
  });
  it('says there is no setup', () => {
    expect(swingStatus({ swing: null }, true)).toMatchObject({ state: 'NONE', levels: null });
    expect(swingStatus(null, true).state).toBe('NONE');
  });
  it('reads a short setup', () => {
    expect(swingStatus({ swing: swing({ side: 'SELL_SHORT' }) }, true).label).toMatch(/short/);
  });
});

describe('intradayStatus', () => {
  const T0 = 1_790_000_000; // IST-shifted epoch seconds of the first bar
  const bars = (n, status = 'DELAYED') => ({
    dataStatus: status,
    candles: Array.from({ length: n }, (_, i) => ({ time: T0 + i * 300, open: 100, high: 101, low: 99.5, close: 100.2, volume: 1000 })),
  });
  const nowAfter = (history) => (history.candles.at(-1).time - 19800) * 1000 + 3600e3; // an hour after the last bar started
  const cfg = { validBars: 12 };
  const sig = (history, extra = {}) => {
    const c = history.candles;
    mockedSignals = [{ index: c.length - 3, time: c[c.length - 3].time, side: 'BUY', strategy: 'orb', entry: 100.5, stop: 99, target1: 102, target2: 103.5, rr: 2, ...extra }];
  };
  beforeEach(() => { mockedSignals = []; });

  it('is unavailable without usable data', () => {
    expect(intradayStatus(null, cfg, { marketOpen: true, nowMs: 0 }).state).toBe('UNAVAILABLE');
    expect(intradayStatus(bars(100, 'STALE'), cfg, { marketOpen: true, nowMs: nowAfter(bars(100)) }).label).toMatch(/stale/);
    expect(intradayStatus(bars(30), cfg, { marketOpen: true, nowMs: nowAfter(bars(30)) }).label).toMatch(/Too little/);
  });
  it('reports no signal when the engine found none this session', () => {
    const h = bars(100);
    expect(intradayStatus(h, cfg, { marketOpen: true, nowMs: nowAfter(h) })).toMatchObject({ state: 'NONE', levels: null });
  });
  it('shows levels for a valid signal while the market is open', () => {
    const h = bars(100);
    sig(h);
    const s = intradayStatus(h, cfg, { marketOpen: true, nowMs: nowAfter(h) });
    expect(s.state).toBe('VALID');
    expect(s.levels).toMatchObject({ entry: 100.5, stop: 99, target1: 102 });
    expect(s.invalidation).toMatch(/99\.00/);
  });
  it('withholds levels when the market is closed or its state is unknown: last session is for review', () => {
    const h = bars(100);
    sig(h);
    for (const marketOpen of [false, null]) expect(intradayStatus(h, cfg, { marketOpen, nowMs: nowAfter(h) })).toMatchObject({ state: 'REVIEW', levels: null });
  });
  it('withholds levels once the signal has been stopped out', () => {
    const h = bars(100);
    sig(h);
    h.candles[h.candles.length - 2] = { ...h.candles.at(-2), low: 98.5 }; // trades through the stop
    const s = intradayStatus(h, cfg, { marketOpen: true, nowMs: nowAfter(h) });
    expect(s).toMatchObject({ state: 'INVALID', levels: null });
    expect(s.label).toMatch(/Stopped/);
  });
});

describe('summariseStock', () => {
  const daily = (n, extra = {}) => {
    let seed = 99;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    let price = 100;
    const out = [];
    let day = 0;
    while (out.length < n) {
      const dt = new Date(Date.UTC(2025, 0, 6) + day++ * 86400000);
      if (dt.getUTCDay() === 0 || dt.getUTCDay() === 6) continue;
      const o = price;
      const c = o + 0.3 + (rnd() - 0.5) * 2;
      out.push({ time: dt.toISOString().slice(0, 10), open: o, high: Math.max(o, c) + rnd(), low: Math.min(o, c) - rnd(), close: c, volume: 1e5 });
      price = c;
    }
    return { candles: out, dataStatus: 'HISTORICAL', provider: 'Yahoo Finance', asOf: out.at(-1).time, ...extra };
  };

  it('returns nothing without daily candles', () => {
    expect(summariseStock(null, null)).toBeNull();
    expect(summariseStock({ candles: [] }, null)).toBeNull();
  });
  it('collects metrics, zones, levels, statuses and the source', () => {
    const v = summariseStock(daily(220), null, { marketOpen: false, nowMs: Date.now() });
    expect(v.metrics.price).toBeCloseTo(v.candles.at(-1).close);
    expect(Array.isArray(v.blocks)).toBe(true);
    expect(v.levels).toHaveProperty('resistance');
    expect(v.source).toMatchObject({ provider: 'Yahoo Finance', status: 'HISTORICAL' });
    expect(v.intraday.state).toBe('UNAVAILABLE');
    expect(['NONE', 'REVIEW']).toContain(v.swing.state); // never VALID while the market is closed
    expect(v.swing.levels).toBeNull();
  });
  it('never offers swing levels when the market state is unknown or the data is stale', () => {
    expect(summariseStock(daily(220), null, { marketOpen: null }).swing.levels).toBeNull();
    expect(summariseStock(daily(220, { dataStatus: 'STALE' }), null, { marketOpen: true }).swing.levels).toBeNull();
  });
  it('ignores the unfinished day', () => {
    const d = daily(220);
    d.candles.push({ ...d.candles.at(-1), time: '2099-01-01', partial: true, close: 9999 });
    expect(summariseStock(d, null, { marketOpen: false }).candles.at(-1).close).toBeLessThan(9999);
  });
});
