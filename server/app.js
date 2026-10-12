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
  historyIntraday: { ttl: 60 * 1000, maxStale: 60 * MINUTE },
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
  rateLimit = { windowMs: 60_000, max: Number(process.env.RATE_LIMIT_PER_MIN) || 120 },
  upstreamConcurrency = Number(process.env.UPSTREAM_CONCURRENCY) || 4,
  // Exchange holiday calendar source. Defaults to NSE's own list when the real fetch is in use and
  // is off when a custom fetchFn is injected (tests, fake feeds); then only weekends are detected.
  holidayFetch = rawFetch === globalThis.fetch ? globalThis.fetch : null,
  breeze = createBreezeClient({ appKey: process.env.BREEZE_API_KEY, secret: process.env.BREEZE_API_SECRET }),
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

  async function serve(res, label, { key, policy, load }) {
    await ensureHolidays();
    const fresh = cache.getFresh(key, policy.ttl);
    if (fresh) return respond(res, fresh);

    try {
      let pending = inFlight.get(key);
      if (!pending) {
        pending = load().finally(() => inFlight.delete(key));
        inFlight.set(key, pending);
      }
      const entry = await pending;
      cache.set(key, entry);
      return respond(res, entry);
    } catch (error) {
      if (error instanceof HttpError) {
        return res.status(error.status).json({ error: error.message, dataStatus: DATA_STATUS.UNAVAILABLE });
      }
      console.error(`${label} error:`, error.message);
      const stale = cache.getStale(key, policy.maxStale);
      if (stale) return respond(res, stale.entry, stale.ageMs);
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

  // ============ BROKER FEED (ICICI Direct Breeze) ============
  // Used when the user has signed in and the symbol is mapped. Any failure falls back to Yahoo,
  // and every response names its provider, so the two feeds are never silently mixed.

  async function brokerQuote(symbol) {
    const code = breeze.isConnected() ? breezeCodeFor(symbol) : null;
    if (!code) return null;
    try {
      const quote = await breeze.getQuote(code, symbol);
      const nowMs = now();
      const lastTradeMs = parseBreezeTime(quote.lastTradeTime);
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
      return null;
    }
  }

  async function brokerHistory(symbol, range, interval) {
    const code = breeze.isConnected() ? breezeCodeFor(symbol) : null;
    const days = RANGE_DAYS[range];
    if (!code || !BREEZE_INTERVALS[interval] || days === undefined) return null;
    try {
      const nowMs = now();
      const intraday = interval !== '1d';
      const candles = await breeze.getHistory(code, interval, nowMs - days * 86400000, nowMs);
      markPartialCandles(candles, interval, marketAt(nowMs), holidays);
      const last = candles[candles.length - 1];
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
      return null;
    }
  }

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

      cache.set(cacheKey, results);
      res.json(results);
    } catch (error) {
      console.error('Search error:', error.message);
      // Fallback: filter the static Nifty 50 symbol list
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
      load: async () => {
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
      },
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

    await serve(res, 'History', {
      key: `history_${yahooSymbol}_${range}_${interval}`,
      policy: intraday ? POLICY.historyIntraday : POLICY.history,
      load: async () => {
        const viaBroker = await brokerHistory(symbol, range, interval);
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
    const session = extractSessionToken(req.body?.session);
    if (!session) return res.status(400).json({ error: 'Paste the redirect address (or its apisession value) after signing in' });
    try {
      await breeze.connect(session);
      res.json({ connected: true });
    } catch (error) {
      res.status(502).json({ connected: false, error: error.message });
    }
  });

  app.post('/api/auth/breeze/disconnect', localOnly, (req, res) => {
    breeze.disconnect();
    res.json({ connected: false });
  });

  app.get('/api/market-status', async (req, res) => {
    await ensureHolidays();
    res.json(marketAt(now()));
  });

  return { app, refreshNSECookies, breeze };
}
