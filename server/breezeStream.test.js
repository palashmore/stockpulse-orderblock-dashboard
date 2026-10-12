import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { createStreamHub, parseQuote, parseDepth, quoteKey, depthKey, LTT_TRUST_WINDOW_MS } from './breezeStream.js';
import { createBudget, createBreezeClient } from './breeze.js';
import { createApp } from './app.js';
import { parseNseMaster } from './securityMaster.js';

// A fake socket.io client: records emits and lets tests fire server events.
class FakeSocket extends EventEmitter {
  constructor() { super(); this.emitted = []; this.closed = false; }
  emit(event, ...args) {
    if (['join', 'leave'].includes(event)) { this.emitted.push([event, ...args]); return true; }
    return super.emit(event, ...args);
  }
  fire(event, ...args) { return super.emit(event, ...args); }
  close() { this.closed = true; }
}

const NOW = Date.UTC(2026, 9, 12, 5, 30); // Mon 11:00 IST
const tickArray = (token = '2885', { last = 1500, lttSec = NOW / 1000, open = 1490 } = {}) => [
  `4.1!${token}`, open, last, 1510, 1488, 0.67, 1499.9, 100, 1500.1, 200, 5, 1495, 123456, 5000, 6000, 999, 'U', 1350, 1650, lttSec, 1490,
];

describe('parsers', () => {
  it('parses a 21-element NSE quote into named fields and checks the timestamp against our clock', () => {
    const q = parseQuote(tickArray(), NOW);
    expect(q).toMatchObject({ token: '2885', last: 1500, open: 1490, high: 1510, low: 1488, bestBid: 1499.9, bestAsk: 1500.1, totalQty: 123456, close: 1490, upperCircuit: 1650 });
    expect(q.lttMs).toBe(NOW);
    expect(q.lttTrusted).toBe(true);
  });

  it('does not trust a timestamp that is far from our clock (epoch not yet verified live)', () => {
    const old = parseQuote(tickArray('2885', { lttSec: NOW / 1000 - 3600 }), NOW);
    expect(old.lttTrusted).toBe(false);
    expect(old.lttOffsetMs).toBe(3600000);
    // an offset epoch (for example seconds since 1980) lands decades away
    expect(parseQuote(tickArray('2885', { lttSec: 1_000_000_000 }), NOW).lttTrusted).toBe(false);
    expect(LTT_TRUST_WINDOW_MS).toBe(600000);
  });

  it('rejects malformed or unrelated messages instead of half-reading them', () => {
    expect(parseQuote(null, NOW)).toBeNull();
    expect(parseQuote(['4.1!1', 1, 2], NOW)).toBeNull(); // wrong length
    expect(parseQuote(tickArray('2885', { last: 0 }), NOW)).toBeNull();
    const bad = tickArray(); bad[0] = 'order-update';
    expect(parseQuote(bad, NOW)).toBeNull();
    expect(parseDepth(['4.2!1', 1, 'x'], NOW)).toBeNull();
  });

  it('parses market depth levels', () => {
    const d = parseDepth(['4.2!2885', NOW / 1000, [[1499.9, 10, 2, 0, 1500.1, 20, 3, 0], [1499.8, 5, 1, 0, 1500.2, 8, 1, 0]]], NOW);
    expect(d.levels).toHaveLength(2);
    expect(d.levels[0]).toEqual({ bidPrice: 1499.9, bidQty: 10, bidOrders: 2, askPrice: 1500.1, askQty: 20, askOrders: 3 });
  });

  it('builds subscription keys', () => {
    expect(quoteKey('2885')).toBe('4.1!2885');
    expect(depthKey('2885')).toBe('4.2!2885');
  });
});

describe('stream hub', () => {
  let sockets;
  let clock;
  let hub;
  beforeEach(() => {
    sockets = [];
    clock = NOW;
    hub = createStreamHub({ now: () => clock, ioFactory: (url, opts) => { const s = new FakeSocket(); s.url = url; s.opts = opts; sockets.push(s); return s; } });
  });
  afterEach(() => hub.stop());

  it('connects with the documented options and does nothing without credentials', () => {
    hub.start(null);
    expect(sockets).toHaveLength(0);
    hub.start({ user: 'U1', token: 'T1' });
    expect(sockets[0].url).toBe('https://livestream.icicidirect.com');
    expect(sockets[0].opts).toMatchObject({ auth: { user: 'U1', token: 'T1' }, transports: ['websocket'], reconnection: true });
    expect(hub.state()).toBe('connecting');
    sockets[0].fire('connect');
    expect(hub.state()).toBe('connected');
  });

  it('never joins the same key twice, including repeated subscribe calls and several callers', () => {
    hub.start({ user: 'U', token: 'T' });
    sockets[0].fire('connect');
    hub.subscribe('4.1!2885');
    hub.subscribe('4.1!2885');
    hub.subscribe(['4.1!2885', '4.1!11536']);
    const joins = sockets[0].emitted.filter((e) => e[0] === 'join');
    expect(joins.flatMap((e) => e[1])).toEqual(['4.1!2885', '4.1!11536']);
  });

  it('queues subscriptions made before the connection and joins them once on connect', () => {
    hub.start({ user: 'U', token: 'T' });
    hub.subscribe('4.1!2885');
    expect(sockets[0].emitted).toHaveLength(0);
    sockets[0].fire('connect');
    expect(sockets[0].emitted).toEqual([['join', ['4.1!2885']]]);
  });

  it('re-joins every wanted key exactly once after a reconnect, without duplicating', () => {
    hub.start({ user: 'U', token: 'T' });
    sockets[0].fire('connect');
    hub.subscribe(['4.1!2885', '4.1!11536']);
    sockets[0].fire('disconnect', 'transport close');
    expect(hub.state()).toBe('connecting');
    expect(hub.health().lastDisconnectReason).toBe('transport close');
    sockets[0].fire('connect');
    const joins = sockets[0].emitted.filter((e) => e[0] === 'join');
    expect(joins).toHaveLength(2); // initial join + one re-join
    expect(joins[1][1].sort()).toEqual(['4.1!11536', '4.1!2885']);
    expect(hub.health()).toMatchObject({ connects: 2, disconnects: 1, subscriptions: 2, joined: 2 });
    expect(hub.health().recentEvents.map((e) => e.message)).toContain('reconnected');
  });

  it('unsubscribes with a leave and does not re-join it later', () => {
    hub.start({ user: 'U', token: 'T' });
    sockets[0].fire('connect');
    hub.subscribe('4.1!2885');
    hub.unsubscribe('4.1!2885');
    expect(sockets[0].emitted.at(-1)).toEqual(['leave', ['4.1!2885']]);
    expect(hub.isSubscribed('4.1!2885')).toBe(false);
    sockets[0].fire('disconnect', 'x');
    sockets[0].fire('connect');
    expect(sockets[0].emitted.filter((e) => e[0] === 'join')).toHaveLength(1);
  });

  it('stores ticks, notifies listeners, counts rejects, and reports tick age', () => {
    hub.start({ user: 'U', token: 'T' });
    sockets[0].fire('connect');
    const seen = [];
    hub.onTick((e) => seen.push(e.type));
    sockets[0].fire('stock', tickArray('2885', { last: 1501 }));
    sockets[0].fire('stock', ['4.2!2885', NOW / 1000, [[1, 2, 3, 0, 4, 5, 6, 0]]]);
    sockets[0].fire('stock', 'garbage');
    expect(hub.getQuote('2885').last).toBe(1501);
    expect(hub.getDepth('2885').levels).toHaveLength(1);
    expect(seen).toEqual(['quote', 'depth']);
    clock += 45000;
    expect(hub.health()).toMatchObject({ ticks: 1, depthTicks: 1, rejectedMessages: 1, lastTickAgeSec: 45 });
  });

  it('records connection errors and recovers state on connect', () => {
    hub.start({ user: 'U', token: 'T' });
    sockets[0].fire('connect_error', new Error('invalid token'));
    expect(hub.state()).toBe('error');
    expect(hub.health().lastError).toBe('invalid token');
    sockets[0].fire('connect');
    expect(hub.state()).toBe('connected');
  });

  it('start() again replaces the old socket cleanly, and stop() clears everything', () => {
    hub.start({ user: 'U', token: 'T' });
    sockets[0].fire('connect');
    hub.subscribe('4.1!2885');
    hub.start({ user: 'U2', token: 'T2' });
    expect(sockets[0].closed).toBe(true);
    expect(hub.isSubscribed('4.1!2885')).toBe(false);
    hub.stop();
    expect(hub.state()).toBe('stopped');
  });
});

describe('request budget', () => {
  it('allows calls up to the per-minute cap and recovers as the window slides', () => {
    let t = 0;
    const b = createBudget({ perMinute: 3, perDay: 100, now: () => t });
    expect([b.take(), b.take(), b.take(), b.take()]).toEqual([true, true, true, false]);
    expect(b.stats()).toMatchObject({ minuteUsed: 3, minuteLimit: 3, dayUsed: 3 });
    t = 61000;
    expect(b.take()).toBe(true);
  });

  it('enforces the daily cap and resets at IST midnight', () => {
    let t = Date.UTC(2026, 9, 12, 5, 0);
    const b = createBudget({ perMinute: 1000, perDay: 2, now: () => t });
    expect([b.take(), b.take(), b.take()]).toEqual([true, true, false]);
    t = Date.UTC(2026, 9, 12, 18, 31); // 00:01 IST next day
    expect(b.take()).toBe(true);
    expect(b.stats().dayUsed).toBe(1);
  });

  it('makes the Breeze client refuse calls once the budget is used, without contacting ICICI', async () => {
    let sent = 0;
    const client = createBreezeClient({
      appKey: 'K', secret: 'S', now: () => NOW,
      budget: createBudget({ perMinute: 1, perDay: 10, now: () => NOW }),
      request: async () => { sent++; return { status: 200, json: { Success: { session_token: Buffer.from('USER1:TOK1').toString('base64') } } }; },
    });
    await client.connect('S1');
    await expect(client.getFunds()).rejects.toThrow(/budget/);
    expect(sent).toBe(1);
    expect(client.budget()).toMatchObject({ minuteUsed: 1, minuteLimit: 1 });
  });

  it('decodes stream credentials from the base64 session token', async () => {
    const client = createBreezeClient({ appKey: 'K', secret: 'S', now: () => NOW, request: async () => ({ status: 200, json: { Success: { session_token: Buffer.from('USER1:TOK1').toString('base64') } } }) });
    expect(client.streamAuth()).toBeNull();
    await client.connect('S1');
    expect(client.streamAuth()).toEqual({ user: 'USER1', token: 'TOK1' });
    client.disconnect();
    expect(client.streamAuth()).toBeNull();
  });
});

describe('server integration', () => {
  const MASTER = [
    '"Token","ShortName","Series","CompanyName","ISINCode","ExchangeCode"',
    '"2885","RELIND","EQ","RELIANCE INDUSTRIES LTD","INE002A01018","RELIANCE"',
    '"2029","INDR","EQ","INDIAN RAILWAY FINANCE CORPORATION LTD","INE053F01010","IRFC"',
  ].join('\n');

  let server;
  let base;
  let hub;
  let breeze;
  let sockets;
  let clock;
  let breezeRequests;
  afterEach(() => new Promise((resolve) => { hub?.stop(); server.close(resolve); }));

  async function start({ connected = true, yahoo = () => { throw new Error('blocked'); } } = {}) {
    sockets = [];
    clock = NOW;
    breezeRequests = [];
    hub = createStreamHub({ now: () => clock, ioFactory: () => { const s = new FakeSocket(); sockets.push(s); return s; } });
    breeze = createBreezeClient({
      appKey: 'K', secret: 'S', now: () => clock,
      request: async (req) => {
        breezeRequests.push(req.path);
        if (req.path.endsWith('customerdetails')) return { status: 200, json: { Success: { session_token: Buffer.from('USER1:TOK1').toString('base64') } } };
        if (req.path.endsWith('quotes')) {
          return { status: 200, json: { Success: [{ ltp: '1500', previous_close: '1490', open: '1490', high: '1505', low: '1488', ltt: '2026-10-12 10:50:00', total_quantity_traded: '1000' }] } };
        }
        return { status: 404, json: null };
      },
    });
    const { app } = createApp({
      fetchFn: async (url, init) => yahoo(url, init), now: () => clock, retryDelayMs: 0,
      breeze, streamHub: hub, loadMaster: async () => parseNseMaster(MASTER),
    });
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}/api`;
    if (connected) await fetch(`${base}/auth/breeze/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session: '123456' }) });
    await new Promise((r) => setTimeout(r, 20)); // let the master finish loading
  }
  const get = async (path) => { const res = await fetch(`${base}${path}`); return { res, body: await res.json() }; };

  it('starts the stream with decoded credentials when the broker signs in, and stops it on sign-out', async () => {
    await start();
    expect(sockets).toHaveLength(1);
    expect(hub.state()).toBe('connecting');
    await fetch(`${base}/auth/breeze/disconnect`, { method: 'POST' });
    expect(hub.state()).toBe('stopped');
  });

  it('serves any instrument in the master from the broker, subscribes to its feed, and prefers a trusted live tick', async () => {
    await start();
    sockets[0].fire('connect');
    const first = await get('/quote/IRFC'); // not in the built-in Nifty 50 map
    expect(first.body).toMatchObject({ provider: 'ICICI Direct Breeze', price: 1500 });
    expect(hub.isSubscribed('4.1!2029')).toBe(true);

    sockets[0].fire('stock', tickArray('2029', { last: 1512, lttSec: (NOW - 1000) / 1000 }));
    clock += 31000; // past the quote cache
    const tickAt = clock - 5000;
    sockets[0].fire('stock', tickArray('2029', { last: 1512, lttSec: tickAt / 1000 }));
    const second = await get('/quote/IRFC');
    expect(second.body.price).toBe(1512);
    expect(second.body.dataStatus).toBe('LIVE');
    expect(second.body.asOf).toBe(new Date(tickAt).toISOString());
    expect(second.body.change).toBeCloseTo(22, 5);
  });

  it('ignores a tick whose exchange time cannot be verified', async () => {
    await start();
    sockets[0].fire('connect');
    await get('/quote/IRFC');
    clock += 31000;
    sockets[0].fire('stock', tickArray('2029', { last: 1999, lttSec: 1_000_000_000 }));
    const q = await get('/quote/IRFC');
    expect(q.body.price).toBe(1500); // REST value, not the untrusted tick
  });

  it('bulk history requests never touch the broker budget', async () => {
    await start({ yahoo: () => new Response(JSON.stringify({ chart: { result: [{ meta: { gmtoffset: 19800 }, timestamp: [Math.floor(Date.UTC(2026, 9, 9, 4, 0) / 1000)], indicators: { quote: [{ open: [1], high: [2], low: [1], close: [2], volume: [1] }], adjclose: [{ adjclose: [2] }] } }] } }), { headers: { 'content-type': 'application/json' } }) });
    const before = breeze.budget().dayUsed;
    const bulk = await get('/history/RELIANCE?range=6mo&interval=1d&bulk=1');
    expect(bulk.body.provider).toBe('Yahoo Finance');
    expect(breeze.budget().dayUsed).toBe(before);
  });

  it('streams ticks to a browser as server-sent events and releases the subscription on close', async () => {
    await start();
    sockets[0].fire('connect');
    const controller = new AbortController();
    const res = await fetch(`${base}/live/RELIANCE`, { signal: controller.signal });
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const readUntil = async (needle) => {
      let text = '';
      while (!text.includes(needle)) text += decoder.decode((await reader.read()).value);
      return text;
    };
    await readUntil('"live":true');
    expect(hub.isSubscribed('4.1!2885')).toBe(true);
    sockets[0].fire('stock', tickArray('2885', { last: 1503, lttSec: clock / 1000 }));
    const text = await readUntil('"price":1503');
    expect(text).toMatch(/event: tick/);
    expect(text).toMatch(/"status":"LIVE"/);
    expect(text).toMatch(/"trusted":true/);
    controller.abort();
    await new Promise((r) => setTimeout(r, 50));
    expect(hub.isSubscribed('4.1!2885')).toBe(false);
  });

  it('tells the browser plainly when no live feed exists', async () => {
    await start({ connected: false });
    const res = await fetch(`${base}/live/RELIANCE`);
    const text = await res.text();
    expect(text).toMatch(/"live":false/);
    expect(text).toMatch(/not signed in/);
  });

  it('search uses the instrument list when Yahoo is unreachable', async () => {
    await start({ connected: false });
    const { body } = await get('/search?q=railway');
    expect(body.map((r) => r.symbol)).toEqual(['IRFC']);
    const bySymbol = await get('/search?q=irf');
    expect(bySymbol.body[0]).toMatchObject({ symbol: 'IRFC', yahooSymbol: 'IRFC.NS' });
  });

  it('reports diagnostics: market, broker budget, stream health, instruments and recent errors', async () => {
    await start();
    await get('/quote/RELIANCE');
    const { body } = await get('/diagnostics');
    expect(body.broker).toMatchObject({ configured: true, connected: true });
    expect(body.broker.budget.dayUsed).toBeGreaterThan(0);
    expect(body.stream).toMatchObject({ state: 'connecting', subscriptions: 1 });
    expect(body.instruments).toMatchObject({ loaded: true, count: 2 });
    expect(body.market.calendar).toBe('weekends-only');
    expect(Array.isArray(body.recentErrors)).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/TOK1|USER1/); // credentials never appear
  });
});
