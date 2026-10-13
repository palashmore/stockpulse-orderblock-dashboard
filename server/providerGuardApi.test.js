import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp } from './app.js';

const realFetch = globalThis.fetch;
const OPEN_MS = Date.UTC(2026, 9, 12, 5, 30);
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const quote = (symbol, price) => ({ quoteResponse: { result: [{ symbol: `${symbol}.NS`, longName: symbol, regularMarketPrice: price, regularMarketChange: 0, regularMarketChangePercent: 0, regularMarketTime: Math.floor((OPEN_MS - 30_000) / 1000), marketState: 'REGULAR' }] } });

describe('provider pausing', () => {
  let server;
  let base;
  let clock;
  let upstream;
  let calls;

  beforeEach(async () => {
    clock = OPEN_MS;
    calls = [];
    upstream = () => json(quote('AAA', 100));
    const fetchFn = async (url) => {
      calls.push(String(url));
      return upstream(String(url));
    };
    const { app } = createApp({ fetchFn, now: () => clock, retryDelayMs: 0, alertIntervalMs: 0 });
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}/api`;
  });

  afterEach(() => new Promise((resolve) => server.close(resolve)));

  const get = async (path) => {
    const res = await realFetch(`${base}${path}`);
    return { res, body: await res.json() };
  };

  it('stops calling Yahoo for a while after it answers 429, and says so on the diagnostics', async () => {
    upstream = () => new Response('slow down', { status: 429, headers: { 'retry-after': '40' } });
    expect((await get('/quote/AAA')).res.status).toBe(503);
    const before = calls.length;
    clock += 35_000; // inside the 40 s pause; other stocks are not cached, so only the pause stands in the way
    expect((await get('/quote/BBB')).res.status).toBe(503);
    expect((await get('/quote/CCC')).res.status).toBe(503);
    expect(calls.length).toBe(before); // nothing was sent while paused
    const diag = await get('/diagnostics');
    expect(diag.body.providersPaused[0]).toMatchObject({ provider: 'yahoo.com', reason: 'rate limited' });
  });

  it('serves the last good copy, labelled STALE, while the provider is paused', async () => {
    expect((await get('/quote/AAA')).body.price).toBe(100);
    clock += 60_000;
    upstream = () => new Response('', { status: 429 });
    const first = await get('/quote/AAA');
    expect(first.res.status).toBe(200);
    expect(first.body.dataStatus).toBe('STALE');
    const before = calls.length;
    const second = await get('/quote/AAA');
    expect(second.body.dataStatus).toBe('STALE');
    expect(calls.length).toBe(before);
  });

  it('resumes once the pause is over', async () => {
    upstream = () => new Response('', { status: 429, headers: { 'retry-after': '10' } });
    await get('/quote/AAA');
    clock += 11_000;
    upstream = () => json(quote('AAA', 123));
    const { res, body } = await get('/quote/AAA');
    expect(res.status).toBe(200);
    expect(body.price).toBe(123);
  });

  it('pauses a provider that cannot be reached, after several failed attempts', async () => {
    upstream = () => { throw new TypeError('fetch failed'); };
    await get('/quote/AAA'); // three attempts (the first and two retries)
    const sent = calls.length;
    expect(sent).toBe(3);
    clock += 5_000; // inside the 20 s pause
    const { res } = await get('/quote/BBB');
    expect(res.status).toBe(503);
    expect(calls.length).toBe(sent); // refused at once, no waiting for another timeout
  });

  it('does not pause one provider because another is down', async () => {
    upstream = (url) => (url.includes('yahoo.com') ? new Response('', { status: 429 }) : json({}));
    await get('/quote/AAA');
    const { res } = await get('/market-status');
    expect(res.status).toBe(200);
  });
});
