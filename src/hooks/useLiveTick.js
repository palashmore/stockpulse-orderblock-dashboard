import { useEffect, useState } from 'react';
import { API_BASE } from '../services/api';

const RETRY_MS = 60000;

/**
 * Live ticks for one stock from the server's broker stream (server-sent events). Resolves to
 * { tick, live }: `tick` is the latest tick or null; `live` is false when the server says no live
 * feed exists (not signed in, instrument unmapped, stream down). When there is no live feed it
 * retries once a minute rather than hammering the server.
 */
export function useLiveTick(symbol, enabled) {
  const [state, setState] = useState({ symbol: null, tick: null, live: false });

  useEffect(() => {
    if (!enabled || !symbol || typeof EventSource === 'undefined') return undefined;
    let source = null;
    let retry = null;
    let closed = false;

    const open = () => {
      source = new EventSource(`${API_BASE}/live/${encodeURIComponent(symbol)}`);
      source.addEventListener('status', (e) => {
        const { live } = JSON.parse(e.data);
        setState((s) => ({ symbol, tick: s.symbol === symbol ? s.tick : null, live }));
        if (!live) {
          source.close();
          if (!closed) retry = setTimeout(open, RETRY_MS);
        }
      });
      source.addEventListener('tick', (e) => setState({ symbol, tick: JSON.parse(e.data), live: true }));
      source.onerror = () => {
        source.close();
        if (!closed) retry = setTimeout(open, RETRY_MS);
      };
    };
    open();

    return () => {
      closed = true;
      clearTimeout(retry);
      source?.close();
    };
  }, [symbol, enabled]);

  // Ignore a tick that belongs to a previously selected stock
  return state.symbol === symbol ? state : { symbol, tick: null, live: false };
}
