import { useCallback, useEffect, useRef, useState } from 'react';
import { getRefreshCoordinator } from '../services/refreshCoordinator';

const EMPTY = { data: null, lastSuccessAt: null, failures: 0, error: null, inFlight: false };

/**
 * Subscribe a screen to a resource on the shared 60 s scheduler. `key` names the resource (symbol,
 * timeframe, universe...); changing it switches resources without losing the other state. The loader
 * receives `{ signal, force }` and must resolve null/throw on failure.
 */
export function useRefresh(key, loader, enabled = true, intervalMs) {
  const [state, setState] = useState({ key: null, ...EMPTY });
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    if (!enabled || !key) return undefined;
    return getRefreshCoordinator().subscribe(
      key,
      (opts) => loaderRef.current(opts),
      (s) => setState({ key, data: s.data, lastSuccessAt: s.lastSuccessAt, failures: s.failures, error: s.error, inFlight: s.inFlight }),
      { intervalMs },
    );
  }, [key, enabled, intervalMs]);

  const refresh = useCallback(() => (key ? getRefreshCoordinator().refresh(key) : Promise.resolve()), [key]);
  const current = state.key === key;
  return { ...(current ? state : EMPTY), loading: Boolean(key && enabled && (!current || (state.inFlight && state.data === null))), refresh };
}
