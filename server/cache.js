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

    /** Entry younger than `ttlMs` (or than the entry's own shorter `freshForMs`, for a partial result), else null. */
    getFresh(key, ttlMs) {
      const hit = store.get(key);
      if (!hit) return null;
      const own = hit.entry?.freshForMs;
      const ttl = Number.isFinite(own) ? Math.min(ttlMs, own) : ttlMs;
      return now() - hit.storedAt < ttl ? hit.entry : null;
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
