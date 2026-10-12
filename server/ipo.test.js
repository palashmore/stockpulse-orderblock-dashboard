import { describe, it, expect } from 'vitest';
import { parseNseDate, parsePriceBand, parseLot, parseSubscription, parseIssueType, stageOf, buildTimeline, buildIpos } from './ipo.js';

const upcomingRows = [
  { companyName: 'HD Fire Protect Limited', issueEndDate: '15-Oct-2026', issuePrice: 'Rs.258 to Rs.271', issueSize: '18420492', issueStartDate: '13-Oct-2026', series: 'EQ', status: 'Active', symbol: 'HDFIRE' },
  { companyName: 'Fusion CX Limited', issueEndDate: '16-Oct-2026', issuePrice: 'Rs.275 to Rs.289', issueSize: '25527272', issueStartDate: '14-Oct-2026', series: 'EQ', status: 'Forthcoming', symbol: 'FUSIONCX' },
  { companyName: 'Ravita Engineering Services Limited', issueEndDate: '16-Oct-2026', issuePrice: 'Rs.105 to Rs.112', issueSize: '10362000', issueStartDate: '14-Oct-2026', lotSize: '1200', series: 'SME', status: 'Forthcoming', symbol: 'RAVITA' },
];
const currentRows = [
  { companyName: 'HD Fire Protect Limited', issueEndDate: '15-Oct-2026', issueStartDate: '13-Oct-2026', series: 'EQ', status: 'Active', symbol: 'HDFIRE', noOfTime: '0.00' },
  { companyName: 'Vaibhav Vyapaar Limited', isBse: '1', issueEndDate: '15-Oct-2026', issueStartDate: '13-Oct-2026', series: 'SME', status: 'Active', symbol: 'LOANFRONT' },
];
const pastRows = [
  { company: 'Orient Cables (India) Limited', ipoEndDate: '29-SEP-2026', ipoStartDate: '25-SEP-2026', issuePrice: '   272', listingDate: '05-OCT-2026', priceRange: 'Rs.258 to Rs.272', securityType: 'EQ', symbol: 'ORIENTCABL' },
  { company: 'Some SME Limited', ipoEndDate: '29-SEP-2026', ipoStartDate: '25-SEP-2026', issuePrice: '   50', listingDate: '05-OCT-2026', priceRange: 'Rs.48 to Rs.50', securityType: 'SME', symbol: 'SOMESME' },
  { company: 'A Debt Issue', ipoEndDate: '09-OCT-2026', ipoStartDate: '05-OCT-2026', issuePrice: '-', listingDate: '-', priceRange: 'Rs.1000', securityType: 'DEBT', symbol: 'SMCG04' },
  { company: 'Rajputana Stainless Limited-Special Withdrawal Option', ipoEndDate: '16-MAR-2026', ipoStartDate: '12-MAR-2026', issuePrice: '-', listingDate: '-', priceRange: 'Rs.116 to Rs.122', securityType: 'EQ', symbol: 'RSL' },
  { company: 'Just Closed Limited', ipoEndDate: '09-OCT-2026', ipoStartDate: '06-OCT-2026', issuePrice: '-', listingDate: '-', priceRange: 'Rs.100 to Rs.105', securityType: 'EQ', symbol: 'JUSTCLOSED' },
  { company: 'Long Ago Limited', ipoEndDate: '10-MAR-2025', ipoStartDate: '06-MAR-2025', issuePrice: '-', listingDate: '-', priceRange: 'Rs.10 to Rs.12', securityType: 'EQ', symbol: 'LONGAGO' },
  { company: 'Old Limited', ipoEndDate: '04-FEB-2016', ipoStartDate: '02-FEB-2016', issuePrice: '   850', listingDate: '12-FEB-2016', priceRange: 'Rs 785 to Rs 850', securityType: 'EQ', symbol: 'OLD' },
];
const detail = (lot, cats) => ({
  issueInfo: { dataList: [
    { title: 'Issue Type', value: 'Book Building' },
    { title: 'Bid Lot', value: '55 Equity Shares and in multiples thereof' },
    { title: 'Minimum Order Quantity', value: lot },
  ] },
  activeCat: { dataList: [{ category: 'Category', noOfTotalMeant: 'No. times' }, ...cats] },
});

describe('parseNseDate', () => {
  it('reads both NSE spellings', () => {
    expect(parseNseDate('13-Oct-2026')).toBe('2026-10-13');
    expect(parseNseDate('05-OCT-2026')).toBe('2026-10-05');
    expect(parseNseDate('13-Oct-2026 15-Oct-2026')).toBe('2026-10-13');
  });
  it('rejects placeholders and impossible dates', () => {
    for (const bad of ['-', '', null, undefined, '31-Foo-2026', '32-Oct-2026', 'garbage']) expect(parseNseDate(bad)).toBeNull();
    expect(parseNseDate('31-Feb-2026')).toBeNull();
  });
});

describe('parsePriceBand', () => {
  it('reads bands and single prices', () => {
    expect(parsePriceBand('Rs.258 to Rs.271')).toEqual({ low: 258, high: 271 });
    expect(parsePriceBand('Rs 785 to Rs 850')).toEqual({ low: 785, high: 850 });
    expect(parsePriceBand('Rs.1,000')).toEqual({ low: 1000, high: 1000 });
    expect(parsePriceBand('   272')).toEqual({ low: 272, high: 272 });
    expect(parsePriceBand('Rs.10.5 to Rs.12.25')).toEqual({ low: 10.5, high: 12.25 });
  });
  it('returns null when there is no price', () => {
    for (const bad of ['-', '', null, 'TBA', 'Rs.1 to Rs.2 to Rs.3']) expect(parsePriceBand(bad)).toBeNull();
  });
});

describe('ipo-detail parsing', () => {
  it('takes the minimum order quantity as the lot, falling back to the bid lot', () => {
    expect(parseLot(detail('55 Equity Shares', []))).toBe(55);
    expect(parseLot(detail('1,200 Equity Shares', []))).toBe(1200);
    expect(parseLot({ issueInfo: { dataList: [{ title: 'Bid Lot', value: '30 Equity Shares' }] } })).toBe(30);
    expect(parseLot({})).toBeNull();
    expect(parseLot(detail('not a number', []))).toBe(55); // falls through to Bid Lot
  });
  it('reads category subscription and ignores the header and bad rows', () => {
    const d = detail('55', [{ category: 'QIB', noOfTotalMeant: '1.25' }, { category: 'Retail', noOfTotalMeant: '0.40' }, { category: 'NII', noOfTotalMeant: 'n/a' }]);
    expect(parseSubscription(d)).toEqual([{ category: 'QIB', times: 1.25 }, { category: 'Retail', times: 0.4 }]);
    expect(parseSubscription({})).toEqual([]);
    expect(parseIssueType(d)).toBe('Book Building');
  });
});

describe('stageOf', () => {
  const ipo = { openDate: '2026-10-13', closeDate: '2026-10-15', listingDate: null };
  it('moves through the lifecycle by date', () => {
    expect(stageOf(ipo, '2026-10-12')).toBe('UPCOMING');
    expect(stageOf(ipo, '2026-10-13')).toBe('OPEN');
    expect(stageOf(ipo, '2026-10-15')).toBe('OPEN');
    expect(stageOf(ipo, '2026-10-16')).toBe('CLOSED');
    expect(stageOf(ipo, '2026-10-30')).toBe('CLOSED');
    expect(stageOf(ipo, '2026-11-20')).toBe('ENDED');
  });
  it('is listed once the published listing date has arrived, and closed until then', () => {
    const listed = { ...ipo, listingDate: '2026-10-20' };
    expect(stageOf(listed, '2026-10-19')).toBe('CLOSED');
    expect(stageOf(listed, '2026-10-20')).toBe('LISTED');
    expect(stageOf(listed, '2027-01-01')).toBe('LISTED');
  });
});

describe('buildTimeline', () => {
  it('derives expected dates from the T+3 rule on trading days, skipping a holiday', () => {
    // closes Thu 15 Oct 2026: allotment Fri 16, refund Mon 19 (weekend skipped), listing Tue 20
    const steps = buildTimeline({ openDate: '2026-10-13', closeDate: '2026-10-15', listingDate: null }, 'OPEN', null);
    expect(steps.map((s) => [s.key, s.date, s.kind])).toEqual([
      ['open', '2026-10-13', 'actual'], ['close', '2026-10-15', 'actual'],
      ['allotment', '2026-10-16', 'expected'], ['refund', '2026-10-19', 'expected'], ['listing', '2026-10-20', 'expected'],
    ]);
    const holidays = new Map([['2026-10-19', 'Test holiday']]);
    const shifted = buildTimeline({ openDate: '2026-10-13', closeDate: '2026-10-15', listingDate: null }, 'OPEN', holidays);
    expect(shifted.find((s) => s.key === 'refund').date).toBe('2026-10-20');
    expect(shifted.find((s) => s.key === 'listing').date).toBe('2026-10-21');
  });
  it('prefers the listing date NSE has published', () => {
    const steps = buildTimeline({ openDate: '2026-10-06', closeDate: '2026-10-09', listingDate: '2026-10-14' }, 'CLOSED', null);
    expect(steps.at(-1)).toMatchObject({ key: 'listing', date: '2026-10-14', kind: 'actual' });
  });
  it('shows only published dates for listed and long-closed issues', () => {
    expect(buildTimeline({ openDate: '2026-09-25', closeDate: '2026-09-29', listingDate: '2026-10-05' }, 'LISTED', null).map((s) => s.key)).toEqual(['open', 'close', 'listing']);
    expect(buildTimeline({ openDate: '2025-03-06', closeDate: '2025-03-10', listingDate: null }, 'ENDED', null).map((s) => s.key)).toEqual(['open', 'close']);
  });
  it('does not derive expected dates for issues from before the T+3 rule', () => {
    const steps = buildTimeline({ openDate: '2023-06-01', closeDate: '2023-06-05', listingDate: null }, 'CLOSED', null);
    expect(steps.filter((s) => s.kind === 'expected').every((s) => s.date === null)).toBe(true);
  });
});

describe('buildIpos', () => {
  const ipos = buildIpos(
    {
      upcoming: upcomingRows,
      current: currentRows,
      past: pastRows,
      details: {
        HDFIRE: detail('55 Equity Shares', [{ category: 'Total', noOfTotalMeant: '0.00' }]),
        FUSIONCX: detail('51 Equity Shares', []),
      },
    },
    { todayKey: '2026-10-13', holidays: null },
  );
  const by = (symbol) => ipos.find((i) => i.symbol === symbol);

  it('keeps mainboard issues only', () => {
    expect(ipos.map((i) => i.symbol).sort()).toEqual(['FUSIONCX', 'HDFIRE', 'JUSTCLOSED', 'LONGAGO', 'ORIENTCABL']);
    expect(by('RAVITA')).toBeUndefined(); // SME
    expect(by('LOANFRONT')).toBeUndefined(); // SME
    expect(by('SMCG04')).toBeUndefined(); // debt
    expect(by('RSL')).toBeUndefined(); // withdrawal window
    expect(by('OLD')).toBeUndefined(); // before the history window
  });

  it('merges the feeds and classifies each issue', () => {
    expect(by('HDFIRE')).toMatchObject({ stage: 'OPEN', openDate: '2026-10-13', closeDate: '2026-10-15', priceLow: 258, priceHigh: 271, lotSize: 55, minInvestment: 14905, exchange: 'NSE' });
    expect(by('FUSIONCX')).toMatchObject({ stage: 'UPCOMING', lotSize: 51, minInvestment: 14739 });
    expect(by('ORIENTCABL')).toMatchObject({ stage: 'LISTED', issuePrice: 272, listingDate: '2026-10-05' });
    expect(by('JUSTCLOSED')).toMatchObject({ stage: 'CLOSED', listingDate: null });
    expect(by('LONGAGO').stage).toBe('ENDED');
  });

  it('estimates the issue size at the upper band and says nothing when unknown', () => {
    expect(by('HDFIRE').issueSizeCr).toBeCloseTo(499.2, 1); // 18,420,492 shares x Rs 271
    expect(by('ORIENTCABL').issueSizeCr).toBeNull();
  });

  it('attaches subscription only to open issues, and lists newest first', () => {
    expect(by('HDFIRE').subscription).toEqual([{ category: 'Total', times: 0 }]);
    expect(by('FUSIONCX').subscription).toEqual([]);
    const dates = ipos.map((i) => i.openDate);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('survives empty or malformed feeds', () => {
    expect(buildIpos({}, { todayKey: '2026-10-13' })).toEqual([]);
    expect(buildIpos({ upcoming: [null, {}, { series: 'EQ', symbol: 'X', issueStartDate: '-', issueEndDate: '-' }], past: [undefined, 5] }, { todayKey: '2026-10-13' })).toEqual([]);
  });

  it('rejects an issue that closes before it opens', () => {
    const bad = [{ series: 'EQ', symbol: 'BAD', companyName: 'Bad', issueStartDate: '15-Oct-2026', issueEndDate: '13-Oct-2026', issuePrice: 'Rs.1 to Rs.2' }];
    expect(buildIpos({ upcoming: bad }, { todayKey: '2026-10-13' })).toEqual([]);
  });

  it('flags BSE-listed mainboard issues', () => {
    const rows = [{ series: 'EQ', symbol: 'BSEONLY', companyName: 'Bse Only', isBse: '1', issueStartDate: '13-Oct-2026', issueEndDate: '15-Oct-2026', issuePrice: 'Rs.10 to Rs.12' }];
    expect(buildIpos({ upcoming: rows }, { todayKey: '2026-10-13' })[0].exchange).toBe('BSE');
  });
});
