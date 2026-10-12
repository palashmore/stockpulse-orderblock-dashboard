import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import { createApp } from './app.js';
import { createMemoryAlertStore } from './alertEngine.js';

// Mon 2026-10-12 11:00 IST (market open) and Sat 2026-10-10 11:00 IST (closed)
const OPEN_MS = Date.UTC(2026, 9, 12, 5, 30);
const CLOSED_MS = Date.UTC(2026, 9, 10, 5, 30);
const realFetch = globalThis.fetch;

const yahoo = (prices, timeMs) => new Response(JSON.stringify({
  quoteResponse: {
    result: Object.entries(prices).map(([symbol, price]) => ({
      symbol: `${symbol}.NS`, longName: symbol, regularMarketPrice: price, regularMarketChange: 0, regularMarketChangePercent: 0,
      regularMarketTime: Math.floor(timeMs / 1000), marketState: 'REGULAR',
    })),
  },
}), { status: 200, headers: { 'content-type': 'application/json' } });

describe('server-side alerts API', () => {
  let server;
  let base;
  let clock;
  let prices;
  let upstreamDown;
  let pushed;
  let store;
  let alerts;

  async function start(extra = {}) {
    const fetchFn = async () => {
      if (upstreamDown) throw new Error('network down');
      return yahoo(prices, clock - 60_000);
    };
    const created = createApp({
      fetchFn,
      now: () => clock,
      retryDelayMs: 0,
      alertStore: store,
      alertNotifier: { channel: 'test', send: async (m) => { pushed.push(m); } },
      alertIntervalMs: 0,
      ...extra,
    });
    alerts = created.alerts;
    await new Promise((resolve) => { server = created.app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}/api`;
  }

  beforeEach(async () => {
    clock = OPEN_MS;
    prices = { RELIANCE: 1500, TCS: 4000 };
    upstreamDown = false;
    pushed = [];
    store = createMemoryAlertStore();
    await start();
  });

  afterEach(() => new Promise((resolve) => server.close(resolve)));

  const call = async (method, path, body) => {
    const res = await realFetch(`${base}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return { res, body: await res.json() };
  };

  it('starts empty and reports the engine state', async () => {
    const { res, body } = await call('GET', '/alerts');
    expect(res.status).toBe(200);
    expect(body.alerts).toEqual([]);
    expect(body.events).toEqual([]);
    expect(body.engine).toMatchObject({ running: false, channel: 'test', outcome: 'not-run-yet' });
  });

  it('creates, pauses, resumes and deletes an alert', async () => {
    const created = await call('POST', '/alerts', { symbol: 'reliance', type: 'above', threshold: 1510 });
    expect(created.res.status).toBe(201);
    expect(created.body.alert).toMatchObject({ symbol: 'RELIANCE', status: 'active', lastPrice: 1500 });
    const id = created.body.alert.id;

    expect((await call('POST', `/alerts/${id}/pause`)).body.alerts[0].status).toBe('paused');
    expect((await call('POST', `/alerts/${id}/activate`)).body.alerts[0].status).toBe('active');
    expect((await call('DELETE', `/alerts/${id}`)).body.alerts).toEqual([]);
    expect((await call('DELETE', `/alerts/${id}`)).res.status).toBe(404);
    expect((await call('POST', '/alerts/nope/pause')).res.status).toBe(404);
  });

  it('rejects bad input with a reason', async () => {
    expect((await call('POST', '/alerts', { symbol: 'RELIANCE', type: 'above', threshold: 1400 })).body.error).toMatch(/already/);
    expect((await call('POST', '/alerts', { symbol: 'RELIANCE', type: 'above' })).res.status).toBe(400);
    expect((await call('POST', '/alerts', { symbol: 'NOT A SYMBOL', type: 'above', threshold: 10 })).res.status).toBe(400);
    expect((await call('POST', '/alerts', {})).res.status).toBe(400);
  });

  it('refuses to create an alert when the price feed is down', async () => {
    upstreamDown = true;
    const { res, body } = await call('POST', '/alerts', { symbol: 'RELIANCE', type: 'above', threshold: 1510 });
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/No reliable current price/);
  });

  it('fires through a check once the price crosses, and keeps the event', async () => {
    await call('POST', '/alerts', { symbol: 'RELIANCE', type: 'above', threshold: 1510 });
    clock += 2 * 60_000; // past the quote cache lifetime
    prices.RELIANCE = 1515;
    const { body } = await call('POST', '/alerts/check');
    expect(body.outcome).toBe('ok');
    expect(body.fired).toHaveLength(1);
    expect(body.fired[0]).toMatchObject({ symbol: 'RELIANCE', price: 1515, status: 'DELAYED', delivery: 'sent' });
    expect(body.alerts[0].status).toBe('triggered');
    expect(body.events).toHaveLength(1);
    expect(pushed).toHaveLength(1);

    const view = await call('GET', '/alerts');
    expect(view.body.events[0].symbol).toBe('RELIANCE');
    expect(view.body.engine.outcome).toBe('ok');
  });

  it('does not check while the market is closed', async () => {
    await call('POST', '/alerts', { symbol: 'RELIANCE', type: 'above', threshold: 1510 });
    clock = CLOSED_MS;
    prices.RELIANCE = 1600;
    const { body } = await call('POST', '/alerts/check');
    expect(body.outcome).toBe('market-closed');
    expect(body.alerts[0].status).toBe('active');
  });

  it('reports a feed outage without changing alerts', async () => {
    await call('POST', '/alerts', { symbol: 'RELIANCE', type: 'above', threshold: 1510 });
    clock += 2 * 60_000;
    upstreamDown = true;
    const { body } = await call('POST', '/alerts/check');
    expect(['data-unavailable', 'data-not-live']).toContain(body.outcome);
    expect(body.alerts[0].status).toBe('active');
    expect(pushed).toHaveLength(0);
  });

  it('refuses to fire on a stale cached quote after the feed fails', async () => {
    await call('POST', '/alerts', { symbol: 'RELIANCE', type: 'above', threshold: 1510 });
    clock += 2 * 60_000;
    prices.RELIANCE = 1600;
    await call('POST', '/alerts/check'); // fires, populating the cache
    await call('POST', `/alerts/${alerts.list()[0].id}/activate`);
    clock += 2 * 60_000;
    upstreamDown = true; // cache is now past its lifetime but still inside the stale window
    const { body } = await call('POST', '/alerts/check');
    expect(body.outcome).toBe('data-not-live');
    expect(body.detail).toContain('STALE');
  });

  it('imports browser alerts and sends a test notification', async () => {
    const imported = await call('POST', '/alerts/import', {
      alerts: [{ id: 'b1', symbol: 'TCS', type: 'above', threshold: 4100, status: 'active', lastPrice: 3900 }],
    });
    expect(imported.body).toEqual({ added: 1, skipped: 0 });
    expect((await call('GET', '/alerts')).body.alerts[0].lastPrice).toBeNull();

    const test = await call('POST', '/alerts/test-notification');
    expect(test.res.status).toBe(200);
    expect(pushed[0].title).toBe('StockPulse test');
  });

  it('reports no push channel when none is configured', async () => {
    await new Promise((resolve) => server.close(resolve));
    await start({ alertNotifier: null });
    const { res, body } = await call('POST', '/alerts/test-notification');
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/NTFY_TOPIC/);
  });

  it('answers only on the machine running the server', async () => {
    const external = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal);
    if (!external) return; // no network interface to test from
    await new Promise((resolve) => server.close(resolve));
    const created = createApp({ fetchFn: async () => yahoo(prices, clock), now: () => clock, alertIntervalMs: 0 });
    await new Promise((resolve) => { server = created.app.listen(0, '0.0.0.0', resolve); });
    const port = server.address().port;
    const remote = await realFetch(`http://${external.address}:${port}/api/alerts`);
    expect(remote.status).toBe(403);
    const mutate = await realFetch(`http://${external.address}:${port}/api/alerts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(mutate.status).toBe(403);
    const local = await realFetch(`http://127.0.0.1:${port}/api/alerts`);
    expect(local.status).toBe(200);
  });

  it('reads and changes the stale-feed alert settings', async () => {
    const view = await call('GET', '/alerts');
    expect(view.body.engine.feed).toMatchObject({ enabled: true, staleMinutes: 5, unhealthyMinutes: 0, alerted: false });

    const changed = await call('POST', '/alerts/feed-settings', { staleMinutes: 12 });
    expect(changed.res.status).toBe(200);
    expect(changed.body.feed).toEqual({ enabled: true, staleMinutes: 12 });
    expect(changed.body.engine.feed.staleMinutes).toBe(12);

    const ignored = await call('POST', '/alerts/feed-settings', { staleMinutes: 'lots', enabled: 'maybe' });
    expect(ignored.body.feed).toEqual({ enabled: true, staleMinutes: 12 });

    expect((await call('POST', '/alerts/feed-settings', { enabled: false })).body.feed.enabled).toBe(false);
    expect((await call('GET', '/alerts')).body.engine.feed.enabled).toBe(false);
  });

  it('shows a stale-feed notice in the event list once the feed has been bad long enough', async () => {
    await call('POST', '/alerts/feed-settings', { staleMinutes: 1 });
    upstreamDown = true;
    clock += 2 * 60_000;
    await call('POST', '/alerts/check'); // starts the clock
    clock += 2 * 60_000;
    const { body } = await call('POST', '/alerts/check');
    const notice = body.events.find((e) => e.kind === 'feed');
    expect(notice.message).toMatch(/No live or delayed prices/);
    expect(pushed.at(-1).title).toBe('StockPulse: price feed is stale');
  });
});
