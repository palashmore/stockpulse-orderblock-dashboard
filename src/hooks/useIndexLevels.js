import { useEffect, useState } from 'react';
import { fetchIndexLevels } from '../services/api';

const REFRESH_MS = 60_000;
const RETRY_MS = 10_000; // after a failure, look again soon instead of waiting a minute

/**
 * NSE index levels, refreshed every minute while `enabled`. Keeps the last good answer when a refresh fails and says so
 * (`failed`), so an old level is never shown as new. `levels` is null until the first answer.
 */
export function useIndexLevels(enabled = true) {
  const [state, setState] = useState({ levels: null, failed: false, loaded: false });

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let timer = null;
    const load = async () => {
      const levels = await fetchIndexLevels();
      if (cancelled) return;
      setState((s) => (levels ? { levels, failed: false, loaded: true } : { levels: s.levels, failed: true, loaded: true }));
      timer = setTimeout(() => { if (!document.hidden) load(); else timer = setTimeout(load, REFRESH_MS); }, levels ? REFRESH_MS : RETRY_MS);
    };
    timer = setTimeout(load, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [enabled]);

  return state;
}
