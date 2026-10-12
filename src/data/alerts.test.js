import { describe, it, expect } from 'vitest';
import {
  createAlert,
  evaluateAlerts,
  pauseAlert,
  activateAlert,
  isEvaluableStatus,
  describeAlert,
} from './alerts';
import { loadAlerts, saveAlerts, STORAGE_KEY } from './alertStore';

const NOW = '2026-10-12T05:30:00.000Z';
const make = (type, threshold, currentPrice, symbol = 'TCS') =>
  createAlert({ symbol, type, threshold }, currentPrice, { id: `${symbol}-${type}`, now: NOW }).alert;
const quotes = (price, symbol = 'TCS') => [{ symbol, price }];

describe('createAlert', () => {
  it('builds an active alert baselined at the current price', () => {
    const a = make('above', 100, 90);
    expect(a).toMatchObject({ symbol: 'TCS', type: 'above', threshold: 100, status: 'active', lastPrice: 90, triggerCount: 0 });
  });

  it('rejects levels the price is already beyond', () => {
    expect(createAlert({ symbol: 'TCS', type: 'above', threshold: 100 }, 100, { id: 'x', now: NOW }).error).toMatch(/already/);
    expect(createAlert({ symbol: 'TCS', type: 'below', threshold: 100 }, 99, { id: 'x', now: NOW }).error).toMatch(/already/);
  });

  it('validates every input', () => {
    const c = (input, price = 50) => createAlert(input, price, { id: 'x', now: NOW }).error;
    expect(c({ symbol: '', type: 'above', threshold: 1 })).toMatch(/stock/);
    expect(c({ symbol: 'A', type: 'sideways', threshold: 1 })).toMatch(/condition/);
    expect(c({ symbol: 'A', type: 'above', threshold: 0 })).toMatch(/greater than 0/);
    expect(c({ symbol: 'A', type: 'above', threshold: NaN })).toMatch(/greater than 0/);
    expect(c({ symbol: 'A', type: 'above', threshold: 100 }, null)).toMatch(/No current price/);
  });

  it('normalises the symbol', () => {
    expect(make('above', 100, 90, ' tcs ').symbol).toBe('TCS');
  });
});

describe('evaluateAlerts crossing semantics', () => {
  it('fires an above-alert when price crosses up, exactly once', () => {
    const a = make('above', 100, 90);
    const r1 = evaluateAlerts([a], quotes(95), NOW);
    expect(r1.fired).toEqual([]);
    expect(r1.alerts[0].lastPrice).toBe(95);

    const r2 = evaluateAlerts(r1.alerts, quotes(100), NOW);
    expect(r2.fired).toEqual([{ id: a.id, symbol: 'TCS', type: 'above', threshold: 100, price: 100 }]);
    expect(r2.alerts[0]).toMatchObject({ status: 'triggered', triggeredPrice: 100, triggeredAt: NOW, triggerCount: 1 });

    const r3 = evaluateAlerts(r2.alerts, quotes(110), NOW);
    expect(r3.fired).toEqual([]);
    expect(r3.changed).toBe(false);
  });

  it('fires a below-alert on a downward cross and not on an upward move', () => {
    const a = make('below', 100, 110);
    expect(evaluateAlerts([a], quotes(120), NOW).fired).toEqual([]);
    const r = evaluateAlerts([a], quotes(99.5), NOW);
    expect(r.fired).toHaveLength(1);
    expect(r.alerts[0].status).toBe('triggered');
  });

  it('does not fire while the price merely stays beyond the level', () => {
    const a = { ...make('above', 100, 90), lastPrice: 105 }; // baseline already above
    expect(evaluateAlerts([a], quotes(120), NOW).fired).toEqual([]);
  });

  it('treats a gap between observations as a crossing', () => {
    const a = make('above', 100, 90);
    const r = evaluateAlerts([a], quotes(130), NOW);
    expect(r.fired[0].price).toBe(130);
  });

  it('skips symbols with no quote and quotes without a price', () => {
    const a = make('above', 100, 90);
    expect(evaluateAlerts([a], quotes(120, 'INFY'), NOW).changed).toBe(false);
    expect(evaluateAlerts([a], [{ symbol: 'TCS', price: null }], NOW).changed).toBe(false);
    expect(evaluateAlerts([a], null, NOW).alerts).toEqual([a]);
  });

  it('only evaluates active alerts and does not mutate its input', () => {
    const active = make('above', 100, 90);
    const paused = pauseAlert(make('above', 100, 90, 'INFY'));
    const input = [active, paused];
    const copy = JSON.parse(JSON.stringify(input));
    const r = evaluateAlerts(input, [...quotes(120), ...quotes(120, 'INFY')], NOW);
    expect(input).toEqual(copy);
    expect(r.alerts[1]).toBe(paused);
    expect(r.fired.map((f) => f.symbol)).toEqual(['TCS']);
  });
});

describe('pause, resume and re-arm', () => {
  it('a resumed alert records a fresh baseline before it can fire', () => {
    const paused = pauseAlert(make('above', 100, 90));
    expect(paused.status).toBe('paused');
    const resumed = activateAlert(paused);
    expect(resumed).toMatchObject({ status: 'active', lastPrice: null });
    // Price is already above the level on resume: seeds only, no instant fire
    const r1 = evaluateAlerts([resumed], quotes(120), NOW);
    expect(r1.fired).toEqual([]);
    expect(r1.alerts[0].lastPrice).toBe(120);
  });

  it('re-arming a triggered alert keeps its history and fires again on the next real cross', () => {
    const fired = evaluateAlerts([make('above', 100, 90)], quotes(101), NOW).alerts[0];
    const rearmed = activateAlert(fired);
    expect(rearmed).toMatchObject({ status: 'active', triggerCount: 1, triggeredPrice: 101 });
    const seeded = evaluateAlerts([rearmed], quotes(95), NOW).alerts;
    const again = evaluateAlerts(seeded, quotes(102), NOW);
    expect(again.fired).toHaveLength(1);
    expect(again.alerts[0].triggerCount).toBe(2);
  });

  it('pausing a triggered alert changes nothing', () => {
    const fired = evaluateAlerts([make('above', 100, 90)], quotes(101), NOW).alerts[0];
    expect(pauseAlert(fired)).toBe(fired);
  });
});

describe('helpers', () => {
  it('evaluates only LIVE or DELAYED data', () => {
    for (const s of ['LIVE', 'DELAYED']) expect(isEvaluableStatus(s)).toBe(true);
    for (const s of ['STALE', 'HISTORICAL', 'SIMULATED', 'UNAVAILABLE', null, undefined]) expect(isEvaluableStatus(s)).toBe(false);
  });

  it('describes conditions', () => {
    expect(describeAlert({ type: 'above', threshold: 1500 })).toBe('Rises to ₹1,500.00 or above');
    expect(describeAlert({ type: 'below', threshold: 99.5 })).toBe('Falls to ₹99.50 or below');
  });
});

describe('alert storage', () => {
  const memory = (initial) => {
    const data = new Map(initial === undefined ? [] : [[STORAGE_KEY, initial]]);
    return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  };

  it('round-trips alerts', () => {
    const storage = memory();
    const alerts = [make('above', 100, 90)];
    expect(saveAlerts(alerts, storage)).toBe(true);
    expect(loadAlerts(storage)).toEqual(alerts);
  });

  it('survives corrupt, missing and malformed data', () => {
    expect(loadAlerts(memory())).toEqual([]);
    expect(loadAlerts(memory('{not json'))).toEqual([]);
    expect(loadAlerts(memory('{"a":1}'))).toEqual([]);
    const mixed = JSON.stringify([
      { id: 'ok', symbol: 'TCS', type: 'above', threshold: 5, status: 'active' },
      { id: 'bad-type', symbol: 'TCS', type: 'x', threshold: 5, status: 'active' },
      { id: 'bad-threshold', symbol: 'TCS', type: 'above', threshold: -1, status: 'active' },
      null,
      'str',
    ]);
    const loaded = loadAlerts(memory(mixed));
    expect(loaded.map((a) => a.id)).toEqual(['ok']);
    expect(loaded[0]).toMatchObject({ lastPrice: null, triggerCount: 0, triggeredAt: null });
  });

  it('reports failure instead of throwing when storage is unavailable', () => {
    const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } };
    expect(saveAlerts([], broken)).toBe(false);
    expect(loadAlerts(broken)).toEqual([]);
  });
});
