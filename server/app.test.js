import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp } from './app.js';

// Mon 2026-10-12 11:00 IST = 05:30 UTC (market open); Sat 2026-10-10 11:00 IST (closed)
const OPEN_MS = Date.UTC(2026, 9, 12, 5, 30);
const CLOSED_MS = Date.UTC(2026, 9, 10, 5, 30);

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const yahooQuote = (overrides = {}, timeMs = OPEN_MS - 60_000) => ({
  quoteResponse: {
    result: [{
      symbol: 'RELIANCE.NS', longName: 'Reliance', regularMarketPrice: 1500, regularMarketChange: 0,
      regularMarketChangePercent: 0, regularMarketTime: Math.floor(timeMs / 1000), marketState: 'REGULAR',
      ...overrides,
    }],
  },
});

const day = (y, m, d) => Math.floor(Date.UTC(y, m, d, 4, 0) / 1000);
const yahooChart = () => ({
  chart: {
    result: [{
      meta: { currency: 'INR', exchangeName: 'NSI' },
      timestamp: [day(2026, 9, 8), day(2026, 9, 9), day(2026, 9, 9), day(2026, 9, 10)],
      indicators: {
        quote: [{
          open: [100, 101, 102, 103],
          high: [105, 106, 107, 108],
          low: [99, 100, 101, 102],
          close: [104, 105, 106, 101],
          volume: [1000, 2000, 3000, 4000],
        }],
        adjclose: [{ adjclose: [104, 105, 106, 102] }],
      },
    }],
  },
});

function nseChain() {
  const row = (strike, ce, pe) => ({
    strikePrice: strike, expiryDate: '28-Oct-2026',
    CE: { openInterest: ce, changeinOpenInterest: 1, totalTradedVolume: 5, lastPrice: 1, impliedVolatility: 20 },
    PE: { openInterest: pe, changeinOpenInterest: 2, totalTradedVolume: 6, lastPrice: 2, impliedVolatility: 21 },
  });
  return {
    records: {
      expiryDates: ['28-Oct-2026', '25-Nov-2026'],
      timestamp: '12-Oct-2026 10:58:00',
      underlyingValue: 1500,
      data: [row(1400, 10, 50), row(1500, 40, 40), row(1600, 50, 10), { ...row(1500, 999, 999), expiryDate: '25-Nov-2026' }],
    },
  };
}

describe('API', () => {
  let server;
  let base;
  let clock;
  let upstream; // (url) => Response | Promise<Response>, or throws
  let calls;

  async function start() {
    const fetchFn = async (url, init) => {
      calls.push(String(url));
      return upstream(String(url), init);
    };
    const { app } = createApp({ fetchFn, now: () => clock, retryDelayMs: 0 });
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}/api`;
  }

  beforeEach(async () => {
    clock = OPEN_MS;
    calls = [];
    upstream = () => { throw new Error('unexpected upstream call'); };
    await start();
  });

  afterEach(() => new Promise((resolve) => server.close(resolve)));

  const get = async (path) => {
    const res = await realFetch(`${base}${path}`);
    return { res, body: await res.json() };
  };
  const realFetch = globalThis.fetch;

  describe('/health and /market-status', () => {
    it('reports health', async () => {
      const { body } = await get('/health');
      expect(body.status).toBe('ok');
    });

    it('computes market status from the injected clock', async () => {
      expect((await get('/market-status')).body.isOpen).toBe(true);
      clock = CLOSED_MS;
      expect((await get('/market-status')).body.isOpen).toBe(false);
    });
  });

  describe('input validation', () => {
    it('rejects invalid symbols without calling the provider', async () => {
      const { res, body } = await get('/quote/BAD%20SYMBOL%3B');
      expect(res.status).toBe(400);
      expect(body.dataStatus).toBe('UNAVAILABLE');
      expect(calls).toHaveLength(0);
    });

    it('rejects invalid history range/interval', async () => {
      expect((await get('/history/RELIANCE?range=999y')).res.status).toBe(400);
      expect((await get('/history/RELIANCE?interval=x&range=1mo')).res.status).toBe(400);
      expect(calls).toHaveLength(0);
    });
  });

  describe('/quote', () => {
    it('labels in-session data DELAYED and keeps the response contract', async () => {
      upstream = () => jsonResponse(yahooQuote());
      const { res, body } = await get('/quote/reliance');
      expect(res.status).toBe(200);
      expect(body.symbol).toBe('RELIANCE');
      expect(body.price).toBe(1500);
      expect(body.dataStatus).toBe('DELAYED');
      expect(body.provider).toBe('Yahoo Finance');
      expect(body.asOf).toBe(new Date(OPEN_MS - 60_000).toISOString());
    });

    it('labels a closed-market quote from the last session MARKET_CLOSED', async () => {
      clock = CLOSED_MS; // Saturday: the last completed session is Friday 9 Oct
      const fridayClose = Date.UTC(2026, 9, 9, 10, 0);
      upstream = () => jsonResponse(yahooQuote({ marketState: 'CLOSED' }, fridayClose));
      const { body } = await get('/quote/RELIANCE');
      expect(body.dataStatus).toBe('MARKET_CLOSED');
      expect(body.asOf).toBe(new Date(fridayClose).toISOString());
    });

    it('labels a closed-market quote older than the last session STALE', async () => {
      clock = CLOSED_MS;
      upstream = () => jsonResponse(yahooQuote({ marketState: 'CLOSED' }, Date.UTC(2026, 9, 7, 10, 0)));
      expect((await get('/quote/RELIANCE')).body.dataStatus).toBe('STALE');
    });

    it('does not trust the provider marketState over the exchange clock', async () => {
      clock = CLOSED_MS; // our calendar says closed even though the provider claims REGULAR
      upstream = () => jsonResponse(yahooQuote({ marketState: 'REGULAR' }, Date.UTC(2026, 9, 9, 10, 0)));
      expect((await get('/quote/RELIANCE')).body.dataStatus).toBe('MARKET_CLOSED');
    });

    it('labels an old in-session quote STALE', async () => {
      upstream = () => jsonResponse(yahooQuote({}, OPEN_MS - 60 * 60 * 1000));
      expect((await get('/quote/RELIANCE')).body.dataStatus).toBe('STALE');
    });

    it('returns 404 for an unknown stock', async () => {
      upstream = () => jsonResponse({ quoteResponse: { result: [] } });
      expect((await get('/quote/NOPE')).res.status).toBe(404);
    });

    it('treats a malformed upstream payload as unavailable', async () => {
      upstream = () => jsonResponse(yahooQuote({ regularMarketPrice: null }));
      const { res, body } = await get('/quote/RELIANCE');
      expect(res.status).toBe(503);
      expect(body.dataStatus).toBe('UNAVAILABLE');
    });

    it('serves fresh cache without a second provider call', async () => {
      upstream = () => jsonResponse(yahooQuote());
      await get('/quote/RELIANCE');
      clock += 10_000;
      await get('/quote/RELIANCE');
      expect(calls).toHaveLength(1);
    });

    it('returns UNAVAILABLE when the provider fails and nothing is cached', async () => {
      upstream = () => { throw new Error('fetch failed'); };
      const { res, body } = await get('/quote/RELIANCE');
      expect(res.status).toBe(503);
      expect(body.dataStatus).toBe('UNAVAILABLE');
      expect(calls).toHaveLength(3); // initial + 2 bounded retries
    });

    it('does not retry client errors', async () => {
      upstream = () => new Response('nope', { status: 429 });
      expect((await get('/quote/RELIANCE')).res.status).toBe(503);
      expect(calls).toHaveLength(1);
    });

    it('serves an expired cache entry as STALE with its age when the provider fails', async () => {
      upstream = () => jsonResponse(yahooQuote());
      await get('/quote/RELIANCE');
      clock += 5 * 60 * 1000;
      upstream = () => { throw new Error('fetch failed'); };
      const { res, body } = await get('/quote/RELIANCE');
      expect(res.status).toBe(200);
      expect(body.dataStatus).toBe('STALE');
      expect(body.staleAgeSec).toBe(300);
      expect(body.price).toBe(1500);
    });

    it('stops serving stale data past the maximum stale age', async () => {
      upstream = () => jsonResponse(yahooQuote());
      await get('/quote/RELIANCE');
      clock += 16 * 60 * 1000;
      upstream = () => { throw new Error('fetch failed'); };
      expect((await get('/quote/RELIANCE')).res.status).toBe(503);
    });
  });

  describe('/search', () => {
    const searchBody = { quotes: [
      { symbol: 'IRFC.NS', exchange: 'NSI', quoteType: 'EQUITY', longname: 'Indian Railway Finance Corporation Limited' },
      { symbol: 'IRFC.BO', exchange: 'BSE', quoteType: 'EQUITY', longname: 'Indian Railway Finance Corporation Limited' },
      { symbol: 'IRFCX', exchange: 'NAS', quoteType: 'MUTUALFUND', longname: 'Some US fund' },
      { symbol: 'GOLDBEES.NS', exchange: 'NSI', quoteType: 'ETF', shortname: 'Gold ETF' },
    ] };

    it('returns NSE equities and ETFs only, without BSE duplicates or foreign funds', async () => {
      upstream = () => jsonResponse(searchBody);
      const { body } = await get('/search?q=IRFC');
      expect(body.map((r) => r.symbol)).toEqual(['IRFC', 'GOLDBEES']);
      expect(body[0]).toMatchObject({ name: 'Indian Railway Finance Corporation Limited', yahooSymbol: 'IRFC.NS' });
    });

    it('falls back to the static Nifty list when Yahoo fails', async () => {
      upstream = () => { throw new Error('blocked'); };
      const { body } = await get('/search?q=reli');
      expect(body.map((r) => r.symbol)).toEqual(['RELIANCE']);
    });

    it('returns an empty list for an empty query without calling the provider', async () => {
      expect((await get('/search?q=')).body).toEqual([]);
      expect(calls).toHaveLength(0);
    });
  });

  describe('Yahoo crumb handshake', () => {
    it('retries a 401 with a session cookie and crumb, then reuses them', async () => {
      let crumbCalls = 0;
      upstream = (url, init) => {
        if (url === 'https://fc.yahoo.com') return new Response('', { status: 404, headers: { 'set-cookie': 'A3=abc; Domain=.yahoo.com; Path=/' } });
        if (url.includes('getcrumb')) { crumbCalls++; return new Response('CRUMB123'); }
        const authed = url.includes('crumb=CRUMB123') && init.headers.Cookie === 'A3=abc';
        return authed ? jsonResponse(yahooQuote()) : new Response('Unauthorized', { status: 401 });
      };
      const first = await get('/quote/RELIANCE');
      expect(first.res.status).toBe(200);
      expect(first.body.price).toBe(1500);
      clock += 60_000; // past the 30 s quote cache
      await get('/quote/RELIANCE');
      expect(crumbCalls).toBe(1);
      expect(calls.filter((u) => u.includes('v7/finance/quote'))).toHaveLength(3); // 401, retry, reuse
    });

    it('is unavailable when Yahoo will not issue a crumb', async () => {
      upstream = (url) => (url === 'https://fc.yahoo.com' ? new Response('', { status: 404 }) : new Response('Unauthorized', { status: 401 }));
      const { res, body } = await get('/quote/RELIANCE');
      expect(res.status).toBe(503);
      expect(body.dataStatus).toBe('UNAVAILABLE');
    });
  });

  describe('/market-status and the holiday calendar', () => {
    const holidayJson = { CM: [{ tradingDate: '12-Oct-2026', description: 'Test Holiday' }] };

    async function startWithCalendar(holidayFetch) {
      await new Promise((resolve) => server.close(resolve));
      const fetchFn = async (url) => { calls.push(String(url)); return upstream(String(url)); };
      const { app } = createApp({ fetchFn, now: () => clock, retryDelayMs: 0, holidayFetch });
      await new Promise((resolve) => { server = app.listen(0, resolve); });
      base = `http://127.0.0.1:${server.address().port}/api`;
    }

    it('without a calendar source reports weekends-only and OPEN on a weekday', async () => {
      const { body } = await get('/market-status');
      expect(body).toMatchObject({ state: 'OPEN', isOpen: true, calendar: 'weekends-only', timezone: 'Asia/Kolkata' });
    });

    it('uses NSE holidays when available: the day is CLOSED and the holiday is named', async () => {
      const holidayFetch = async (url) => {
        if (url === 'https://www.nseindia.com/') return new Response('', { headers: { 'set-cookie': 'a=b' } });
        return jsonResponse(holidayJson);
      };
      await startWithCalendar(async (url, init) => (url.includes('holiday-master')
        ? jsonResponse(holidayJson)
        : holidayFetch(url, init)));
      const { body } = await get('/market-status');
      expect(body).toMatchObject({ state: 'CLOSED', reason: 'holiday', holiday: 'Test Holiday', isOpen: false, calendar: 'nse', lastSession: '2026-10-09' });
    });

    it('a quote on a holiday is MARKET_CLOSED against the previous session, not live', async () => {
      await startWithCalendar(async (url) => (url.includes('holiday-master') ? jsonResponse(holidayJson) : new Response('', { headers: { 'set-cookie': 'a=b' } })));
      upstream = () => jsonResponse(yahooQuote({ marketState: 'REGULAR' }, Date.UTC(2026, 9, 9, 10, 0)));
      expect((await get('/quote/RELIANCE')).body.dataStatus).toBe('MARKET_CLOSED');
    });

    it('keeps working with weekends-only when the calendar fetch fails', async () => {
      await startWithCalendar(async () => { throw new Error('blocked'); });
      upstream = () => jsonResponse(yahooQuote());
      const status = await get('/market-status');
      expect(status.body.calendar).toBe('weekends-only');
      expect((await get('/quote/RELIANCE')).res.status).toBe(200);
    });
  });

  describe('partial candles', () => {
    const dayStamp = (d) => Math.floor(Date.UTC(2026, 9, d, 4, 0) / 1000); // 09:30 IST
    const chart = (days) => ({
      chart: { result: [{ meta: { currency: 'INR', exchangeName: 'NSI', gmtoffset: 19800 }, timestamp: days.map(dayStamp),
        indicators: { quote: [{ open: days.map(() => 10), high: days.map(() => 12), low: days.map(() => 9), close: days.map(() => 11), volume: days.map(() => 5) }], adjclose: [{ adjclose: days.map(() => 11) }] } }] },
    });

    it('flags the in-progress daily candle while the market is open', async () => {
      upstream = () => jsonResponse(chart([8, 9, 12])); // today is Monday 12 Oct, market open
      const { body } = await get('/history/RELIANCE?range=1mo&interval=1d');
      expect(body.candles.map((c) => !!c.partial)).toEqual([false, false, true]);
    });

    it('does not flag the latest daily candle once the session has closed', async () => {
      clock = Date.UTC(2026, 9, 12, 11, 0); // 16:30 IST
      upstream = () => jsonResponse(chart([8, 9, 12]));
      const { body } = await get('/history/RELIANCE?range=1mo&interval=1d');
      expect(body.candles.some((c) => c.partial)).toBe(false);
    });
  });

  describe('/history', () => {
    it('returns validated candles labeled HISTORICAL', async () => {
      upstream = () => jsonResponse(yahooChart());
      const { res, body } = await get('/history/RELIANCE?range=1mo');
      expect(res.status).toBe(200);
      expect(body.dataStatus).toBe('HISTORICAL');
      expect(body.asOf).toBe('2026-10-09');
      // duplicate 9 Oct day collapses to the later observation; the invalid-range candle (close<low) is dropped
      expect(body.candles.map((c) => c.time)).toEqual(['2026-10-08', '2026-10-09']);
      expect(body.candles[1].close).toBe(106);
    });

    it('is unavailable when no candle survives validation', async () => {
      const bad = yahooChart();
      bad.chart.result[0].indicators.quote[0].close = [null, null, null, null];
      upstream = () => jsonResponse(bad);
      expect((await get('/history/RELIANCE')).res.status).toBe(503);
    });
  });

  describe('/history intraday', () => {
    const bar = (min) => Math.floor((OPEN_MS - 3_600_000 + min * 60_000) / 1000);
    const intradayChart = () => ({
      chart: {
        result: [{
          meta: { currency: 'INR', exchangeName: 'NSI', gmtoffset: 19800 },
          timestamp: [bar(0), bar(1), bar(2)],
          indicators: {
            quote: [{ open: [10, 11, 12], high: [12, 13, 14], low: [9, 10, 11], close: [11, 12, 13], volume: [5, 6, 7] }],
            adjclose: [{ adjclose: [11, 12, 13] }],
          },
        }],
      },
    });

    it('returns every intraday bar with epoch-second times; old newest bar is STALE in-session', async () => {
      upstream = () => jsonResponse(intradayChart());
      const { res, body } = await get('/history/RELIANCE?range=5d&interval=1m');
      expect(res.status).toBe(200);
      expect(body.candles).toHaveLength(3);
      expect(body.candles[0].time).toBe(bar(0) + 19800);
      expect(body.dataStatus).toBe('STALE'); // newest bar is ~57 min old
    });

    it('is DELAYED when the newest bar is recent', async () => {
      const chart = intradayChart();
      chart.chart.result[0].timestamp = [bar(56), bar(57), bar(59)];
      upstream = () => jsonResponse(chart);
      expect((await get('/history/RELIANCE?range=5d&interval=1m')).body.dataStatus).toBe('DELAYED');
    });

    it('rejects unsupported intraday ranges before calling the provider', async () => {
      expect((await get('/history/RELIANCE?range=6mo&interval=1m')).res.status).toBe(400);
      expect(calls).toHaveLength(0);
    });

    it('uses the short intraday cache window', async () => {
      upstream = () => jsonResponse(intradayChart());
      await get('/history/RELIANCE?range=5d&interval=1m');
      clock += 61_000;
      await get('/history/RELIANCE?range=5d&interval=1m');
      expect(calls).toHaveLength(2);
    });
  });

  describe('/options', () => {
    beforeEach(() => {
      upstream = (url) => (url === 'https://www.nseindia.com/'
        ? new Response('', { headers: { 'set-cookie': 'nsit=abc; Path=/' } })
        : jsonResponse(nseChain()));
    });

    it('summarises only the nearest expiry', async () => {
      const { res, body } = await get('/options/RELIANCE');
      expect(res.status).toBe(200);
      expect(body.currentExpiry).toBe('28-Oct-2026');
      expect(body.totalCallOI).toBe(100);
      expect(body.totalPutOI).toBe(100);
      expect(body.pcr).toBe(1);
      expect(body.maxPain).toBe(1500);
      expect(body.dataStatus).toBe('DELAYED');
      expect(body.source).toBe('NSE');
      expect(body.asOf).toBe(new Date(Date.UTC(2026, 9, 12, 5, 28)).toISOString());
    });

    it('labels options MARKET_CLOSED when the chain is from the last session, STALE when older', async () => {
      clock = Date.UTC(2026, 9, 12, 11, 0); // Monday 16:30 IST, after the close
      upstream = (url) => (url === 'https://www.nseindia.com/'
        ? new Response('', { headers: { 'set-cookie': 'nsit=abc; Path=/' } })
        : jsonResponse(nseChain())); // chain timestamp 12-Oct-2026 10:58 IST
      expect((await get('/options/RELIANCE')).body.dataStatus).toBe('MARKET_CLOSED');
      clock = Date.UTC(2026, 9, 14, 5, 0); // Wednesday morning, chain two sessions old
      const stale = await get('/options/RELIANCE');
      expect(stale.body.dataStatus).toBe('STALE');
    });

    it('does not fall back to fabricated values when NSE fails', async () => {
      upstream = (url) => (url === 'https://www.nseindia.com/'
        ? new Response('')
        : new Response('blocked', { status: 403 }));
      const { res, body } = await get('/options/RELIANCE');
      expect(res.status).toBe(503);
      expect(body.dataStatus).toBe('UNAVAILABLE');
      expect(body.maxPain).toBeUndefined();
      expect(calls.some((u) => u.includes('yahoo'))).toBe(false);
    });

    it('treats an empty NSE payload (non-F&O symbol) as unavailable', async () => {
      upstream = (url) => (url === 'https://www.nseindia.com/' ? new Response('') : jsonResponse({}));
      expect((await get('/options/ABCD')).res.status).toBe(503);
    });
  });

  describe('/nifty50', () => {
    it('keeps the array contract and reports status in headers', async () => {
      upstream = () => jsonResponse(yahooQuote());
      const { res, body } = await get('/nifty50');
      expect(Array.isArray(body)).toBe(true);
      expect(body[0].symbol).toBe('RELIANCE');
      expect(res.headers.get('x-data-status')).toBe('DELAYED');
    });

    it('exposes the status headers to cross-origin browser code', async () => {
      upstream = () => jsonResponse(yahooQuote());
      const res = await realFetch(`${base}/nifty50`, { headers: { Origin: 'http://localhost:5173' } });
      const exposed = (res.headers.get('access-control-expose-headers') || '').toLowerCase();
      for (const h of ['x-data-status', 'x-data-as-of', 'x-data-stale-age-sec']) expect(exposed).toContain(h);
    });

    it('marks cached data STALE through headers when the provider fails', async () => {
      upstream = () => jsonResponse(yahooQuote());
      await get('/nifty50');
      clock += 2 * 60 * 1000;
      upstream = () => { throw new Error('fetch failed'); };
      const { res, body } = await get('/nifty50');
      expect(body).toHaveLength(1);
      expect(res.headers.get('x-data-status')).toBe('STALE');
    });
  });
});
