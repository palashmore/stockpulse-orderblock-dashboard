import express from 'express';
import cors from 'cors';
import { createCache } from './cache.js';
import {
  DATA_STATUS,
  classifyQuoteStatus,
  classifyOptionsStatus,
  classifyHistoryStatus,
  classifyLiveQuoteStatus,
  classifyLiveHistoryStatus,
  parseNseTimestamp,
} from './dataStatus.js';
import { buildOptionsChain } from './options.js';
import { loadSecurityMaster } from './securityMaster.js';
import { buildPortfolio, mapFunds } from './portfolio.js';
import {
  isEmptyResult, parseWindow, mapOrder, mapTrade, mapTradeDetail, mapPosition, realisedRoundTrips, orderSummary, depthSummary,
  mapFundsDetail, mapMargin,
} from './brokerBooks.js';
import { depthKey } from './breezeStream.js';
import { istDateKey } from './marketCalendar.js';
import { INDEX_DEFS, INDEX_BASE, indexDef, parseIndexCsv, MAX_SYMBOLS_PER_REQUEST } from './indices.js';
import { BREEZE_STOCK_CODES } from './breezeCodes.js';
import { createStreamHub, quoteKey } from './breezeStream.js';
import { createAlertEngine, createMemoryAlertStore } from './alertEngine.js';
import { buildIpos } from './ipo.js';
import { parseNseHolidays, getMarketState, markPartialCandles } from './marketCalendar.js';
import { createRateLimiter, createConcurrencyLimiter } from './limits.js';
import {
  createBreezeClient,
  breezeCodeFor,
  extractSessionToken,
  loginUrl,
  parseBreezeTime,
  BREEZE_INTERVALS,
} from './breeze.js';
import {
  isValidSymbol,
  isValidRange,
  isValidInterval,
  isIntradayInterval,
  isSupportedCombination,
  normalizeCandles,
} from './validators.js';

const MINUTE = 60 * 1000;

// Freshness (ttl) and the longest a cached value may be served as STALE after a provider failure.
const POLICY = {
  search: { ttl: 10 * MINUTE },
  quote: { ttl: 30 * 1000, maxStale: 15 * MINUTE },
  nifty50: { ttl: 30 * 1000, maxStale: 15 * MINUTE },
  options: { ttl: 60 * 1000, maxStale: 30 * MINUTE },
  holidays: { ttl: 12 * 60 * MINUTE },
  history: { ttl: 5 * MINUTE, maxStale: 24 * 60 * MINUTE },
  indexList: { ttl: 24 * 60 * MINUTE, maxStale: 7 * 24 * 60 * MINUTE },
  quotesBatch: { ttl: 45 * 1000, maxStale: 15 * MINUTE },
  historyIntraday: { ttl: 60 * 1000, maxStale: 60 * MINUTE },
  ipos: { ttl: 10 * MINUTE, maxStale: 24 * 60 * MINUTE },
};

const RANGE_DAYS = { '1d': 1, '5d': 5, '1mo': 31, '3mo': 93, '6mo': 186, '1y': 366, '2y': 731, '5y': 1827 };
const INTERVAL_MS = { '1d': 86400e3, '1m': 60e3, '2m': 120e3, '5m': 300e3, '15m': 900e3, '30m': 1800e3, '60m': 3600e3, '1h': 3600e3, '90m': 5400e3 };

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nseindia.com/',
};

export const NIFTY50_SYMBOLS = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
  'HINDUNILVR', 'SBIN', 'BHARTIARTL', 'KOTAKBANK', 'ITC',
  'LT', 'AXISBANK', 'BAJFINANCE', 'MARUTI', 'TITAN',
  'SUNPHARMA', 'HCLTECH', 'ADANIENT', 'TATASTEEL', 'NTPC',
  'POWERGRID', 'ONGC', 'JSWSTEEL', 'COALINDIA', 'TECHM',
  'DRREDDY', 'ASIANPAINT', 'ULTRACEMCO', 'BAJAJFINSV', 'NESTLEIND',
  'CIPLA', 'TATACONSUM', 'APOLLOHOSP', 'EICHERMOT', 'HINDALCO',
  'SBILIFE', 'M&M', 'GRASIM', 'HDFCLIFE', 'SHRIRAMFIN',
  'BAJAJ-AUTO', 'TRENT', 'ADANIPORTS', 'BSE', 'BEL',
  'ETERNAL', 'INDIGO', 'JIOFIN', 'MAXHEALTH', 'TMPV',
];

/** Error that should be returned to the client as-is rather than treated as a provider outage. */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * `fetchFn`, `now` and `retryDelayMs` are injectable so provider failures, stale-cache
 * behaviour and timing can be tested without network access.
 */
export function createApp({
  fetchFn: rawFetch = fetch,
  now = Date.now,
  retryDelayMs = 1000,
  rateLimit = { windowMs: 60_000, max: Number(process.env.RATE_LIMIT_PER_MIN) || 120, loopbackMax: Number(process.env.RATE_LIMIT_LOCAL_PER_MIN) || 1200 },
  upstreamConcurrency = Number(process.env.UPSTREAM_CONCURRENCY) || 4,
  // Exchange holiday calendar source. Defaults to NSE's own list when the real fetch is in use and
  // is off when a custom fetchFn is injected (tests, fake feeds); then only weekends are detected.
  holidayFetch = rawFetch === globalThis.fetch ? globalThis.fetch : null,
  loadMaster = null, // () => Promise<{ byCode, byIsin, bySymbol }>; defaults to ICICI's daily security master
  streamHub = createStreamHub({ now }),
  autoLoadMaster = rawFetch === globalThis.fetch || Boolean(loadMaster),
  breeze = createBreezeClient({ appKey: process.env.BREEZE_API_KEY, secret: process.env.BREEZE_API_SECRET }),
  alertStore = createMemoryAlertStore(), // server/index.js passes a file-backed store
  alertNotifier = null,
  alertIntervalMs = 60_000, // how often the server checks alerts once alerts.start() is called
} = {}) {
  const app = express();
  // At most `upstreamConcurrency` provider requests in flight; the rest queue.
  const limit = createConcurrencyLimiter(upstreamConcurrency);
  const fetchFn = (url, init) => limit(() => rawFetch(url, init));
  const inFlight = new Map(); // cache key -> pending provider load, so concurrent identical requests share one call
  const cache = createCache(now);
  let nseCookies = '';

  app.disable('x-powered-by');
  // The browser can only read the X-Data-* status headers (used by /api/nifty50) if they are exposed
  const corsOptions = { exposedHeaders: ['X-Data-Status', 'X-Data-Provider', 'X-Data-Fetched-At', 'X-Data-As-Of', 'X-Data-Stale-Age-Sec'] };
  if (process.env.CORS_ORIGIN) corsOptions.origin = process.env.CORS_ORIGIN.split(',');
  app.use(cors(corsOptions));
  app.use(createRateLimiter({ ...rateLimit, now }));
  app.use(express.json());

  async function fetchJson(url, headers, retries = 2) {
    for (let i = 0; i <= retries; i++) {
      try {
        const response = await fetchFn(url, { headers, signal: AbortSignal.timeout(10000) });
        if (!response.ok) {
          const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
          error.status = response.status;
          throw error;
        }
        return await response.json();
      } catch (error) {
        const clientError = error.status >= 400 && error.status < 500;
        if (i === retries || clientError) throw error;
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * (i + 1)));
      }
    }
  }

  // Yahoo's v7 quote endpoint requires a session cookie plus a "crumb" token (otherwise 401).
  // It is fetched lazily on the first 401, reused afterwards, and refreshed when it stops working.
  let yahooAuth = null;

  async function refreshYahooAuth() {
    yahooAuth = null;
    const home = await fetchFn('https://fc.yahoo.com', { headers: YAHOO_HEADERS, signal: AbortSignal.timeout(10000) });
    const cookie = (home.headers.getSetCookie ? home.headers.getSetCookie() : [])
      .map((c) => c.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');
    if (!cookie) throw new Error('Yahoo did not issue a session cookie');
    const res = await fetchFn('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      // The crumb endpoint answers 406 to `Accept: application/json`, so ask for anything
      headers: { ...YAHOO_HEADERS, Accept: '*/*', Cookie: cookie },
      signal: AbortSignal.timeout(10000),
    });
    const crumb = (await res.text()).trim();
    if (!res.ok || !crumb || crumb.length > 40 || /[<\s]/.test(crumb)) throw new Error('Yahoo did not issue a crumb');
    yahooAuth = { cookie, crumb };
  }

  async function yahooQuotes(encodedSymbols) {
    const request = () => fetchJson(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodedSymbols}${yahooAuth ? `&crumb=${encodeURIComponent(yahooAuth.crumb)}` : ''}`,
      yahooAuth ? { ...YAHOO_HEADERS, Cookie: yahooAuth.cookie } : YAHOO_HEADERS
    );
    try {
      return await request();
    } catch (error) {
      if (error.status !== 401) throw error;
      await refreshYahooAuth();
      return await request();
    }
  }

  async function refreshNSECookies() {
    try {
      const response = await fetchFn('https://www.nseindia.com/', {
        headers: NSE_HEADERS,
        signal: AbortSignal.timeout(10000),
      });
      const setCookies = response.headers.getSetCookie
        ? response.headers.getSetCookie()
        : (response.headers.get('set-cookie') || '').split(/,(?=\s*[^;,]+=)/);
      const cookies = setCookies.map((c) => c.split(';')[0].trim()).filter(Boolean);
      if (cookies.length) nseCookies = cookies.join('; ');
    } catch (e) {
      console.log('NSE cookie refresh failed:', e.message);
    }
  }

  /**
   * A cache entry is { body, status, provider, fetchedAt, asOf }. Object bodies carry the
   * status fields inline; array bodies (Nifty 50) keep their shape and use response headers.
   */
  function respond(res, entry, staleAgeMs = null) {
    const stale = staleAgeMs !== null;
    const dataStatus = stale ? DATA_STATUS.STALE : entry.status;
    const meta = {
      dataStatus,
      provider: entry.provider,
      fetchedAt: entry.fetchedAt,
      asOf: entry.asOf,
    };
    if (stale) meta.staleAgeSec = Math.round(staleAgeMs / 1000);

    if (Array.isArray(entry.body)) {
      res.set('X-Data-Status', dataStatus);
      res.set('X-Data-Provider', entry.provider);
      res.set('X-Data-Fetched-At', entry.fetchedAt);
      if (entry.asOf) res.set('X-Data-As-Of', entry.asOf);
      if (stale) res.set('X-Data-Stale-Age-Sec', String(meta.staleAgeSec));
      return res.json(entry.body);
    }
    return res.json({ ...entry.body, ...meta });
  }

  /**
   * Fresh cache entry, else a provider load (shared between concurrent callers), else a stale copy.
   * Resolves { entry, staleAgeMs } (staleAgeMs is null unless the entry is a stale fallback) and
   * throws when nothing usable exists. Used by the HTTP routes and by the server-side alert checker.
   */
  async function resolve(label, { key, policy, load }) {
    await ensureHolidays();
    const fresh = cache.getFresh(key, policy.ttl);
    if (fresh) return { entry: fresh, staleAgeMs: null };

    try {
      let pending = inFlight.get(key);
      if (!pending) {
        pending = load().finally(() => inFlight.delete(key));
        inFlight.set(key, pending);
      }
      const entry = await pending;
      cache.set(key, entry);
      return { entry, staleAgeMs: null };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      console.error(`${label} error:`, error.message);
      recordError(label, error.message);
      const stale = cache.getStale(key, policy.maxStale);
      if (stale) return { entry: stale.entry, staleAgeMs: stale.ageMs };
      throw error;
    }
  }

  async function serve(res, label, options) {
    try {
      const { entry, staleAgeMs } = await resolve(label, options);
      return respond(res, entry, staleAgeMs);
    } catch (error) {
      if (error instanceof HttpError) {
        return res.status(error.status).json({ error: error.message, dataStatus: DATA_STATUS.UNAVAILABLE });
      }
      return res.status(503).json({
        error: `${label} unavailable`,
        message: error.message,
        dataStatus: DATA_STATUS.UNAVAILABLE,
      });
    }
  }

  const symbolOr400 = (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    if (!isValidSymbol(symbol)) {
      res.status(400).json({ error: 'Invalid symbol', dataStatus: DATA_STATUS.UNAVAILABLE });
      return null;
    }
    return symbol;
  };

  // ============ MARKET CALENDAR ============
  let holidays = null; // Map of YYYY-MM-DD -> holiday name once loaded
  let holidaysLoadedAt = 0;
  let holidaysInFlight = null;

  async function loadHolidays() {
    if (!nseCookies) await refreshNSECookies();
    const response = await holidayFetch('https://www.nseindia.com/api/holiday-master?type=trading', {
      headers: { ...NSE_HEADERS, Cookie: nseCookies },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`NSE holiday calendar HTTP ${response.status}`);
    const parsed = parseNseHolidays(await response.json());
    if (!parsed) throw new Error('NSE holiday calendar was empty');
    return parsed;
  }

  /** Refresh the holiday calendar when due. Never throws; keeps the last good calendar on failure. */
  async function ensureHolidays() {
    if (!holidayFetch) return;
    const age = now() - holidaysLoadedAt;
    if (holidays && age < POLICY.holidays.ttl) return;
    if (!holidaysInFlight) {
      holidaysInFlight = loadHolidays()
        .then((map) => { holidays = map; holidaysLoadedAt = now(); })
        .catch((error) => {
          console.error('Holiday calendar error:', error.message);
          holidaysLoadedAt = now() - POLICY.holidays.ttl + 10 * MINUTE; // retry in 10 minutes
        })
        .finally(() => { holidaysInFlight = null; });
    }
    await holidaysInFlight;
  }

  const marketAt = (ms) => getMarketState(ms, holidays);

  // ============ DIAGNOSTICS SUPPORT ============
  const recentErrors = [];
  const recordError = (source, message) => {
    recentErrors.push({ at: new Date(now()).toISOString(), source, message: String(message).slice(0, 200) });
    if (recentErrors.length > 25) recentErrors.shift();
  };
  const startedAt = now();

  // ============ INSTRUMENT UNIVERSE (ICICI security master) ============
  // Maps any NSE equity symbol to ICICI's stock code and exchange token. Loaded without signing in
  // (it is a public daily file); until it loads, the built-in Nifty 50 codes are used.
  let master = null;
  let masterLoadedAt = 0;
  async function getMaster() {
    if (master && now() - masterLoadedAt < 12 * 60 * MINUTE) return master;
    try {
      master = await (loadMaster ? loadMaster() : loadSecurityMaster(fetchFn));
      masterLoadedAt = now();
    } catch (error) {
      console.error('Security master error:', error.message);
      recordError('security-master', error.message);
      masterLoadedAt = now() - 12 * 60 * MINUTE + 10 * MINUTE; // keep any older copy, retry in 10 minutes
    }
    return master;
  }
  const instrumentFor = (symbol) => master?.bySymbol?.get(symbol) ?? null;
  const codeFor = (symbol) => instrumentFor(symbol)?.code ?? breezeCodeFor(symbol);
  if (autoLoadMaster) getMaster();

  // ============ LIVE FEED (Breeze tick stream) ============
  function startStream() {
    const auth = breeze.streamAuth();
    if (auth) streamHub.start(auth);
  }
  function stopStream() {
    streamHub.stop();
    liveSubscribers.clear();
  }
  const liveSubscribers = new Map(); // symbol -> number of open /api/live connections

  // ============ BROKER FEED (ICICI Direct Breeze) ============
  // Used when the user has signed in and the symbol is mapped. Any failure falls back to Yahoo,
  // and every response names its provider, so the two feeds are never silently mixed.

  async function brokerQuote(symbol) {
    const code = breeze.isConnected() ? codeFor(symbol) : null;
    if (!code) return null;
    try {
      const quote = await breeze.getQuote(code, symbol);
      const nowMs = now();
      let lastTradeMs = parseBreezeTime(quote.lastTradeTime);
      // Prefer the live stream's tick when it is newer and its exchange timestamp is believable
      const token = instrumentFor(symbol)?.token;
      const tick = token ? streamHub.getQuote(token) : null;
      if (tick && tick.lttTrusted && tick.lttMs > (lastTradeMs ?? 0) && nowMs - tick.receivedAt < 30000) {
        quote.price = tick.last;
        quote.close = tick.last;
        if (tick.high !== null) quote.high = tick.high;
        if (tick.low !== null) quote.low = tick.low;
        if (tick.open !== null) quote.open = tick.open;
        if (quote.previousClose > 0) {
          quote.change = tick.last - quote.previousClose;
          quote.changePct = (quote.change / quote.previousClose) * 100;
        }
        lastTradeMs = tick.lttMs;
        quote.lastTradeTime = null;
      }
      if (token && breeze.isConnected()) streamHub.subscribe(quoteKey(token));
      const body = { ...quote };
      delete body.lastTradeTime;
      return {
        body: { ...body, timestamp: lastTradeMs === null ? null : Math.floor(lastTradeMs / 1000) },
        status: classifyLiveQuoteStatus({ marketOpen: marketAt(nowMs).isOpen, lastTradeMs, nowMs, market: marketAt(nowMs) }),
        provider: 'ICICI Direct Breeze',
        fetchedAt: new Date(nowMs).toISOString(),
        asOf: lastTradeMs === null ? null : new Date(lastTradeMs).toISOString(),
      };
    } catch (error) {
      console.error('Breeze quote error:', error.message);
      recordError('breeze-quote', error.message);
      return null;
    }
  }

  async function brokerHistory(symbol, range, interval) {
    const code = breeze.isConnected() ? codeFor(symbol) : null;
    const days = RANGE_DAYS[range];
    if (!code || !BREEZE_INTERVALS[interval] || days === undefined) return null;
    try {
      const nowMs = now();
      const intraday = interval !== '1d';
      const candles = await breeze.getHistory(code, interval, nowMs - days * 86400000, nowMs);
      markPartialCandles(candles, interval, marketAt(nowMs), holidays);
      const last = candles[candles.length - 1];
      // Breeze's daily series can lag the exchange (the live service had no bar for a session that
      // had just ended). Never serve a daily series that misses the latest completed session.
      if (!intraday && last.time < marketAt(nowMs).lastSession) return null;
      const lastBarMs = intraday ? (last.time - 19800) * 1000 : null;
      return {
        body: { symbol, currency: 'INR', exchange: 'NSE', candles },
        status: classifyLiveHistoryStatus({
          intraday,
          marketOpen: marketAt(nowMs).isOpen,
          lastBarMs,
          intervalMs: INTERVAL_MS[interval],
          nowMs,
        }),
        provider: 'ICICI Direct Breeze',
        fetchedAt: new Date(nowMs).toISOString(),
        asOf: intraday ? new Date(lastBarMs).toISOString() : last.time,
      };
    } catch (error) {
      console.error('Breeze history error:', error.message);
      recordError('breeze-history', error.message);
      return null;
    }
  }

  /** Quote for one NSE symbol: the broker when signed in, otherwise Yahoo. Cache entry shape. */
  async function loadQuote(symbol) {
    const yahooSymbol = symbol.includes('.') ? symbol : `${symbol}.NS`;
    const viaBroker = await brokerQuote(symbol);
    if (viaBroker) return viaBroker;
    const data = await yahooQuotes(encodeURIComponent(yahooSymbol));

    const quote = data.quoteResponse?.result?.[0];
    if (!quote) throw new HttpError(404, 'Stock not found');
    if (!Number.isFinite(quote.regularMarketPrice)) throw new Error('Malformed quote response');

    const quoteTimeMs = Number.isFinite(quote.regularMarketTime) ? quote.regularMarketTime * 1000 : null;
    const nowMs = now();
    return {
      body: {
        symbol: symbol.replace('.NS', ''),
        name: quote.longName || quote.shortName || symbol,
        price: quote.regularMarketPrice,
        previousClose: quote.regularMarketPreviousClose,
        open: quote.regularMarketOpen,
        high: quote.regularMarketDayHigh,
        low: quote.regularMarketDayLow,
        close: quote.regularMarketPrice,
        change: quote.regularMarketChange,
        changePct: quote.regularMarketChangePercent,
        volume: quote.regularMarketVolume,
        avgVolume: quote.averageDailyVolume3Month,
        marketCap: quote.marketCap,
        fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
        pe: quote.trailingPE,
        eps: quote.epsTrailingTwelveMonths,
        dividend: quote.dividendYield,
        sector: quote.sector || '',
        industry: quote.industry || '',
        exchange: quote.exchange,
        marketState: quote.marketState, // PRE, REGULAR, POST, CLOSED
        timestamp: quote.regularMarketTime,
        currency: quote.currency || 'INR',
      },
      status: classifyQuoteStatus({ marketState: quote.marketState, quoteTimeMs, nowMs, market: marketAt(nowMs) }),
      provider: 'Yahoo Finance',
      fetchedAt: new Date(nowMs).toISOString(),
      asOf: quoteTimeMs === null ? null : new Date(quoteTimeMs).toISOString(),
    };
  }

  /** Yahoo quotes for sorted, validated symbols (chunks of 50). Cache entry shape. */
  async function loadQuotesBatch(symbols) {
    const results = [];
    for (let i = 0; i < symbols.length; i += 50) {
      const chunk = symbols.slice(i, i + 50).map((s) => encodeURIComponent(`${s}.NS`)).join(',');
      const data = await yahooQuotes(chunk);
      results.push(...(data.quoteResponse?.result || []));
    }
    const valid = results.filter((q) => Number.isFinite(q.regularMarketPrice));
    if (valid.length === 0) throw new Error('No valid quotes in provider response');
    const quotes = valid.map((q) => ({
      symbol: (q.symbol || '').replace('.NS', ''),
      name: q.longName || q.shortName || q.symbol,
      price: q.regularMarketPrice,
      change: q.regularMarketChange,
      changePct: q.regularMarketChangePercent,
      volume: q.regularMarketVolume,
      avgVolume: q.averageDailyVolume3Month,
      open: q.regularMarketOpen,
      high: q.regularMarketDayHigh,
      low: q.regularMarketDayLow,
      previousClose: q.regularMarketPreviousClose,
      marketCap: q.marketCap,
      marketState: q.marketState,
    }));
    const have = new Set(quotes.map((q) => q.symbol));
    const times = valid.map((q) => q.regularMarketTime).filter(Number.isFinite);
    const quoteTimeMs = times.length ? Math.max(...times) * 1000 : null;
    const nowMs = now();
    return {
      body: { quotes, missing: symbols.filter((s) => !have.has(s)) },
      status: classifyQuoteStatus({ marketState: valid[0].marketState, quoteTimeMs, nowMs, market: marketAt(nowMs) }),
      provider: 'Yahoo Finance',
      fetchedAt: new Date(nowMs).toISOString(),
      asOf: quoteTimeMs === null ? null : new Date(quoteTimeMs).toISOString(),
    };
  }

  // ============ SERVER-SIDE ALERTS ============
  // Quotes for the alert checker. Broker-connected symbols use the same path as /api/quote (so the live
  // feed is preferred and caches are shared); the rest go to Yahoo in batches. Each quote keeps its own
  // status, and a stale cache fallback is labelled STALE, which the checker refuses to evaluate.
  const ALERT_BROKER_MAX = 25; // leaves most of Breeze's request budget for the screens
  async function alertQuotes(symbols) {
    const out = [];
    let lastError = null;
    const labelled = ({ entry, staleAgeMs }, symbol, price) => ({
      symbol, price, status: staleAgeMs === null ? entry.status : DATA_STATUS.STALE, provider: entry.provider, asOf: entry.asOf,
    });
    const viaBroker = breeze.isConnected() ? symbols.filter((s) => codeFor(s)).slice(0, ALERT_BROKER_MAX) : [];
    for (const symbol of viaBroker) {
      try {
        const r = await resolve('Quote', { key: `quote_${symbol}.NS`, policy: POLICY.quote, load: () => loadQuote(symbol) });
        out.push(labelled(r, symbol, r.entry.body.price));
      } catch (error) {
        lastError = error;
      }
    }
    const rest = symbols.filter((s) => !viaBroker.includes(s)).sort();
    for (let i = 0; i < rest.length; i += MAX_SYMBOLS_PER_REQUEST) {
      const chunk = rest.slice(i, i + MAX_SYMBOLS_PER_REQUEST);
      try {
        const r = await resolve('Quotes', { key: `quotes_${chunk.join(',')}`, policy: POLICY.quotesBatch, load: () => loadQuotesBatch(chunk) });
        for (const q of r.entry.body.quotes) out.push(labelled(r, q.symbol, q.price));
      } catch (error) {
        lastError = error;
      }
    }
    if (out.length === 0 && lastError) throw lastError;
    return out;
  }

  const alerts = createAlertEngine({
    store: alertStore,
    getQuotes: alertQuotes,
    marketOpen: async () => { await ensureHolidays(); return marketAt(now()).isOpen; },
    isValidSymbol,
    notifier: alertNotifier,
    now,
    intervalMs: alertIntervalMs,
  });

  // ============ ROUTES ============

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date(now()).toISOString() });
  });

  app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query || typeof query !== 'string') return res.json([]);

    const cacheKey = `search_${query}`;
    const cached = cache.getFresh(cacheKey, POLICY.search.ttl);
    if (cached) return res.json(cached);

    // Matches from ICICI's NSE instrument list work even when Yahoo is unreachable
    const needle = query.trim().toLowerCase();
    const masterHits = [];
    if (master && needle.length >= 2) {
      for (const info of master.bySymbol.values()) {
        const sym = info.symbol.toLowerCase();
        if (sym.startsWith(needle) || sym.includes(needle) || (info.name || '').toLowerCase().includes(needle)) {
          masterHits.push({ symbol: info.symbol, name: info.name, exchange: 'NSE', type: 'EQUITY', yahooSymbol: `${info.symbol}.NS` });
          if (masterHits.length >= 40) break;
        }
      }
      masterHits.sort((a, b) => {
        const rank = (x) => (x.symbol.toLowerCase() === needle ? 0 : x.symbol.toLowerCase().startsWith(needle) ? 1 : 2);
        return rank(a) - rank(b) || a.symbol.localeCompare(b.symbol);
      });
    }
    const mergeHits = (yahooResults) => {
      const seen = new Set();
      return [...yahooResults, ...masterHits.slice(0, 10)].filter((r) => !seen.has(r.symbol) && seen.add(r.symbol)).slice(0, 15);
    };

    try {
      const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&lang=en-US&region=IN&quotesCount=10&newsCount=0&enableFuzzyQuery=false&quotesQueryId=tss_match_phrase_query`;
      const data = await fetchJson(url, YAHOO_HEADERS);

      // NSE-listed equities and ETFs only: every data route reads a bare symbol as `SYMBOL.NS`,
      // so BSE listings (same symbol, different feed) would silently show NSE data.
      const results = (data.quotes || []).filter(q =>
        typeof q.symbol === 'string' && q.symbol.endsWith('.NS') && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF')
      ).map(q => ({
        symbol: q.symbol.replace('.NS', ''),
        name: q.longname || q.shortname || q.symbol,
        exchange: q.exchange,
        type: q.quoteType,
        yahooSymbol: q.symbol,
      }));

      const merged = mergeHits(results);
      cache.set(cacheKey, merged);
      res.json(merged);
    } catch (error) {
      console.error('Search error:', error.message);
      // Yahoo failed: the instrument list, else the static Nifty 50 symbols
      if (masterHits.length > 0) return res.json(masterHits.slice(0, 15));
      const lower = query.toLowerCase();
      res.json(
        NIFTY50_SYMBOLS
          .filter(s => s.toLowerCase().includes(lower))
          .map(s => ({ symbol: s, name: s, exchange: 'NSE', yahooSymbol: `${s}.NS` }))
      );
    }
  });

  app.get('/api/quote/:symbol', async (req, res) => {
    const symbol = symbolOr400(req, res);
    if (!symbol) return;
    const yahooSymbol = symbol.includes('.') ? symbol : `${symbol}.NS`;

    await serve(res, 'Quote', {
      key: `quote_${yahooSymbol}`,
      policy: POLICY.quote,
      load: () => loadQuote(symbol),
    });
  });

  app.get('/api/history/:symbol', async (req, res) => {
    const symbol = symbolOr400(req, res);
    if (!symbol) return;
    const range = req.query.range || '6mo';
    const interval = req.query.interval || '1d';
    if (!isValidRange(range) || !isValidInterval(interval) || !isSupportedCombination(range, interval)) {
      return res.status(400).json({ error: 'Invalid range or interval', dataStatus: DATA_STATUS.UNAVAILABLE });
    }
    const intraday = isIntradayInterval(interval);
    const yahooSymbol = symbol.includes('.') ? symbol : `${symbol}.NS`;
    // Bulk callers (the screener loading dozens of stocks) skip the broker feed so they cannot use up
    // the broker's request budget; they get Yahoo data under a separate cache key.
    const bulk = req.query.bulk === '1';

    await serve(res, 'History', {
      key: `history_${yahooSymbol}_${range}_${interval}${bulk ? '_bulk' : ''}`,
      policy: intraday ? POLICY.historyIntraday : POLICY.history,
      load: async () => {
        const viaBroker = bulk ? null : await brokerHistory(symbol, range, interval);
        if (viaBroker) return viaBroker;
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=${range}&interval=${interval}&includeAdjustedClose=true`;
        const data = await fetchJson(url, YAHOO_HEADERS);

        const chart = data.chart?.result?.[0];
        if (!chart) throw new HttpError(404, 'No data found');

        const { candles } = normalizeCandles(
          chart.timestamp || [],
          chart.indicators?.quote?.[0] || {},
          chart.indicators?.adjclose?.[0]?.adjclose || [],
          chart.meta?.gmtoffset,
          intraday
        );
        if (candles.length === 0) throw new Error('No valid candles in provider response');
        markPartialCandles(candles, interval, marketAt(now()), holidays);
        const lastCandle = candles[candles.length - 1];
        const offsetSec = Number.isFinite(chart.meta?.gmtoffset) ? chart.meta.gmtoffset : 19800;
        const nowMs = now();

        return {
          body: {
            symbol: symbol.replace('.NS', ''),
            currency: chart.meta?.currency || 'INR',
            exchange: chart.meta?.exchangeName || 'NSI',
            candles,
          },
          status: classifyHistoryStatus({
            intraday,
            marketOpen: marketAt(nowMs).isOpen,
            lastBarMs: intraday ? (lastCandle.time - offsetSec) * 1000 : null,
            intervalMs: INTERVAL_MS[interval],
            nowMs,
          }),
          provider: 'Yahoo Finance',
          fetchedAt: new Date(nowMs).toISOString(),
          asOf: intraday ? new Date((lastCandle.time - offsetSec) * 1000).toISOString() : lastCandle.time,
        };
      },
    });
  });

  // Options chain (OI analysis). NSE is the only provider: Yahoo does not carry NSE options,
  // and a Yahoo fallback previously produced fabricated max-pain and OI-change values.
  app.get('/api/options/:symbol', async (req, res) => {
    const symbol = symbolOr400(req, res);
    if (!symbol) return;

    await serve(res, 'Options data', {
      key: `options_${symbol}`,
      policy: POLICY.options,
      load: async () => {
        const nseUrl = `https://www.nseindia.com/api/option-chain-equities?symbol=${encodeURIComponent(symbol)}`;
        const request = () => fetchFn(nseUrl, {
          headers: { ...NSE_HEADERS, Cookie: nseCookies },
          signal: AbortSignal.timeout(10000),
        });

        if (!nseCookies) await refreshNSECookies();
        let response = await request();
        if (response.status === 401 || response.status === 403) {
          await refreshNSECookies();
          response = await request();
        }
        if (!response.ok) throw new Error(`NSE HTTP ${response.status}`);

        const chain = buildOptionsChain(await response.json(), symbol);
        const nowMs = now();
        const asOfMs = parseNseTimestamp(chain.providerTimestamp);
        return {
          body: chain,
          status: classifyOptionsStatus({
            marketOpen: marketAt(nowMs).isOpen,
            asOfMs,
            nowMs,
            market: marketAt(nowMs),
          }),
          provider: 'NSE',
          fetchedAt: new Date(nowMs).toISOString(),
          asOf: asOfMs === null ? null : new Date(asOfMs).toISOString(),
        };
      },
    });
  });

  app.get('/api/nifty50', async (req, res) => {
    await serve(res, 'Nifty 50 quotes', {
      key: 'nifty50_quotes',
      policy: POLICY.nifty50,
      load: async () => {
        const symbols = NIFTY50_SYMBOLS.map(s => encodeURIComponent(`${s}.NS`)).join(',');
        const data = await yahooQuotes(symbols);

        const results = (data.quoteResponse?.result || []).filter(q => Number.isFinite(q.regularMarketPrice));
        if (results.length === 0) throw new Error('No valid quotes in provider response');

        const body = results.map(q => ({
          symbol: (q.symbol || '').replace('.NS', ''),
          name: q.longName || q.shortName || q.symbol,
          price: q.regularMarketPrice,
          change: q.regularMarketChange,
          changePct: q.regularMarketChangePercent,
          volume: q.regularMarketVolume,
          open: q.regularMarketOpen,
          high: q.regularMarketDayHigh,
          low: q.regularMarketDayLow,
          previousClose: q.regularMarketPreviousClose,
          marketCap: q.marketCap,
          avgVolume: q.averageDailyVolume3Month,
          marketState: q.marketState,
        }));

        const times = results.map(q => q.regularMarketTime).filter(Number.isFinite);
        const quoteTimeMs = times.length ? Math.max(...times) * 1000 : null;
        const nowMs = now();
        return {
          body,
          status: classifyQuoteStatus({ marketState: results[0].marketState, quoteTimeMs, nowMs, market: marketAt(nowMs) }),
          provider: 'Yahoo Finance',
          fetchedAt: new Date(nowMs).toISOString(),
          asOf: quoteTimeMs === null ? null : new Date(quoteTimeMs).toISOString(),
        };
      },
    });
  });

  // ---- broker sign-in (local machine only: these endpoints change which account feeds the app)
  const isLoopback = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  const localOnly = (req, res, next) => (isLoopback(req)
    ? next()
    : res.status(403).json({ error: 'Broker sign-in is only available from the machine running the server' }));

  app.get('/api/auth/status', localOnly, (req, res) => {
    res.json({
      broker: 'ICICI Direct Breeze',
      configured: breeze.configured,
      connected: breeze.isConnected(),
      connectedAt: breeze.connectedAt() ? new Date(breeze.connectedAt()).toISOString() : null,
      loginUrl: breeze.configured ? loginUrl(process.env.BREEZE_API_KEY) : null,
    });
  });

  app.post('/api/auth/breeze/session', localOnly, async (req, res) => {
    const raw = String(req.body?.session ?? '');
    const session = extractSessionToken(raw);
    if (!session) {
      const emptyValue = /api_?session=\s*$/i.test(raw.trim());
      return res.status(400).json({
        error: emptyValue
          ? 'That address has nothing after "apisession=". First open the ICICI sign-in page and log in; then copy the address your browser shows afterwards, which ends in a long number.'
          : 'Paste the address your browser shows after signing in to ICICI (it contains "apisession=" followed by a number).',
      });
    }
    try {
      await breeze.connect(session);
      startStream();
      res.json({ connected: true });
    } catch (error) {
      res.status(502).json({ connected: false, error: error.message });
    }
  });

  // ---- portfolio (read-only; local machine only; personal data, so never cached beyond one minute)
  const niftyByCode = Object.fromEntries(Object.entries(BREEZE_STOCK_CODES).map(([symbol, code]) => [code, symbol]));
  let portfolioCache = null;


  app.get('/api/portfolio', localOnly, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!breeze.isConnected()) return res.status(409).json({ error: 'Sign in to ICICI Direct in Settings first' });
    if (portfolioCache && now() - portfolioCache.at < MINUTE) return res.json(portfolioCache.body);

    try {
      const [rawHoldings, rawFunds, masterData] = await Promise.all([
        breeze.getDematHoldings(),
        breeze.getFunds().catch(() => null),
        getMaster(),
      ]);

      // Price every held stock. Breeze answers HTTP 503 when called too fast, so go two at a time
      // and retry a failed quote after a short pause (stays inside ICICI's 100 calls/minute).
      const codes = [...new Set(rawHoldings.filter((h) => Number(h.quantity) > 0).map((h) => String(h.stock_code).trim()))];
      const quotes = new Map();
      const priceOne = async (code) => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const q = await breeze.getQuote(code, code);
            quotes.set(code, { price: q.price, previousClose: q.previousClose });
            return;
          } catch (error) {
            if (attempt === 2 || !/HTTP 5\d\d/.test(error.message)) {
              // unpriced holdings are reported as such, never valued at zero
              console.error(`Portfolio quote failed for ${code}: ${error.message}`);
              return;
            }
            await new Promise((resolve) => setTimeout(resolve, retryDelayMs * (attempt + 1)));
          }
        }
      };
      for (let i = 0; i < codes.length; i += 2) {
        await Promise.all(codes.slice(i, i + 2).map(priceOne));
      }

      const nowMs = now();
      const market = marketAt(nowMs);
      const portfolio = buildPortfolio(rawHoldings, { master: masterData, niftyByCode, quotes });
      const body = {
        ...portfolio,
        funds: mapFunds(rawFunds),
        fetchedAt: new Date(nowMs).toISOString(),
        priceBasis: market.isOpen ? 'latest broker quote (market open)' : `last close, session ${market.lastSession}`,
        provider: 'ICICI Direct Breeze',
        notes: ['Holdings have no purchase price in this API, so profit and loss versus cost is not shown.'],
      };
      portfolioCache = { at: nowMs, body };
      res.json(body);
    } catch (error) {
      console.error('Portfolio error:', error.message);
      res.status(502).json({ error: error.message });
    }
  });

  // ---- order book, trade book and positions: read-only views of your ICICI Direct account.
  // Loopback only, never cached by the browser, and held on the server for 30 seconds. This app has no
  // endpoint that places, changes or cancels an order.
  const bookCache = new Map();
  async function book(key, loader) {
    const hit = bookCache.get(key);
    if (hit && now() - hit.at < 30000) return hit.body;
    let rows;
    try {
      rows = await loader();
    } catch (error) {
      if (!isEmptyResult(error.message)) throw error;
      rows = [];
    }
    const body = { rows, fetchedAt: new Date(now()).toISOString() };
    bookCache.set(key, { at: now(), body });
    return body;
  }
  const exchangesFor = (q) => (q === 'NFO' ? ['NFO'] : q === 'NSE' ? ['NSE'] : ['NSE', 'NFO']);
  const brokerGuard = (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!breeze.isConnected()) return res.status(409).json({ error: 'Sign in to ICICI Direct in Settings first' });
    next();
  };
  const brokerFail = (res, error) => {
    recordError('broker-books', error.message);
    if (/session expired/i.test(error.message)) stopStream();
    res.status(/session expired/i.test(error.message) ? 409 : 502).json({ error: error.message });
  };

  app.get('/api/broker/positions', localOnly, brokerGuard, async (req, res) => {
    try {
      const body = await book('positions', () => breeze.getPositions());
      res.json({ positions: body.rows.map(mapPosition), fetchedAt: body.fetchedAt, provider: 'ICICI Direct Breeze' });
    } catch (error) { brokerFail(res, error); }
  });

  // Funds and margin as ICICI reports them. Margin is per exchange; a missing piece is reported as such
  // rather than failing the whole page.
  app.get('/api/broker/funds', localOnly, brokerGuard, async (req, res) => {
    try {
      const optional = async (key, loader) => {
        try {
          return { ok: true, value: (await book(key, async () => { const v = await loader(); return v ? [v] : []; })).rows[0] ?? null };
        } catch (error) {
          if (/session expired/i.test(error.message)) throw error;
          recordError('broker-funds', error.message);
          return { ok: false, error: error.message };
        }
      };
      const [funds, nse, nfo] = await Promise.all([
        optional('funds', () => breeze.getFunds()),
        optional('margin|NSE', () => breeze.getMargin('NSE')),
        optional('margin|NFO', () => breeze.getMargin('NFO')),
      ]);
      if (!funds.ok && !nse.ok && !nfo.ok) return brokerFail(res, new Error(funds.error));
      res.json({
        funds: funds.ok ? mapFundsDetail(funds.value) : null,
        fundsError: funds.ok ? null : funds.error,
        margins: [nse, nfo].map((m, i) => (m.ok ? mapMargin(m.value, i === 0 ? 'NSE' : 'NFO') : null)),
        marginErrors: [nse, nfo].map((m) => (m.ok ? null : m.error)),
        fetchedAt: new Date(now()).toISOString(),
        provider: 'ICICI Direct Breeze',
      });
    } catch (error) { brokerFail(res, error); }
  });

  app.get('/api/broker/orders', localOnly, brokerGuard, async (req, res) => {
    const w = parseWindow(req.query.from, req.query.to, istDateKey(now()));
    if (w.error) return res.status(400).json({ error: w.error });
    try {
      const parts = await Promise.all(exchangesFor(req.query.exchange).map((ex) => book(`orders|${ex}|${w.from}|${w.to}`, () => breeze.getOrders(ex, w.from, w.to))));
      const orders = parts.flatMap((p) => p.rows).map(mapOrder).sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
      res.json({ orders, summary: orderSummary(orders), window: w, fetchedAt: parts[0].fetchedAt, provider: 'ICICI Direct Breeze' });
    } catch (error) { brokerFail(res, error); }
  });

  app.get('/api/broker/trades', localOnly, brokerGuard, async (req, res) => {
    const w = parseWindow(req.query.from, req.query.to, istDateKey(now()));
    if (w.error) return res.status(400).json({ error: w.error });
    try {
      const parts = await Promise.all(exchangesFor(req.query.exchange).map((ex) => book(`trades|${ex}|${w.from}|${w.to}`, () => breeze.getTrades(ex, w.from, w.to))));
      const trades = parts.flatMap((p) => p.rows).map(mapTrade);
      res.json({ trades, realised: realisedRoundTrips(trades), window: w, fetchedAt: parts[0].fetchedAt, provider: 'ICICI Direct Breeze' });
    } catch (error) { brokerFail(res, error); }
  });

  app.get('/api/broker/trades/detail', localOnly, brokerGuard, async (req, res) => {
    const orderId = String(req.query.orderId || '');
    const exchange = req.query.exchange === 'NFO' ? 'NFO' : 'NSE';
    if (!/^[A-Za-z0-9-]{4,40}$/.test(orderId)) return res.status(400).json({ error: 'Invalid order id' });
    try {
      const body = await book(`detail|${exchange}|${orderId}`, () => breeze.getTradeDetail(exchange, orderId));
      res.json({ fills: body.rows.map(mapTradeDetail), fetchedAt: body.fetchedAt });
    } catch (error) { brokerFail(res, error); }
  });

  // ---- market depth from the exchange feed: best bid/ask and levels, only if the live stream supplies them.
  // This is a different thing from the order book above, which is YOUR orders.
  const depthTimers = new Map();
  // Depth for one symbol: subscribes to the feed on first use and keeps the subscription for 30 s after the last request
  function depthFor(symbol) {
    const token = instrumentFor(symbol)?.token ?? null;
    if (!breeze.isConnected() || !streamHub.isConnected() || !token) {
      return { symbol, available: false, reason: !breeze.isConnected() ? 'Broker not signed in' : !token ? 'Instrument not mapped for the live feed' : 'Live stream not connected' };
    }
    const key = depthKey(token);
    streamHub.subscribe(key);
    clearTimeout(depthTimers.get(key));
    depthTimers.set(key, setTimeout(() => { streamHub.unsubscribe(key); depthTimers.delete(key); }, 30000));
    const d = streamHub.getDepth(token);
    if (!d) return { symbol, available: false, reason: 'Subscribed; no depth received yet (the exchange sends depth only while trading)' };
    return { symbol, available: true, levels: d.levels, summary: depthSummary(d.levels), receivedAt: new Date(d.receivedAt).toISOString(), source: 'ICICI Direct live feed' };
  }

  app.get('/api/depth/:symbol', (req, res) => {
    const symbol = symbolOr400(req, res);
    if (!symbol) return;
    res.set('Cache-Control', 'no-store');
    res.json(depthFor(symbol));
  });

  // Several symbols at once (up to 10), for the order-flow view
  app.get('/api/depth', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const symbols = [...new Set(String(req.query.symbols || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))];
    if (symbols.length === 0 || symbols.length > 10 || !symbols.every(isValidSymbol)) {
      return res.status(400).json({ error: 'Send between 1 and 10 valid symbols' });
    }
    res.json({ depths: symbols.map(depthFor) });
  });

  app.post('/api/auth/breeze/disconnect', localOnly, (req, res) => {
    breeze.disconnect();
    stopStream();
    bookCache.clear();
    portfolioCache = null;
    res.json({ connected: false });
  });

  // ---- API diagnostics: what the server is doing and how much of ICICI's request budget is used
  app.get('/api/diagnostics', localOnly, async (req, res) => {
    await ensureHolidays();
    res.set('Cache-Control', 'no-store');
    const market = marketAt(now());
    res.json({
      generatedAt: new Date(now()).toISOString(),
      uptimeSec: Math.round((now() - startedAt) / 1000),
      market: {
        state: market.state, reason: market.reason, holiday: market.holiday, lastSession: market.lastSession,
        calendar: market.calendar, holidaysLoaded: holidays ? holidays.size : 0,
      },
      broker: {
        name: 'ICICI Direct Breeze',
        configured: breeze.configured,
        connected: breeze.isConnected(),
        connectedAt: breeze.connectedAt() ? new Date(breeze.connectedAt()).toISOString() : null,
        budget: breeze.budget(),
      },
      stream: streamHub.health(),
      instruments: { loaded: Boolean(master), count: master ? master.bySymbol.size : 0, loadedAt: masterLoadedAt ? new Date(masterLoadedAt).toISOString() : null },
      yahoo: { sessionReady: Boolean(yahooAuth) },
      cacheEntries: cache.size(),
      liveClients: [...liveSubscribers.values()].reduce((s, n) => s + n, 0),
      recentErrors: [...recentErrors].reverse(),
    });
  });

  // ---- live ticks for one stock as server-sent events. Sends only what the broker stream supplies;
  // the `trusted` flag says whether the exchange timestamp could be verified against our clock.
  app.get('/api/live/:symbol', (req, res) => {
    const symbol = symbolOr400(req, res);
    if (!symbol) return;
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.flushHeaders();

    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const token = instrumentFor(symbol)?.token ?? null;
    if (!breeze.isConnected() || !streamHub.isConnected() || !token) {
      send('status', { live: false, reason: !breeze.isConnected() ? 'broker not signed in' : !token ? 'instrument not mapped' : 'stream not connected' });
      return res.end();
    }

    const key = quoteKey(token);
    liveSubscribers.set(symbol, (liveSubscribers.get(symbol) ?? 0) + 1);
    streamHub.subscribe(key);
    send('status', { live: true });

    const emit = (q) => send('tick', {
      symbol, price: q.last, open: q.open, high: q.high, low: q.low, bid: q.bestBid, ask: q.bestAsk, volume: q.totalQty,
      asOf: q.lttMs === null ? null : new Date(q.lttMs).toISOString(), trusted: q.lttTrusted,
      status: q.lttTrusted && marketAt(now()).isOpen && now() - q.lttMs <= 2 * MINUTE ? 'LIVE' : q.lttTrusted ? 'MARKET_CLOSED' : 'DELAYED',
    });
    const current = streamHub.getQuote(token);
    if (current) emit(current);
    const off = streamHub.onTick((e) => { if (e.type === 'quote' && e.quote.token === token) emit(e.quote); });
    const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      off();
      const left = (liveSubscribers.get(symbol) ?? 1) - 1;
      if (left <= 0) {
        liveSubscribers.delete(symbol);
        streamHub.unsubscribe(key);
      } else liveSubscribers.set(symbol, left);
    });
  });

  // ---- index lists: which stocks belong to Nifty 50, Midcap, Smallcap, sector indices and so on
  app.get('/api/indices', (req, res) => {
    res.json(INDEX_DEFS.map(({ id, label, group }) => ({ id, label, group })));
  });

  app.get('/api/indices/:id', async (req, res) => {
    const def = indexDef(req.params.id);
    if (!def) return res.status(404).json({ error: 'Unknown index', dataStatus: DATA_STATUS.UNAVAILABLE });
    await serve(res, 'Index list', {
      key: `index_${def.id}`,
      policy: POLICY.indexList,
      load: async () => {
        const response = await fetchFn(`${INDEX_BASE}/ind_${def.file}list.csv`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`NSE index file HTTP ${response.status}`);
        const stocks = parseIndexCsv(await response.text());
        return {
          body: { id: def.id, label: def.label, group: def.group, count: stocks.length, stocks },
          status: DATA_STATUS.HISTORICAL, // a membership list, not a price: labelled as reference data
          provider: 'NSE Indices (niftyindices.com)',
          fetchedAt: new Date(now()).toISOString(),
          asOf: null,
        };
      },
    });
  });

  // ---- quotes for any list of NSE symbols (an index, a watchlist). Yahoo is asked in chunks of 50.
  app.get('/api/quotes', async (req, res) => {
    const symbols = [...new Set(String(req.query.symbols || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))];
    if (symbols.length === 0) return res.status(400).json({ error: 'No symbols given', dataStatus: DATA_STATUS.UNAVAILABLE });
    if (symbols.length > MAX_SYMBOLS_PER_REQUEST || !symbols.every(isValidSymbol)) {
      return res.status(400).json({ error: `Send up to ${MAX_SYMBOLS_PER_REQUEST} valid symbols`, dataStatus: DATA_STATUS.UNAVAILABLE });
    }
    symbols.sort();
    await serve(res, 'Quotes', {
      key: `quotes_${symbols.join(',')}`,
      policy: POLICY.quotesBatch,
      load: () => loadQuotesBatch(symbols),
    });
  });

  // ---- server-side alerts (this machine only: they are personal and can notify an external channel)
  const alertsView = () => ({ alerts: alerts.list(), events: alerts.events(), engine: alerts.status() });

  app.get('/api/alerts', localOnly, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(alertsView());
  });

  app.post('/api/alerts', localOnly, async (req, res) => {
    const result = await alerts.add({ symbol: req.body?.symbol, type: req.body?.type, threshold: req.body?.threshold });
    if (result.error) return res.status(400).json({ error: result.error });
    res.status(201).json({ alert: result.alert });
  });

  app.post('/api/alerts/import', localOnly, (req, res) => {
    res.json(alerts.importAlerts(req.body?.alerts));
  });

  app.post('/api/alerts/check', localOnly, async (req, res) => {
    const result = await alerts.check();
    res.json({ outcome: result.outcome, detail: result.detail, fired: result.fired, ...alertsView() });
  });

  app.post('/api/alerts/test-notification', localOnly, async (req, res) => {
    const result = await alerts.sendTest();
    res.status(result.ok ? 200 : 400).json(result);
  });

  for (const [action, run] of [['pause', (id) => alerts.pause(id)], ['activate', (id) => alerts.activate(id)]]) {
    app.post(`/api/alerts/:id/${action}`, localOnly, (req, res) => {
      if (!run(req.params.id)) return res.status(404).json({ error: 'Alert not found' });
      res.json(alertsView());
    });
  }

  app.delete('/api/alerts/:id', localOnly, (req, res) => {
    if (!alerts.remove(req.params.id)) return res.status(404).json({ error: 'Alert not found' });
    res.json(alertsView());
  });

  // ---- mainboard IPO tracking (NSE's public IPO feeds). Open and forthcoming issues also get their bid lot and
  // category-wise subscription from the issue's detail page; if that fails the issue is still listed without them.
  async function nseJson(apiPath, referer = 'https://www.nseindia.com/market-data/all-upcoming-issues-ipo') {
    const request = () => fetchFn(`https://www.nseindia.com/api/${apiPath}`, {
      headers: { ...NSE_HEADERS, Cookie: nseCookies, Referer: referer, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!nseCookies) await refreshNSECookies();
    let response = await request();
    if (response.status === 401 || response.status === 403) {
      await refreshNSECookies();
      response = await request();
    }
    if (!response.ok) throw new Error(`NSE HTTP ${response.status}`);
    return response.json();
  }

  async function loadIpos() {
    const upcoming = await nseJson('all-upcoming-issues?category=ipo');
    const [past, current] = await Promise.all([
      nseJson('public-past-issues'),
      nseJson('ipo-current-issue').catch(() => []),
    ]);
    if (!Array.isArray(upcoming) || !Array.isArray(past)) throw new Error('NSE IPO feed had an unexpected shape');
    const nowMs = now();
    const context = { todayKey: istDateKey(nowMs), holidays };
    const feeds = { upcoming, current: Array.isArray(current) ? current : [], past, details: {} };

    const live = buildIpos(feeds, context).filter((ipo) => ipo.stage === 'UPCOMING' || ipo.stage === 'OPEN');
    await Promise.all(live.map(async (ipo) => {
      try {
        feeds.details[ipo.symbol] = await nseJson(`ipo-detail?symbol=${encodeURIComponent(ipo.symbol)}&series=EQ`, `https://www.nseindia.com/market-data/issue-information?symbol=${encodeURIComponent(ipo.symbol)}&series=EQ&type=Active`);
      } catch (error) {
        recordError('ipo-detail', `${ipo.symbol}: ${error.message}`);
      }
    }));

    return {
      body: { ipos: buildIpos(feeds, context), todayKey: context.todayKey, calendar: holidays ? 'nse' : 'weekends-only' },
      status: DATA_STATUS.DELAYED, // unofficial website feed: never better than DELAYED
      provider: 'NSE India website',
      fetchedAt: new Date(nowMs).toISOString(),
      asOf: null,
    };
  }

  app.get('/api/ipos', async (req, res) => {
    await serve(res, 'IPO list', { key: 'ipos', policy: POLICY.ipos, load: loadIpos });
  });

  app.get('/api/market-status', async (req, res) => {
    await ensureHolidays();
    res.json(marketAt(now()));
  });

  return { app, refreshNSECookies, breeze, streamHub, alerts };
}
