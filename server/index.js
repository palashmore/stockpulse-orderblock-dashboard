import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 30000; // 30 seconds

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data;
  }
  cache.delete(key);
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

// Yahoo Finance API headers
const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

// NSE API headers
const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nseindia.com/',
};

let nseCookies = '';

async function fetchWithRetry(url, headers, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      if (i === retries) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

// Get NSE cookies for authenticated requests
async function refreshNSECookies() {
  try {
    const response = await fetch('https://www.nseindia.com/', {
      headers: NSE_HEADERS,
      signal: AbortSignal.timeout(10000),
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      nseCookies = setCookie.split(',').map(c => c.split(';')[0].trim()).join('; ');
    }
  } catch (e) {
    console.log('NSE cookie refresh failed:', e.message);
  }
}

// Nifty 50 symbols list
const NIFTY50_SYMBOLS = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
  'HINDUNILVR', 'SBIN', 'BHARTIARTL', 'KOTAKBANK', 'ITC',
  'LT', 'AXISBANK', 'BAJFINANCE', 'MARUTI', 'TITAN',
  'SUNPHARMA', 'TATAMOTORS', 'WIPRO', 'HCLTECH', 'ADANIENT',
  'TATASTEEL', 'NTPC', 'POWERGRID', 'ONGC', 'JSWSTEEL',
  'COALINDIA', 'TECHM', 'DRREDDY', 'ASIANPAINT', 'ULTRACEMCO',
  'BAJAJFINSV', 'NESTLEIND', 'CIPLA', 'TATACONSUM', 'APOLLOHOSP',
  'HEROMOTOCO', 'DIVISLAB', 'BRITANNIA', 'EICHERMOT', 'HINDALCO',
  'SBILIFE', 'M&M', 'GRASIM', 'INDUSINDBK', 'BPCL',
  'HDFCLIFE', 'SHRIRAMFIN', 'BAJAJ-AUTO', 'TRENT', 'JSWENERGY',
];

// ============ ROUTES ============

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Search stocks
app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) return res.json([]);

    const cacheKey = `search_${query}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&lang=en-US&region=IN&quotesCount=10&newsCount=0&enableFuzzyQuery=false&quotesQueryId=tss_match_phrase_query`;
    const data = await fetchWithRetry(url, YAHOO_HEADERS);

    const results = (data.quotes || []).filter(q =>
      q.exchange === 'NSI' || q.exchange === 'NSE' || q.exchange === 'BSE' || q.exchDisp === 'NSI'
    ).map(q => ({
      symbol: q.symbol.replace('.NS', '').replace('.BO', ''),
      name: q.longname || q.shortname || q.symbol,
      exchange: q.exchange,
      type: q.quoteType,
      yahooSymbol: q.symbol,
    }));

    setCache(cacheKey, results);
    res.json(results);
  } catch (error) {
    console.error('Search error:', error.message);
    // Fallback: filter from Nifty 50 list
    const query = (req.query.q || '').toLowerCase();
    const fallback = NIFTY50_SYMBOLS
      .filter(s => s.toLowerCase().includes(query))
      .map(s => ({ symbol: s, name: s, exchange: 'NSE', yahooSymbol: `${s}.NS` }));
    res.json(fallback);
  }
});

// Get real-time quote for a stock
app.get('/api/quote/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const yahooSymbol = symbol.includes('.') ? symbol : `${symbol}.NS`;

    const cacheKey = `quote_${yahooSymbol}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${yahooSymbol}`;
    const data = await fetchWithRetry(url, YAHOO_HEADERS);

    const quote = data.quoteResponse?.result?.[0];
    if (!quote) {
      return res.status(404).json({ error: 'Stock not found' });
    }

    const result = {
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
    };

    setCache(cacheKey, result);
    res.json(result);
  } catch (error) {
    console.error('Quote error:', error.message);
    res.status(500).json({ error: 'Failed to fetch quote', message: error.message });
  }
});

// Get historical OHLCV data
app.get('/api/history/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const yahooSymbol = symbol.includes('.') ? symbol : `${symbol}.NS`;
    const range = req.query.range || '6mo';
    const interval = req.query.interval || '1d';

    const cacheKey = `history_${yahooSymbol}_${range}_${interval}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?range=${range}&interval=${interval}&includeAdjustedClose=true`;
    const data = await fetchWithRetry(url, YAHOO_HEADERS);

    const chart = data.chart?.result?.[0];
    if (!chart) {
      return res.status(404).json({ error: 'No data found' });
    }

    const timestamps = chart.timestamp || [];
    const ohlcv = chart.indicators?.quote?.[0] || {};
    const adjClose = chart.indicators?.adjclose?.[0]?.adjclose || [];

    const candles = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (ohlcv.open[i] === null || ohlcv.close[i] === null) continue;

      const date = new Date(timestamps[i] * 1000);
      candles.push({
        time: date.toISOString().split('T')[0],
        open: parseFloat(ohlcv.open[i].toFixed(2)),
        high: parseFloat(ohlcv.high[i].toFixed(2)),
        low: parseFloat(ohlcv.low[i].toFixed(2)),
        close: parseFloat(ohlcv.close[i].toFixed(2)),
        volume: ohlcv.volume[i] || 0,
        adjClose: adjClose[i] ? parseFloat(adjClose[i].toFixed(2)) : null,
      });
    }

    const result = {
      symbol: symbol.replace('.NS', ''),
      currency: chart.meta?.currency || 'INR',
      exchange: chart.meta?.exchangeName || 'NSI',
      candles,
    };

    setCache(cacheKey, result);
    res.json(result);
  } catch (error) {
    console.error('History error:', error.message);
    res.status(500).json({ error: 'Failed to fetch history', message: error.message });
  }
});

// Get options chain data (for OI analysis)
app.get('/api/options/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();

    const cacheKey = `options_${symbol}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    // Try NSE options chain first
    try {
      if (!nseCookies) await refreshNSECookies();

      const nseUrl = `https://www.nseindia.com/api/option-chain-equities?symbol=${encodeURIComponent(symbol)}`;
      const nseResponse = await fetch(nseUrl, {
        headers: { ...NSE_HEADERS, Cookie: nseCookies },
        signal: AbortSignal.timeout(10000),
      });

      if (nseResponse.ok) {
        const nseData = await nseResponse.json();
        const records = nseData.records || {};
        const filteredData = nseData.filtered || {};

        // Process options chain for OI analysis
        const expiryDates = records.expiryDates || [];
        const currentExpiry = expiryDates[0] || '';
        const strikePrices = records.strikePrices || [];
        const underlyingValue = records.underlyingValue || 0;

        // Aggregate OI data by strike
        const oiData = [];
        const allData = filteredData.data || records.data || [];
        let totalCallOI = 0;
        let totalPutOI = 0;
        let totalCallOIChange = 0;
        let totalPutOIChange = 0;

        for (const row of allData) {
          const strike = row.strikePrice;
          const callOI = row.CE?.openInterest || 0;
          const putOI = row.PE?.openInterest || 0;
          const callOIChange = row.CE?.changeinOpenInterest || 0;
          const putOIChange = row.PE?.changeinOpenInterest || 0;
          const callVolume = row.CE?.totalTradedVolume || 0;
          const putVolume = row.PE?.totalTradedVolume || 0;
          const callLTP = row.CE?.lastPrice || 0;
          const putLTP = row.PE?.lastPrice || 0;
          const callIV = row.CE?.impliedVolatility || 0;
          const putIV = row.PE?.impliedVolatility || 0;

          totalCallOI += callOI;
          totalPutOI += putOI;
          totalCallOIChange += callOIChange;
          totalPutOIChange += putOIChange;

          oiData.push({
            strike,
            callOI, putOI,
            callOIChange, putOIChange,
            callVolume, putVolume,
            callLTP, putLTP,
            callIV, putIV,
          });
        }

        // Calculate PCR (Put-Call Ratio)
        const pcr = totalCallOI > 0 ? (totalPutOI / totalCallOI).toFixed(2) : 0;

        // Find Max Pain (strike where total option value is minimized)
        let maxPainStrike = underlyingValue;
        let minPain = Infinity;
        for (const row of oiData) {
          let pain = 0;
          for (const inner of oiData) {
            if (inner.strike < row.strike) pain += inner.callOI * (row.strike - inner.strike);
            if (inner.strike > row.strike) pain += inner.putOI * (inner.strike - row.strike);
          }
          if (pain < minPain) {
            minPain = pain;
            maxPainStrike = row.strike;
          }
        }

        // Find highest OI strikes (support/resistance)
        const sortedByCallOI = [...oiData].sort((a, b) => b.callOI - a.callOI);
        const sortedByPutOI = [...oiData].sort((a, b) => b.putOI - a.putOI);

        const resistance = sortedByCallOI.slice(0, 3).map(d => ({
          strike: d.strike,
          oi: d.callOI,
          oiChange: d.callOIChange,
        }));

        const support = sortedByPutOI.slice(0, 3).map(d => ({
          strike: d.strike,
          oi: d.putOI,
          oiChange: d.putOIChange,
        }));

        const result = {
          symbol,
          underlyingValue,
          currentExpiry,
          expiryDates,
          pcr: parseFloat(pcr),
          maxPain: maxPainStrike,
          totalCallOI,
          totalPutOI,
          totalCallOIChange,
          totalPutOIChange,
          resistance,
          support,
          oiData,
          source: 'NSE',
        };

        setCache(cacheKey, result);
        return res.json(result);
      }
    } catch (nseError) {
      console.log('NSE options fetch failed, trying Yahoo:', nseError.message);
    }

    // Fallback: Yahoo Finance options
    const yahooSymbol = `${symbol}.NS`;
    const yahooUrl = `https://query1.finance.yahoo.com/v7/finance/options/${yahooSymbol}`;
    const yahooData = await fetchWithRetry(yahooUrl, YAHOO_HEADERS);

    const optionChain = yahooData.optionChain?.result?.[0] || {};
    const options = optionChain.options?.[0] || {};
    const calls = options.calls || [];
    const puts = options.puts || [];
    const underlyingPrice = optionChain.quote?.regularMarketPrice || 0;

    const oiMap = new Map();
    let totalCallOI = 0;
    let totalPutOI = 0;

    for (const call of calls) {
      totalCallOI += call.openInterest || 0;
      oiMap.set(call.strike, {
        strike: call.strike,
        callOI: call.openInterest || 0,
        callOIChange: call.change || 0,
        callVolume: call.volume || 0,
        callLTP: call.lastPrice || 0,
        callIV: call.impliedVolatility || 0,
        putOI: 0, putOIChange: 0, putVolume: 0, putLTP: 0, putIV: 0,
      });
    }

    for (const put of puts) {
      totalPutOI += put.openInterest || 0;
      const existing = oiMap.get(put.strike) || {
        strike: put.strike,
        callOI: 0, callOIChange: 0, callVolume: 0, callLTP: 0, callIV: 0,
      };
      existing.putOI = put.openInterest || 0;
      existing.putOIChange = put.change || 0;
      existing.putVolume = put.volume || 0;
      existing.putLTP = put.lastPrice || 0;
      existing.putIV = put.impliedVolatility || 0;
      oiMap.set(put.strike, existing);
    }

    const oiData = Array.from(oiMap.values()).sort((a, b) => a.strike - b.strike);
    const pcr = totalCallOI > 0 ? (totalPutOI / totalCallOI).toFixed(2) : 0;

    const result = {
      symbol,
      underlyingValue: underlyingPrice,
      currentExpiry: options.expirationDate ? new Date(options.expirationDate * 1000).toISOString().split('T')[0] : '',
      expiryDates: (optionChain.expirationDates || []).map(d => new Date(d * 1000).toISOString().split('T')[0]),
      pcr: parseFloat(pcr),
      maxPain: underlyingPrice,
      totalCallOI,
      totalPutOI,
      totalCallOIChange: 0,
      totalPutOIChange: 0,
      resistance: [...oiData].sort((a, b) => b.callOI - a.callOI).slice(0, 3).map(d => ({ strike: d.strike, oi: d.callOI, oiChange: d.callOIChange })),
      support: [...oiData].sort((a, b) => b.putOI - a.putOI).slice(0, 3).map(d => ({ strike: d.strike, oi: d.putOI, oiChange: d.putOIChange })),
      oiData,
      source: 'Yahoo',
    };

    setCache(cacheKey, result);
    res.json(result);
  } catch (error) {
    console.error('Options error:', error.message);
    res.status(500).json({ error: 'Failed to fetch options data', message: error.message });
  }
});

// Get batch quotes for Nifty 50
app.get('/api/nifty50', async (req, res) => {
  try {
    const cacheKey = 'nifty50_quotes';
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const symbols = NIFTY50_SYMBOLS.map(s => `${s}.NS`).join(',');
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`;
    const data = await fetchWithRetry(url, YAHOO_HEADERS);

    const quotes = (data.quoteResponse?.result || []).map(q => ({
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

    setCache(cacheKey, quotes);
    res.json(quotes);
  } catch (error) {
    console.error('Nifty50 error:', error.message);
    res.status(500).json({ error: 'Failed to fetch Nifty 50 data', message: error.message });
  }
});

// Market status
app.get('/api/market-status', async (req, res) => {
  try {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    const hours = istNow.getUTCHours();
    const minutes = istNow.getUTCMinutes();
    const day = istNow.getUTCDay();
    const timeInMinutes = hours * 60 + minutes;

    const isWeekday = day >= 1 && day <= 5;
    const isMarketHours = timeInMinutes >= 555 && timeInMinutes <= 930; // 9:15 AM to 3:30 PM IST
    const isPreOpen = timeInMinutes >= 540 && timeInMinutes < 555; // 9:00 to 9:15

    res.json({
      isOpen: isWeekday && isMarketHours,
      isPreOpen: isWeekday && isPreOpen,
      currentTime: istNow.toISOString(),
      marketOpen: '09:15',
      marketClose: '15:30',
      timezone: 'IST',
      day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`\n  🚀 StockPulse API Server running at http://localhost:${PORT}`);
  console.log(`  📊 Endpoints:`);
  console.log(`     GET /api/quote/:symbol     - Real-time stock quote`);
  console.log(`     GET /api/history/:symbol   - Historical OHLCV data`);
  console.log(`     GET /api/options/:symbol   - Options chain & OI data`);
  console.log(`     GET /api/nifty50           - All Nifty 50 quotes`);
  console.log(`     GET /api/search?q=query    - Search stocks`);
  console.log(`     GET /api/market-status     - Market open/close status\n`);

  // Pre-warm NSE cookies
  refreshNSECookies();
});
