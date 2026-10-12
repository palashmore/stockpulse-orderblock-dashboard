import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp } from './app.js';
import { FIXTURE_HTML } from './fixtures/gmpPage.js';

// Tue 2026-10-13 11:00 IST
const NOW = Date.UTC(2026, 9, 13, 5, 30);
const realFetch = globalThis.fetch;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const upcoming = [
  { companyName: 'HD Fire Protect Limited', issueEndDate: '15-Oct-2026', issuePrice: 'Rs.258 to Rs.271', issueSize: '18420492', issueStartDate: '13-Oct-2026', series: 'EQ', status: 'Active', symbol: 'HDFIRE' },
  { companyName: 'Ravita Engineering Services Limited', issueEndDate: '16-Oct-2026', issuePrice: 'Rs.105 to Rs.112', issueSize: '10362000', issueStartDate: '14-Oct-2026', series: 'SME', status: 'Forthcoming', symbol: 'RAVITA' },
];
const past = [
  { company: 'Orient Cables (India) Limited', ipoEndDate: '29-SEP-2026', ipoStartDate: '25-SEP-2026', issuePrice: '   272', listingDate: '05-OCT-2026', priceRange: 'Rs.258 to Rs.272', securityType: 'EQ', symbol: 'ORIENTCABL' },
];
const detail = {
  issueInfo: { dataList: [{ title: 'Minimum Order Quantity', value: '55 Equity Shares' }, { title: 'Issue Type', value: 'Book Building' }, { title: 'Name of the Registrar', value: 'KFin Technologies Limited' }] },
  activeCat: { dataList: [{ category: 'Category' }, { category: 'Total', noOfTotalMeant: '0.50' }] },
};

describe('/api/ipos', () => {
  let server;
  let base;
  let clock;
  let feed; // (path) => Response
  let calls;
  let gmpPage; // () => Response for InvestorGain's report page

  beforeEach(async () => {
    clock = NOW;
    calls = [];
    gmpPage = () => new Response(FIXTURE_HTML, { status: 200, headers: { 'content-type': 'text/html' } });
    feed = (path) => {
      if (path.startsWith('all-upcoming-issues')) return json(upcoming);
      if (path.startsWith('public-past-issues')) return json(past);
      if (path.startsWith('ipo-current-issue')) return json([]);
      if (path.startsWith('ipo-detail')) return json(detail);
      return json({}, 404);
    };
    const fetchFn = async (url) => {
      const u = String(url);
      if (u === 'https://www.nseindia.com/') return new Response('', { status: 200 });
      if (u.includes('investorgain.com')) { calls.push('investorgain'); return gmpPage(); }
      const m = /nseindia\.com\/api\/(.+)$/.exec(u);
      calls.push(m ? m[1] : u);
      return m ? feed(m[1]) : json({}, 404);
    };
    const { app } = createApp({ fetchFn, now: () => clock, retryDelayMs: 0, alertIntervalMs: 0, ipoDetailWaitMs: 60 });
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}/api`;
  });

  afterEach(() => new Promise((resolve) => server.close(resolve)));

  const get = async () => {
    const res = await realFetch(`${base}/ipos`);
    return { res, body: await res.json() };
  };

  it('returns mainboard IPOs with their dates, lot and a DELAYED label naming the source', async () => {
    const { res, body } = await get();
    expect(res.status).toBe(200);
    expect(body.dataStatus).toBe('DELAYED');
    expect(body.provider).toBe('NSE India website');
    expect(body.todayKey).toBe('2026-10-13');
    // NSE's two issues, plus the announced issues InvestorGain lists that NSE does not carry yet
    expect(body.ipos.filter((i) => i.source === 'NSE').map((i) => i.symbol)).toEqual(['HDFIRE', 'ORIENTCABL']);
    const hd = body.ipos.find((i) => i.symbol === 'HDFIRE');
    expect(hd).toMatchObject({ stage: 'OPEN', lotSize: 55, minInvestment: 14905, issueType: 'Book Building' });
    expect(hd.subscription).toEqual([{ category: 'Total', times: 0.5 }]);
    expect(hd.timeline.map((s) => s.key)).toEqual(['open', 'close', 'allotment', 'refund', 'listing']);
    expect(body.ipos.find((i) => i.symbol === 'ORIENTCABL')).toMatchObject({ stage: 'LISTED', listingDate: '2026-10-05', issuePrice: 272 });
  });

  it('asks for details on open, closed and recently listed mainboard issues, and caches the answers', async () => {
    await get();
    expect(calls.filter((c) => c.startsWith('ipo-detail')).sort()).toEqual(['ipo-detail?symbol=HDFIRE&series=EQ', 'ipo-detail?symbol=ORIENTCABL&series=EQ']);
    const before = calls.length;
    await get();
    expect(calls.length).toBe(before);
  });

  it('still lists an issue when its detail page fails', async () => {
    const original = feed;
    feed = (path) => (path.startsWith('ipo-detail') ? json({}, 500) : original(path));
    const { res, body } = await get();
    expect(res.status).toBe(200);
    expect(body.ipos.find((i) => i.symbol === 'HDFIRE')).toMatchObject({ lotSize: 55, minInvestment: 14905, subscription: [] }); // lot still known from InvestorGain
  });

  it('is unavailable, not empty, when a required feed fails', async () => {
    feed = (path) => (path.startsWith('public-past-issues') ? json({}, 503) : json(upcoming));
    const { res, body } = await get();
    expect(res.status).toBe(503);
    expect(body.dataStatus).toBe('UNAVAILABLE');
  });

  it('serves the last good list as STALE when NSE fails later', async () => {
    await get();
    clock += 30 * 60_000; // past the cache lifetime
    feed = () => json({}, 503);
    const { res, body } = await get();
    expect(res.status).toBe(200);
    expect(body.dataStatus).toBe('STALE');
    expect(body.ipos.filter((i) => i.source === 'NSE')).toHaveLength(2);
  });

  it('rejects an unexpected response shape instead of showing nothing', async () => {
    feed = () => json({ unexpected: true });
    const { res } = await get();
    expect(res.status).toBe(503);
  });

  describe('grey-market data', () => {
    it('adds the premium, announced issues and allotment links, labelled as unofficial', async () => {
      const { body } = await get();
      expect(body.gmp).toMatchObject({ status: 'OK', provider: 'InvestorGain (unofficial)', error: null });
      const hd = body.ipos.find((i) => i.symbol === 'HDFIRE');
      expect(hd.gmp).toMatchObject({ gmp: 86, gmpPct: 31.73 });
      expect(hd.analysis.verdict.code).toBeTruthy();
      expect(body.ipos.find((i) => i.name === 'Tonbo Imaging India')).toMatchObject({ source: 'InvestorGain', symbol: null });
      expect(body.ipos.find((i) => i.name === 'Jio Platforms').stage).toBe('ANNOUNCED');
      const orient = body.ipos.find((i) => i.symbol === 'ORIENTCABL');
      expect(orient.allotment.registrar).toBe('KFin Technologies Limited');
      expect(orient.listingGainPct).toBe(65.44);
    });

    it('still serves the NSE list, with the premium marked unavailable, when InvestorGain fails', async () => {
      gmpPage = () => new Response('blocked', { status: 403 });
      const { res, body } = await get();
      expect(res.status).toBe(200);
      expect(body.gmp).toMatchObject({ status: 'UNAVAILABLE', fetchedAt: null });
      expect(body.gmp.error).toMatch(/403/);
      expect(body.ipos.every((i) => i.gmp === null)).toBe(true);
      expect(body.ipos.map((i) => i.symbol).sort()).toEqual(['HDFIRE', 'ORIENTCABL']);
    });

    it('treats a page without readable rows as unavailable rather than empty', async () => {
      gmpPage = () => new Response('<html>Just a moment...</html>', { status: 200 });
      const { body } = await get();
      expect(body.gmp.status).toBe('UNAVAILABLE');
      expect(body.gmp.error).toMatch(/no readable/i);
    });

    it('fetches the page once per cache lifetime', async () => {
      await get();
      clock += 11 * 60_000; // the IPO list expires, the 15-minute grey-market cache has not
      await get();
      expect(calls.filter((c) => c === 'investorgain')).toHaveLength(1);
    });

    it('labels a cached copy STALE when the page later fails', async () => {
      await get();
      clock += 20 * 60_000;
      gmpPage = () => new Response('', { status: 500 });
      const { body } = await get();
      expect(body.gmp.status).toBe('STALE');
      expect(body.ipos.find((i) => i.symbol === 'HDFIRE').gmp.gmp).toBe(86);
    });
  });

  describe('slow detail pages', () => {
    it('serves the list without waiting forever, marks it partial, and picks the details up on the next look', async () => {
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      const original = feed;
      feed = (path) => (path.startsWith('ipo-detail?symbol=HDFIRE') ? gate.then(() => json(detail)) : original(path));

      const first = await get();
      expect(first.body.detailsPending).toBe(1);
      const hd = first.body.ipos.find((i) => i.symbol === 'HDFIRE');
      expect(hd.lotSize).toBe(55); // still known from InvestorGain
      expect(hd.issueType).toBeNull(); // only the detail page has this

      release();
      await new Promise((resolve) => setTimeout(resolve, 30)); // the background load finishes and is cached
      const cachedPartial = await get();
      expect(cachedPartial.body.detailsPending).toBe(1); // a partial list is trusted for only 20 seconds

      clock += 21_000;
      const second = await get();
      expect(second.body.detailsPending).toBe(0);
      expect(second.body.ipos.find((i) => i.symbol === 'HDFIRE').issueType).toBe('Book Building');
    });

    it('caches a complete list for the full ten minutes', async () => {
      await get();
      const before = calls.length;
      clock += 5 * 60_000;
      await get();
      expect(calls.length).toBe(before);
    });
  });

  describe('provider isolation', () => {
    it('is not held up by a flood of slow Yahoo requests', async () => {
      await new Promise((resolve) => server.close(resolve));
      const hang = new Promise(() => {}); // Yahoo never answers
      const fetchFn = async (url) => {
        const u = String(url);
        if (u.includes('yahoo.com')) return hang;
        if (u === 'https://www.nseindia.com/') return new Response('', { status: 200 });
        if (u.includes('investorgain.com')) return gmpPage();
        const m = /nseindia\.com\/api\/(.+)$/.exec(u);
        return m ? feed(m[1]) : json({}, 404);
      };
      const { app } = createApp({ fetchFn, now: () => clock, retryDelayMs: 0, alertIntervalMs: 0, upstreamConcurrency: 1, ipoDetailWaitMs: 60 });
      await new Promise((resolve) => { server = app.listen(0, resolve); });
      base = `http://127.0.0.1:${server.address().port}/api`;

      const controller = new AbortController();
      for (let i = 0; i < 3; i++) realFetch(`${base}/quote/RELIANCE`, { signal: controller.signal }).catch(() => {}); // pile up behind Yahoo
      const { res, body } = await get();
      controller.abort();
      expect(res.status).toBe(200);
      expect(body.ipos.length).toBeGreaterThan(0);
    });
  });
});
