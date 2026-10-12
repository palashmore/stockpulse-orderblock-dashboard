import { io as socketIo } from 'socket.io-client';
import { parseBreezeTime } from './breeze.js';

// Live tick feed from ICICI Direct Breeze (Socket.IO). One connection, shared by every client of
// this server. Wire format and subscription calls follow ICICI's published Breeze SDK:
//   connect to https://livestream.icicidirect.com with auth { user, token }, websocket transport
//   emit('join', '4.1!<token>')  -> quotes for an NSE instrument; '4.2!<token>' -> market depth
//   on('stock', data): quotes are a 21-element array, depth is [symbol, epochSeconds, levels[]]
// The exchange's last-trade time (`ltt`) arrives as epoch seconds. Its exact epoch has not yet been
// confirmed against a live session, so every tick records how far that time is from our own clock
// and `lttTrusted` says whether it landed in a believable range. LIVE is only ever claimed from a
// trusted timestamp.
export const STREAM_URL = 'https://livestream.icicidirect.com';
export const EXCHANGE_NSE = '4';
export const LTT_TRUST_WINDOW_MS = 10 * 60 * 1000;

const num = (v) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/** Subscription key for an exchange token: '4.1!2885' (quotes) or '4.2!2885' (depth). */
export const quoteKey = (token) => `${EXCHANGE_NSE}.1!${token}`;
export const depthKey = (token) => `${EXCHANGE_NSE}.2!${token}`;

/**
 * Parse one quote message (21-element array) into named fields. Returns null for anything that is
 * not a recognisable NSE equity quote, so a changed format is rejected rather than half-read.
 */
export function parseQuote(data, nowMs) {
  if (!Array.isArray(data) || data.length !== 21 || typeof data[0] !== 'string' || !/^\d+\.1!\d+$/.test(data[0])) return null;
  const last = num(data[2]);
  if (last === null || last <= 0) return null;
  const epoch = num(data[19]);
  const lttMs = epoch === null ? null : epoch * 1000;
  return {
    key: data[0],
    token: data[0].split('!')[1],
    open: num(data[1]),
    last,
    high: num(data[3]),
    low: num(data[4]),
    change: num(data[5]),
    bestBid: num(data[6]),
    bestBidQty: num(data[7]),
    bestAsk: num(data[8]),
    bestAskQty: num(data[9]),
    lastQty: num(data[10]),
    avgPrice: num(data[11]),
    totalQty: num(data[12]),
    lowerCircuit: num(data[17]),
    upperCircuit: num(data[18]),
    close: num(data[20]),
    lttMs,
    lttOffsetMs: lttMs === null ? null : nowMs - lttMs,
    lttTrusted: lttMs !== null && Math.abs(nowMs - lttMs) <= LTT_TRUST_WINDOW_MS,
    receivedAt: nowMs,
  };
}

/** Parse a depth message into bid/ask levels. NSE levels carry 8 fields each. */
export function parseDepth(data, nowMs) {
  if (!Array.isArray(data) || typeof data[0] !== 'string' || !/^\d+\.2!\d+$/.test(data[0]) || !Array.isArray(data[2])) return null;
  const levels = [];
  for (const row of data[2]) {
    if (!Array.isArray(row) || row.length < 8) continue;
    levels.push({
      bidPrice: num(row[0]),
      bidQty: num(row[1]),
      bidOrders: num(row[2]),
      askPrice: num(row[4]),
      askQty: num(row[5]),
      askOrders: num(row[6]),
    });
  }
  if (levels.length === 0) return null;
  return { key: data[0], token: data[0].split('!')[1], levels, receivedAt: nowMs };
}

/**
 * The hub. `ioFactory` and `now` are injectable so reconnects and parsing are tested without a network.
 * Subscriptions are a set: asking for the same key twice never sends a second join, and after a
 * reconnect every wanted key is re-joined exactly once.
 */
export function createStreamHub({ ioFactory = socketIo, now = Date.now, url = STREAM_URL, maxEvents = 50 } = {}) {
  let socket = null;
  let state = 'stopped'; // stopped | connecting | connected | error
  const wanted = new Set();
  const joined = new Set();
  const quotes = new Map();
  const depths = new Map();
  const listeners = new Set();
  const stats = {
    connectedAt: null, connects: 0, disconnects: 0, joinEmits: 0, ticks: 0, depthTicks: 0, rejected: 0,
    lastTickAt: null, lastError: null, lastDisconnectReason: null,
  };
  const events = [];
  const note = (message) => {
    events.push({ at: new Date(now()).toISOString(), message });
    if (events.length > maxEvents) events.shift();
  };

  function joinPending() {
    if (!socket || state !== 'connected') return;
    const pending = [...wanted].filter((k) => !joined.has(k));
    if (pending.length === 0) return;
    socket.emit('join', pending);
    pending.forEach((k) => joined.add(k));
    stats.joinEmits++;
  }

  function onStock(data) {
    const t = now();
    const q = parseQuote(data, t);
    if (q) {
      quotes.set(q.token, q);
      stats.ticks++;
      stats.lastTickAt = t;
      listeners.forEach((fn) => fn({ type: 'quote', quote: q }));
      return;
    }
    const d = parseDepth(data, t);
    if (d) {
      depths.set(d.token, d);
      stats.depthTicks++;
      stats.lastTickAt = t;
      listeners.forEach((fn) => fn({ type: 'depth', depth: d }));
      return;
    }
    stats.rejected++; // unknown or malformed message: counted, never half-parsed
  }

  return {
    /** Open the connection with the session credentials. Safe to call again: it restarts cleanly. */
    start(auth) {
      this.stop();
      if (!auth?.user || !auth?.token) return;
      state = 'connecting';
      socket = ioFactory(url, {
        auth: { user: auth.user, token: auth.token },
        transports: ['websocket'],
        extraHeaders: { 'User-Agent': 'Mozilla/5.0' },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
        timeout: 10000,
      });
      socket.on('connect', () => {
        state = 'connected';
        stats.connects++;
        stats.connectedAt = now();
        joined.clear(); // a new connection holds no subscriptions: re-join everything wanted, once
        note(stats.connects > 1 ? 'reconnected' : 'connected');
        joinPending();
      });
      socket.on('disconnect', (reason) => {
        state = 'connecting';
        stats.disconnects++;
        stats.lastDisconnectReason = String(reason);
        joined.clear();
        note(`disconnected: ${reason}`);
      });
      socket.on('connect_error', (error) => {
        state = 'error';
        stats.lastError = String(error?.message ?? error);
        note(`connect error: ${stats.lastError}`);
      });
      socket.on('stock', onStock);
    },

    stop() {
      if (socket) {
        socket.removeAllListeners();
        socket.close();
      }
      socket = null;
      state = 'stopped';
      joined.clear();
      wanted.clear();
      quotes.clear();
      depths.clear();
    },

    /** Subscribe to keys (e.g. quoteKey('2885')). Idempotent. */
    subscribe(keys) {
      for (const k of [].concat(keys)) wanted.add(k);
      joinPending();
    },

    unsubscribe(keys) {
      const list = [].concat(keys).filter((k) => wanted.has(k));
      list.forEach((k) => { wanted.delete(k); joined.delete(k); });
      if (list.length && socket && state === 'connected') socket.emit('leave', list);
    },

    isSubscribed: (key) => wanted.has(key),
    isConnected: () => state === 'connected',
    state: () => state,
    getQuote: (token) => quotes.get(token) ?? null,
    getDepth: (token) => depths.get(token) ?? null,
    onTick(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** Health for the diagnostics page. */
    health() {
      const t = now();
      return {
        state,
        subscriptions: wanted.size,
        joined: joined.size,
        connectedAt: stats.connectedAt ? new Date(stats.connectedAt).toISOString() : null,
        connects: stats.connects,
        disconnects: stats.disconnects,
        joinEmits: stats.joinEmits,
        ticks: stats.ticks,
        depthTicks: stats.depthTicks,
        rejectedMessages: stats.rejected,
        lastTickAgeSec: stats.lastTickAt ? Math.round((t - stats.lastTickAt) / 1000) : null,
        lastError: stats.lastError,
        lastDisconnectReason: stats.lastDisconnectReason,
        recentEvents: events.slice(-10),
      };
    },
  };
}

export { parseBreezeTime };
