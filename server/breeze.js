import { createHash } from 'node:crypto';
import https from 'node:https';
import { BREEZE_STOCK_CODES } from './breezeCodes.js';

// ICICI Direct Breeze API client (read-only market data: quotes and historical candles).
// Request/response shapes follow ICICI's published Breeze HTTP API documentation and are covered
// by mocked tests only; they have not been run against the live service.
const HOST = 'api.icicidirect.com';
const BASE_PATH = '/breezeapi/api/v1';
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// The v1 historical endpoint rejects the '1minute'/'1day' spellings shown in the docs and asks for
// 'minute', '5minute', '30minute' or 'day' (its own error message, seen on the live service).
export const BREEZE_INTERVALS = { '1m': 'minute', '5m': '5minute', '30m': '30minute', '1d': 'day' };

/** Breeze stock code for an NSE symbol, or null when the symbol is not mapped. */
export function breezeCodeFor(symbol) {
  return BREEZE_STOCK_CODES[symbol] || null;
}

export function loginUrl(appKey) {
  return `https://${HOST}/apiuser/login?api_key=${encodeURIComponent(appKey)}`;
}

/** Pull the session value out of whatever the user pasted: the redirect URL, `apisession=...`, or the bare value. */
export function extractSessionToken(input) {
  const text = String(input || '').trim();
  if (!text) return null;
  const param = /[?&#]?(?:api_?session)=([^&#\s]+)/i.exec(text);
  if (param) return decodeURIComponent(param[1]);
  return /^[A-Za-z0-9+/=_-]{4,}$/.test(text) ? text : null;
}

/** SHA-256 checksum Breeze expects: hex(sha256(timestamp + body + secret)). */
export function computeChecksum(timestamp, body, secret) {
  return createHash('sha256').update(timestamp + body + secret).digest('hex');
}

/** UTC timestamp with zero milliseconds, as Breeze requires: 2025-02-03T09:20:56.000Z. */
export function breezeTimestamp(nowMs) {
  return `${new Date(nowMs).toISOString().slice(0, 19)}.000Z`;
}

/** Date formatted as IST wall-clock time labelled Z, the form used in Breeze's request examples. */
export function istWallClock(ms) {
  return `${new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 19)}.000Z`;
}

/** Real transport. Breeze uses GET requests that carry a JSON body, which fetch() forbids. */
export function httpsRequest({ method, path, headers, body }) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { host: HOST, method, path, headers: { ...headers, 'Content-Length': Buffer.byteLength(body) }, timeout: 10000 },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try { json = JSON.parse(text); } catch { /* non-JSON error page */ }
          resolve({ status: res.statusCode, json, text });
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('Breeze request timed out')));
    req.on('error', reject);
    req.end(body);
  });
}

const num = (v) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

const MONTH_INDEX = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/**
 * Parse a Breeze timestamp as IST wall-clock into epoch ms, or null. Formats seen in ICICI's docs:
 *   "2025-02-03 09:21:00" / ISO            (historical candles)
 *   "05-Feb-2025 10:41:24"                  (trade times)
 *   "Tue Mar 11 09:38:22 2025"              (live-feed last-trade time, Python %c)
 */
export function parseBreezeTime(text) {
  const value = String(text || '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}):(\d{2}))?/.exec(value);
  if (m) {
    const [, y, mo, d, hh = '0', mm = '0', ss = '0'] = m;
    return Date.UTC(+y, +mo - 1, +d, +hh, +mm, +ss) - IST_OFFSET_MS;
  }
  m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/.exec(value);
  if (m && MONTH_INDEX[m[2].toLowerCase()] !== undefined) {
    const [, d, mon, y, hh = '0', mm = '0', ss = '0'] = m;
    return Date.UTC(+y, MONTH_INDEX[mon.toLowerCase()], +d, +hh, +mm, +ss) - IST_OFFSET_MS;
  }
  m = /^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+(\d{4})$/.exec(value);
  if (m && MONTH_INDEX[m[1].toLowerCase()] !== undefined) {
    const [, mon, d, hh, mm, ss, y] = m;
    return Date.UTC(+y, MONTH_INDEX[mon.toLowerCase()], +d, +hh, +mm, +ss) - IST_OFFSET_MS;
  }
  return null;
}

/** Map a Breeze quote row to the app's quote shape. Returns null when there is no usable price. */
export function mapQuote(row, symbol) {
  const price = num(row?.ltp);
  if (price === null) return null;
  const previousClose = num(row.previous_close);
  // Breeze's ltp_percent_change comes back unsigned on the live service (a falling stock showed a
  // positive value), so the change is derived from price and previous close when both are known.
  const changePct = previousClose > 0 ? ((price - previousClose) / previousClose) * 100 : num(row.ltp_percent_change);
  return {
    symbol,
    name: symbol,
    price,
    previousClose,
    open: num(row.open),
    high: num(row.high),
    low: num(row.low),
    close: price,
    change: previousClose === null ? null : price - previousClose,
    changePct,
    volume: num(row.total_quantity_traded),
    exchange: 'NSE',
    currency: 'INR',
    lastTradeTime: row.ltt ?? null,
  };
}

/**
 * Map Breeze candles to the app's candle shape and apply the same validation as the Yahoo path.
 * Intraday candles use exchange wall-clock epoch seconds; daily candles use the calendar date.
 */
export function mapCandles(rows, intraday) {
  const out = [];
  let last = null;
  for (const r of rows || []) {
    const open = num(r.open);
    const high = num(r.high);
    const low = num(r.low);
    const close = num(r.close);
    if ([open, high, low, close].some((v) => v === null)) continue;
    if (!(low > 0 && high >= low && high >= Math.max(open, close) && low <= Math.min(open, close))) continue;
    const ms = parseBreezeTime(r.datetime);
    if (ms === null) continue;
    const time = intraday ? Math.floor((ms + IST_OFFSET_MS) / 1000) : new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
    if (last !== null && time <= last) continue;
    last = time;
    const volume = num(r.volume);
    out.push({ time, open, high, low, close, volume, adjClose: null });
  }
  return out;
}

/**
 * `request` and `now` are injectable for tests. The session lives in memory only: it is set by
 * connect() after the user signs in, and is cleared when the provider rejects it.
 */
/**
 * Request budget for ICICI's documented limits (100 calls/minute, 5,000/day), kept below the caps
 * so a burst cannot get the key throttled. The day rolls over at IST midnight.
 */
export function createBudget({ perMinute = 90, perDay = 4500, now = Date.now } = {}) {
  let recent = [];
  let day = '';
  let used = 0;
  const istDay = () => new Date(now() + IST_OFFSET_MS).toISOString().slice(0, 10);

  return {
    /** Reserve one call. Returns false (and reserves nothing) when a limit would be exceeded. */
    take() {
      const t = now();
      const today = istDay();
      if (today !== day) { day = today; used = 0; }
      recent = recent.filter((x) => t - x < 60000);
      if (recent.length >= perMinute || used >= perDay) return false;
      recent.push(t);
      used++;
      return true;
    },
    stats() {
      const t = now();
      if (istDay() !== day) { day = istDay(); used = 0; }
      recent = recent.filter((x) => t - x < 60000);
      return { minuteUsed: recent.length, minuteLimit: perMinute, dayUsed: used, dayLimit: perDay };
    },
  };
}

export function createBreezeClient({ appKey, secret, request = httpsRequest, now = Date.now, budget = createBudget({ now }) } = {}) {
  let sessionToken = null;
  let connectedAt = null;
  let rejectedInARow = 0;

  const configured = Boolean(appKey && secret);

  // ICICI answers HTTP 401/503 when several signed requests arrive at once (seen on the live service),
  // so every call goes through a one-at-a-time queue.
  let queue = Promise.resolve();
  function call(method, endpoint, payload, options) {
    const run = queue.then(() => callNow(method, endpoint, payload, options));
    queue = run.catch(() => {});
    return run;
  }

  async function callNow(method, endpoint, payload, { authenticated = true } = {}) {
    if (!budget.take()) throw new Error('Breeze request budget used up for now (ICICI limits: 100/minute, 5,000/day)');
    const body = JSON.stringify(payload);
    const timestamp = breezeTimestamp(now());
    const headers = { 'Content-Type': 'application/json' };
    if (authenticated) {
      headers['X-Checksum'] = `token ${computeChecksum(timestamp, body, secret)}`;
      headers['X-Timestamp'] = timestamp;
      headers['X-AppKey'] = appKey;
      headers['X-SessionToken'] = sessionToken;
    }
    const res = await request({ method, path: `${BASE_PATH}/${endpoint}`, headers, body });
    const rejected = res.status === 401 || res.status === 403 || (res.json && String(res.json.Status) === '401');
    if (authenticated && rejected) {
      // A single HTTP 401/403 is not proof the session is dead (ICICI has returned one on a busy moment
      // while the session was still good), so signing out on it would lose a valid login. The session is
      // dropped only when ICICI says so in words, or after several rejections in a row.
      rejectedInARow++;
      const reason = String(res.json?.Error ?? '').trim();
      const sessionGone = /invalid session|resource not available|expired|session/i.test(reason) || rejectedInARow >= 3;
      if (sessionGone) {
        sessionToken = null;
        connectedAt = null;
        rejectedInARow = 0;
        throw new Error('Breeze session expired; sign in again');
      }
      throw new Error(`Breeze rejected the request (HTTP ${res.status}${reason ? `: ${reason}` : ''}); the session is kept, try again`);
    }
    rejectedInARow = 0;
    if (res.status >= 500 || !res.json) throw new Error(`Breeze HTTP ${res.status}`);
    if (res.json.Error && !res.json.Success) throw new Error(`Breeze: ${res.json.Error}`);
    return res.json;
  }

  return {
    configured,
    isConnected: () => sessionToken !== null,
    budget: () => budget.stats(),

    /** Credentials for the live feed: the session token is base64 of "userId:token". Null when signed out. */
    streamAuth() {
      if (!sessionToken) return null;
      try {
        const [user, token] = Buffer.from(sessionToken, 'base64').toString('ascii').split(':');
        return user && token ? { user, token } : null;
      } catch {
        return null;
      }
    },
    connectedAt: () => connectedAt,

    /** Exchange the one-time API session from the login redirect for a session token. */
    async connect(apiSession) {
      if (!configured) throw new Error('Breeze API key and secret are not configured');
      const json = await call('GET', 'customerdetails', { SessionToken: apiSession, AppKey: appKey }, { authenticated: false });
      const token = json.Success?.session_token;
      if (!token) throw new Error(`Breeze did not return a session${json.Error ? `: ${json.Error}` : ''}`);
      sessionToken = token;
      connectedAt = now();
    },

    disconnect() {
      sessionToken = null;
      connectedAt = null;
    },

    async getQuote(stockCode, symbol) {
      const json = await call('GET', 'quotes', {
        stock_code: stockCode, exchange_code: 'NSE', expiry_date: '', product_type: 'cash', right: '', strike_price: '',
      });
      const quote = mapQuote(Array.isArray(json.Success) ? json.Success[0] : null, symbol);
      if (!quote) throw new Error('Breeze returned no usable quote');
      return quote;
    },

    // ---- read-only account data (documented endpoints: funds, dematholdings, portfoliopositions)
    async getFunds() {
      const json = await call('GET', 'funds', {});
      return json.Success && typeof json.Success === 'object' ? json.Success : null;
    },

    /** Margin for one exchange ('NSE' or 'NFO'). Returns the reported object, or null when ICICI sends none. */
    async getMargin(exchangeCode) {
      const json = await call('GET', 'margin', { exchange_code: exchangeCode });
      return json.Success && typeof json.Success === 'object' && !Array.isArray(json.Success) ? json.Success : null;
    },

    async getDematHoldings() {
      const json = await call('GET', 'dematholdings', {});
      return Array.isArray(json.Success) ? json.Success : [];
    },

    async getPositions() {
      const json = await call('GET', 'portfoliopositions', {});
      return Array.isArray(json.Success) ? json.Success : [];
    },

    // ---- order book, trade book, per-trade detail (documented read-only endpoints)
    async getOrders(exchangeCode, fromDay, toDay) {
      const json = await call('GET', 'order', { exchange_code: exchangeCode, from_date: `${fromDay}T00:00:00.000Z`, to_date: `${toDay}T23:59:59.000Z` });
      return Array.isArray(json.Success) ? json.Success : [];
    },

    async getTrades(exchangeCode, fromDay, toDay) {
      const json = await call('GET', 'trades', { exchange_code: exchangeCode, from_date: `${fromDay}T00:00:00.000Z`, to_date: `${toDay}T23:59:59.000Z` });
      return Array.isArray(json.Success) ? json.Success : [];
    },

    async getTradeDetail(exchangeCode, orderId) {
      const json = await call('GET', 'trades', { exchange_code: exchangeCode, order_id: orderId });
      return Array.isArray(json.Success) ? json.Success : [];
    },

    async getHistory(stockCode, interval, fromMs, toMs) {
      const breezeInterval = BREEZE_INTERVALS[interval];
      if (!breezeInterval) throw new Error(`Unsupported Breeze interval ${interval}`);
      const json = await call('GET', 'historicalcharts', {
        interval: breezeInterval,
        from_date: istWallClock(fromMs),
        to_date: istWallClock(toMs),
        stock_code: stockCode,
        exchange_code: 'NSE',
        product_type: 'cash',
      });
      const candles = mapCandles(json.Success, interval !== '1d');
      if (candles.length === 0) throw new Error('Breeze returned no usable candles');
      return candles;
    },
  };
}
