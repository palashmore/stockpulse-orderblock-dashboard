import { useMemo } from 'react';
import { fetchQuotes } from '../services/api';
import { useRefresh } from './useRefresh';

/**
 * Quotes for a list of symbols, refreshed on the shared 60 s scheduler while enabled. Keeps the last
 * good result when a refresh fails and says so (`failed`), so the screen never silently shows old
 * prices as new.
 */
export function useQuotesBatch(symbols, enabled = true) {
  const key = symbols.join(',');
  const loader = useMemo(() => ({ force }) => fetchQuotes(key.split(','), { force }), [key]);
  const r = useRefresh(key ? `quotes:${key}` : '', loader, enabled && Boolean(key));
  return {
    result: r.data,
    failed: r.failures > 0,
    loading: r.loading,
    lastSuccessAt: r.lastSuccessAt,
    reload: r.refresh,
  };
}
