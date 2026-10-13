import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createAlert, evaluateAlerts, pauseAlert, activateAlert, isEvaluableStatus, describeAlert, MAX_ALERTS } from '../src/data/alerts.js';
import { loadAlerts } from '../src/data/alertStore.js';

/**
 * Server-side price alerts. They are kept in a file on this machine and checked on a timer by the
 * server, so they keep working with the browser closed (as long as the server process is running).
 *
 * Rules (the crossing logic itself is shared with the browser: src/data/alerts.js)
 * - Checked only while the market is open, and only against quotes labelled LIVE or DELAYED.
 *   STALE, historical, simulated or unavailable data never fires an alert.
 * - An alert fires once and is saved as TRIGGERED *before* any notification is attempted, so a
 *   failed notification can never cause it to fire again.
 * - Nothing here places or modifies an order. An alert is a price level being reached, not advice.
 */
export const MAX_EVENTS = 200;
const BASELINE_STATUSES = new Set(['LIVE', 'DELAYED', 'MARKET_CLOSED']);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// ---------- storage ----------

export const DEFAULT_FEED_SETTINGS = { enabled: true, staleMinutes: 5 };
const EVENT_KINDS = ['price', 'feed', 'broker'];

/** Validate feed-alert settings (stored data or a request body); unknown or invalid fields keep their current value. */
export function sanitizeFeedSettings(raw, current = DEFAULT_FEED_SETTINGS) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const minutes = Number(r.staleMinutes);
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : current.enabled,
    staleMinutes: Number.isInteger(minutes) && minutes >= 1 && minutes <= 120 ? minutes : current.staleMinutes,
  };
}

const cleanEvent = (raw) => {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || typeof raw.at !== 'string') return null;
  const kind = EVENT_KINDS.includes(raw.kind) ? raw.kind : 'price';
  const common = {
    id: raw.id,
    kind,
    at: raw.at,
    delivery: typeof raw.delivery === 'string' ? raw.delivery : 'none',
  };
  if (kind !== 'price') {
    // feed and broker notices carry a sentence instead of a price level
    return typeof raw.message === 'string' && raw.message !== '' ? { ...common, message: raw.message.slice(0, 300) } : null;
  }
  if (typeof raw.symbol !== 'string' || !isNum(raw.price) || !isNum(raw.threshold)) return null;
  return {
    ...common,
    alertId: typeof raw.alertId === 'string' ? raw.alertId : null,
    symbol: raw.symbol,
    type: raw.type === 'below' ? 'below' : 'above',
    threshold: raw.threshold,
    price: raw.price,
    status: typeof raw.status === 'string' ? raw.status : null,
  };
};

/** Parse stored JSON text; corrupt or missing data gives an empty state, never an exception. */
export function parseState(text) {
  try {
    const parsed = JSON.parse(text);
    return {
      alerts: loadAlerts({ getItem: () => JSON.stringify(parsed?.alerts ?? []) }),
      events: (Array.isArray(parsed?.events) ? parsed.events : []).map(cleanEvent).filter(Boolean).slice(0, MAX_EVENTS),
      feed: sanitizeFeedSettings(parsed?.feed),
    };
  } catch {
    return { alerts: [], events: [], feed: { ...DEFAULT_FEED_SETTINGS } };
  }
}

/** Alerts and events kept in memory only (tests, and the default when no file is configured). */
export function createMemoryAlertStore(initial = null) {
  let text = initial ? JSON.stringify(initial) : null;
  return {
    load: () => parseState(text),
    save: (state) => { text = JSON.stringify(state); return true; },
  };
}

/** Alerts and events in one JSON file, written atomically (temp file, then rename). */
export function createFileAlertStore(file) {
  return {
    load() {
      try {
        return parseState(fs.readFileSync(file, 'utf8'));
      } catch {
        return parseState(null);
      }
    },
    save(state) {
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const tmp = `${file}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
        fs.renameSync(tmp, file);
        return true;
      } catch (error) {
        console.error('Could not save alerts:', error.message);
        return false;
      }
    },
  };
}

// ---------- notifications (optional, off unless configured) ----------

const NTFY_TOPIC = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Phone/desktop push through ntfy (free, open source; https://ntfy.sh or your own server).
 * Configure with NTFY_TOPIC (and optionally NTFY_SERVER) in .env. The alert text (symbol, level,
 * price) is sent to that topic, so use a long random topic name: anyone who knows it can read it.
 * Returns { channel, send, error }: `send` is null when nothing is configured or the config is invalid.
 */
export function createNotifier(env = {}, fetchFn = fetch) {
  const dispatchers = [];
  const errors = [];
  const channels = [];

  // 1. ntfy
  const topic = (env.NTFY_TOPIC || '').trim();
  const server = (env.NTFY_SERVER || 'https://ntfy.sh').trim().replace(/\/$/, '');
  if (topic) {
    if (!NTFY_TOPIC.test(topic)) {
      errors.push('NTFY_TOPIC must be 8-64 letters, digits, "-" or "_"');
    } else if (!/^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(server) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(server)) {
      errors.push('NTFY_SERVER must be an https:// address');
    } else {
      channels.push('ntfy');
      dispatchers.push(async ({ title, message }) => {
        const response = await fetchFn(`${server}/${topic}`, {
          method: 'POST',
          headers: { Title: String(title).replace(/[^\x20-\x7e]/g, '?'), Tags: 'chart_with_upwards_trend' },
          body: message,
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error(`ntfy answered HTTP ${response.status}`);
      });
    }
  }

  // 2. Telegram Bot API
  const tgToken = (env.TELEGRAM_BOT_TOKEN || '').trim();
  const tgChatId = (env.TELEGRAM_CHAT_ID || '').trim();
  if (tgToken && tgChatId) {
    channels.push('telegram');
    dispatchers.push(async ({ title, message }) => {
      const url = `https://api.telegram.org/bot${tgToken}/sendMessage`;
      const response = await fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: tgChatId, text: `📈 *${title}*\n\n${message}`, parse_mode: 'Markdown' }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`Telegram answered HTTP ${response.status}`);
    });
  }

  // 3. Discord Webhook
  const discordUrl = (env.DISCORD_WEBHOOK_URL || '').trim();
  if (discordUrl) {
    if (!/^https:\/\/discord(app)?\.com\/api\/webhooks\//.test(discordUrl)) {
      errors.push('DISCORD_WEBHOOK_URL must be a valid Discord webhook URL');
    } else {
      channels.push('discord');
      dispatchers.push(async ({ title, message }) => {
        const response = await fetchFn(discordUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            embeds: [{
              title: String(title),
              description: String(message),
              color: 0x00e676,
              timestamp: new Date().toISOString(),
            }],
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error(`Discord answered HTTP ${response.status}`);
      });
    }
  }

  // 4. Twilio SMS
  const twilioSid = (env.TWILIO_ACCOUNT_SID || '').trim();
  const twilioToken = (env.TWILIO_AUTH_TOKEN || '').trim();
  const twilioTo = (env.TWILIO_TO_NUMBER || '').trim();
  const twilioFrom = (env.TWILIO_FROM_NUMBER || '').trim();
  if (twilioSid && twilioToken && twilioTo && twilioFrom) {
    channels.push('twilio');
    dispatchers.push(async ({ title, message }) => {
      const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
      const body = new URLSearchParams({ From: twilioFrom, To: twilioTo, Body: `${title}: ${message}` }).toString();
      const response = await fetchFn(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`Twilio answered HTTP ${response.status}`);
    });
  }

  // 5. Generic Custom Webhook
  const customWebhook = (env.GENERIC_WEBHOOK_URL || '').trim();
  if (customWebhook) {
    channels.push('webhook');
    dispatchers.push(async ({ title, message }) => {
      const response = await fetchFn(customWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, message, timestamp: new Date().toISOString() }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`Webhook answered HTTP ${response.status}`);
    });
  }

  if (dispatchers.length === 0) {
    return {
      channel: 'none',
      send: null,
      error: errors.length ? errors.join('; ') : null,
    };
  }

  const primaryChannel = channels.join(', ');
  return {
    channel: primaryChannel,
    channels,
    error: errors.length ? errors.join('; ') : null,
    async send(payload) {
      const settled = await Promise.allSettled(dispatchers.map((d) => d(payload)));
      const rejections = settled.filter((s) => s.status === 'rejected');
      if (rejections.length === dispatchers.length) {
        throw new Error(rejections[0].reason?.message || 'All notification channels failed');
      }
    },
  };
}

// ---------- engine ----------

const inr = (n) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * @param store      { load(): {alerts, events}, save(state): boolean }
 * @param getQuotes  async (symbols) => [{ symbol, price, status, provider, asOf }]; may throw
 * @param marketOpen async () => boolean
 * @param notifier   { channel, send } from createNotifier, or null
 * @param brokerStatus () => { configured, connected }: lets the engine notice a signed-in broker session dropping
 * @param probeSymbol a liquid symbol used to check the price feed when there are no price alerts to evaluate
 */
export function createAlertEngine({
  store,
  getQuotes,
  marketOpen,
  isValidSymbol = (s) => /^[A-Z0-9&-]{1,20}$/.test(s),
  notifier = null,
  brokerStatus = null,
  probeSymbol = 'RELIANCE',
  now = Date.now,
  newId = randomUUID,
  intervalMs = 60_000,
}) {
  let { alerts, events, feed: feedSettings } = store.load();
  feedSettings = sanitizeFeedSettings(feedSettings);
  const feedWatch = { since: null, alertedAt: null }; // when the feed went bad, and when the user was told
  let brokerWasConnected = null;
  let timer = null;
  let checking = null;
  const state = { lastCheckAt: null, outcome: 'not-run-yet', detail: null, saveFailed: false };

  const persist = () => { state.saveFailed = !store.save({ alerts, events, feed: feedSettings }); };
  const iso = () => new Date(now()).toISOString();

  const baselineQuote = async (symbol) => {
    const quotes = await getQuotes([symbol]);
    const q = (quotes || []).find((x) => x.symbol === symbol);
    return q && isNum(q.price) && BASELINE_STATUSES.has(q.status) ? q : null;
  };

  async function add({ symbol, type, threshold }) {
    if (alerts.length >= MAX_ALERTS) return { error: `You can keep up to ${MAX_ALERTS} alerts` };
    const sym = typeof symbol === 'string' ? symbol.trim().toUpperCase() : '';
    if (!isValidSymbol(sym)) return { error: 'Choose a valid stock symbol' };
    let quote = null;
    try { quote = await baselineQuote(sym); } catch { /* reported below */ }
    if (!quote) return { error: `No reliable current price for ${sym} right now, so the alert was not created` };
    const result = createAlert({ symbol: sym, type, threshold }, quote.price, { id: newId(), now: iso() });
    if (result.alert) {
      alerts = [result.alert, ...alerts];
      persist();
    }
    return result;
  }

  const mapAlert = (id, fn) => {
    if (!alerts.some((a) => a.id === id)) return false;
    alerts = alerts.map((a) => (a.id === id ? fn(a) : a));
    persist();
    return true;
  };
  const remove = (id) => {
    if (!alerts.some((a) => a.id === id)) return false;
    alerts = alerts.filter((a) => a.id !== id);
    persist();
    return true;
  };

  /** Take over alerts saved in a browser. Existing ids are skipped; levels re-baseline on the next check. */
  function importAlerts(list) {
    const incoming = loadAlerts({ getItem: () => JSON.stringify(Array.isArray(list) ? list : []) });
    const have = new Set(alerts.map((a) => a.id));
    let added = 0;
    for (const a of incoming) {
      if (have.has(a.id) || alerts.length >= MAX_ALERTS) continue;
      alerts = [{ ...a, lastPrice: null }, ...alerts];
      have.add(a.id);
      added += 1;
    }
    if (added) persist();
    return { added, skipped: incoming.length - added };
  }

  async function deliver(event) {
    if (!notifier?.send) return 'none';
    try {
      await notifier.send({
        title: `${event.symbol} alert`,
        message: `${describeAlert(event)}. Last price ${inr(event.price)} (${event.status ?? 'data'}). A price level was reached; this is not advice.`,
      });
      return 'sent';
    } catch (error) {
      console.error('Alert notification failed:', error.message);
      return 'failed';
    }
  }

  /** A feed or broker notice: saved as an event first, then pushed. */
  async function notice(kind, title, message) {
    const event = { id: newId(), kind, at: iso(), message, delivery: 'pending' };
    events = [event, ...events].slice(0, MAX_EVENTS);
    persist();
    if (!notifier?.send) {
      event.delivery = 'none';
    } else {
      try {
        await notifier.send({ title, message });
        event.delivery = 'sent';
      } catch (error) {
        console.error('Notice delivery failed:', error.message);
        event.delivery = 'failed';
      }
    }
    persist();
    return event;
  }

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  /**
   * Watches whether usable (LIVE or DELAYED) prices keep arriving while the market is open. When they have been
   * missing for the configured time it raises one notice, and one more when they return. Nothing is said while the
   * market is closed (no prices are expected then), and the timers restart each session.
   */
  async function observeFeed(open, healthy, detail = null) {
    if (!feedSettings.enabled || !open) {
      feedWatch.since = null;
      feedWatch.alertedAt = null;
      return;
    }
    const t = now();
    if (healthy) {
      if (feedWatch.alertedAt !== null) {
        const minutes = Math.max(1, Math.round((t - feedWatch.since) / 60000));
        feedWatch.since = null;
        feedWatch.alertedAt = null;
        await notice('feed', 'StockPulse: price feed is back', `The price feed is back after about ${plural(minutes, 'minute')}. Price alerts are being checked again.`);
      }
      feedWatch.since = null;
      return;
    }
    if (feedWatch.since === null) feedWatch.since = t;
    if (feedWatch.alertedAt === null && t - feedWatch.since >= feedSettings.staleMinutes * 60000) {
      feedWatch.alertedAt = t;
      const minutes = Math.max(1, Math.round((t - feedWatch.since) / 60000));
      await notice('feed', 'StockPulse: price feed is stale', `No live or delayed prices for about ${plural(minutes, 'minute')} while the market is open${detail ? ` (${detail})` : ''}. Price alerts cannot fire until it recovers.`);
    }
  }

  /** Tells the user when a signed-in broker session drops during market hours (overnight expiry is normal and silent). */
  async function observeBroker(open) {
    if (!brokerStatus) return;
    let b = null;
    try { b = brokerStatus(); } catch { return; }
    if (!b?.configured) {
      brokerWasConnected = null;
      return;
    }
    const was = brokerWasConnected;
    brokerWasConnected = Boolean(b.connected);
    if (open && feedSettings.enabled && was === true && !b.connected) {
      await notice('broker', 'StockPulse: ICICI Direct session ended', 'Your ICICI Direct session is no longer connected. Prices fall back to the delayed Yahoo feed until you sign in again in Settings.');
    }
  }

  async function runCheck() {
    const finish = (outcome, detail = null) => {
      state.lastCheckAt = iso();
      state.outcome = outcome;
      state.detail = detail;
      return { outcome, detail, fired: [] };
    };

    let open = false;
    try { open = await marketOpen(); } catch { open = false; }
    await observeBroker(open);

    const symbols = [...new Set(alerts.filter((a) => a.status === 'active').map((a) => a.symbol))];
    if (!open) {
      await observeFeed(false, false);
      return finish(symbols.length === 0 ? 'no-active-alerts' : 'market-closed');
    }
    if (symbols.length === 0) {
      // Nothing to evaluate, but the feed is still worth watching: one cheap look at a liquid stock
      if (feedSettings.enabled) {
        try {
          const probe = await getQuotes([probeSymbol]);
          await observeFeed(true, (probe || []).some((q) => isNum(q.price) && isEvaluableStatus(q.status)), 'no usable quote');
        } catch (error) {
          await observeFeed(true, false, error.message);
        }
      }
      return finish('no-active-alerts');
    }

    let quotes;
    try {
      quotes = await getQuotes(symbols);
    } catch (error) {
      await observeFeed(true, false, error.message);
      return finish('data-unavailable', error.message);
    }
    const usable = (quotes || []).filter((q) => isNum(q.price) && isEvaluableStatus(q.status));
    if (usable.length === 0) {
      const seen = [...new Set((quotes || []).map((q) => q.status))].join(', ');
      await observeFeed(true, false, seen ? `quotes were ${seen}` : 'no quotes returned');
      return finish('data-not-live', seen ? `Quotes were ${seen}` : 'No quotes returned');
    }
    await observeFeed(true, true);

    // Read the alert list after the await so edits made while quotes were loading are kept
    const nowIso = iso();
    const result = evaluateAlerts(alerts, usable, nowIso);
    const statusOf = new Map(usable.map((q) => [q.symbol, q.status]));
    const fresh = result.fired.map((f) => ({
      id: newId(),
      alertId: f.id,
      symbol: f.symbol,
      type: f.type,
      threshold: f.threshold,
      price: f.price,
      at: nowIso,
      status: statusOf.get(f.symbol) ?? null,
      delivery: 'pending',
    }));
    if (result.changed) {
      alerts = result.alerts;
      events = [...fresh, ...events].slice(0, MAX_EVENTS);
      persist(); // triggered state is saved before any notification is attempted
    }
    for (const event of fresh) event.delivery = await deliver(event);
    if (fresh.length) persist();
    const out = finish('ok', `${usable.length} of ${symbols.length} symbols checked`);
    out.fired = fresh;
    return out;
  }

  /** One check now. Overlapping calls share the check that is already running. */
  function check() {
    if (!checking) checking = runCheck().finally(() => { checking = null; });
    return checking;
  }

  return {
    list: () => alerts,
    events: () => events,
    add,
    remove,
    pause: (id) => mapAlert(id, pauseAlert),
    activate: (id) => mapAlert(id, activateAlert),
    importAlerts,
    check,
    async sendTest() {
      if (!notifier?.send) return { ok: false, error: 'No push channel is configured (set NTFY_TOPIC in .env)' };
      try {
        await notifier.send({ title: 'StockPulse test', message: 'Test notification from StockPulse. Alerts will arrive here.' });
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    },
    feedSettings: () => ({ ...feedSettings }),
    updateFeedSettings(raw) {
      feedSettings = sanitizeFeedSettings(raw, feedSettings);
      if (!feedSettings.enabled) { feedWatch.since = null; feedWatch.alertedAt = null; }
      persist();
      return { ...feedSettings };
    },
    status: () => ({
      feed: {
        ...feedSettings,
        unhealthyMinutes: feedWatch.since === null ? 0 : Math.round((now() - feedWatch.since) / 60000),
        alerted: feedWatch.alertedAt !== null,
      },
      running: timer !== null,
      intervalSec: Math.round(intervalMs / 1000),
      channel: notifier?.channel ?? 'none',
      channelError: notifier?.error ?? null,
      lastCheckAt: state.lastCheckAt,
      outcome: state.outcome,
      detail: state.detail,
      saveFailed: state.saveFailed,
    }),
    start() {
      if (timer || intervalMs <= 0) return;
      timer = setInterval(() => { check().catch(() => {}); }, intervalMs);
      timer.unref?.();
      check().catch(() => {});
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
