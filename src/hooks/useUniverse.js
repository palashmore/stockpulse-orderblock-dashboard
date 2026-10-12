import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { fetchIndexStocks } from '../services/api';
import {
  loadUniverse, saveUniverse, toggleIndex, toggleGroup, setCustom, savePreset, applyPreset, deletePreset, combineUniverse,
} from '../data/universe';
import { loadSettings } from '../data/settings';

// The selected indices, custom symbols and presets, shared by every screen and saved in this browser.
let current = null;
let storageOk = true;
const listeners = new Set();

function read() {
  if (current === null) current = loadUniverse(window.localStorage, loadSettings(window.localStorage).index);
  return current;
}

function write(next) {
  if (next === current) return;
  current = next;
  storageOk = saveUniverse(next, window.localStorage);
  listeners.forEach((fn) => fn());
}

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function useUniverseSelection() {
  const universe = useSyncExternalStore(subscribe, read);
  return {
    universe,
    storageOk,
    toggle: useCallback((id) => write(toggleIndex(read(), id)), []),
    toggleGroup: useCallback((ids) => write(toggleGroup(read(), ids)), []),
    setCustom: useCallback((symbols) => write(setCustom(read(), symbols)), []),
    savePreset: useCallback((name) => { const next = savePreset(read(), name); if (next) write(next); return Boolean(next); }, []),
    applyPreset: useCallback((name) => write(applyPreset(read(), name)), []),
    deletePreset: useCallback((name) => write(deletePreset(read(), name)), []),
  };
}

// One request per index per session; a failed one is retried the next time it is needed.
const lists = new Map();
export function getIndexList(id) {
  if (!lists.has(id)) lists.set(id, fetchIndexStocks(id).then((d) => { if (!d) lists.delete(id); return d; }));
  return lists.get(id);
}

/**
 * The combined, deduplicated stocks of the selected indices and custom symbols. `stocks` is null until
 * the lists have loaded. `failedIds` names selected indices whose list could not be loaded (the rest
 * are still used, and the screen says which were missing).
 */
export function useUniverseStocks(universe) {
  const idsKey = universe.ids.join(',');
  const customKey = universe.custom.join(',');
  const [state, setState] = useState({ key: '', lists: [], failedIds: [] });

  useEffect(() => {
    let cancelled = false;
    const ids = idsKey ? idsKey.split(',') : [];
    Promise.all(ids.map((id) => getIndexList(id))).then((results) => {
      if (cancelled) return;
      setState({
        key: idsKey,
        lists: results.flatMap((d, i) => (d ? [{ id: ids[i], label: d.label, stocks: d.stocks }] : [])),
        failedIds: ids.filter((_, i) => !results[i]),
      });
    });
    return () => { cancelled = true; };
  }, [idsKey]);

  const ready = state.key === idsKey;
  // Memoised: a new array on every render would restart every scan that depends on it
  const stocks = useMemo(() => (ready ? combineUniverse(state.lists, customKey ? customKey.split(',') : []) : null), [ready, state.lists, customKey]);
  const labels = useMemo(() => Object.fromEntries(state.lists.map((l) => [l.id, l.label])), [state.lists]);
  return { stocks, labels, failedIds: ready ? state.failedIds : [], loading: !ready };
}
