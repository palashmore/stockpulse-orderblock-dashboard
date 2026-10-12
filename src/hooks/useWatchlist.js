import { useCallback, useSyncExternalStore } from 'react';
import { loadWatchlists, saveWatchlists, addToList, removeFromList, moveBetween } from '../data/watchStore';

// Two watchlists (daily trading and swing) shared by every screen: starring a stock anywhere updates
// every list that shows it. Reading the whole store gives both lists; `kind` picks the one to act on.
let current = null;
let storageOk = true;
const listeners = new Set();

function read() {
  if (current === null) current = loadWatchlists(window.localStorage);
  return current;
}

function write(next) {
  if (next === current) return;
  current = next;
  storageOk = saveWatchlists(next, window.localStorage);
  listeners.forEach((fn) => fn());
}

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function useWatchlist(kind = 'daily') {
  const lists = useSyncExternalStore(subscribe, read);
  const list = lists[kind];

  const nowIso = () => new Date().toISOString();
  const add = useCallback((symbol, price = null) => write(addToList(read(), kind, symbol, price, nowIso())), [kind]);
  const remove = useCallback((symbol) => write(removeFromList(read(), kind, symbol)), [kind]);
  const toggle = useCallback((symbol, price = null) => {
    if (read()[kind].some((e) => e.symbol === symbol)) write(removeFromList(read(), kind, symbol));
    else write(addToList(read(), kind, symbol, price, nowIso()));
  }, [kind]);
  const move = useCallback((symbol, to) => write(moveBetween(read(), symbol, kind, to)), [kind]);

  const all = new Set([...lists.daily, ...lists.swing].map((e) => e.symbol));
  return { list, lists, symbols: new Set(list.map((e) => e.symbol)), allSymbols: all, add, remove, toggle, move, storageOk };
}
