import { describe, it, expect } from 'vitest';
import {
  IPO_VIEWS, inView, countByView, yearsOf, filterIpos, countdown, stepState, formatDay, againstIssuePrice,
  recentlyListed, nseIssueUrl, investorGainUrl, loadTracked, saveTracked, toggleTracked, TRACKED_KEY, MAX_TRACKED, daysBetween,
} from './ipoView';

const TODAY = '2026-10-13';
const mk = (symbol, stage, openDate, extra = {}) => ({
  id: `${symbol}-${openDate}`, symbol, name: `${symbol} Limited`, stage, openDate, closeDate: openDate, listingDate: null, issuePrice: null, timeline: [], ...extra,
});
const ipos = [
  mk('OPENA', 'OPEN', '2026-10-13', { closeDate: '2026-10-15' }),
  mk('SOON', 'UPCOMING', '2026-10-14'),
  mk('LATER', 'UPCOMING', '2026-10-20'),
  mk('WAIT', 'CLOSED', '2026-10-06'),
  mk('DONE', 'LISTED', '2026-09-25', { listingDate: '2026-10-05', issuePrice: 272 }),
  mk('OLD', 'LISTED', '2025-03-06', { listingDate: '2025-03-14', issuePrice: 100 }),
  mk('NODATE', 'ENDED', '2025-02-01'),
];

describe('views and counts', () => {
  it('puts each stage in its tab, with completed issues under Listed', () => {
    expect(ipos.filter((i) => inView(i, 'open')).map((i) => i.symbol)).toEqual(['OPENA']);
    expect(ipos.filter((i) => inView(i, 'listed')).map((i) => i.symbol)).toEqual(['DONE', 'OLD', 'NODATE']);
    expect(ipos.filter((i) => inView(i, 'all'))).toHaveLength(ipos.length);
  });
  it('counts every view, including tracked', () => {
    expect(countByView(ipos, new Set(['SOON-2026-10-14']))).toEqual({ open: 1, upcoming: 2, closed: 1, listed: 3, tracked: 1, all: 7 });
    expect(Object.keys(countByView([]))).toEqual(IPO_VIEWS.map((v) => v.id));
  });
});

describe('filterIpos', () => {
  it('sorts open and upcoming soonest first and the rest newest first', () => {
    expect(filterIpos(ipos, { view: 'upcoming' }).map((i) => i.symbol)).toEqual(['SOON', 'LATER']);
    expect(filterIpos(ipos, { view: 'listed' }).map((i) => i.symbol)).toEqual(['DONE', 'OLD', 'NODATE']);
  });
  it('searches name and symbol, case-insensitively', () => {
    expect(filterIpos(ipos, { view: 'all', query: ' later ' }).map((i) => i.symbol)).toEqual(['LATER']);
    expect(filterIpos(ipos, { view: 'all', query: 'zzz' })).toEqual([]);
  });
  it('filters by year and by tracked ids', () => {
    expect(filterIpos(ipos, { view: 'listed', year: '2025' }).map((i) => i.symbol)).toEqual(['OLD', 'NODATE']);
    expect(filterIpos(ipos, { view: 'tracked', tracked: new Set(['WAIT-2026-10-06']) }).map((i) => i.symbol)).toEqual(['WAIT']);
    expect(filterIpos(ipos, { view: 'tracked' })).toEqual([]);
  });
  it('lists years newest first', () => {
    expect(yearsOf(ipos)).toEqual(['2026', '2025']);
  });
});

describe('countdown', () => {
  it('describes upcoming and open issues', () => {
    expect(countdown(mk('A', 'UPCOMING', '2026-10-14'), TODAY)).toBe('Opens tomorrow');
    expect(countdown(mk('A', 'UPCOMING', '2026-10-20'), TODAY)).toBe('Opens in 7 days');
    expect(countdown(mk('A', 'OPEN', '2026-10-13', { closeDate: '2026-10-13' }), TODAY)).toBe('Closes today');
    expect(countdown(mk('A', 'OPEN', '2026-10-13', { closeDate: '2026-10-14' }), TODAY)).toBe('Closes tomorrow');
    expect(countdown(mk('A', 'OPEN', '2026-10-12', { closeDate: '2026-10-15' }), TODAY)).toBe('Closes in 2 days');
  });
  it('says expected for derived listing dates and plain for announced ones', () => {
    const expected = mk('A', 'CLOSED', '2026-10-06', { timeline: [{ key: 'listing', date: '2026-10-16', kind: 'expected' }] });
    const actual = mk('A', 'CLOSED', '2026-10-06', { timeline: [{ key: 'listing', date: '2026-10-14', kind: 'actual' }] });
    expect(countdown(expected, TODAY)).toBe('Listing expected in 3 days');
    expect(countdown(actual, TODAY)).toBe('Lists tomorrow');
    expect(countdown(mk('A', 'CLOSED', '2026-10-06', { timeline: [{ key: 'listing', date: null, kind: 'expected' }] }), TODAY)).toBe('Closed; listing date not announced');
    expect(countdown(mk('A', 'CLOSED', '2026-10-06', { timeline: [{ key: 'listing', date: '2026-10-13', kind: 'expected' }] }), TODAY)).toBe('Listing expected due now');
  });
  it('covers listed and completed issues', () => {
    expect(countdown(mk('A', 'LISTED', '2026-09-25', { listingDate: '2026-10-05' }), TODAY)).toBe('Listed 8 days ago');
    expect(countdown(mk('A', 'LISTED', '2026-09-25', { listingDate: '2026-10-12' }), TODAY)).toBe('Listed 1 day ago');
    expect(countdown(mk('A', 'ENDED', '2025-02-01'), TODAY)).toMatch(/not published/);
  });
});

describe('dates', () => {
  it('works out day differences across month and year ends', () => {
    expect(daysBetween('2026-10-13', '2026-10-20')).toBe(7);
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
  });
  it('classifies a step against today', () => {
    expect(stepState({ date: '2026-10-12' }, TODAY)).toBe('done');
    expect(stepState({ date: TODAY }, TODAY)).toBe('today');
    expect(stepState({ date: '2026-10-14' }, TODAY)).toBe('upcoming');
    expect(stepState({ date: null }, TODAY)).toBe('unknown');
  });
  it('formats days, adding the year only when it differs or is asked for', () => {
    expect(formatDay('2026-10-13', TODAY)).toBe('13 Oct');
    expect(formatDay('2025-03-06', TODAY)).toBe('6 Mar 2025');
    expect(formatDay('2026-10-13', TODAY, true)).toBe('13 Oct 2026');
    expect(formatDay(null)).toBe('—');
  });
});

describe('price against issue price', () => {
  it('computes the percentage move', () => {
    expect(againstIssuePrice({ issuePrice: 200 }, 250)).toEqual({ price: 250, pct: 25 });
    expect(againstIssuePrice({ issuePrice: 200 }, 150).pct).toBe(-25);
  });
  it('gives nothing when either price is missing or invalid', () => {
    expect(againstIssuePrice({ issuePrice: null }, 250)).toBeNull();
    expect(againstIssuePrice({ issuePrice: 200 }, undefined)).toBeNull();
    expect(againstIssuePrice({ issuePrice: 0 }, 250)).toBeNull();
    expect(againstIssuePrice({ issuePrice: 200 }, -1)).toBeNull();
  });
  it('picks recently listed issues only', () => {
    expect(recentlyListed(ipos, TODAY).map((i) => i.symbol)).toEqual(['DONE']);
    expect(recentlyListed(ipos, TODAY, 5)).toEqual([]);
  });
});

describe('links', () => {
  it('points at the matching NSE page', () => {
    expect(nseIssueUrl(mk('HDFIRE', 'OPEN', '2026-10-13'))).toBe('https://www.nseindia.com/market-data/issue-information?symbol=HDFIRE&series=EQ&type=Active');
    expect(nseIssueUrl(mk('DONE', 'LISTED', '2026-09-25'))).toContain('type=Past');
    expect(nseIssueUrl(mk('M&M', 'OPEN', '2026-10-13'))).toContain('symbol=M%26M');
  });
});

describe('tracked issues storage', () => {
  const memory = (initial = null) => {
    let value = initial;
    return { getItem: () => value, setItem: (_k, v) => { value = v; } };
  };
  it('round-trips and ignores malformed ids', () => {
    const storage = memory();
    expect(saveTracked(new Set(['HDFIRE-2026-10-13']), storage)).toBe(true);
    expect([...loadTracked(storage)]).toEqual(['HDFIRE-2026-10-13']);
    expect([...loadTracked(memory(JSON.stringify(['ok-2026-10-13', 'HDFIRE-2026-10-13', 5, '<script>', 'X'])))]).toEqual(['HDFIRE-2026-10-13']);
  });
  it('treats corrupt or unavailable storage as empty and reports a failed save', () => {
    expect(loadTracked(memory('{bad')).size).toBe(0);
    expect(loadTracked({ getItem: () => { throw new Error('blocked'); } }).size).toBe(0);
    expect(saveTracked(new Set(['A-2026-10-13']), { setItem: () => { throw new Error('full'); } })).toBe(false);
    expect(TRACKED_KEY).toMatch(/ipo/);
  });
  it('toggles without mutating and respects the limit', () => {
    const base = new Set(['A-2026-10-13']);
    const added = toggleTracked(base, 'B-2026-10-13');
    expect([...base]).toEqual(['A-2026-10-13']);
    expect(added.size).toBe(2);
    expect(toggleTracked(added, 'B-2026-10-13').size).toBe(1);
    const full = new Set(Array.from({ length: MAX_TRACKED }, (_, i) => `S${i}-2026-10-13`));
    expect(toggleTracked(full, 'NEW-2026-10-13').size).toBe(MAX_TRACKED);
  });
});

describe('announced issues without dates', () => {
  const announced = { id: 'IG2306-undated', symbol: null, name: 'Jio Platforms', stage: 'ANNOUNCED', openDate: null, closeDate: null, listingDate: null, timeline: [], gmp: { path: '/gmp/jio-platforms-ipo/2306/' } };
  const soon = mk('SOON', 'UPCOMING', '2026-10-14');
  const all = [announced, soon, mk('DONE', 'LISTED', '2026-09-25', { listingDate: '2026-10-05' })];

  it('appear under Upcoming, after the issues that have a date', () => {
    expect(filterIpos(all, { view: 'upcoming' }).map((i) => i.name)).toEqual(['SOON Limited', 'Jio Platforms']);
    expect(countByView(all).upcoming).toBe(2);
  });
  it('can be searched by name, filtered by year and left out of the year list', () => {
    expect(filterIpos(all, { view: 'all', query: 'jio' }).map((i) => i.id)).toEqual(['IG2306-undated']);
    expect(filterIpos(all, { view: 'all', year: '2026' }).map((i) => i.symbol)).toEqual(['SOON', 'DONE']);
    expect(yearsOf(all)).toEqual(['2026']);
  });
  it('say the dates are not set, and have no NSE page or price lookup', () => {
    expect(countdown(announced, TODAY)).toMatch(/not set yet/);
    expect(nseIssueUrl(announced)).toBeNull();
    expect(recentlyListed([announced], TODAY)).toEqual([]);
  });
  it('can be tracked', () => {
    const storage = { v: null, getItem() { return this.v; }, setItem(_k, v) { this.v = v; } };
    saveTracked(new Set(['IG2306-undated']), storage);
    expect([...loadTracked(storage)]).toEqual(['IG2306-undated']);
  });
});

describe('investorGainUrl', () => {
  it('builds the link from the validated page path only', () => {
    expect(investorGainUrl({ gmp: { path: '/gmp/tonbo-imaging-india-ipo/2369/' } })).toBe('https://www.investorgain.com/gmp/tonbo-imaging-india-ipo/2369/');
    for (const bad of ['https://evil.example.com/x', '//evil.example.com', '/gmp/../admin/1/', 'javascript:alert(1)', '']) expect(investorGainUrl({ gmp: { path: bad } })).toBeNull();
    expect(investorGainUrl({ gmp: null })).toBeNull();
    expect(investorGainUrl({})).toBeNull();
  });
});
