import { describe, it, expect } from 'vitest';
import { parseGmpPage, inferDate, inferUpdated, sameCompany, findGmpRow, gmpSummary } from './ipoGmp.js';
import { FIXTURE_HTML, page, row } from './fixtures/gmpPage.js';

const TODAY = '2026-10-13';
const rows = parseGmpPage(FIXTURE_HTML, TODAY);
const by = (name) => rows.find((r) => r.name === name);

describe('inferDate and inferUpdated', () => {
  it('picks the year closest to today, including across New Year', () => {
    expect(inferDate('15-Oct', '2026-10-13')).toBe('2026-10-15');
    expect(inferDate('2-Jan', '2026-12-28')).toBe('2027-01-02');
    expect(inferDate('28-Dec', '2027-01-03')).toBe('2026-12-28');
    expect(inferDate('25-Sep GMP: 80', '2026-10-13')).toBe('2026-09-25');
  });
  it('rejects nonsense', () => {
    for (const bad of ['', null, '-', '31-Feb', '15-Foo', 'GMP: 5']) expect(inferDate(bad, TODAY)).toBeNull();
  });
  it('reads the updated time as India time', () => {
    expect(inferUpdated('12-Oct 23:37', TODAY)).toBe('2026-10-12T18:07:00.000Z');
    expect(inferUpdated('5-Oct 9:37', TODAY)).toBe('2026-10-05T04:07:00.000Z');
    expect(inferUpdated('soon', TODAY)).toBeNull();
  });
});

describe('parseGmpPage', () => {
  it('reads every row and tells mainboard from SME', () => {
    expect(rows.map((r) => [r.name, r.kind])).toEqual([
      ['HD Fire Protect', 'MAINBOARD'], ['Tonbo Imaging India', 'MAINBOARD'], ['Jio Platforms', 'MAINBOARD'],
      ['Shellz India', 'SME'], ['Orient Cables', 'MAINBOARD'], ['Acevector', 'MAINBOARD'],
    ]);
  });
  it('parses the premium, its percentage and its recent range', () => {
    expect(by('Tonbo Imaging India')).toMatchObject({ gmp: 425, gmpPct: 60.71, low: 270, high: 425, price: 700, sizeCr: 852.18, lot: 21, anchor: true });
    expect(by('HD Fire Protect')).toMatchObject({ gmp: 86, gmpPct: 31.73, low: 63, high: 86 });
  });
  it('treats "--" and a missing percentage as no figure, not zero', () => {
    expect(by('Shellz India')).toMatchObject({ gmp: null, gmpPct: null });
    expect(by('Jio Platforms')).toMatchObject({ gmp: 182, gmpPct: null, price: null }); // price band not announced
  });
  it('infers the dates, including the allotment (basis of allotment) date', () => {
    expect(by('Tonbo Imaging India')).toMatchObject({ openDate: '2026-10-15', closeDate: '2026-10-19', boaDate: '2026-10-21', listingDate: '2026-10-23' });
    expect(by('Jio Platforms')).toMatchObject({ openDate: null, closeDate: null, boaDate: null, listingDate: null });
    expect(by('HD Fire Protect').updatedAt).toBe('2026-10-12T18:07:00.000Z');
  });
  it('reads the listing result and final subscription of listed issues, with or without the price', () => {
    expect(by('Orient Cables')).toMatchObject({ listingPrice: 450, listingGainPct: 65.44, subscription: 97.28, openDate: '2026-09-25' });
    expect(by('Acevector')).toMatchObject({ listingPrice: null, listingGainPct: -11.5, subscription: 5.07 });
    expect(by('HD Fire Protect')).toMatchObject({ listingGainPct: null, subscription: null });
  });
  it('keeps the page address so the issue can be linked', () => {
    expect(by('Tonbo Imaging India')).toMatchObject({ id: '2369', path: '/gmp/tonbo-imaging-india-ipo/2369/' });
  });
  it('returns nothing, rather than guessing, for a page that is not the report', () => {
    expect(parseGmpPage('<html>blocked</html>', TODAY)).toEqual([]);
    expect(parseGmpPage('', TODAY)).toEqual([]);
    expect(parseGmpPage(null, TODAY)).toEqual([]);
    expect(parseGmpPage(page([row({ n: 'No Link', slug: 'x', id: 1 }).replace(/<a [^>]*>[^<]*<\/a>/, 'No Link')]), TODAY)).toEqual([]);
  });
});

describe('matching an issue to its row', () => {
  it('matches names regardless of Limited/Ltd, punctuation and case', () => {
    expect(sameCompany('HD Fire Protect Limited', 'HD Fire Protect')).toBe(true);
    expect(sameCompany('Orient Cables (India) Limited', 'Orient Cables India')).toBe(true);
    expect(sameCompany('M&M Financial', 'm and m financial')).toBe(true);
    expect(sameCompany('Tonbo Imaging India', 'Fusion CX')).toBe(false);
    expect(sameCompany('', 'x')).toBe(false);
  });
  it('finds the row only when the opening dates agree', () => {
    const ipo = { name: 'HD Fire Protect Limited', openDate: '2026-10-13' };
    expect(findGmpRow(ipo, rows)?.id).toBe('2400');
    expect(findGmpRow({ ...ipo, openDate: '2024-03-01' }, rows)).toBeNull();
    expect(findGmpRow({ name: 'Shellz India Limited', openDate: '2026-10-15' }, rows)).toBeNull(); // SME rows are never used
  });
  it('summarises a row, working out the percentage and implied listing price when needed', () => {
    expect(gmpSummary(by('HD Fire Protect'), 271)).toMatchObject({ gmp: 86, gmpPct: 31.73, impliedListing: 357 });
    expect(gmpSummary({ ...by('Jio Platforms'), gmpPct: null }, 200)).toMatchObject({ gmp: 182, gmpPct: 91, impliedListing: 382 });
    expect(gmpSummary(by('Jio Platforms'))).toMatchObject({ impliedListing: null });
    expect(gmpSummary(null)).toBeNull();
  });
});
