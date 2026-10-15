import { useEffect, useMemo, useState } from 'react';
import { fetchHistory } from '../services/api';
import { getIndexList } from './useUniverse';
import { analysePortfolio, buildClassifier } from '../data/portfolioAnalysis';

export const MAX_REVIEWED = 40; // the largest holdings by value; each needs one history request
const CONCURRENCY = 4;
const CLASSIFIER_INDEX_IDS = ['bank', 'it', 'auto', 'pharma', 'fmcg', 'metal', 'realty', 'media', 'consumerdurables', 'energy', 'oilgas', 'healthcare', 'financeservices', 'infra', 'nifty100', 'midcap150', 'smallcap250'];
const UNUSABLE = new Set(['STALE', 'UNAVAILABLE', 'SIMULATED']);

/**
 * Loads about a year of daily history for the largest holdings and the NSE index lists used to label sectors and
 * sizes, then runs the pure analysis. Nothing is invented for a holding whose history could not be loaded: it
 * appears without a verdict and is listed in `missing`.
 * @param holdings the holdings from /api/portfolio (or null)
 * @param costs    { SYMBOL: average buy price } typed in by the user
 */
export function usePortfolioAnalysis(holdings, { funds = null, totalValue = null, costs = {} } = {}) {
  const [state, setState] = useState({ key: '', status: 'idle', done: 0, total: 0, candles: new Map(), lists: [], missing: [] });

  const targets = useMemo(
    () => (holdings ?? []).filter((h) => h.symbol && Number.isFinite(h.value)).sort((a, b) => b.value - a.value).slice(0, MAX_REVIEWED).map((h) => h.symbol),
    [holdings],
  );
  const key = targets.join(',');

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    const symbols = key.split(',');
    const candles = new Map();
    const missing = [];
    let done = 0;
    let next = 0;
    // State is only written from async callbacks, and never after this run was cancelled by a newer one
    const progress = (status) => { if (!cancelled) setState((s) => ({ ...s, key, status, done, total: symbols.length, candles: new Map(candles), missing: [...missing] })); };
    const start = setTimeout(() => progress('loading'), 0);

    const lists = Promise.all(CLASSIFIER_INDEX_IDS.map((index) => getIndexList(index)))
      .then((results) => results.flatMap((d, i) => (d ? [{ id: CLASSIFIER_INDEX_IDS[i], label: d.label, symbols: d.stocks.map((s) => s.symbol) }] : [])));

    const worker = async () => {
      while (next < symbols.length) {
        const symbol = symbols[next++];
        const history = await fetchHistory(symbol, '1y', '1d', { bulk: true });
        if (cancelled) return;
        if (!history || UNUSABLE.has(history.dataStatus)) missing.push(symbol);
        else candles.set(symbol, history.candles);
        done++;
        if (done % 3 === 0 || done === symbols.length) progress('loading');
      }
    };
    Promise.all([lists, ...Array.from({ length: CONCURRENCY }, worker)]).then(([loaded]) => {
      if (cancelled) return;
      setState({ key, status: 'ready', done: symbols.length, total: symbols.length, candles, lists: loaded, missing });
    });
    return () => { clearTimeout(start); cancelled = true; };
  }, [key]);

  const ready = state.key === key && state.status === 'ready';
  const analysis = useMemo(() => {
    if (!ready || !holdings) return null;
    return analysePortfolio({ holdings, candlesBySymbol: state.candles, classify: buildClassifier(state.lists), funds, totalValue, costs });
  }, [ready, holdings, state.candles, state.lists, funds, totalValue, costs]);

  return {
    analysis,
    candles: ready ? state.candles : null,
    loading: Boolean(key) && !ready,
    progress: state.key === key ? { done: state.done, total: state.total } : { done: 0, total: targets.length },
    missing: state.key === key ? state.missing : [],
    limited: (holdings ?? []).filter((h) => h.symbol && Number.isFinite(h.value)).length > MAX_REVIEWED,
  };
}
