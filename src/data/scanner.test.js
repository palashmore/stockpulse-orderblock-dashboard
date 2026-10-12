import { describe, it, expect } from 'vitest';
import { scanMetrics, matches, runScan, presetCriteria, DEFAULT_CRITERIA, PRESETS, NEAR_EDGE } from './scanner';

// price, changePct, low, high, open, previousClose, volume, avgVolume
const q = (symbol, o = {}) => ({
  symbol, name: symbol, price: 108, changePct: 1.5, low: 100, high: 110,
  open: 101, previousClose: 100, volume: 300, avgVolume: 100, ...o,
});

describe('scanMetrics', () => {
  it('derives gap, position, relative volume and ranking fields', () => {
    const m = scanMetrics(q('A'));
    expect(m.gapPct).toBeCloseTo(1, 10);
    expect(m.position).toBeCloseTo(0.6, 10);
    expect(m.relVolume).toBe(3);
    expect(m.strength).toBe(54);
    expect(m.direction).toBe('BULLISH');
  });

  it('leaves unknown fields null rather than zero', () => {
    const m = scanMetrics(q('A', { open: undefined, avgVolume: undefined, low: undefined, high: undefined }));
    expect(m.gapPct).toBeNull();
    expect(m.relVolume).toBeNull();
    expect(m.position).toBeNull();
  });

  it('returns null when the quote cannot be scored', () => {
    expect(scanMetrics({ symbol: 'A', price: null, changePct: 1 })).toBeNull();
  });
});

describe('matches', () => {
  const m = scanMetrics(q('A'));

  it('passes everything with default criteria', () => {
    expect(matches(m, DEFAULT_CRITERIA)).toBe(true);
  });

  it('applies each rule', () => {
    expect(matches(m, { ...DEFAULT_CRITERIA, direction: 'BEARISH' })).toBe(false);
    expect(matches(m, { ...DEFAULT_CRITERIA, direction: 'BULLISH' })).toBe(true);
    expect(matches(m, { ...DEFAULT_CRITERIA, minChangePct: 2 })).toBe(false);
    expect(matches(m, { ...DEFAULT_CRITERIA, maxChangePct: 1 })).toBe(false);
    expect(matches(m, { ...DEFAULT_CRITERIA, minRelVolume: 3 })).toBe(true);
    expect(matches(m, { ...DEFAULT_CRITERIA, minRelVolume: 3.1 })).toBe(false);
    expect(matches(m, { ...DEFAULT_CRITERIA, minStrength: 55 })).toBe(false);
    expect(matches(m, { ...DEFAULT_CRITERIA, minGapPct: 1 })).toBe(true);
    expect(matches(m, { ...DEFAULT_CRITERIA, minGapPct: 1.01 })).toBe(false);
  });

  it('near-high and near-low use the documented edge', () => {
    const atHigh = scanMetrics(q('H', { price: 110 }));
    const atLow = scanMetrics(q('L', { price: 100, changePct: -1.5 }));
    expect(atHigh.position).toBe(1);
    expect(matches(atHigh, { ...DEFAULT_CRITERIA, nearHigh: true })).toBe(true);
    expect(matches(m, { ...DEFAULT_CRITERIA, nearHigh: true })).toBe(false); // 0.6 < NEAR_EDGE
    expect(matches(atLow, { ...DEFAULT_CRITERIA, nearLow: true })).toBe(true);
    expect(NEAR_EDGE).toBe(0.8);
  });

  it('a stock missing a needed field never matches that rule', () => {
    const noVol = scanMetrics(q('A', { avgVolume: undefined }));
    expect(matches(noVol, { ...DEFAULT_CRITERIA, minRelVolume: 0 })).toBe(false);
    const noOpen = scanMetrics(q('A', { open: undefined }));
    expect(matches(noOpen, { ...DEFAULT_CRITERIA, maxGapPct: 100 })).toBe(false);
    const noRange = scanMetrics(q('A', { low: undefined, high: undefined }));
    expect(matches(noRange, { ...DEFAULT_CRITERIA, nearHigh: true })).toBe(false);
  });
});

describe('runScan', () => {
  const quotes = [
    q('LOW', { price: 103, changePct: 0.5, volume: 100 }),
    q('MID', { price: 108 }),
    q('HIGH', { price: 110, changePct: 3, volume: 500 }),
    { symbol: 'BAD', price: null, changePct: null },
  ];

  it('filters, sorts descending by default and reports unscannable quotes', () => {
    const r = runScan(quotes, DEFAULT_CRITERIA);
    expect(r.rows.map((x) => x.symbol)).toEqual(['HIGH', 'MID', 'LOW']);
    expect(r.unscannable).toBe(1);
  });

  it('sorts by any column in either direction', () => {
    expect(runScan(quotes, DEFAULT_CRITERIA, 'relVolume', 'asc').rows.map((x) => x.symbol)).toEqual(['LOW', 'MID', 'HIGH']);
    expect(runScan(quotes, DEFAULT_CRITERIA, 'symbol', 'asc').rows.map((x) => x.symbol)).toEqual(['HIGH', 'LOW', 'MID']);
  });

  it('puts rows with a missing sort value last in both directions', () => {
    const withGap = [q('A', { open: 102 }), q('B', { open: undefined }), q('C', { open: 101 })];
    expect(runScan(withGap, DEFAULT_CRITERIA, 'gapPct', 'desc').rows.map((x) => x.symbol)).toEqual(['A', 'C', 'B']);
    expect(runScan(withGap, DEFAULT_CRITERIA, 'gapPct', 'asc').rows.map((x) => x.symbol)).toEqual(['C', 'A', 'B']);
  });

  it('is deterministic on ties', () => {
    const ties = [q('B'), q('A'), q('C')];
    expect(runScan(ties, DEFAULT_CRITERIA).rows.map((x) => x.symbol)).toEqual(['A', 'B', 'C']);
  });

  it('handles empty input', () => {
    expect(runScan(null, DEFAULT_CRITERIA)).toEqual({ rows: [], unscannable: 0 });
  });
});

describe('presets', () => {
  it('layer on the defaults and every preset id resolves', () => {
    for (const p of PRESETS) {
      expect(presetCriteria(p.id)).toMatchObject(p.criteria);
      expect(presetCriteria(p.id).direction).toBe('ANY');
    }
    expect(presetCriteria('nope')).toEqual(DEFAULT_CRITERIA);
  });

  it('volume spike finds only stocks at 2x average or more', () => {
    const r = runScan([q('A', { volume: 150 }), q('B', { volume: 250 })], presetCriteria('volume'));
    expect(r.rows.map((x) => x.symbol)).toEqual(['B']);
  });

  it('gap-down preset catches a falling open', () => {
    const r = runScan([q('A', { open: 98 }), q('B', { open: 101 })], presetCriteria('gapdown'));
    expect(r.rows.map((x) => x.symbol)).toEqual(['A']);
  });
});
