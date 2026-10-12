import { describe, it, expect } from 'vitest';
import { sanitizeCosts, loadCosts, saveCosts, setCost, COST_KEY, MAX_COSTS } from './costBasis';

const memory = (initial = null) => {
  let value = initial;
  return { getItem: () => value, setItem: (_k, v) => { value = v; }, peek: () => value };
};

describe('cost basis', () => {
  it('keeps only valid symbols with positive finite prices', () => {
    expect(sanitizeCosts({ TCS: 3500, 'M&M': 1200.5, bad: 10, ZERO: 0, NEG: -1, STR: '5', NAN: NaN, 'A B': 5 })).toEqual({ TCS: 3500, 'M&M': 1200.5 });
    for (const junk of [null, undefined, [], 'x', 5]) expect(sanitizeCosts(junk)).toEqual({});
  });

  it('round-trips through storage and survives corrupt or blocked storage', () => {
    const storage = memory();
    expect(saveCosts({ TCS: 3500 }, storage)).toBe(true);
    expect(loadCosts(storage)).toEqual({ TCS: 3500 });
    expect(loadCosts(memory('{bad'))).toEqual({});
    expect(loadCosts({ getItem: () => { throw new Error('blocked'); } })).toEqual({});
    expect(saveCosts({ TCS: 1 }, { setItem: () => { throw new Error('full'); } })).toBe(false);
    expect(COST_KEY).toMatch(/portfolio/);
  });

  it('sets, updates and clears a price without mutating the original', () => {
    const base = { TCS: 3500 };
    const added = setCost(base, 'INFY', '1,450.50');
    expect(added).toEqual({ TCS: 3500, INFY: 1450.5 });
    expect(base).toEqual({ TCS: 3500 });
    expect(setCost(added, 'TCS', 3600).TCS).toBe(3600);
    expect(setCost(added, 'TCS', '')).toEqual({ INFY: 1450.5 });
    expect(setCost(added, 'TCS', 'abc')).toEqual({ INFY: 1450.5 });
    expect(setCost(added, 'TCS', -5)).toEqual({ INFY: 1450.5 });
  });

  it('ignores an invalid symbol and caps the number of entries', () => {
    const base = { TCS: 1 };
    expect(setCost(base, 'not valid', 5)).toBe(base);
    const many = Object.fromEntries(Array.from({ length: MAX_COSTS + 20 }, (_, i) => [`S${i}`, 1]));
    expect(Object.keys(sanitizeCosts(many))).toHaveLength(MAX_COSTS);
  });
});
