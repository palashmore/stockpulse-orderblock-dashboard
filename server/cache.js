const MAX_ENTRIES = 500;

/**
 * In-memory cache with separate freshness and stale-fallback windows.
 * `now` is injectable so freshness logic can be tested deterministically.
 */
export function createCache(now = Date.now) {
  const store = new Map();

  return {
    set(key, entry) {
      store.delete(key);
      store.set(key, { entry, storedAt: now() });
      if (store.size > MAX_ENTRIES) {
        store.delete(store.keys().next().value);
      }
    },

    /** Entry younger than `ttlMs`, else null. */
    getFresh(key, ttlMs) {
      const hit = store.get(key);
      if (hit && now() - hit.storedAt < ttlMs) return hit.entry;
      return null;
    },

    /** Entry younger than `maxStaleMs` with its age, else null. Used only after a provider failure. */
    getStale(key, maxStaleMs) {
      const hit = store.get(key);
      if (!hit) return null;
      const ageMs = now() - hit.storedAt;
      if (ageMs >= maxStaleMs) {
        store.delete(key);
        return null;
      }
      return { entry: hit.entry, ageMs };
    },

    size: () => store.size,
  };
}
