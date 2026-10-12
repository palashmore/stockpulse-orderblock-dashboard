import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAlertEngine, createMemoryAlertStore, createFileAlertStore, createNotifier, parseState } from './alertEngine.js';

const T0 = Date.UTC(2026, 9, 12, 5, 30);
const q = (symbol, price, status = 'LIVE') => ({ symbol, price, status, provider: 'test', asOf: null });

describe('alert engine', () => {
  let clock;
  let open;
  let prices; // symbol -> { price, status }
  let quoteCalls;
  let sent;
  let notifyError;
  let store;
  let seq;

  const getQuotes = async (symbols) => {
    quoteCalls.push([...symbols]);
    return symbols.filter((s) => prices[s]).map((s) => q(s, prices[s].price, prices[s].status ?? 'LIVE'));
  };
  const notifier = () => ({
    channel: 'test',
    send: async (m) => {
      if (notifyError) throw new Error(notifyError);
      sent.push(m);
    },
  });
  const make = (extra = {}) => createAlertEngine({
    store,
    getQuotes,
    marketOpen: async () => open,
    notifier: notifier(),
    now: () => clock,
    newId: () => `id${++seq}`,
    intervalMs: 0,
    ...extra,
  });

  beforeEach(() => {
    clock = T0;
    open = true;
    prices = { RELIANCE: { price: 1500 }, TCS: { price: 4000 } };
    quoteCalls = [];
    sent = [];
    notifyError = null;
    store = createMemoryAlertStore();
    seq = 0;
  });

  describe('creating alerts', () => {
    it('baselines on the current price and saves the alert', async () => {
      const engine = make();
      const { alert, error } = await engine.add({ symbol: 'reliance', type: 'above', threshold: 1600 });
      expect(error).toBeUndefined();
      expect(alert).toMatchObject({ symbol: 'RELIANCE', status: 'active', lastPrice: 1500, threshold: 1600 });
      expect(store.load().alerts).toHaveLength(1);
    });

    it('accepts a last-close baseline while the market is closed', async () => {
      prices.RELIANCE.status = 'MARKET_CLOSED';
      const { alert } = await make().add({ symbol: 'RELIANCE', type: 'below', threshold: 1400 });
      expect(alert.lastPrice).toBe(1500);
    });

    it('refuses without a reliable current price', async () => {
      prices.RELIANCE.status = 'STALE';
      const stale = await make().add({ symbol: 'RELIANCE', type: 'above', threshold: 1600 });
      expect(stale.error).toMatch(/No reliable current price/);
      expect((await make().add({ symbol: 'UNKNOWN', type: 'above', threshold: 10 })).error).toMatch(/No reliable current price/);
      const engine = make({ getQuotes: async () => { throw new Error('down'); } });
      expect((await engine.add({ symbol: 'RELIANCE', type: 'above', threshold: 1600 })).error).toMatch(/No reliable current price/);
      expect(store.load().alerts).toHaveLength(0);
    });

    it('refuses a level the price has already passed, and bad input', async () => {
      const engine = make();
      expect((await engine.add({ symbol: 'RELIANCE', type: 'above', threshold: 1400 })).error).toMatch(/already/);
      expect((await engine.add({ symbol: 'RELIANCE', type: 'sideways', threshold: 1400 })).error).toBeTruthy();
      expect((await engine.add({ symbol: 'BAD SYMBOL;', type: 'above', threshold: 1600 })).error).toMatch(/valid stock symbol/);
      expect((await engine.add({ symbol: 'RELIANCE', type: 'above', threshold: -5 })).error).toBeTruthy();
      expect(engine.list()).toHaveLength(0);
    });
  });

  describe('checking', () => {
    it('fires once when the price crosses, saves first, then notifies', async () => {
      const engine = make();
      await engine.add({ symbol: 'RELIANCE', type: 'above', threshold: 1510 });
      prices.RELIANCE.price = 1512;
      const result = await engine.check();
      expect(result.outcome).toBe('ok');
      expect(result.fired).toHaveLength(1);
      expect(result.fired[0]).toMatchObject({ symbol: 'RELIANCE', price: 1512, threshold: 1510, status: 'LIVE', delivery: 'sent' });
      expect(sent).toHaveLength(1);
      expect(sent[0].message).toContain('1,512.00');
      expect(sent[0].message).toContain('not advice');
      expect(engine.list()[0]).toMatchObject({ status: 'triggered', triggeredPrice: 1512, triggerCount: 1 });
      expect(store.load().events).toHaveLength(1);

      prices.RELIANCE.price = 1520;
      const again = await engine.check();
      expect(again.fired).toHaveLength(0);
      expect(sent).toHaveLength(1);
    });

    it('does not fire again when the notification fails', async () => {
      notifyError = 'channel down';
      const engine = make();
      await engine.add({ symbol: 'RELIANCE', type: 'above', threshold: 1510 });
      prices.RELIANCE.price = 1512;
      const result = await engine.check();
      expect(result.fired[0].delivery).toBe('failed');
      expect(engine.list()[0].status).toBe('triggered');
      expect(store.load().events[0].delivery).toBe('failed');
      notifyError = null;
      expect((await engine.check()).fired).toHaveLength(0);
      expect(sent).toHaveLength(0);
    });

    it('records the event with delivery "none" when no channel is configured', async () => {
      const engine = make({ notifier: null });
      await engine.add({ symbol: 'RELIANCE', type: 'below', threshold: 1490 });
      prices.RELIANCE.price = 1480;
      const result = await engine.check();
      expect(result.fired[0].delivery).toBe('none');
      expect(engine.events()).toHaveLength(1);
    });

    it('treats a gap between checks as a crossing', async () => {
      const engine = make();
      await engine.add({ symbol: 'RELIANCE', type: 'above', threshold: 1510 });
      prices.RELIANCE.price = 1600;
      expect((await engine.check()).fired).toHaveLength(1);
    });

    it('skips the data call entirely while the market is closed', async () => {
      const engine = make();
      await engine.add({ symbol: 'RELIANCE', type: 'above', threshold: 1510 });
      quoteCalls = [];
      open = false;
      prices.RELIANCE.price = 1600;
      const result = await engine.check();
      expect(result.outcome).toBe('market-closed');
      expect(quoteCalls).toHaveLength(0);
      expect(engine.list()[0].status).toBe('active');
      expect(engine.status().outcome).toBe('market-closed');
    });

    it('never evaluates stale, closed or missing data', async () => {
      const engine = make();
      await engine.add({ symbol: 'RELIANCE', type: 'above', threshold: 1510 });
      for (const status of ['STALE', 'HISTORICAL', 'SIMULATED', 'UNAVAILABLE', 'MARKET_CLOSED']) {
        prices.RELIANCE = { price: 1600, status };
        const result = await engine.check();
        expect(result.outcome).toBe('data-not-live');
        expect(result.detail).toContain(status);
      }
      expect(engine.list()[0].status).toBe('active');
      expect(engine.events()).toHaveLength(0);
    });

    it('reports a provider failure and leaves alerts untouched', async () => {
      store = createMemoryAlertStore({ alerts: [{ id: 'a', symbol: 'RELIANCE', type: 'above', status: 'active', threshold: 1510, lastPrice: 1500 }], events: [] });
      const failing = make({ getQuotes: async () => { throw new Error('upstream 503'); } });
      const result = await failing.check();
      expect(result.outcome).toBe('data-unavailable');
      expect(result.detail).toBe('upstream 503');
      expect(failing.list()[0].status).toBe('active');
    });

    it('checks only active alerts, each symbol once', async () => {
      const engine = make();
      await engine.add({ symbol: 'RELIANCE', type: 'above', threshold: 1510 });
      await engine.add({ symbol: 'RELIANCE', type: 'below', threshold: 1400 });
      const paused = (await engine.add({ symbol: 'TCS', type: 'above', threshold: 4100 })).alert;
      engine.pause(paused.id);
      quoteCalls = [];
      await engine.check();
      expect(quoteCalls).toEqual([['RELIANCE']]);
    });

    it('reports when there is nothing to check', async () => {
      expect((await make().check()).outcome).toBe('no-active-alerts');
    });

    it('re-arms a triggered alert and baselines on the next price', async () => {
      const engine = make();
      const { alert } = await engine.add({ symbol: 'RELIANCE', type: 'above', threshold: 1510 });
      prices.RELIANCE.price = 1512;
      await engine.check();
      expect(engine.activate(alert.id)).toBe(true);
      expect(engine.list()[0]).toMatchObject({ status: 'active', lastPrice: null });
      expect((await engine.check()).fired).toHaveLength(0); // records 1512 as the baseline
      prices.RELIANCE.price = 1500;
      expect((await engine.check()).fired).toHaveLength(0);
    });

    it('keeps edits made while quotes were loading', async () => {
      let release;
      const gate = new Promise((r) => { release = r; });
      const engine = make();
      const { alert } = await engine.add({ symbol: 'RELIANCE', type: 'above', threshold: 1510 });
      const slow = make({ store, getQuotes: async (s) => { await gate; return s.map((x) => q(x, 1600)); } });
      const pending = slow.check();
      expect(slow.remove(alert.id)).toBe(true);
      release();
      const result = await pending;
      expect(result.fired).toHaveLength(0);
      expect(slow.list()).toHaveLength(0);
    });

    it('shares one run between overlapping checks', async () => {
      const engine = make();
      await engine.add({ symbol: 'RELIANCE', type: 'above', threshold: 1510 });
      quoteCalls = [];
      const [a, b] = await Promise.all([engine.check(), engine.check()]);
      expect(a).toBe(b);
      expect(quoteCalls).toHaveLength(1);
    });
  });

  describe('managing alerts', () => {
    it('pauses, resumes and removes, and rejects unknown ids', async () => {
      const engine = make();
      const { alert } = await engine.add({ symbol: 'RELIANCE', type: 'above', threshold: 1510 });
      expect(engine.pause(alert.id)).toBe(true);
      expect(engine.list()[0].status).toBe('paused');
      expect(engine.activate(alert.id)).toBe(true);
      expect(engine.list()[0].status).toBe('active');
      expect(engine.remove(alert.id)).toBe(true);
      expect(engine.remove(alert.id)).toBe(false);
      expect(engine.pause('nope')).toBe(false);
    });

    it('keeps alerts and history across a restart', async () => {
      const first = make();
      await first.add({ symbol: 'RELIANCE', type: 'above', threshold: 1510 });
      prices.RELIANCE.price = 1512;
      await first.check();
      const second = make();
      expect(second.list()).toHaveLength(1);
      expect(second.list()[0].status).toBe('triggered');
      expect(second.events()).toHaveLength(1);
    });

    it('imports browser alerts once, ignoring malformed entries and duplicates', async () => {
      const engine = make();
      const browser = [
        { id: 'b1', symbol: 'TCS', type: 'above', threshold: 4100, status: 'active', lastPrice: 3900 },
        { id: 'b2', symbol: 'INFY', type: 'below', threshold: 1400, status: 'triggered', lastPrice: 1390, triggeredAt: '2026-10-09T10:00:00.000Z', triggeredPrice: 1390, triggerCount: 1 },
        { id: 'bad', symbol: 'X', type: 'sideways', threshold: 1, status: 'active' },
        'garbage',
      ];
      expect(engine.importAlerts(browser)).toEqual({ added: 2, skipped: 0 });
      expect(engine.importAlerts(browser)).toEqual({ added: 0, skipped: 2 });
      const active = engine.list().find((a) => a.id === 'b1');
      expect(active.lastPrice).toBeNull(); // a stale browser baseline is not trusted
      expect(engine.list().find((a) => a.id === 'b2').status).toBe('triggered');
      expect(engine.importAlerts('nope')).toEqual({ added: 0, skipped: 0 });
    });
  });

  describe('test notification and status', () => {
    it('sends a test only when a channel exists', async () => {
      expect((await make().sendTest()).ok).toBe(true);
      expect(sent).toHaveLength(1);
      const none = await make({ notifier: null }).sendTest();
      expect(none.ok).toBe(false);
      notifyError = 'boom';
      expect(await make().sendTest()).toEqual({ ok: false, error: 'boom' });
    });

    it('reports its state', async () => {
      const engine = make();
      expect(engine.status()).toMatchObject({ running: false, channel: 'test', outcome: 'not-run-yet', lastCheckAt: null });
      await engine.check();
      expect(engine.status().lastCheckAt).toBe(new Date(T0).toISOString());
    });

    it('flags when the store cannot save', async () => {
      const engine = make({ store: { load: () => ({ alerts: [], events: [] }), save: () => false } });
      await engine.add({ symbol: 'RELIANCE', type: 'above', threshold: 1510 });
      expect(engine.status().saveFailed).toBe(true);
    });
  });
});

describe('alert storage', () => {
  it('treats corrupt or malformed stored data as empty', () => {
    expect(parseState('not json')).toEqual({ alerts: [], events: [], feed: { enabled: true, staleMinutes: 5 } });
    expect(parseState(null)).toEqual({ alerts: [], events: [], feed: { enabled: true, staleMinutes: 5 } });
    expect(parseState('{"alerts": 5, "events": "x"}')).toEqual({ alerts: [], events: [], feed: { enabled: true, staleMinutes: 5 } });
  });

  it('keeps only well-formed alerts and events', () => {
    const state = parseState(JSON.stringify({
      alerts: [{ id: 'a', symbol: 'TCS', type: 'above', threshold: 10, status: 'active' }, { id: 'b' }],
      events: [{ id: 'e', symbol: 'TCS', type: 'above', threshold: 10, price: 11, at: 'x' }, { id: 'f' }],
    }));
    expect(state.alerts).toHaveLength(1);
    expect(state.events).toHaveLength(1);
  });

  it('round-trips through a file and survives a corrupt one', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-alerts-'));
    try {
      const file = path.join(dir, 'nested', 'alerts.json');
      const store = createFileAlertStore(file);
      expect(store.load()).toEqual({ alerts: [], events: [], feed: { enabled: true, staleMinutes: 5 } });
      const alert = { id: 'a', symbol: 'TCS', type: 'above', threshold: 10, status: 'active', lastPrice: 9 };
      expect(store.save({ alerts: [alert], events: [] })).toBe(true);
      expect(store.load().alerts[0]).toMatchObject({ id: 'a', symbol: 'TCS' });
      expect(fs.readdirSync(path.dirname(file))).toEqual(['alerts.json']); // no temp file left behind
      fs.writeFileSync(file, '{broken');
      expect(store.load()).toEqual({ alerts: [], events: [], feed: { enabled: true, staleMinutes: 5 } });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('push notifier', () => {
  const okFetch = (log) => async (url, init) => { log.push({ url, init }); return new Response('ok', { status: 200 }); };

  it('is off unless a topic is configured', () => {
    expect(createNotifier({})).toEqual({ channel: 'none', send: null, error: null });
  });

  it('rejects a weak topic or a non-https server', () => {
    expect(createNotifier({ NTFY_TOPIC: 'short' }).error).toMatch(/NTFY_TOPIC/);
    expect(createNotifier({ NTFY_TOPIC: 'has space in it!' }).send).toBeNull();
    expect(createNotifier({ NTFY_TOPIC: 'abcdefgh1234', NTFY_SERVER: 'http://example.com' }).error).toMatch(/https/);
    expect(createNotifier({ NTFY_TOPIC: 'abcdefgh1234', NTFY_SERVER: 'ftp://x' }).send).toBeNull();
  });

  it('posts the message to the topic with an ASCII-only title', async () => {
    const log = [];
    const notifier = createNotifier({ NTFY_TOPIC: 'abcdefgh1234' }, okFetch(log));
    expect(notifier.channel).toBe('ntfy');
    await notifier.send({ title: 'RELIANCE ₹ alert', message: 'Price ₹1,512.00' });
    expect(log[0].url).toBe('https://ntfy.sh/abcdefgh1234');
    expect(log[0].init.method).toBe('POST');
    expect(log[0].init.headers.Title).toBe('RELIANCE ? alert');
    expect(log[0].init.body).toBe('Price ₹1,512.00');
  });

  it('uses a custom https server and reports HTTP failures', async () => {
    const log = [];
    const custom = createNotifier({ NTFY_TOPIC: 'abcdefgh1234', NTFY_SERVER: 'https://push.example.org/' }, okFetch(log));
    await custom.send({ title: 't', message: 'm' });
    expect(log[0].url).toBe('https://push.example.org/abcdefgh1234');
    const failing = createNotifier({ NTFY_TOPIC: 'abcdefgh1234' }, async () => new Response('no', { status: 429 }));
    await expect(failing.send({ title: 't', message: 'm' })).rejects.toThrow(/429/);
  });
});
