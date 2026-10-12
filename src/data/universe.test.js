import { describe, it, expect } from 'vitest';
import {
  validateUniverse, loadUniverse, saveUniverse, toggleIndex, toggleGroup, setCustom, parseSymbols, savePreset, applyPreset,
  deletePreset, combineUniverse, describeUniverse, UNIVERSE_KEY, MAX_INDICES, DEFAULT_UNIVERSE,
} from './universe';

const memory = (value) => {
  const data = new Map(value === undefined ? [] : [[UNIVERSE_KEY, value]]);
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
};
const U = (ids, custom = [], presets = []) => ({ ids, custom, presets });

describe('universe validation and storage', () => {
  it('keeps valid ids and symbols, drops junk and duplicates, and never ends up empty', () => {
    expect(validateUniverse({ ids: ['bank', 'bank', 'Bad Id!', 5], custom: ['IRFC', 'irfc', 'M&M'] })).toEqual(U(['bank'], ['IRFC', 'M&M']));
    expect(validateUniverse(null)).toEqual(DEFAULT_UNIVERSE);
    expect(validateUniverse({ ids: [], custom: [] }).ids).toEqual(['nifty50']);
    expect(validateUniverse({ ids: [], custom: ['TCS'] })).toEqual(U([], ['TCS']));
  });

  it('limits the number of indices', () => {
    const many = Array.from({ length: 12 }, (_, i) => `idx${i}x`);
    expect(validateUniverse({ ids: many }).ids).toHaveLength(MAX_INDICES);
  });

  it('round-trips and survives corrupt or blocked storage', () => {
    const s = memory();
    expect(saveUniverse(U(['bank', 'it'], ['IRFC']), s)).toBe(true);
    expect(loadUniverse(s)).toEqual(U(['bank', 'it'], ['IRFC']));
    expect(loadUniverse(memory('{bad'))).toEqual(DEFAULT_UNIVERSE);
    const blocked = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
    expect(loadUniverse(blocked)).toEqual(DEFAULT_UNIVERSE);
    expect(saveUniverse(U(['bank']), blocked)).toBe(false);
  });

  it('starts from the index chosen before multi-select existed when nothing is saved', () => {
    expect(loadUniverse(memory(), 'midcap100')).toEqual(U(['midcap100']));
    expect(loadUniverse(memory(), null)).toEqual(DEFAULT_UNIVERSE);
  });
});

describe('selecting indices', () => {
  it('toggles one index on and off', () => {
    let u = toggleIndex(U(['nifty50']), 'bank');
    expect(u.ids).toEqual(['nifty50', 'bank']);
    u = toggleIndex(u, 'nifty50');
    expect(u.ids).toEqual(['bank']);
  });

  it('selects a whole group, and clears it when every member is already selected', () => {
    const group = ['bank', 'it', 'auto'];
    const on = toggleGroup(U(['nifty50']), group);
    expect(on.ids).toEqual(['nifty50', 'bank', 'it', 'auto']);
    expect(toggleGroup(on, group).ids).toEqual(['nifty50']);
    expect(toggleGroup(U(['bank']), group).ids).toEqual(['bank', 'it', 'auto']); // partly selected: completes the group
  });

  it('never leaves nothing selected by toggling the last index off', () => {
    expect(toggleIndex(U(['bank']), 'bank').ids).toEqual(['nifty50']);
    expect(toggleIndex(U(['bank'], ['TCS']), 'bank')).toEqual(U([], ['TCS']));
  });

  it('adds custom symbols and reports what could not be read', () => {
    expect(parseSymbols('tcs, INFY\nm&m; bad! ,ITC, tcs')).toEqual({ valid: ['TCS', 'INFY', 'M&M', 'ITC'], skipped: ['BAD!'] });
    expect(setCustom(U(['nifty50']), ['IRFC', 'x y']).custom).toEqual(['IRFC']);
  });
});

describe('presets', () => {
  it('saves a named preset, replaces by name ignoring case, applies it and deletes it', () => {
    let u = savePreset(U(['bank', 'it'], ['IRFC']), 'My banks');
    expect(u.presets).toEqual([{ name: 'My banks', ids: ['bank', 'it'], custom: ['IRFC'] }]);
    u = savePreset({ ...u, ids: ['pharma'], custom: [] }, 'my BANKS');
    expect(u.presets).toHaveLength(1);
    expect(u.presets[0].ids).toEqual(['pharma']);
    // the replacement keeps the newest casing of the name, and applying needs that exact name
    expect(u.presets[0].name).toBe('my BANKS');
    const applied = applyPreset({ ...u, ids: ['nifty50'], custom: ['X'] }, 'my BANKS');
    expect(applied).toMatchObject({ ids: ['pharma'], custom: [] });
    const unchanged = applyPreset({ ...u, ids: ['nifty50'], custom: ['X'] }, 'no such preset');
    expect(unchanged.ids).toEqual(['nifty50']);
    const byName = applied;
    expect(deletePreset(byName, u.presets[0].name).presets).toEqual([]);
    expect(savePreset(U(['bank']), '   ')).toBeNull();
  });
});

describe('combineUniverse', () => {
  const list = (id, label, symbols) => ({ id, label, stocks: symbols.map((s) => ({ symbol: s, name: `${s} Ltd`, industry: 'Financial Services' })) });

  it('merges lists without duplicates and records every index a stock belongs to', () => {
    const out = combineUniverse([list('nifty50', 'Nifty 50', ['HDFCBANK', 'TCS']), list('bank', 'Nifty Bank', ['HDFCBANK', 'SBIN'])]);
    expect(out.map((s) => s.symbol)).toEqual(['HDFCBANK', 'TCS', 'SBIN']);
    expect(out[0].indices).toEqual(['Nifty 50', 'Nifty Bank']);
    expect(out[1].indices).toEqual(['Nifty 50']);
    expect(out[0]).toMatchObject({ name: 'HDFCBANK Ltd', sector: 'Financial Services' });
  });

  it('adds custom symbols, marking those that are also in an index', () => {
    const out = combineUniverse([list('bank', 'Nifty Bank', ['SBIN'])], ['IRFC', 'SBIN']);
    expect(out.find((s) => s.symbol === 'IRFC')).toMatchObject({ indices: ['Custom'], name: 'IRFC' });
    expect(out.find((s) => s.symbol === 'SBIN').indices).toEqual(['Nifty Bank', 'Custom']);
    expect(out).toHaveLength(2);
  });

  it('handles no lists', () => {
    expect(combineUniverse([], [])).toEqual([]);
  });

  it('describes the selection for the selector button', () => {
    const labels = { nifty50: 'Nifty 50', bank: 'Nifty Bank' };
    expect(describeUniverse(U(['bank']), labels)).toBe('Nifty Bank');
    expect(describeUniverse(U(['nifty50', 'bank'], ['X']), labels, 120)).toBe('Nifty 50 + 2 more (120 stocks)');
    expect(describeUniverse(U([], ['A', 'B']), labels)).toBe('2 custom');
  });
});
