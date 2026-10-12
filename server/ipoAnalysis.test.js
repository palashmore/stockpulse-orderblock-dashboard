import { describe, it, expect } from 'vitest';
import { analyseIpo, allotmentLinks } from './ipoAnalysis.js';

const base = (extra = {}) => ({
  stage: 'OPEN', subscription: [], totalSubscription: null, anchor: false, gmp: null, lotSize: 55, priceHigh: 271, issueSizeCr: 499.2, listingGainPct: null, listingPrice: null, ...extra,
});
const gmp = (g, pct, extra = {}) => ({ gmp: g, gmpPct: pct, low: g, high: g, ...extra });
const status = (analysis, key) => analysis.checks.find((c) => c.key === key)?.status;

describe('grey-market check', () => {
  it('reads a healthy premium as favourable, a modest one as neutral, none as unfavourable', () => {
    expect(status(analyseIpo(base({ gmp: gmp(86, 31.7) })), 'gmp')).toBe('good');
    expect(status(analyseIpo(base({ gmp: gmp(10, 3.7) })), 'gmp')).toBe('neutral');
    expect(status(analyseIpo(base({ gmp: gmp(0, 0) })), 'gmp')).toBe('bad');
    expect(status(analyseIpo(base({ gmp: gmp(-5, -2) })), 'gmp')).toBe('bad');
  });
  it('is unknown without a figure, and tempers a premium that has fallen from its high', () => {
    expect(status(analyseIpo(base()), 'gmp')).toBe('unknown');
    expect(status(analyseIpo(base({ gmp: { gmp: null, gmpPct: null, low: null, high: null } })), 'gmp')).toBe('unknown');
    const fallen = analyseIpo(base({ gmp: gmp(40, 14.7, { high: 90 }) }));
    expect(status(fallen, 'gmp')).toBe('neutral');
    expect(fallen.checks.find((c) => c.key === 'gmp').detail).toMatch(/fallen/);
  });
  it('always says the premium is unofficial', () => {
    expect(analyseIpo(base({ gmp: gmp(86, 31.7) })).checks.find((c) => c.key === 'gmp').detail).toMatch(/Unofficial/);
  });
  it('is not part of the checklist once the issue has listed', () => {
    expect(analyseIpo(base({ stage: 'LISTED', gmp: gmp(86, 31.7) })).checks.some((c) => c.key === 'gmp')).toBe(false);
  });
});

describe('subscription check', () => {
  const subs = (total, qib = 5) => [{ category: 'QIB', times: qib }, { category: 'Retail', times: 2 }, { category: 'Total', times: total }];
  it('scores total subscription', () => {
    expect(status(analyseIpo(base({ stage: 'CLOSED', subscription: subs(12) })), 'subscription')).toBe('good');
    expect(status(analyseIpo(base({ stage: 'CLOSED', subscription: subs(1.5) })), 'subscription')).toBe('neutral');
    expect(status(analyseIpo(base({ stage: 'CLOSED', subscription: subs(0.6) })), 'subscription')).toBe('bad');
  });
  it('does not call a still-open issue undersubscribed', () => {
    const a = analyseIpo(base({ stage: 'OPEN', subscription: subs(0.4) }));
    expect(status(a, 'subscription')).toBe('neutral');
    expect(a.checks.find((c) => c.key === 'subscription').detail).toMatch(/last day/);
  });
  it('is unknown before the issue opens, or without figures, and falls back to InvestorGain\'s total', () => {
    expect(status(analyseIpo(base({ stage: 'UPCOMING' })), 'subscription')).toBe('unknown');
    expect(status(analyseIpo(base({ stage: 'ANNOUNCED' })), 'subscription')).toBe('unknown');
    expect(status(analyseIpo(base({ stage: 'CLOSED' })), 'subscription')).toBe('unknown');
    expect(status(analyseIpo(base({ stage: 'CLOSED', totalSubscription: 97.3 })), 'subscription')).toBe('good');
  });
});

describe('other checks', () => {
  it('uses the anchor allocation when there is one', () => {
    expect(status(analyseIpo(base({ anchor: true })), 'anchor')).toBe('good');
    expect(status(analyseIpo(base({ anchor: false })), 'anchor')).toBe('unknown');
  });
  it('describes the ticket against the retail limit', () => {
    const a = analyseIpo(base());
    expect(a.checks.find((c) => c.key === 'ticket').detail).toMatch(/13 lots/); // 2,00,000 / (55 x 271)
    const big = analyseIpo(base({ lotSize: 1000, priceHigh: 500 }));
    expect(big.checks.find((c) => c.key === 'ticket').detail).toMatch(/above the/);
    expect(analyseIpo(base({ lotSize: null })).checks.some((c) => c.key === 'ticket')).toBe(false);
  });
  it('comments on very large and small issues', () => {
    expect(analyseIpo(base({ issueSizeCr: 8000 })).checks.find((c) => c.key === 'size').detail).toMatch(/very large/);
    expect(analyseIpo(base({ issueSizeCr: 100 })).checks.find((c) => c.key === 'size').detail).toMatch(/small/);
    expect(analyseIpo(base({ issueSizeCr: null })).checks.some((c) => c.key === 'size')).toBe(false);
  });
  it('reports the listing result for listed issues', () => {
    expect(status(analyseIpo(base({ stage: 'LISTED', listingGainPct: 40 })), 'listing')).toBe('good');
    expect(status(analyseIpo(base({ stage: 'LISTED', listingGainPct: 3 })), 'listing')).toBe('neutral');
    expect(status(analyseIpo(base({ stage: 'LISTED', listingGainPct: -8 })), 'listing')).toBe('bad');
    expect(status(analyseIpo(base({ stage: 'LISTED' })), 'listing')).toBe('unknown');
    expect(analyseIpo(base()).checks.some((c) => c.key === 'listing')).toBe(false);
  });
  it('never claims to have assessed the business', () => {
    expect(status(analyseIpo(base({ gmp: gmp(86, 31.7), anchor: true })), 'fundamentals')).toBe('unknown');
  });
});

describe('verdict', () => {
  it('needs at least two assessed checks', () => {
    expect(analyseIpo(base()).verdict.code).toBe('INSUFFICIENT');
    expect(analyseIpo(base({ gmp: gmp(86, 31.7) })).verdict.code).toBe('INSUFFICIENT'); // only one assessed
  });
  it('is favourable when the assessed checks all agree', () => {
    const a = analyseIpo(base({ stage: 'CLOSED', gmp: gmp(86, 31.7), anchor: true, subscription: [{ category: 'Total', times: 20 }] }));
    expect(a.verdict).toMatchObject({ code: 'FAVOURABLE', tone: 'good' });
    expect(a.good).toBe(3);
  });
  it('is unfavourable when more checks are bad than good, and mixed when they split', () => {
    const bad = analyseIpo(base({ stage: 'CLOSED', gmp: gmp(0, 0), subscription: [{ category: 'Total', times: 0.5 }] }));
    expect(bad.verdict.code).toBe('UNFAVOURABLE');
    const mixed = analyseIpo(base({ stage: 'CLOSED', gmp: gmp(0, 0), anchor: true, subscription: [{ category: 'Total', times: 20 }] }));
    expect(mixed.verdict.code).toBe('MIXED');
  });
  it('never uses the word recommend as an instruction', () => {
    const a = analyseIpo(base({ gmp: gmp(86, 31.7), anchor: true }));
    expect(JSON.stringify(a)).not.toMatch(/you should apply|subscribe to this/i);
  });
});

describe('allotmentLinks', () => {
  it('links the registrar\'s own page when its name is recognised', () => {
    const k = allotmentLinks('KFin Technologies Limited', '/gmp/orient-cables-ipo/1832/');
    expect(k.registrar).toBe('KFin Technologies Limited');
    expect(k.links[0]).toMatchObject({ url: 'https://ipostatus.kfintech.com/', primary: true });
    expect(k.links.some((l) => l.url === 'https://www.bseindia.com/investors/appli_check.aspx')).toBe(true);
    expect(k.links.at(-1).url).toBe('https://www.investorgain.com/allotment-status/orient-cables-ipo/1832/');
    expect(allotmentLinks('MUFG Intime India Private Limited').links[0].url).toContain('mufg.com');
    expect(allotmentLinks('Bigshare Services Private Limited').links[0].url).toContain('bigshareonline');
    expect(allotmentLinks('Link Intime India Pvt Ltd').links[0].url).toContain('mufg.com');
  });
  it('falls back to BSE\'s page for an unrecognised or missing registrar', () => {
    const unknown = allotmentLinks('Some New Registrar Ltd');
    expect(unknown.links[0]).toMatchObject({ url: null, primary: true });
    expect(unknown.links[1]).toMatchObject({ url: 'https://www.bseindia.com/investors/appli_check.aspx', primary: true }); // the only clickable option, so it leads
    const none = allotmentLinks(null);
    expect(none.registrar).toBeNull();
    expect(none.links[0]).toMatchObject({ primary: true });
  });
});
