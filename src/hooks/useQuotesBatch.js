import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchQuotes } from '../services/api';

const REFRESH_MS = 60000;

/**
 * Quotes for a list of symbols, refreshed every minute while enabled. Keeps the last good result
 * when a refresh fails and says so (`failed`), so the screen never silently shows old prices as new.
 */
export function useQuotesBatch(symbols, enabled = true) {
  const key = symbols.join(',');
  const [state, setState] = useState({ key: '', result: null, failed: false, loading: false });
  const run = useRef(0);

  const load = useCallback(async () => {
    if (!key) return;
    const id = ++run.current;
    setState((s) => ({ ...s, loading: true }));
    const result = await fetchQuotes(key.split(','));
    if (id !== run.current) return;
    setState((s) => (result
      ? { key, result, failed: false, loading: false }
      : { key, result: s.key === key ? s.result : null, failed: true, loading: false }));
  }, [key]);

  useEffect(() => {
    if (!enabled || !key) return undefined;
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => { clearInterval(timer); run.current++; };
  }, [enabled, key, load]);

  const current = state.key === key;
  return { result: current ? state.result : null, failed: current ? state.failed : false, loading: !key ? false : !current || state.loading, reload: load };
}
