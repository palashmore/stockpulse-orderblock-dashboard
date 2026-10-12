import { describe, it, expect } from 'vitest';
import { nearestBlocks, moversFromQuotes, orderBlockList, swingSetupList, trendingList, intradayList } from './stockLists';
import { screenerMetrics, MIN_CANDLES } from './screenerMetrics';

const block = (type, low, high, o = {}) => ({ type, low, high, strength: 50, tested: false, mitigated: false, volumeConfirm: false, time: 't', index: 10, ...o });

describe('nearestBlocks', () => {
  it('finds the closest valid demand zone at or below price and supply zone at or above it', () => {
    const blocks = [
      block('bullish', 90, 92), block('bullish', 96, 98), block('bullish', 105, 107), // 105-107 is above price: not demand
      block('bearish', 110, 112), block('bearish', 104, 106), block('bearish', 90, 95), // 90-95 is below price: not supply
    ];
    const r = nearestBlocks(blocks, 100, 50);
    expect(r.demand).toMatchObject({ low: 96, high: 98, inside: false });
    expect(r.demand.distancePct).toBeCloseTo(2, 10);
    expect(r.supply).toMatchObject({ low: 104, high: 106 });
    expect(r.supply.distancePct).toBeCloseTo(4, 10);
    expect(r.demand.ageBars).toBe(39);
  });

  it('reports a zero distance when price is inside the zone', () => {
    const r = nearestBlocks([block('bullish', 98, 102), block('bearish', 99, 101)], 100);
    expect(r.demand).toMatchObject({ distancePct: 0, inside: true });
    expect(r.supply).toMatchObject({ distancePct: 0, inside: true });
  });

  it('never returns a mitigated block, and ties go to the stronger one', () => {
    expect(nearestBlocks([block('bullish', 98, 99, { mitigated: true })], 100).demand).toBeNull();
    const r = nearestBlocks([block('bullish', 98, 99, { strength: 40 }), block('bullish', 98, 99, { strength: 80 })], 100);
    expect(r.demand.strength).toBe(80);
  });

  it('handles empty input and invalid prices', () => {
    expect(nearestBlocks(null, 100)).toEqual({ demand: null, supply: null });
    expect(nearestBlocks([block('bullish', 98, 99)], 0)).toEqual({ demand: null, supply: null });
  });
});

describe('moversFromQuotes', () => {
  const q = (symbol, price, changePct, volume, avgVolume) => ({ symbol, price, changePct, volume, avgVolume });
  const quotes = [q('A', 100, 3, 1000, 500), q('B', 10, 5, 100000, 1000), q('C', 200, -4, 2000, 4000), q('D', 50, -1, 10, 100), q('E', 80, 0, 5, 5), q('BAD', null, 1, 1, 1), q('NOCHG', 5, undefined, 1, 1)];

  it('ranks gainers, losers, traded value and relative volume, leaving out unusable quotes', () => {
    const m = moversFromQuotes(quotes);
    expect(m.gainers.map((x) => x.symbol)).toEqual(['B', 'A']);
    expect(m.losers.map((x) => x.symbol)).toEqual(['C', 'D']);
    // traded value: B 1,000,000; C 400,000; A 100,000; E 400; D 500 -> B, C, A, D, E
    expect(m.volume.map((x) => x.symbol)).toEqual(['B', 'C', 'A', 'D', 'E']);
    expect(m.relVolume[0]).toMatchObject({ symbol: 'B', relVolume: 100 });
    expect(m.counts).toEqual({ total: 7, ranked: 5, up: 2, down: 2 });
  });

  it('respects the limit and handles empty input', () => {
    expect(moversFromQuotes(quotes, 1).gainers).toHaveLength(1);
    expect(moversFromQuotes(null).counts.total).toBe(0);
  });
});

describe('list builders', () => {
  const row = (symbol, metrics) => ({ symbol, name: symbol, sector: '', metrics });
  const zone = (distancePct, strength = 50) => ({ distancePct, strength, low: 1, high: 2, inside: distancePct === 0, tested: false, volumeConfirm: false, time: 't', ageBars: 3 });

  it('orderBlockList keeps zones within the distance and sorts by proximity then strength', () => {
    const rows = [
      row('FAR', { price: 1, orderBlocks: { demand: zone(5), supply: null } }),
      row('NEAR', { price: 1, orderBlocks: { demand: zone(0.5, 40), supply: zone(1) } }),
      row('INSIDE', { price: 1, orderBlocks: { demand: zone(0, 30), supply: null } }),
      row('STRONGER', { price: 1, orderBlocks: { demand: zone(0.5, 90), supply: null } }),
      row('NONE', { price: 1, orderBlocks: { demand: null, supply: null } }),
      row('NOMETRICS', null),
    ];
    expect(orderBlockList(rows, 'demand', 2).map((r) => r.symbol)).toEqual(['INSIDE', 'STRONGER', 'NEAR']);
    expect(orderBlockList(rows, 'supply', 2).map((r) => r.symbol)).toEqual(['NEAR']);
    expect(orderBlockList(rows, 'demand', 10).map((r) => r.symbol)).toContain('FAR');
  });

  it('swingSetupList shows valid setups newest first, and the no-longer-valid ones on request', () => {
    const rows = [
      row('OLD', { swing: { ageBars: 2, actionable: true } }), row('NEW', { swing: { ageBars: 0, actionable: true } }),
      row('STOPPED', { swing: { ageBars: 1, actionable: false, status: 'STOPPED' } }), row('NONE', { swing: null }),
    ];
    expect(swingSetupList(rows).map((r) => r.symbol)).toEqual(['NEW', 'OLD']);
    expect(swingSetupList(rows, { actionable: false }).map((r) => r.symbol)).toEqual(['STOPPED']);
  });

  it('trendingList needs ADX, EMA order and DI to agree, strongest first', () => {
    const rows = [
      row('A', { adx: 40, trend: 'up', diBias: 'up' }), row('B', { adx: 30, trend: 'up', diBias: 'up' }),
      row('C', { adx: 50, trend: 'up', diBias: 'down' }), row('D', { adx: 20, trend: 'up', diBias: 'up' }), row('E', { adx: 45, trend: 'down', diBias: 'down' }),
    ];
    expect(trendingList(rows, 'up').map((r) => r.symbol)).toEqual(['A', 'B']);
    expect(trendingList(rows, 'down').map((r) => r.symbol)).toEqual(['E']);
  });

  it('intradayList separates still-valid signals from expired, stopped and past-session ones', () => {
    const life = (actionable) => ({ actionable });
    const scans = [
      { symbol: 'A', latest: { ageBars: 4, lifecycle: life(true) } }, { symbol: 'B', latest: { ageBars: 0, lifecycle: life(true) } },
      { symbol: 'C', latest: { ageBars: 30, lifecycle: life(false) } }, { symbol: 'D', latest: null }, { symbol: 'E', latest: { ageBars: 2 } },
    ];
    expect(intradayList(scans).map((s) => s.symbol)).toEqual(['B', 'A']);
    expect(intradayList(scans, { actionable: false }).map((s) => s.symbol)).toEqual(['E', 'C']);
  });
});

describe('screenerMetrics extensions', () => {
  function daily(n) {
    let seed = 4242;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const out = [];
    let price = 100;
    const d0 = Date.UTC(2025, 0, 6);
    let day = 0;
    while (out.length < n) {
      const dt = new Date(d0 + day * 86400000);
      day++;
      if (dt.getUTCDay() === 0 || dt.getUTCDay() === 6) continue;
      const o = price;
      const c = o + 0.4 + (rnd() - 0.5) * 2.4;
      out.push({ time: dt.toISOString().slice(0, 10), open: o, high: Math.max(o, c) + rnd() * 1.2, low: Math.min(o, c) - rnd() * 1.2, close: c, volume: 100000 + Math.floor(rnd() * 50000) + (rnd() > 0.9 ? 300000 : 0) });
      price = c;
    }
    return out;
  }

  it('adds the recent swing setup and nearest order blocks, consistent with the engines', () => {
    const c = daily(MIN_CANDLES + 140);
    let sawSwing = 0;
    for (let n = MIN_CANDLES; n <= c.length; n++) {
      const m = screenerMetrics(c.slice(0, n));
      expect(m.orderBlocks).toHaveProperty('demand');
      if (m.swing) {
        sawSwing++;
        expect(m.swing.ageBars).toBeGreaterThanOrEqual(0);
        expect(m.swing.ageBars).toBeLessThanOrEqual(2);
        expect(m.swing.stop).toBeLessThan(m.swing.entry);
        expect(typeof m.swing.actionable).toBe('boolean');
        expect(m.swing.status).toBeTruthy();
      }
      if (m.setup) expect(m.swing.ageBars).toBe(0); // a setup on the last bar is always the newest recent one
    }
    expect(sawSwing).toBeGreaterThan(0);
  });
});
