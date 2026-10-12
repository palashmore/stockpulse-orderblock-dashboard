import { describe, it, expect } from 'vitest';
import { loadWatch, saveWatch, addToWatch, removeFromWatch, sinceAddedPct, WATCH_KEY_V2, MAX_WATCH } from './watchStore';

const memory = (entries = {}) => {
  const data = new Map(Object.entries(entries));
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), data };
};
const NOW = '2026-10-12T10:00:00.000Z';

describe('watchlist store', () => {
  it('adds newest first with the price and time, and ignores duplicates and invalid symbols', () => {
    let list = addToWatch([], 'tcs', 2125, NOW);
    list = addToWatch(list, 'IRFC', 77.5, NOW);
    list = addToWatch(list, 'TCS', 1, NOW);
    list = addToWatch(list, 'bad symbol', 1, NOW);
    expect(list.map((e) => e.symbol)).toEqual(['IRFC', 'TCS']);
    expect(list[1]).toEqual({ symbol: 'TCS', addedAt: NOW, addedPrice: 2125 });
    expect(addToWatch([], 'X', null, NOW)[0].addedPrice).toBeNull();
    expect(addToWatch([], 'X', -5, NOW)[0].addedPrice).toBeNull();
  });

  it('removes a symbol', () => {
    expect(removeFromWatch(addToWatch(addToWatch([], 'A', 1, NOW), 'B', 1, NOW), 'A').map((e) => e.symbol)).toEqual(['B']);
  });

  it('round-trips through storage, validating what it reads', () => {
    const s = memory();
    const list = addToWatch([], 'SBIN', 941, NOW);
    expect(saveWatch(list, s)).toBe(true);
    expect(loadWatch(s)).toEqual(list);
    const dirty = memory({ [WATCH_KEY_V2]: JSON.stringify([{ symbol: 'TCS', addedAt: 'nonsense', addedPrice: 'x' }, { symbol: 'tcs lower' }, { symbol: 'TCS' }, null, 7]) });
    expect(loadWatch(dirty)).toEqual([{ symbol: 'TCS', addedAt: null, addedPrice: null }]);
  });

  it('upgrades the earlier symbols-only list, and the new key wins once it exists', () => {
    const old = memory({ 'stockpulse.watchlist.v1': JSON.stringify(['TCS', 'INFY', 'bad one', 'TCS']) });
    expect(loadWatch(old).map((e) => e.symbol)).toEqual(['TCS', 'INFY']);
    expect(loadWatch(old)[0]).toEqual({ symbol: 'TCS', addedAt: null, addedPrice: null });
    old.setItem(WATCH_KEY_V2, JSON.stringify([{ symbol: 'ITC' }]));
    expect(loadWatch(old).map((e) => e.symbol)).toEqual(['ITC']);
  });

  it('survives corrupt or blocked storage and caps the list size', () => {
    expect(loadWatch(memory({ [WATCH_KEY_V2]: '{bad' }))).toEqual([]);
    const blocked = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
    expect(loadWatch(blocked)).toEqual([]);
    expect(saveWatch([], blocked)).toBe(false);
    let list = [];
    for (let i = 0; i < MAX_WATCH + 10; i++) list = addToWatch(list, `S${i}`, 1, NOW);
    expect(list).toHaveLength(MAX_WATCH);
  });

  it('works out the change since added only when both prices are known', () => {
    expect(sinceAddedPct({ addedPrice: 100 }, 110)).toBeCloseTo(10, 10);
    expect(sinceAddedPct({ addedPrice: null }, 110)).toBeNull();
    expect(sinceAddedPct({ addedPrice: 100 }, null)).toBeNull();
  });
});
