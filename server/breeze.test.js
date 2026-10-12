import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
  computeChecksum,
  breezeTimestamp,
  istWallClock,
  extractSessionToken,
  breezeCodeFor,
  parseBreezeTime,
  mapQuote,
  mapCandles,
  createBreezeClient,
  loginUrl,
} from './breeze.js';
import { createApp, NIFTY50_SYMBOLS } from './app.js';
import { classifyLiveQuoteStatus, classifyLiveHistoryStatus } from './dataStatus.js';

// Mon 2026-10-12 11:00 IST (market open)
const OPEN_MS = Date.UTC(2026, 9, 12, 5, 30);
const ist = (h, m, s = 0) => Date.UTC(2026, 9, 12, h, m, s) - 19800000; // IST wall clock -> epoch ms

describe('signing helpers', () => {
  it('checksum is sha256(timestamp + body + secret) in hex', () => {
    const expected = createHash('sha256').update('2026-10-12T05:30:00.000Z{"a":1}SECRET').digest('hex');
    expect(computeChecksum('2026-10-12T05:30:00.000Z', '{"a":1}', 'SECRET')).toBe(expected);
    expect(expected).toHaveLength(64);
  });

  it('formats timestamps with zero milliseconds', () => {
    expect(breezeTimestamp(Date.UTC(2026, 9, 12, 5, 30, 56, 789))).toBe('2026-10-12T05:30:56.000Z');
    expect(istWallClock(Date.UTC(2026, 9, 12, 3, 45))).toBe('2026-10-12T09:15:00.000Z');
  });

  it('builds an encoded login URL', () => {
    expect(loginUrl('a+b=c')).toBe('https://api.icicidirect.com/apiuser/login?api_key=a%2Bb%3Dc');
  });

  it('extracts the session from a pasted redirect URL, a parameter, or a bare value', () => {
    expect(extractSessionToken('https://127.0.0.1/?apisession=12345678')).toBe('12345678');
    expect(extractSessionToken('https://127.0.0.1/?API_Session=abc%3D')).toBe('abc=');
    expect(extractSessionToken('apisession=999')).toBe('999');
    expect(extractSessionToken('  87654321 ')).toBe('87654321');
    expect(extractSessionToken('')).toBeNull();
    expect(extractSessionToken('two words')).toBeNull();
    expect(extractSessionToken(null)).toBeNull();
  });

  it('maps Nifty symbols to Breeze stock codes', () => {
    expect(breezeCodeFor('RELIANCE')).toBe('RELIND');
    expect(breezeCodeFor('HDFCBANK')).toBe('HDFBAN');
    expect(breezeCodeFor('M&M')).toBeTruthy();
    expect(breezeCodeFor('NOPE')).toBeNull();
    const unmapped = NIFTY50_SYMBOLS.filter((s) => !breezeCodeFor(s));
    expect(unmapped).toEqual([]);
  });
});

describe('response mapping', () => {
  it('parses Breeze times as IST wall clock', () => {
    expect(parseBreezeTime('2026-10-12 09:15:00')).toBe(Date.UTC(2026, 9, 12, 3, 45));
    expect(parseBreezeTime('2026-10-12')).toBe(Date.UTC(2026, 9, 12) - 19800000);
    expect(parseBreezeTime('garbage')).toBeNull();
    expect(parseBreezeTime(undefined)).toBeNull();
  });

  it('parses the other timestamp formats in ICICI documentation', () => {
    expect(parseBreezeTime('05-Feb-2025 10:41:24')).toBe(Date.UTC(2025, 1, 5, 5, 11, 24));
    expect(parseBreezeTime('Tue Mar 11 09:38:22 2025')).toBe(Date.UTC(2025, 2, 11, 4, 8, 22));
    expect(parseBreezeTime('06-FEB-25')).toBeNull(); // two-digit year is not guessed
  });

  it('maps a quote, accepting numeric strings, and rejects one without a price', () => {
    const q = mapQuote({ ltp: '1500.5', previous_close: '1490', open: 1495, high: 1510, low: 1488, ltp_percent_change: '0.70', total_quantity_traded: '123456', ltt: '2026-10-12 10:59:30' }, 'RELIANCE');
    expect(q).toMatchObject({ symbol: 'RELIANCE', price: 1500.5, previousClose: 1490, volume: 123456, high: 1510 });
    expect(q.changePct).toBeCloseTo(0.7047, 3); // derived from price and previous close
    expect(q.change).toBeCloseTo(10.5, 10);
    // a falling stock whose feed percent is unsigned must still come out negative
    const falling = mapQuote({ ltp: '2125', previous_close: '2156', ltp_percent_change: '1.4378' }, 'TCS');
    expect(falling.changePct).toBeCloseTo(-1.438, 3);
    expect(falling.change).toBe(-31);
    expect(mapQuote({ ltp: 10, ltp_percent_change: '2' }, 'X').changePct).toBe(2); // no previous close: feed value
    expect(mapQuote({ ltp: '' }, 'X')).toBeNull();
    expect(mapQuote(null, 'X')).toBeNull();
    expect(mapQuote({ ltp: 10 }, 'X').change).toBeNull(); // no previous close: not guessed
  });

  it('maps and validates candles: intraday wall-clock seconds, daily dates', () => {
    const rows = [
      { datetime: '2026-10-12 09:15:00', open: '10', high: '12', low: '9', close: '11', volume: '100' },
      { datetime: '2026-10-12 09:16:00', open: '11', high: '13', low: '10', close: '12', volume: '' },
      { datetime: '2026-10-12 09:16:00', open: '11', high: '13', low: '10', close: '12', volume: '5' }, // duplicate
      { datetime: '2026-10-12 09:17:00', open: '11', high: '9', low: '10', close: '12', volume: '5' }, // bad OHLC
      { datetime: 'bad', open: 1, high: 2, low: 1, close: 1, volume: 1 },
    ];
    const intraday = mapCandles(rows, true);
    expect(intraday).toHaveLength(2);
    expect(intraday[0].time).toBe(Date.UTC(2026, 9, 12, 9, 15) / 1000);
    expect(intraday[1].volume).toBeNull();
    const daily = mapCandles([{ datetime: '2026-10-12 07:00:00', open: 1, high: 2, low: 1, close: 2, volume: 9 }], false);
    expect(daily[0].time).toBe('2026-10-12');
  });
});

describe('live status rules', () => {
  const nowMs = 10_000_000;
  it('quote is LIVE only in-session with a fresh trade time', () => {
    expect(classifyLiveQuoteStatus({ marketOpen: true, lastTradeMs: nowMs - 30_000, nowMs })).toBe('LIVE');
    expect(classifyLiveQuoteStatus({ marketOpen: true, lastTradeMs: nowMs - 10 * 60_000, nowMs })).toBe('STALE');
    expect(classifyLiveQuoteStatus({ marketOpen: true, lastTradeMs: null, nowMs })).toBe('DELAYED'); // cannot verify
    expect(classifyLiveQuoteStatus({ marketOpen: false, lastTradeMs: nowMs, nowMs })).toBe('HISTORICAL');
  });

  it('history is LIVE only when the newest intraday bar is current', () => {
    const base = { intraday: true, marketOpen: true, intervalMs: 60_000, nowMs };
    expect(classifyLiveHistoryStatus({ ...base, lastBarMs: nowMs - 60_000 })).toBe('LIVE');
    expect(classifyLiveHistoryStatus({ ...base, lastBarMs: nowMs - 20 * 60_000 })).toBe('STALE');
    expect(classifyLiveHistoryStatus({ ...base, intraday: false, lastBarMs: null })).toBe('HISTORICAL');
    expect(classifyLiveHistoryStatus({ ...base, marketOpen: false, lastBarMs: nowMs })).toBe('HISTORICAL');
  });
});

describe('client', () => {
  let sent;
  let respond;
  const request = async (req) => { sent.push(req); return respond(req); };
  const make = () => createBreezeClient({ appKey: 'KEY', secret: 'SECRET', request, now: () => OPEN_MS });

  beforeEach(() => { sent = []; });

  it('is unconfigured without credentials and refuses to connect', async () => {
    const client = createBreezeClient({ request });
    expect(client.configured).toBe(false);
    await expect(client.connect('123')).rejects.toThrow(/not configured/);
    expect(sent).toHaveLength(0);
  });

  it('exchanges the login session for a session token', async () => {
    respond = () => ({ status: 200, json: { Success: { session_token: 'TOKEN' } } });
    const client = make();
    await client.connect('API_SESSION');
    expect(client.isConnected()).toBe(true);
    expect(sent[0]).toMatchObject({ method: 'GET', path: '/breezeapi/api/v1/customerdetails' });
    expect(JSON.parse(sent[0].body)).toEqual({ SessionToken: 'API_SESSION', AppKey: 'KEY' });
    expect(sent[0].headers['X-Checksum']).toBeUndefined(); // unauthenticated step
  });

  it('fails to connect when no session token comes back', async () => {
    respond = () => ({ status: 200, json: { Success: null, Error: 'Invalid session' } });
    const client = make();
    await expect(client.connect('x')).rejects.toThrow(/Invalid session/);
    expect(client.isConnected()).toBe(false);
  });

  it('signs data requests with the documented headers and checksum', async () => {
    respond = (req) => (req.path.endsWith('customerdetails')
      ? { status: 200, json: { Success: { session_token: 'TOKEN' } } }
      : { status: 200, json: { Success: [{ ltp: 100, previous_close: 99, ltt: '2026-10-12 10:59:30' }] } });
    const client = make();
    await client.connect('S');
    const quote = await client.getQuote('RELIND', 'RELIANCE');
    expect(quote.price).toBe(100);

    const req = sent[1];
    const timestamp = '2026-10-12T05:30:00.000Z';
    expect(req.headers).toMatchObject({ 'X-AppKey': 'KEY', 'X-SessionToken': 'TOKEN', 'X-Timestamp': timestamp, 'Content-Type': 'application/json' });
    expect(req.headers['X-Checksum']).toBe(`token ${computeChecksum(timestamp, req.body, 'SECRET')}`);
    expect(JSON.parse(req.body)).toMatchObject({ stock_code: 'RELIND', exchange_code: 'NSE', product_type: 'cash' });
  });

  it('keeps the session after a single HTTP 401 and drops it after repeated ones', async () => {
    respond = (req) => (req.path.endsWith('customerdetails')
      ? { status: 200, json: { Success: { session_token: 'TOKEN' } } }
      : { status: 401, json: null });
    const client = make();
    await client.connect('S');
    await expect(client.getQuote('RELIND', 'RELIANCE')).rejects.toThrow(/session is kept/);
    expect(client.isConnected()).toBe(true);
    await expect(client.getQuote('RELIND', 'RELIANCE')).rejects.toThrow(/session is kept/);
    await expect(client.getQuote('RELIND', 'RELIANCE')).rejects.toThrow(/expired/);
    expect(client.isConnected()).toBe(false);
  });

  it('a successful call resets the rejection count', async () => {
    let n = 0;
    respond = (req) => {
      if (req.path.endsWith('customerdetails')) return { status: 200, json: { Success: { session_token: 'TOKEN' } } };
      n++;
      return n % 3 === 0 ? { status: 200, json: { Success: [{ ltp: 1 }] } } : { status: 401, json: null };
    };
    const client = make();
    await client.connect('S');
    for (let i = 0; i < 6; i++) await client.getQuote('X', 'X').catch(() => {});
    expect(client.isConnected()).toBe(true);
  });

  it('drops the session at once when ICICI says the session is invalid', async () => {
    respond = (req) => (req.path.endsWith('customerdetails')
      ? { status: 200, json: { Success: { session_token: 'TOKEN' } } }
      : { status: 401, json: { Status: 401, Error: 'Invalid session.' } });
    const client = make();
    await client.connect('S');
    await expect(client.getQuote('RELIND', 'RELIANCE')).rejects.toThrow(/expired/);
    expect(client.isConnected()).toBe(false);
  });

  it('drops the session when the provider rejects it', async () => {
    respond = (req) => (req.path.endsWith('customerdetails')
      ? { status: 200, json: { Success: { session_token: 'TOKEN' } } }
      : { status: 401, json: { Status: 401, Error: 'expired' } });
    const client = make();
    await client.connect('S');
    await expect(client.getQuote('RELIND', 'RELIANCE')).rejects.toThrow(/expired/);
    expect(client.isConnected()).toBe(false);
  });

  it('requests historical candles with IST wall-clock bounds', async () => {
    respond = (req) => (req.path.endsWith('customerdetails')
      ? { status: 200, json: { Success: { session_token: 'T' } } }
      : { status: 200, json: { Success: [{ datetime: '2026-10-12 10:58:00', open: 1, high: 2, low: 1, close: 2, volume: 3 }] } });
    const client = make();
    await client.connect('S');
    const candles = await client.getHistory('RELIND', '5m', OPEN_MS - 86400000, OPEN_MS);
    expect(candles).toHaveLength(1);
    expect(JSON.parse(sent[1].body)).toMatchObject({ interval: '5minute', to_date: '2026-10-12T11:00:00.000Z', from_date: '2026-10-11T11:00:00.000Z' });
    await client.getHistory('RELIND', '1d', OPEN_MS - 86400000, OPEN_MS);
    expect(JSON.parse(sent[2].body).interval).toBe('day');
    await client.getHistory('RELIND', '1m', OPEN_MS - 86400000, OPEN_MS);
    expect(JSON.parse(sent[3].body).interval).toBe('minute');
    await expect(client.getHistory('RELIND', '15m', 0, 1)).rejects.toThrow(/Unsupported/);
  });
});

describe('API integration', () => {
  let server;
  let base;
  let yahoo;
  let breezeReply;
  const jsonResponse = (b) => new Response(JSON.stringify(b), { headers: { 'content-type': 'application/json' } });
  const yahooQuote = () => jsonResponse({ quoteResponse: { result: [{ symbol: 'RELIANCE.NS', regularMarketPrice: 1400, regularMarketChange: 0, regularMarketChangePercent: 0, regularMarketTime: Math.floor(OPEN_MS / 1000), marketState: 'REGULAR' }] } });

  async function start({ connected }) {
    const breeze = createBreezeClient({
      appKey: 'KEY',
      secret: 'SECRET',
      now: () => OPEN_MS,
      request: async (req) => breezeReply(req),
    });
    breezeReply = (req) => (req.path.endsWith('customerdetails')
      ? { status: 200, json: { Success: { session_token: 'T' } } }
      : { status: 200, json: { Success: [{ ltp: 1500, previous_close: 1490, ltt: '2026-10-12 10:59:45', ltp_percent_change: 0.67, total_quantity_traded: 10 }] } });
    if (connected) await breeze.connect('S');
    const { app } = createApp({ fetchFn: async () => yahoo(), now: () => OPEN_MS, retryDelayMs: 0, breeze });
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}/api`;
  }

  beforeEach(() => { yahoo = () => yahooQuote(); });
  afterEach(() => new Promise((resolve) => server.close(resolve)));

  const get = async (path) => { const res = await fetch(`${base}${path}`); return { res, body: await res.json() }; };

  it('uses the broker quote and calls it LIVE when connected and the trade time is fresh', async () => {
    await start({ connected: true });
    const { body } = await get('/quote/RELIANCE');
    expect(body.provider).toBe('ICICI Direct Breeze');
    expect(body.dataStatus).toBe('LIVE');
    expect(body.price).toBe(1500);
    expect(body.asOf).toBe(new Date(ist(10, 59, 45)).toISOString());
  });

  it('uses Yahoo (never LIVE) when not connected', async () => {
    await start({ connected: false });
    const { body } = await get('/quote/RELIANCE');
    expect(body.provider).toBe('Yahoo Finance');
    expect(body.dataStatus).toBe('DELAYED');
  });

  it('falls back to Yahoo for unmapped symbols and when the broker fails', async () => {
    await start({ connected: true });
    breezeReply = () => ({ status: 500, json: null });
    const { body } = await get('/quote/RELIANCE');
    expect(body.provider).toBe('Yahoo Finance');
    expect(body.price).toBe(1400);
  });

  it('serves broker history only for supported intervals', async () => {
    await start({ connected: true });
    breezeReply = (req) => ({ status: 200, json: { Success: [{ datetime: '2026-10-12 10:59:00', open: 1, high: 2, low: 1, close: 2, volume: 3 }] }, path: req.path });
    const five = await get('/history/RELIANCE?range=5d&interval=5m');
    expect(five.body.provider).toBe('ICICI Direct Breeze');
    expect(five.body.dataStatus).toBe('LIVE');
    expect(five.body.candles).toHaveLength(1);
    yahoo = () => jsonResponse({ chart: { result: [{ meta: { gmtoffset: 19800 }, timestamp: [Math.floor(OPEN_MS / 1000)], indicators: { quote: [{ open: [1], high: [2], low: [1], close: [2], volume: [1] }], adjclose: [{ adjclose: [2] }] } }] } });
    const fifteen = await get('/history/RELIANCE?range=5d&interval=15m');
    expect(fifteen.body.provider).toBe('Yahoo Finance');
  });

  it('falls back to Yahoo when the broker daily series misses the latest completed session', async () => {
    await start({ connected: true });
    // Mon 12 Oct 11:00 IST: last completed session is Fri 9 Oct. A bar dated 8 Oct is behind it.
    breezeReply = () => ({ status: 200, json: { Success: [{ datetime: '2026-10-08 07:00:00', open: 1, high: 2, low: 1, close: 2, volume: 3 }] } });
    yahoo = () => jsonResponse({ chart: { result: [{ meta: { gmtoffset: 19800 }, timestamp: [Math.floor(Date.UTC(2026, 9, 9, 4, 0) / 1000)], indicators: { quote: [{ open: [1], high: [2], low: [1], close: [2], volume: [1] }], adjclose: [{ adjclose: [2] }] } }] } });
    const stale = await get('/history/RELIANCE?range=1mo&interval=1d');
    expect(stale.body.provider).toBe('Yahoo Finance');
    breezeReply = () => ({ status: 200, json: { Success: [{ datetime: '2026-10-09 07:00:00', open: 1, high: 2, low: 1, close: 2, volume: 3 }] } });
    const fresh = await get('/history/RELIANCE?range=3mo&interval=1d');
    expect(fresh.body.provider).toBe('ICICI Direct Breeze');
  });

  it('reports sign-in status and rejects bad session input', async () => {
    await start({ connected: false });
    const status = await get('/auth/status');
    expect(status.body).toMatchObject({ configured: true, connected: false });
    expect(status.body.loginUrl).toContain('api_key=');
    const bad = await fetch(`${base}/auth/breeze/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session: '' }) });
    expect(bad.status).toBe(400);
  });

  it('connects through the session endpoint and disconnects', async () => {
    await start({ connected: false });
    const ok = await fetch(`${base}/auth/breeze/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session: 'https://127.0.0.1/?apisession=4242' }) });
    expect(ok.status).toBe(200);
    expect((await get('/auth/status')).body.connected).toBe(true);
    await fetch(`${base}/auth/breeze/disconnect`, { method: 'POST' });
    expect((await get('/auth/status')).body.connected).toBe(false);
  });

  it('explains an address that has nothing after apisession=', async () => {
    await start({ connected: false });
    const res = await fetch(`${base}/auth/breeze/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session: 'https://127.0.0.1/?apisession=' }) });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/nothing after/);
  });

  it('reports a failed sign-in without exposing secrets', async () => {
    await start({ connected: false });
    breezeReply = () => ({ status: 200, json: { Success: null, Error: 'Invalid session' } });
    const res = await fetch(`${base}/auth/breeze/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session: '123456' }) });
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body.connected).toBe(false);
    expect(JSON.stringify(body)).not.toContain('SECRET');
  });
});
