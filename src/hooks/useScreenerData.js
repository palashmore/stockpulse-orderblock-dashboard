import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchHistory } from '../services/api';
import { screenerMetrics } from '../data/screenerMetrics';

const CONCURRENCY = 4;
const STALE_STATUSES = new Set(['STALE', 'UNAVAILABLE', 'SIMULATED']);

/**
 * Loads six months of daily candles for each stock (a few at a time, from Yahoo, never the broker
 * budget) and turns them into screener rows. Stocks whose data is stale/unavailable, or that have too
 * little history, are counted in `excluded` and never shown with guessed values.
 * Results are kept for `ttlMs` so switching tabs does not reload everything.
 */
const cache = { at: 0, key: '', rows: [], excluded: [] };
const TTL_MS = 10 * 60 * 1000;

export function useScreenerData(stocks, enabled) {
  const [state, setState] = useState({ rows: [], excluded: [], done: 0, total: 0, loading: false, loadedAt: null });
  const runId = useRef(0);
  const key = stocks.map((s) => s.symbol).join(',');

  const load = useCallback(async (force = false) => {
    if (!stocks.length) return;
    if (!force && cache.key === key && Date.now() - cache.at < TTL_MS) {
      setState({ rows: cache.rows, excluded: cache.excluded, done: stocks.length, total: stocks.length, loading: false, loadedAt: cache.at });
      return;
    }
    const id = ++runId.current;
    setState((s) => ({ ...s, rows: [], excluded: [], done: 0, total: stocks.length, loading: true }));
    const rows = [];
    const excluded = [];
    let next = 0;
    let done = 0;

    const worker = async () => {
      while (next < stocks.length) {
        const stock = stocks[next++];
        const history = await fetchHistory(stock.symbol, '6mo', '1d', { bulk: true });
        if (id !== runId.current) return;
        let reason = null;
        if (!history) reason = 'no data';
        else if (STALE_STATUSES.has(history.dataStatus)) reason = history.dataStatus.toLowerCase();
        const metrics = reason ? null : screenerMetrics(history.candles);
        if (!reason && !metrics) reason = 'too little history';
        if (reason) excluded.push({ symbol: stock.symbol, reason });
        else rows.push({ ...stock, metrics, dataStatus: history.dataStatus, provider: history.provider });
        done++;
        if (done % 5 === 0 || done === stocks.length) setState({ rows: [...rows], excluded: [...excluded], done, total: stocks.length, loading: done < stocks.length, loadedAt: null });
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    if (id !== runId.current) return;
    cache.at = Date.now();
    cache.key = key;
    cache.rows = rows;
    cache.excluded = excluded;
    setState({ rows, excluded, done: stocks.length, total: stocks.length, loading: false, loadedAt: cache.at });
  }, [stocks, key]);

  useEffect(() => {
    if (!enabled) return undefined;
    load(false);
    return () => { runId.current++; };
  }, [enabled, load]);

  return { ...state, reload: () => load(true) };
}
