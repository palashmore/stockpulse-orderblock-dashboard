import { describe, it, expect } from 'vitest';
import {
  loadWatch, saveWatch, addToWatch, removeFromWatch, sinceAddedPct, WATCH_KEY_V2, MAX_WATCH,
  loadWatchlists, saveWatchlists, addToList, removeFromList, moveBetween, emptyLists, WATCH_KEY_V3,
} from './watchStore';

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

describe('daily and swing watchlists', () => {
  it('keeps the two lists separate', () => {
    let lists = addToList(emptyLists(), 'daily', 'TCS', 2125, NOW);
    lists = addToList(lists, 'swing', 'IRFC', 77.5, NOW);
    lists = addToList(lists, 'swing', 'TCS', 2125, NOW);
    expect(lists.daily.map((e) => e.symbol)).toEqual(['TCS']);
    expect(lists.swing.map((e) => e.symbol)).toEqual(['TCS', 'IRFC']);
    lists = removeFromList(lists, 'daily', 'TCS');
    expect(lists.daily).toEqual([]);
    expect(lists.swing).toHaveLength(2); // removing from one list leaves the other alone
    expect(addToList(lists, 'nope', 'X', 1, NOW)).toBe(lists);
  });

  it('moves a stock between lists keeping its added time and price, and refuses duplicates', () => {
    const lists = addToList(addToList(emptyLists(), 'daily', 'SBIN', 941, NOW), 'swing', 'ITC', 258, NOW);
    const moved = moveBetween(lists, 'SBIN', 'daily', 'swing');
    expect(moved.daily).toEqual([]);
    expect(moved.swing[0]).toEqual({ symbol: 'SBIN', addedAt: NOW, addedPrice: 941 });
    expect(moveBetween(lists, 'SBIN', 'daily', 'daily')).toBe(lists);
    expect(moveBetween(lists, 'ZZZ', 'daily', 'swing')).toBe(lists);
    const dup = addToList(lists, 'swing', 'SBIN', 1, NOW);
    expect(moveBetween(dup, 'SBIN', 'daily', 'swing')).toBe(dup);
  });

  it('upgrades the earlier single list into the daily list and leaves swing empty', () => {
    const s = memory({ [WATCH_KEY_V2]: JSON.stringify([{ symbol: 'TCS', addedAt: NOW, addedPrice: 100 }]) });
    expect(loadWatchlists(s)).toEqual({ daily: [{ symbol: 'TCS', addedAt: NOW, addedPrice: 100 }], swing: [] });
    const v1 = memory({ 'stockpulse.watchlist.v1': JSON.stringify(['INFY']) });
    expect(loadWatchlists(v1).daily.map((e) => e.symbol)).toEqual(['INFY']);
  });

  it('round-trips, validates what it reads, and survives corrupt or blocked storage', () => {
    const s = memory();
    const lists = addToList(addToList(emptyLists(), 'daily', 'A', 1, NOW), 'swing', 'B', 2, NOW);
    expect(saveWatchlists(lists, s)).toBe(true);
    expect(loadWatchlists(s)).toEqual(lists);
    expect(loadWatchlists(memory({ [WATCH_KEY_V3]: JSON.stringify({ daily: ['x y', 'OK'], swing: 5 }) }))).toEqual({ daily: [{ symbol: 'OK', addedAt: null, addedPrice: null }], swing: [] });
    expect(loadWatchlists(memory({ [WATCH_KEY_V3]: '{bad' }))).toEqual(emptyLists());
    const blocked = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
    expect(loadWatchlists(blocked)).toEqual(emptyLists());
    expect(saveWatchlists(lists, blocked)).toBe(false);
  });
});
