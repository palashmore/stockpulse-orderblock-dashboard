import { describe, it, expect, beforeEach } from 'vitest';
import { createAlertEngine, createMemoryAlertStore, parseState, sanitizeFeedSettings, DEFAULT_FEED_SETTINGS } from './alertEngine.js';

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 12, 5, 30);

describe('stale-feed alerts', () => {
  let clock;
  let open;
  let mode; // 'live' | 'stale' | 'throw' | 'empty'
  let quoteCalls;
  let sent;
  let broker;
  let store;
  let seq;

  const getQuotes = async (symbols) => {
    quoteCalls.push([...symbols]);
    if (mode === 'throw') throw new Error('upstream 503');
    if (mode === 'empty') return [];
    return symbols.map((symbol) => ({ symbol, price: 1500, status: mode === 'live' ? 'DELAYED' : 'STALE', provider: 'test', asOf: null }));
  };
  const make = (extra = {}) => createAlertEngine({
    store,
    getQuotes,
    marketOpen: async () => open,
    notifier: { channel: 'test', send: async (m) => { sent.push(m); } },
    brokerStatus: () => broker,
    now: () => clock,
    newId: () => `id${++seq}`,
    intervalMs: 0,
    ...extra,
  });
  const tick = async (engine, minutes = 1) => {
    clock += minutes * MIN;
    return engine.check();
  };
  const feedEvents = (engine) => engine.events().filter((e) => e.kind === 'feed');

  beforeEach(() => {
    clock = T0;
    open = true;
    mode = 'live';
    quoteCalls = [];
    sent = [];
    broker = { configured: false, connected: false };
    store = createMemoryAlertStore();
    seq = 0;
  });

  it('is on by default with a five-minute threshold', () => {
    expect(make().feedSettings()).toEqual({ enabled: true, staleMinutes: 5 });
    expect(DEFAULT_FEED_SETTINGS).toEqual({ enabled: true, staleMinutes: 5 });
  });

  it('stays quiet while the feed is healthy', async () => {
    const engine = make();
    for (let i = 0; i < 10; i++) await tick(engine);
    expect(engine.events()).toEqual([]);
    expect(engine.status().feed).toMatchObject({ unhealthyMinutes: 0, alerted: false });
  });

  it('raises one notice after the feed has been bad for the threshold, not before', async () => {
    const engine = make();
    await tick(engine); // healthy
    mode = 'stale';
    for (let i = 0; i < 4; i++) await tick(engine); // 4 minutes bad
    expect(feedEvents(engine)).toHaveLength(0);
    expect(engine.status().feed.unhealthyMinutes).toBe(3);
    await tick(engine, 2); // 6 minutes bad since the first bad check at minute 2
    const [event] = feedEvents(engine);
    expect(event).toMatchObject({ kind: 'feed', delivery: 'sent' });
    expect(event.message).toMatch(/No live or delayed prices for about \d+ minutes/);
    expect(sent).toHaveLength(1);
    expect(sent[0].title).toBe('StockPulse: price feed is stale');
    expect(engine.status().feed.alerted).toBe(true);
    for (let i = 0; i < 5; i++) await tick(engine);
    expect(feedEvents(engine)).toHaveLength(1); // no repeats while it stays bad
  });

  it('says when the feed is back, once', async () => {
    const engine = make();
    mode = 'stale';
    for (let i = 0; i < 7; i++) await tick(engine);
    mode = 'live';
    await tick(engine);
    await tick(engine);
    const messages = feedEvents(engine).map((e) => e.message);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatch(/is back after about \d+ minutes?/);
    expect(sent.map((m) => m.title)).toEqual(['StockPulse: price feed is stale', 'StockPulse: price feed is back']);
    expect(engine.status().feed).toMatchObject({ alerted: false, unhealthyMinutes: 0 });
  });

  it('does not alert for a short blip, and restarts the clock after one', async () => {
    const engine = make();
    mode = 'stale';
    await tick(engine, 2);
    await tick(engine, 2);
    mode = 'live';
    await tick(engine);
    mode = 'stale';
    await tick(engine, 4);
    expect(engine.events()).toEqual([]);
  });

  it('treats errors, empty answers and stale quotes alike', async () => {
    for (const bad of ['throw', 'empty', 'stale']) {
      store = createMemoryAlertStore();
      sent = [];
      clock = T0;
      const engine = make();
      mode = bad;
      await tick(engine, 1);
      await tick(engine, 6);
      expect(feedEvents(engine), bad).toHaveLength(1);
    }
  });

  it('does not alert while the market is closed, and forgets the problem at the close', async () => {
    const engine = make();
    mode = 'stale';
    await tick(engine, 1);
    await tick(engine, 3);
    open = false;
    quoteCalls = [];
    for (let i = 0; i < 20; i++) await tick(engine, 10);
    expect(engine.events()).toEqual([]);
    expect(quoteCalls).toEqual([]); // no data calls at all while closed
    open = true; // next session: the clock starts again
    await tick(engine, 1);
    await tick(engine, 3);
    expect(engine.events()).toEqual([]);
  });

  it('is silent when the market closes after an alert had been raised', async () => {
    const engine = make();
    mode = 'stale';
    await tick(engine, 1);
    await tick(engine, 6);
    expect(feedEvents(engine)).toHaveLength(1);
    open = false;
    await tick(engine, 5);
    mode = 'live';
    open = true;
    await tick(engine, 1000);
    expect(feedEvents(engine)).toHaveLength(1); // no "back" notice for a problem from a previous session
  });

  it('uses the prices of active alerts as the health check, and a probe when there are none', async () => {
    const engine = make();
    await tick(engine);
    expect(quoteCalls.at(-1)).toEqual(['RELIANCE']);
    store = createMemoryAlertStore({ alerts: [{ id: 'a', symbol: 'TCS', type: 'above', status: 'active', threshold: 9999, lastPrice: 1500 }], events: [] });
    quoteCalls = [];
    await tick(make());
    expect(quoteCalls).toEqual([['TCS']]); // no extra probe call
  });

  it('can be turned off and its threshold changed, with bad values ignored', async () => {
    const engine = make();
    expect(engine.updateFeedSettings({ staleMinutes: 10 })).toEqual({ enabled: true, staleMinutes: 10 });
    expect(engine.updateFeedSettings({ staleMinutes: 0 })).toEqual({ enabled: true, staleMinutes: 10 });
    expect(engine.updateFeedSettings({ staleMinutes: 500 }).staleMinutes).toBe(10);
    expect(engine.updateFeedSettings({ staleMinutes: 2.5 }).staleMinutes).toBe(10);
    expect(engine.updateFeedSettings({ enabled: 'yes' }).enabled).toBe(true);
    mode = 'stale';
    expect(engine.updateFeedSettings({ enabled: false }).enabled).toBe(false);
    quoteCalls = [];
    for (let i = 0; i < 15; i++) await tick(engine);
    expect(engine.events()).toEqual([]);
    expect(quoteCalls).toEqual([]); // no probe when monitoring is off and there are no alerts
  });

  it('honours a longer threshold', async () => {
    const engine = make();
    engine.updateFeedSettings({ staleMinutes: 15 });
    mode = 'stale';
    await tick(engine, 1);
    await tick(engine, 10);
    expect(feedEvents(engine)).toHaveLength(0);
    await tick(engine, 6);
    expect(feedEvents(engine)).toHaveLength(1);
  });

  it('keeps the settings and the notices across a restart', async () => {
    const engine = make();
    engine.updateFeedSettings({ staleMinutes: 8, enabled: true });
    mode = 'stale';
    await tick(engine, 1);
    await tick(engine, 9);
    const again = make();
    expect(again.feedSettings()).toEqual({ enabled: true, staleMinutes: 8 });
    expect(feedEvents(again)).toHaveLength(1);
  });

  it('records a notice even when the push fails, and does not repeat it', async () => {
    const engine = make({ notifier: { channel: 'test', send: async () => { throw new Error('down'); } } });
    mode = 'stale';
    await tick(engine, 1);
    await tick(engine, 6);
    await tick(engine, 6);
    expect(feedEvents(engine)).toHaveLength(1);
    expect(feedEvents(engine)[0].delivery).toBe('failed');
  });

  it('records the notice with delivery "none" without a push channel', async () => {
    const engine = make({ notifier: null });
    mode = 'stale';
    await tick(engine, 1);
    await tick(engine, 6);
    expect(feedEvents(engine)[0].delivery).toBe('none');
  });
});

describe('broker session notices', () => {
  let clock;
  let open;
  let sent;
  let broker;
  const make = () => createAlertEngine({
    store: createMemoryAlertStore(),
    getQuotes: async (symbols) => symbols.map((symbol) => ({ symbol, price: 1, status: 'DELAYED' })),
    marketOpen: async () => open,
    notifier: { channel: 'test', send: async (m) => { sent.push(m); } },
    brokerStatus: () => broker,
    now: () => clock,
    newId: (() => { let n = 0; return () => `b${++n}`; })(),
    intervalMs: 0,
  });
  beforeEach(() => { clock = T0; open = true; sent = []; broker = { configured: true, connected: true }; });

  it('tells you when a signed-in session drops during market hours, once', async () => {
    const engine = make();
    await engine.check();
    broker = { configured: true, connected: false };
    await engine.check();
    await engine.check();
    const events = engine.events().filter((e) => e.kind === 'broker');
    expect(events).toHaveLength(1);
    expect(events[0].message).toMatch(/no longer connected/);
    expect(sent[0].title).toBe('StockPulse: ICICI Direct session ended');
  });

  it('does not announce an overnight expiry, being signed out at start-up, or an unconfigured broker', async () => {
    const engine = make();
    await engine.check();
    open = false;
    broker = { configured: true, connected: false };
    await engine.check(); // expiry noticed while closed: silent
    open = true;
    await engine.check();
    expect(engine.events()).toEqual([]);

    broker = { configured: false, connected: false };
    const other = make();
    await other.check();
    expect(other.events()).toEqual([]);
  });

  it('can be switched off with the feed alerts', async () => {
    const engine = make();
    engine.updateFeedSettings({ enabled: false });
    await engine.check();
    broker = { configured: true, connected: false };
    await engine.check();
    expect(engine.events()).toEqual([]);
  });

  it('survives a broker status that throws', async () => {
    const engine = createAlertEngine({ store: createMemoryAlertStore(), getQuotes: async () => [], marketOpen: async () => true, brokerStatus: () => { throw new Error('boom'); }, now: () => clock, intervalMs: 0 });
    await expect(engine.check()).resolves.toBeTruthy();
  });
});

describe('stored settings and notices', () => {
  it('validates feed settings', () => {
    expect(sanitizeFeedSettings(null)).toEqual({ enabled: true, staleMinutes: 5 });
    expect(sanitizeFeedSettings({ enabled: false, staleMinutes: 12 })).toEqual({ enabled: false, staleMinutes: 12 });
    expect(sanitizeFeedSettings({ enabled: 1, staleMinutes: '7' }, { enabled: false, staleMinutes: 9 })).toEqual({ enabled: false, staleMinutes: 7 });
    expect(sanitizeFeedSettings({ staleMinutes: -3 }).staleMinutes).toBe(5);
  });

  it('keeps well-formed feed and broker notices and drops malformed ones', () => {
    const state = parseState(JSON.stringify({
      alerts: [],
      events: [
        { id: 'a', kind: 'feed', at: '2026-10-12T05:00:00.000Z', message: 'Feed stale', delivery: 'sent' },
        { id: 'b', kind: 'broker', at: '2026-10-12T05:00:00.000Z', message: 'Session ended' },
        { id: 'c', kind: 'feed', at: '2026-10-12T05:00:00.000Z' },
        { id: 'd', kind: 'mystery', at: '2026-10-12T05:00:00.000Z', symbol: 'TCS', type: 'above', threshold: 1, price: 2 },
        { id: 'e', kind: 'feed', message: 'no time' },
      ],
      feed: { enabled: false, staleMinutes: 3 },
    }));
    expect(state.events.map((e) => [e.id, e.kind])).toEqual([['a', 'feed'], ['b', 'broker'], ['d', 'price']]);
    expect(state.feed).toEqual({ enabled: false, staleMinutes: 3 });
  });
});
