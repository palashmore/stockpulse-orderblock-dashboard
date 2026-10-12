import { useCallback, useSyncExternalStore } from 'react';
import { loadWatch, saveWatch, addToWatch, removeFromWatch } from '../data/watchStore';

// One watchlist shared by every screen: starring a stock anywhere updates every list that shows it.
let current = null;
let storageOk = true;
const listeners = new Set();

function read() {
  if (current === null) current = loadWatch(window.localStorage);
  return current;
}

function write(next) {
  current = next;
  storageOk = saveWatch(next, window.localStorage);
  listeners.forEach((fn) => fn());
}

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function useWatchlist() {
  const list = useSyncExternalStore(subscribe, read);

  const add = useCallback((symbol, price = null) => write(addToWatch(read(), symbol, price, new Date().toISOString())), []);
  const remove = useCallback((symbol) => write(removeFromWatch(read(), symbol)), []);
  const toggle = useCallback((symbol, price = null) => {
    if (read().some((e) => e.symbol === symbol)) write(removeFromWatch(read(), symbol));
    else write(addToWatch(read(), symbol, price, new Date().toISOString()));
  }, []);

  return { list, symbols: new Set(list.map((e) => e.symbol)), add, remove, toggle, storageOk };
}
