import { useState, useMemo, useEffect, useCallback } from 'react';
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
  const [state, setState] = useState({ quotes: [], status: null, asOf: null, failed: false, loaded: false });

  const load = useCallback(async (force = false) => {
    const result = await fetchNifty50({ force: force === true });
    setState((prev) => {
      if (!result) return { ...prev, failed: true, loaded: true };
      return { quotes: result.quotes, status: result.dataStatus, asOf: result.asOf, failed: false, loaded: true };
    });
  }, []);

  useEffect(() => {
    if (demoMode) return;
    load(); // may use a copy fetched a moment ago by another screen
    const interval = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(interval);
  }, [demoMode, load]);

  const demo = useMemo(() => (demoMode ? demoQuotes() : []), [demoMode]);

  if (demoMode) return { quotes: demo, status: 'SIMULATED', asOf: null, failed: false, loaded: true, retry: () => load(true) };
  return { ...state, retry: () => load(true) };
}
