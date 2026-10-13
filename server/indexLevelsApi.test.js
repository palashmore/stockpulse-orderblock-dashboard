import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp } from './app.js';

const realFetch = globalThis.fetch;
const OPEN_MS = Date.UTC(2026, 9, 12, 5, 30); // Mon 11:00 IST
const CLOSED_MS = Date.UTC(2026, 9, 12, 11, 0); // Mon 16:30 IST
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('/api/index-levels', () => {
  let server;
  let base;
  let clock;
  let feed;

  beforeEach(async () => {
    clock = CLOSED_MS;
    feed = () => json({
      timestamp: '12-Oct-2026 15:30',
      data: [
        { index: 'NIFTY 50', last: 22363.35, variation: -157.2, percentChange: -0.7, advances: 13, declines: 36, unchanged: 1 },
        { index: 'NIFTY BANK', last: 54918, variation: -336, percentChange: -0.61 },
      ],
    });
    const fetchFn = async (url) => {
      const u = String(url);
      if (u === 'https://www.nseindia.com/') return new Response('', { status: 200 });
      return u.includes('/api/allIndices') ? feed() : json({}, 404);
    };
    const { app } = createApp({ fetchFn, now: () => clock, retryDelayMs: 0, alertIntervalMs: 0 });
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}/api`;
  });

  afterEach(() => new Promise((resolve) => server.close(resolve)));

  const get = async () => {
    const res = await realFetch(`${base}/index-levels`);
    return { res, body: await res.json() };
  };

  it('returns levels for the configured indices NSE reports, and names the ones it does not', async () => {
    const { res, body } = await get();
    expect(res.status).toBe(200);
    expect(body.indices.nifty50).toMatchObject({ last: 22363.35, changePct: -0.7, advances: 13, declines: 36 });
    expect(body.indices.bank.last).toBe(54918);
    expect(body.missing).toContain('niftynext50');
    expect(body.provider).toBe('NSE India website');
    expect(body.asOf).toBe('2026-10-12T10:00:00.000Z');
  });

  it('labels the data by the clock: delayed during the session, stale when old, market closed after it', async () => {
    clock = OPEN_MS;
    feed = () => json({ timestamp: '12-Oct-2026 10:55', data: [{ index: 'NIFTY 50', last: 1 }] });
    expect((await get()).body.dataStatus).toBe('DELAYED');
    clock += 30 * 60_000; // the feed still says 10:55 half an hour later
    expect((await get()).body.dataStatus).toBe('STALE');
    clock = CLOSED_MS;
    feed = () => json({ timestamp: '12-Oct-2026 15:30', data: [{ index: 'NIFTY 50', last: 1 }] });
    expect((await get()).body.dataStatus).toBe('MARKET_CLOSED');
  });

  it('is unavailable, not empty, when the feed is unusable, and falls back to a stale copy after a failure', async () => {
    feed = () => json({ data: [] });
    const bad = await get();
    expect(bad.res.status).toBe(503);
    expect(bad.body.dataStatus).toBe('UNAVAILABLE');

    feed = () => json({ timestamp: '12-Oct-2026 15:30', data: [{ index: 'NIFTY 50', last: 22000 }] });
    expect((await get()).res.status).toBe(200);
    clock += 10 * 60_000;
    feed = () => json({}, 503);
    const stale = await get();
    expect(stale.res.status).toBe(200);
    expect(stale.body.dataStatus).toBe('STALE');
    expect(stale.body.indices.nifty50.last).toBe(22000);
  });

  describe('NSE session cookies', () => {
    const levels = () => json({ timestamp: '12-Oct-2026 15:30', data: [{ index: 'NIFTY 50', last: 22000 }] });
    let homeVisits;
    let stalled; // cookie value NSE stops answering for
    let stalledCalls;

    const start = async () => {
      await new Promise((resolve) => server.close(resolve));
      homeVisits = 0;
      stalledCalls = 0;
      const fetchFn = async (url, init) => {
        const u = String(url);
        if (u === 'https://www.nseindia.com/') {
          homeVisits += 1;
          return new Response('', { status: 200, headers: { 'set-cookie': `session=c${homeVisits}; Path=/` } });
        }
        if (u.includes('/api/allIndices')) {
          if (init?.headers?.Cookie === stalled) {
            stalledCalls += 1;
            throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
          }
          return levels();
        }
        return json({}, 404);
      };
      const { app } = createApp({ fetchFn, now: () => clock, retryDelayMs: 0, alertIntervalMs: 0 });
      await new Promise((resolve) => { server = app.listen(0, resolve); });
      base = `http://127.0.0.1:${server.address().port}/api`;
    };

    it('renews cookies that NSE has stopped answering for, and retries once', async () => {
      await start();
      stalled = 'session=c1';
      const { res, body } = await get();
      expect(res.status).toBe(200);
      expect(body.indices.nifty50.last).toBe(22000);
      expect(homeVisits).toBe(2); // the first visit, then the renewal
    });

    it('renews cookies once they are ten minutes old, before asking', async () => {
      await start();
      stalled = 'session=c1';
      clock = CLOSED_MS;
      await get(); // first visit: the cookie c1 stalls, so it renews to c2 and succeeds
      const visits = homeVisits;
      clock += 11 * 60_000 + 60_000; // past the data cache and the cookie lifetime
      stalled = 'session=c2';
      stalledCalls = 0;
      const { res } = await get();
      expect(res.status).toBe(200);
      expect(homeVisits).toBeGreaterThan(visits);
      expect(stalledCalls).toBe(0); // renewed up front, so the stalled cookie was never used
    });
  });
});
