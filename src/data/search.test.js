import { describe, it, expect } from 'vitest';
import { mergeSearchResults } from './search';

const local = [
  { symbol: 'RELIANCE', name: 'Reliance Industries', sector: 'Energy' },
  { symbol: 'TCS', name: 'Tata Consultancy Services', sector: 'IT' },
  { symbol: 'SBIN', name: 'State Bank of India', sector: 'Banking' },
];

describe('mergeSearchResults', () => {
  it('finds stocks that are not in the local list through the server results', () => {
    const remote = [{ symbol: 'IRFC', name: 'Indian Railway Finance Corporation Limited' }];
    const out = mergeSearchResults(local, remote, 'IRFC');
    expect(out).toEqual([{ symbol: 'IRFC', name: 'Indian Railway Finance Corporation Limited', sector: '' }]);
  });

  it('puts local matches first and removes duplicates', () => {
    const remote = [{ symbol: 'RPOWER', name: 'Reliance Power' }, { symbol: 'RELIANCE', name: 'Reliance Industries Limited' }];
    const out = mergeSearchResults(local, remote, 'reli');
    expect(out.map((s) => s.symbol)).toEqual(['RELIANCE', 'RPOWER']);
    expect(out[0].sector).toBe('Energy');
  });

  it('matches names, ranks exact then prefix then contains, and is case-insensitive', () => {
    expect(mergeSearchResults(local, [], 'bank').map((s) => s.symbol)).toEqual(['SBIN']);
    expect(mergeSearchResults(local, [], 'tata').map((s) => s.symbol)).toEqual(['TCS']);
    const many = [{ symbol: 'ABCD', name: 'x' }, { symbol: 'AB', name: 'y' }, { symbol: 'XABY', name: 'z' }];
    expect(mergeSearchResults(many, [], 'ab').map((s) => s.symbol)).toEqual(['AB', 'ABCD', 'XABY']);
    expect(mergeSearchResults(local, [], 'sbin')[0].symbol).toBe('SBIN');
  });

  it('shows the local list for an empty query and respects the limit', () => {
    expect(mergeSearchResults(local, [], '')).toHaveLength(3);
    expect(mergeSearchResults(local, [], '   ', 2)).toHaveLength(2);
    const remote = Array.from({ length: 20 }, (_, i) => ({ symbol: `S${i}`, name: 'n' }));
    expect(mergeSearchResults([], remote, 's', 5)).toHaveLength(5);
  });

  it('tolerates missing or malformed remote entries', () => {
    expect(mergeSearchResults(local, [null, {}, { symbol: 'OK', name: 'ok' }], 'ok').map((s) => s.symbol)).toEqual(['OK']);
    expect(mergeSearchResults(local, null, 'zzz')).toEqual([]);
  });
});
