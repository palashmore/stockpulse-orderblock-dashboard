import { useEffect, useState } from 'react';
import { fetchIndexLevels } from '../services/api';

const REFRESH_MS = 60_000;

/**
 * NSE index levels, refreshed every minute while `enabled`. Keeps the last good answer when a refresh fails and says so
 * (`failed`), so an old level is never shown as new. `levels` is null until the first answer.
 */
export function useIndexLevels(enabled = true) {
  const [state, setState] = useState({ levels: null, failed: false, loaded: false });

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const load = async () => {
      const levels = await fetchIndexLevels();
      if (cancelled) return;
      setState((s) => (levels ? { levels, failed: false, loaded: true } : { levels: s.levels, failed: true, loaded: true }));
    };
    const first = setTimeout(load, 0);
    const timer = setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
    return () => { cancelled = true; clearTimeout(first); clearInterval(timer); };
  }, [enabled]);

  return state;
}
