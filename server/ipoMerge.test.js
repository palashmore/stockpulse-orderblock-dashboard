import { describe, it, expect } from 'vitest';
import { parseSubscription, parseRegistrar, parseRhpUrl, needsDetail, buildIpos } from './ipo.js';
import { parseGmpPage } from './ipoGmp.js';
import { FIXTURE_HTML, page, row } from './fixtures/gmpPage.js';

const upcomingRows = [
  { companyName: 'HD Fire Protect Limited', issueEndDate: '15-Oct-2026', issuePrice: 'Rs.258 to Rs.271', issueSize: '18420492', issueStartDate: '13-Oct-2026', series: 'EQ', status: 'Active', symbol: 'HDFIRE' },
  { companyName: 'Fusion CX Limited', issueEndDate: '16-Oct-2026', issuePrice: 'Rs.275 to Rs.289', issueSize: '25527272', issueStartDate: '14-Oct-2026', series: 'EQ', status: 'Forthcoming', symbol: 'FUSIONCX' },
];
const pastRows = [
  { company: 'Orient Cables (India) Limited', ipoEndDate: '29-SEP-2026', ipoStartDate: '25-SEP-2026', issuePrice: '   272', listingDate: '05-OCT-2026', priceRange: 'Rs.258 to Rs.272', securityType: 'EQ', symbol: 'ORIENTCABL' },
  { company: 'Just Closed Limited', ipoEndDate: '09-OCT-2026', ipoStartDate: '06-OCT-2026', issuePrice: '-', listingDate: '-', priceRange: 'Rs.100 to Rs.105', securityType: 'EQ', symbol: 'JUSTCLOSED' },
];
const detail = (lot, cats = []) => ({
  issueInfo: { dataList: [{ title: 'Minimum Order Quantity', value: lot }, { title: 'Issue Type', value: 'Book Building' }, { title: 'Name of the Registrar', value: 'KFin Technologies Limited' }] },
  activeCat: { dataList: [{ category: 'Category', srNo: 'Sr.No.' }, ...cats] },
});

describe('subscription rows and prospectus link from the detail page', () => {
  it('keeps top-level categories with short names and drops the sub-rows', () => {
    const d = { activeCat: { dataList: [
      { category: 'Category', srNo: 'Sr.No.' },
      { category: 'Qualified Institutional Buyers(QIBs)', srNo: '1', noOfTotalMeant: '182.76' },
      { category: 'Foreign Institutional Investors(FIIs)', srNo: '1(a)', noOfTotalMeant: '' },
      { category: 'Non Institutional Investors(NIIs)', srNo: '2', noOfTotalMeant: '115.6' },
      { category: 'Non Institutional Investors - more than 10 lakh', srNo: '2(a)', noOfTotalMeant: '123.1' },
      { category: 'Retail Individual Investors(RIIs)', srNo: '3', noOfTotalMeant: '40.2' },
      { category: 'Total', srNo: null, noOfTotalMeant: '97.28' },
    ] } };
    expect(parseSubscription(d)).toEqual([{ category: 'QIB', times: 182.76 }, { category: 'NII', times: 115.6 }, { category: 'Retail', times: 40.2 }, { category: 'Total', times: 97.28 }]);
  });

  it('reads the registrar and only trusts an NSE archive link for the prospectus', () => {
    const d = { issueInfo: { dataList: [
      { title: 'Name of the Registrar', value: 'KFin Technologies Limited' },
      { title: 'Red Herring Prospectus', value: 'https://nsearchives.nseindia.com/content/ipo/RHP_HDFIRE.zip' },
    ] } };
    expect(parseRegistrar(d)).toBe('KFin Technologies Limited');
    expect(parseRhpUrl(d)).toBe('https://nsearchives.nseindia.com/content/ipo/RHP_HDFIRE.zip');
    const hostile = { issueInfo: { dataList: [{ title: 'Red Herring Prospectus', value: 'https://evil.example.com/RHP.zip' }, { title: 'Name of the Registrar', value: '' }] } };
    expect(parseRhpUrl(hostile)).toBeNull();
    expect(parseRhpUrl({ issueInfo: { dataList: [{ title: 'Red Herring Prospectus', value: 'javascript:alert(1)' }] } })).toBeNull();
    expect(parseRegistrar(hostile)).toBeNull();
    expect(parseRegistrar({})).toBeNull();
  });
});

describe('InvestorGain grey-market data merged into the list', () => {
  const gmpRows = parseGmpPage(FIXTURE_HTML, '2026-10-13');
  const merged = buildIpos(
    { upcoming: upcomingRows, past: pastRows, details: { HDFIRE: detail('55 Equity Shares', [{ category: 'Total', srNo: null, noOfTotalMeant: '0.00' }]), ORIENTCABL: detail('55 Equity Shares') }, gmpRows },
    { todayKey: '2026-10-13', holidays: null },
  );
  const byName = (name) => merged.find((i) => i.name === name);

  it('attaches the premium to the matching NSE issue and computes the implied listing price', () => {
    const hd = byName('HD Fire Protect Limited');
    expect(hd.gmp).toMatchObject({ gmp: 86, gmpPct: 31.73, impliedListing: 357 });
    expect(hd.anchor).toBe(true);
    expect(hd.analysis.checks.find((c) => c.key === 'gmp').status).toBe('good');
  });

  it('adds announced mainboard issues NSE has not listed yet, and never SME ones', () => {
    const tonbo = byName('Tonbo Imaging India');
    expect(tonbo).toMatchObject({ source: 'InvestorGain', symbol: null, stage: 'UPCOMING', openDate: '2026-10-15', closeDate: '2026-10-19', priceHigh: 700, lotSize: 21, minInvestment: 14700 });
    expect(tonbo.id).toBe('IG2369-2026-10-15');
    expect(merged.some((i) => i.name === 'Shellz India')).toBe(false);
  });

  it('uses the announced allotment and listing dates over the derived ones', () => {
    const steps = Object.fromEntries(byName('Tonbo Imaging India').timeline.map((t) => [t.key, t]));
    expect(steps.allotment).toMatchObject({ date: '2026-10-21', kind: 'actual' });
    expect(steps.listing).toMatchObject({ date: '2026-10-23', kind: 'actual' });
    expect(steps.refund.kind).toBe('expected');
  });

  it('lists an undated announcement as ANNOUNCED, without a timeline', () => {
    const jio = byName('Jio Platforms');
    expect(jio).toMatchObject({ stage: 'ANNOUNCED', openDate: null, closeDate: null, id: 'IG2306-undated', timeline: [] });
    expect(jio.gmp.gmp).toBe(182);
    expect(merged.at(0).id).toBe('IG2306-undated'); // sorts as the furthest away
  });

  it('shows the listing result of listed issues and keeps their premium out of the list', () => {
    const orient = byName('Orient Cables (India) Limited');
    expect(orient).toMatchObject({ stage: 'LISTED', listingGainPct: 65.44, listingPrice: 450, gmp: null });
    expect(orient.analysis.checks.find((c) => c.key === 'listing').status).toBe('good');
  });

  it('offers allotment links to closed and recently listed issues only, led by the registrar', () => {
    const orient = byName('Orient Cables (India) Limited');
    expect(orient.allotment.registrar).toBe('KFin Technologies Limited');
    expect(orient.allotment.links[0].url).toBe('https://ipostatus.kfintech.com/');
    expect(byName('Just Closed Limited').allotment.links.length).toBeGreaterThan(0);
    expect(byName('HD Fire Protect Limited').allotment).toBeUndefined();
    expect(byName('Fusion CX Limited').allotment).toBeUndefined();
  });

  it('works unchanged without any grey-market data', () => {
    const plain = buildIpos({ upcoming: upcomingRows, past: pastRows }, { todayKey: '2026-10-13' });
    expect(plain.every((i) => i.gmp === null)).toBe(true);
    expect(plain.map((i) => i.symbol).sort()).toEqual(['FUSIONCX', 'HDFIRE', 'JUSTCLOSED', 'ORIENTCABL']);
  });

  it('ignores rows that are not usable announcements', () => {
    const odd = parseGmpPage(page([
      row({ n: 'Closes Before Open', slug: 'b', id: 2, open: '19-Oct', close: '15-Oct', upcoming: false }),
    ]), '2026-10-13');
    expect(buildIpos({ gmpRows: odd }, { todayKey: '2026-10-13' }).map((i) => i.name)).toEqual([]);
  });
});

describe('needsDetail', () => {
  const ipo = (stage, extra = {}) => ({ symbol: 'X', stage, listingDate: null, ...extra });
  it('asks for open, upcoming and closed issues and recently listed ones only', () => {
    expect(needsDetail(ipo('OPEN'), '2026-10-13')).toBe(true);
    expect(needsDetail(ipo('UPCOMING'), '2026-10-13')).toBe(true);
    expect(needsDetail(ipo('CLOSED'), '2026-10-13')).toBe(true);
    expect(needsDetail(ipo('LISTED', { listingDate: '2026-10-05' }), '2026-10-13')).toBe(true);
    expect(needsDetail(ipo('LISTED', { listingDate: '2026-08-05' }), '2026-10-13')).toBe(false);
    expect(needsDetail(ipo('ENDED'), '2026-10-13')).toBe(false);
    expect(needsDetail(ipo('OPEN', { symbol: null }), '2026-10-13')).toBe(false);
  });
});
