import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchHistory } from '../services/api';
import { screenerMetrics } from '../data/screenerMetrics';
import { createLoadCache } from '../data/loadCache';

const CONCURRENCY = 6;
const STALE_STATUSES = new Set(['STALE', 'UNAVAILABLE', 'SIMULATED']);

/**
 * Loads six months of daily candles for each stock (a few at a time, from Yahoo, never the broker
 * budget) and turns them into screener rows. Stocks whose data is stale/unavailable, or that have too
 * little history, are counted in `excluded` and never shown with guessed values.
 * Results are kept for `ttlMs` so switching tabs does not reload everything.
 */
const cache = new Map(); // universe key -> { at, rows, excluded }
// One entry per stock (not per universe): a scan that is interrupted by a tab switch keeps what it loaded, a second scan
// of the same stocks reuses it, and two scans asking for the same stock at once share one request.
const outcomes = createLoadCache({ ttlMs: 10 * 60 * 1000, failTtlMs: 30 * 1000, max: 800 });

/** The result of loading and measuring one stock: { metrics, dataStatus, provider } or { reason }. */
async function loadOutcome(symbol) {
  const history = await fetchHistory(symbol, '6mo', '1d', { bulk: true });
  let reason = null;
  if (!history) reason = 'no data';
  else if (STALE_STATUSES.has(history.dataStatus)) reason = history.dataStatus.toLowerCase();
  const metrics = reason ? null : screenerMetrics(history.candles);
  if (!reason && !metrics) reason = 'too little history';
  return reason ? { reason } : { metrics, dataStatus: history.dataStatus, provider: history.provider };
}
const isFailed = (o) => Boolean(o.reason);
export const MAX_SCAN = 250;
const TTL_MS = 10 * 60 * 1000;

export function useScreenerData(stocks, enabled) {
  const [state, setState] = useState({ rows: [], excluded: [], done: 0, total: 0, loading: false, loadedAt: null });
  const runId = useRef(0);
  const key = stocks.map((s) => s.symbol).join(',');

  const load = useCallback(async (force = false) => {
    if (!stocks.length) return;
    const hit = cache.get(key);
    if (!force && hit && Date.now() - hit.at < TTL_MS) {
      setState({ rows: hit.rows, excluded: hit.excluded, done: stocks.length, total: stocks.length, loading: false, loadedAt: hit.at });
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
        if (id !== runId.current) return; // superseded or left: stop taking new stocks (finished ones stay cached)
        const stock = stocks[next++];
        const outcome = await outcomes.get(stock.symbol, () => loadOutcome(stock.symbol), isFailed);
        if (id !== runId.current) return;
        if (outcome.reason) excluded.push({ symbol: stock.symbol, reason: outcome.reason });
        else rows.push({ ...stock, metrics: outcome.metrics, dataStatus: outcome.dataStatus, provider: outcome.provider });
        done++;
        if (done % 5 === 0 || done === stocks.length) setState({ rows: [...rows], excluded: [...excluded], done, total: stocks.length, loading: done < stocks.length, loadedAt: null });
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    if (id !== runId.current) return;
    const at = Date.now();
    cache.set(key, { at, rows, excluded });
    if (cache.size > 6) cache.delete(cache.keys().next().value);
    setState({ rows, excluded, done: stocks.length, total: stocks.length, loading: false, loadedAt: at });
  }, [stocks, key]);

  useEffect(() => {
    if (!enabled) return undefined;
    load(false);
    return () => { runId.current++; };
  }, [enabled, load]);

  return { ...state, reload: () => load(true) };
}
