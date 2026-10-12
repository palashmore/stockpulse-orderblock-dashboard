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

const cleanEvent = (raw) => {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || typeof raw.symbol !== 'string') return null;
  if (!isNum(raw.price) || !isNum(raw.threshold) || typeof raw.at !== 'string') return null;
  return {
    id: raw.id,
    alertId: typeof raw.alertId === 'string' ? raw.alertId : null,
    symbol: raw.symbol,
    type: raw.type === 'below' ? 'below' : 'above',
    threshold: raw.threshold,
    price: raw.price,
    at: raw.at,
    status: typeof raw.status === 'string' ? raw.status : null,
    delivery: typeof raw.delivery === 'string' ? raw.delivery : 'none',
  };
};

/** Parse stored JSON text; corrupt or missing data gives an empty state, never an exception. */
export function parseState(text) {
  try {
    const parsed = JSON.parse(text);
    return {
      alerts: loadAlerts({ getItem: () => JSON.stringify(parsed?.alerts ?? []) }),
      events: (Array.isArray(parsed?.events) ? parsed.events : []).map(cleanEvent).filter(Boolean).slice(0, MAX_EVENTS),
    };
  } catch {
    return { alerts: [], events: [] };
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
        return { alerts: [], events: [] };
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
  const topic = (env.NTFY_TOPIC || '').trim();
  if (!topic) return { channel: 'none', send: null, error: null };
  const server = (env.NTFY_SERVER || 'https://ntfy.sh').trim().replace(/\/$/, '');
  if (!NTFY_TOPIC.test(topic)) return { channel: 'none', send: null, error: 'NTFY_TOPIC must be 8-64 letters, digits, "-" or "_"' };
  if (!/^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(server) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(server)) {
    return { channel: 'none', send: null, error: 'NTFY_SERVER must be an https:// address' };
  }
  return {
    channel: 'ntfy',
    error: null,
    async send({ title, message }) {
      const response = await fetchFn(`${server}/${topic}`, {
        method: 'POST',
        // Header values must be plain ASCII; the body carries the details
        headers: { Title: String(title).replace(/[^\x20-\x7e]/g, '?'), Tags: 'chart_with_upwards_trend' },
        body: message,
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`ntfy answered HTTP ${response.status}`);
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
 */
export function createAlertEngine({
  store,
  getQuotes,
  marketOpen,
  isValidSymbol = (s) => /^[A-Z0-9&-]{1,20}$/.test(s),
  notifier = null,
  now = Date.now,
  newId = randomUUID,
  intervalMs = 60_000,
}) {
  let { alerts, events } = store.load();
  let timer = null;
  let checking = null;
  const state = { lastCheckAt: null, outcome: 'not-run-yet', detail: null, saveFailed: false };

  const persist = () => { state.saveFailed = !store.save({ alerts, events }); };
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

  async function runCheck() {
    const finish = (outcome, detail = null) => {
      state.lastCheckAt = iso();
      state.outcome = outcome;
      state.detail = detail;
      return { outcome, detail, fired: [] };
    };

    const symbols = [...new Set(alerts.filter((a) => a.status === 'active').map((a) => a.symbol))];
    if (symbols.length === 0) return finish('no-active-alerts');
    let open = false;
    try { open = await marketOpen(); } catch { open = false; }
    if (!open) return finish('market-closed');

    let quotes;
    try {
      quotes = await getQuotes(symbols);
    } catch (error) {
      return finish('data-unavailable', error.message);
    }
    const usable = (quotes || []).filter((q) => isNum(q.price) && isEvaluableStatus(q.status));
    if (usable.length === 0) {
      const seen = [...new Set((quotes || []).map((q) => q.status))].join(', ');
      return finish('data-not-live', seen ? `Quotes were ${seen}` : 'No quotes returned');
    }

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
    status: () => ({
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
