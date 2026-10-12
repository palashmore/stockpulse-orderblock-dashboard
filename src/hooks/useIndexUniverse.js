import { useEffect, useMemo, useState } from 'react';
import { fetchIndices, fetchIndexStocks } from '../services/api';

// Index menu and constituent lists, loaded once per session and shared by every screen.
let menuPromise = null;
const listPromises = new Map();

export function useIndexMenu() {
  const [menu, setMenu] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (!menuPromise) menuPromise = fetchIndices().then((m) => { if (!m) menuPromise = null; return m; });
    menuPromise.then((m) => { if (!cancelled) setMenu(m); });
    return () => { cancelled = true; };
  }, []);
  return menu;
}

/** Stocks of the chosen index as [{ symbol, name, sector }], or null while loading / on failure. */
export function useIndexStocks(indexId) {
  const [state, setState] = useState({ id: null, data: null, failed: false });
  useEffect(() => {
    let cancelled = false;
    if (!listPromises.has(indexId)) {
      listPromises.set(indexId, fetchIndexStocks(indexId).then((d) => { if (!d) listPromises.delete(indexId); return d; }));
    }
    listPromises.get(indexId).then((d) => { if (!cancelled) setState({ id: indexId, data: d, failed: !d }); });
    return () => { cancelled = true; };
  }, [indexId]);

  // Memoised on the loaded data: a new array on every render would make every effect that depends on
  // the stock list run again and again (this caused an infinite render loop once)
  const stocks = useMemo(
    () => (state.data ? state.data.stocks.map((s) => ({ symbol: s.symbol, name: s.name, sector: s.industry })) : null),
    [state.data]
  );

  if (state.id !== indexId) return { stocks: null, label: null, failed: false, loading: true };
  return {
    stocks,
    label: state.data?.label ?? null,
    failed: state.failed,
    loading: false,
  };
}
