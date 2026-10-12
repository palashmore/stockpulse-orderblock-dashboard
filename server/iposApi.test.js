import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp } from './app.js';

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
  issueInfo: { dataList: [{ title: 'Minimum Order Quantity', value: '55 Equity Shares' }, { title: 'Issue Type', value: 'Book Building' }] },
  activeCat: { dataList: [{ category: 'Category' }, { category: 'Total', noOfTotalMeant: '0.50' }] },
};

describe('/api/ipos', () => {
  let server;
  let base;
  let clock;
  let feed; // (path) => Response
  let calls;

  beforeEach(async () => {
    clock = NOW;
    calls = [];
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
      const m = /nseindia\.com\/api\/(.+)$/.exec(u);
      calls.push(m ? m[1] : u);
      return m ? feed(m[1]) : json({}, 404);
    };
    const { app } = createApp({ fetchFn, now: () => clock, retryDelayMs: 0, alertIntervalMs: 0 });
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
    expect(body.ipos.map((i) => i.symbol)).toEqual(['HDFIRE', 'ORIENTCABL']);
    const hd = body.ipos[0];
    expect(hd).toMatchObject({ stage: 'OPEN', lotSize: 55, minInvestment: 14905, issueType: 'Book Building' });
    expect(hd.subscription).toEqual([{ category: 'Total', times: 0.5 }]);
    expect(hd.timeline.map((s) => s.key)).toEqual(['open', 'close', 'allotment', 'refund', 'listing']);
    expect(body.ipos[1]).toMatchObject({ stage: 'LISTED', listingDate: '2026-10-05', issuePrice: 272 });
  });

  it('asks for details only on open and forthcoming mainboard issues, and caches the answer', async () => {
    await get();
    expect(calls.filter((c) => c.startsWith('ipo-detail'))).toEqual(['ipo-detail?symbol=HDFIRE&series=EQ']);
    const before = calls.length;
    await get();
    expect(calls.length).toBe(before);
  });

  it('still lists an issue when its detail page fails', async () => {
    const original = feed;
    feed = (path) => (path.startsWith('ipo-detail') ? json({}, 500) : original(path));
    const { res, body } = await get();
    expect(res.status).toBe(200);
    expect(body.ipos[0]).toMatchObject({ symbol: 'HDFIRE', lotSize: null, minInvestment: null, subscription: [] });
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
    expect(body.ipos).toHaveLength(2);
  });

  it('rejects an unexpected response shape instead of showing nothing', async () => {
    feed = () => json({ unexpected: true });
    const { res } = await get();
    expect(res.status).toBe(503);
  });
});
