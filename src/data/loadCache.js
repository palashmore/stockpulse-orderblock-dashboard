// A small keyed cache for async loads (pure apart from the injected clock). Used by the stock scans so that:
//  - a stock already loaded is not loaded again when you switch tabs or screens (progress survives),
//  - two scans asking for the same stock at once share one request,
//  - a failed load is remembered only briefly, so it is retried soon but not hammered.
export function createLoadCache({ ttlMs = 10 * 60_000, failTtlMs = 30_000, max = 600, now = () => Date.now() } = {}) {
  const entries = new Map(); // key -> { at, promise, settled, failed }

  const fresh = (e) => (e.settled ? now() - e.at < (e.failed ? failTtlMs : e.ttl ?? ttlMs) : true);

  return {
    /** The loaded value for `key`, calling `loader()` only when nothing fresh (or in flight) exists. `isFailure(value)` marks a short-lived result. */
    get(key, loader, isFailure = (v) => v === null || v === undefined, ttl = undefined) {
      const hit = entries.get(key);
      if (hit && fresh(hit)) return hit.promise;
      const entry = { at: now(), promise: null, settled: false, failed: false, ttl };
      entry.promise = Promise.resolve()
        .then(loader)
        .then(
          (value) => { entry.at = now(); entry.settled = true; entry.failed = Boolean(isFailure(value)); return value; },
          (error) => { entries.delete(key); throw error; }, // an exception is never cached
        );
      entries.set(key, entry);
      if (entries.size > max) entries.delete(entries.keys().next().value);
      return entry.promise;
    },
    /** True when a fresh, successful value is already stored (no request would be made). */
    has(key) {
      const e = entries.get(key);
      return Boolean(e && e.settled && !e.failed && fresh(e));
    },
    /** Forget one key, or everything when no key is given. */
    clear(key) { if (key === undefined) entries.clear(); else entries.delete(key); },
    size: () => entries.size,
  };
}
