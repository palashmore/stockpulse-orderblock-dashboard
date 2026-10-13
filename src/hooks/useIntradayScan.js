import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchHistory } from '../services/api';
import { intradaySignals } from '../data/strategies';
import { dropFormingBar } from '../data/strategyGate';
import { loadStrategyConfig } from '../data/strategyStore';
import { evaluateSignal } from '../data/signalLifecycle';
import { createLoadCache } from '../data/loadCache';

const CONCURRENCY = 6;
const FRAME_MS = 300000; // 5-minute candles
const TTL_MS = 3 * 60 * 1000;
export const MAX_INTRADAY_SCAN = 150;
const cache = new Map(); // universe key -> { at, scans, excluded }
const fetched = createLoadCache({ ttlMs: TTL_MS, failTtlMs: 30 * 1000, max: 400 }); // per stock, so a switch of tab does not restart the scan

/**
 * Runs the Intraday workspace's rules over each stock's 5-minute candles (Yahoo, a few at a time,
 * never the broker request budget). For each stock it keeps the newest signal on the most recent
 * session, with how many 5-minute bars ago it fired. Stocks whose data is missing or stale are
 * counted in `excluded` and never shown.
 */
export function useIntradayScan(stocks, enabled) {
  const [state, setState] = useState({ scans: [], excluded: [], done: 0, total: 0, loading: false, loadedAt: null });
  const runId = useRef(0);
  const key = stocks.map((s) => s.symbol).join(',');

  const load = useCallback(async (force = false) => {
    if (!stocks.length) return;
    const hit = cache.get(key);
    if (!force && hit && Date.now() - hit.at < TTL_MS) {
      setState({ scans: hit.scans, excluded: hit.excluded, done: stocks.length, total: stocks.length, loading: false, loadedAt: hit.at });
      return;
    }
    const id = ++runId.current;
    const config = loadStrategyConfig('intraday', window.localStorage);
    setState((s) => ({ ...s, scans: [], excluded: [], done: 0, total: stocks.length, loading: true }));
    const scans = [];
    const excluded = [];
    let next = 0;
    let done = 0;

    const worker = async () => {
      while (next < stocks.length) {
        const stock = stocks[next++];
        if (id !== runId.current) return;
        const h = await fetched.get(stock.symbol, () => fetchHistory(stock.symbol, '1mo', '5m', { bulk: true }));
        if (id !== runId.current) return;
        let reason = null;
        if (!h) reason = 'no data';
        else if (['STALE', 'UNAVAILABLE', 'SIMULATED'].includes(h.dataStatus)) reason = h.dataStatus.toLowerCase();
        const usable = reason ? [] : dropFormingBar(h.candles.filter((c) => !c.partial), FRAME_MS, Date.now());
        if (!reason && usable.length < 60) reason = 'too little history';
        if (reason) excluded.push({ symbol: stock.symbol, reason });
        else {
          const last = usable[usable.length - 1];
          const lastDay = Math.floor(last.time / 86400);
          const sigs = intradaySignals(usable, config).filter((s) => Math.floor(s.time / 86400) === lastDay);
          const s = sigs.at(-1) ?? null;
          scans.push({
            ...stock,
            price: last.close,
            asOf: h.asOf,
            dataStatus: h.dataStatus,
            sessionSignals: sigs.length,
            latest: s ? { ...s, ageBars: usable.length - 1 - s.index, lifecycle: evaluateSignal(s, usable, { validBars: config.validBars, intraday: true }) } : null,
          });
        }
        done++;
        if (done % 5 === 0 || done === stocks.length) setState({ scans: [...scans], excluded: [...excluded], done, total: stocks.length, loading: done < stocks.length, loadedAt: null });
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    if (id !== runId.current) return;
    const at = Date.now();
    cache.set(key, { at, scans, excluded });
    if (cache.size > 4) cache.delete(cache.keys().next().value);
    setState({ scans, excluded, done: stocks.length, total: stocks.length, loading: false, loadedAt: at });
  }, [stocks, key]);

  useEffect(() => {
    if (!enabled) return undefined;
    load(false);
    return () => { runId.current++; };
  }, [enabled, load]);

  return { ...state, reload: () => load(true) };
}
