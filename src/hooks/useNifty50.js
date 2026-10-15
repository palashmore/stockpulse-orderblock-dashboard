import { useMemo } from 'react';
import { NIFTY_STOCKS, generateCandlestickData } from '../data/stockData';
import { fetchNifty50 } from '../services/api';

const REFRESH_MS = 60000;

// Quote-shaped rows built from generated candles. Only used in explicit demo mode.
function demoQuotes() {
  return NIFTY_STOCKS.map((stock) => {
    const candles = generateCandlestickData(stock.symbol);
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const volumes = candles.map((c) => c.volume);
    return {
      symbol: stock.symbol,
      name: stock.name,
      price: last.close,
      change: last.close - prev.close,
      changePct: ((last.close - prev.close) / prev.close) * 100,
      high: last.high,
      low: last.low,
      volume: last.volume,
      avgVolume: volumes.reduce((s, v) => s + v, 0) / volumes.length,
    };
  });
}

/**
 * Nifty 50 quotes shared by the watchlist and the ranked board: real quotes from the backend
 * (refreshed every minute), or generated rows only when demo mode is explicitly on.
 */
export function useNifty50(demoMode) {
  const r = useRefresh('nifty50', ({ force }) => fetchNifty50({ force }), !demoMode);
  const demo = useMemo(() => (demoMode ? demoQuotes() : []), [demoMode]);

  if (demoMode) return { quotes: demo, status: 'SIMULATED', asOf: null, failed: false, loaded: true, retry: () => {} };
  const result = r.data;
  return {
    quotes: result?.quotes ?? [],
    status: result?.dataStatus ?? null,
    asOf: result?.asOf ?? null,
    failed: r.failures > 0,
    loaded: result !== null || r.failures > 0,
    lastSuccessAt: r.lastSuccessAt,
    retry: r.refresh,
  };
}
