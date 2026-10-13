import { describe, it, expect } from 'vitest';
import { parseAllIndices, matchIndexLevels } from './indexLevels.js';

const feed = {
  timestamp: '12-Oct-2026 15:30',
  data: [
    { index: 'NIFTY 50', last: 22363.35, variation: -157.2, percentChange: -0.7, open: 22500, high: 22600, low: 22300, previousClose: 22520.55, yearHigh: 26000, yearLow: 21000, pe: '21.4', advances: 13, declines: 36, unchanged: 1 },
    { index: 'NIFTY BANK', last: '54,918.00', variation: -336.1, percentChange: -0.61, advances: 1, declines: 13, unchanged: 0 },
    { index: 'NIFTY   OIL & GAS', last: 11000, percentChange: 0.2 },
    { index: 'BROKEN', last: 'n/a' },
    { index: '', last: 5 },
    null,
  ],
};
const parsed = parseAllIndices(feed);

describe('parseAllIndices', () => {
  it('reads levels, changes and NSE breadth, normalising names', () => {
    expect(parsed.timestamp).toBe('12-Oct-2026 15:30');
    expect(parsed.rows.get('NIFTY 50')).toMatchObject({ last: 22363.35, change: -157.2, changePct: -0.7, high: 22600, pe: 21.4, advances: 13, declines: 36, unchanged: 1 });
    expect(parsed.rows.get('NIFTY BANK').last).toBe(54918);
    expect(parsed.rows.get('NIFTY OIL & GAS')).toMatchObject({ last: 11000, change: null, advances: null });
  });
  it('skips rows without a usable level, and survives bad input', () => {
    expect([...parsed.rows.keys()].sort()).toEqual(['NIFTY 50', 'NIFTY BANK', 'NIFTY OIL & GAS']);
    for (const bad of [null, undefined, {}, { data: 'x' }, { data: [] }]) expect(parseAllIndices(bad).rows.size).toBe(0);
    expect(parseAllIndices({ data: [] }).timestamp).toBeNull();
  });
});

describe('matchIndexLevels', () => {
  const defs = [
    { id: 'nifty50', label: 'Nifty 50' },
    { id: 'bank', label: 'Nifty Bank' },
    { id: 'oilgas', label: 'Nifty Oil & Gas' },
    { id: 'psu', label: 'Nifty PSE' },
  ];
  it('matches by name and reports what NSE did not give instead of filling it in', () => {
    const { byId, missing } = matchIndexLevels(defs, parsed);
    expect(Object.keys(byId)).toEqual(['nifty50', 'bank', 'oilgas']);
    expect(byId.nifty50.last).toBe(22363.35);
    expect(missing).toEqual(['psu']);
  });
});
