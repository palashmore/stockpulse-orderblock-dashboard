// One shared scheduler for every auto-refreshing screen. Screens subscribe to a resource key; the
// coordinator owns the single timer, shares one request per key, bounds concurrency, backs off with
// jitter after failures, pauses while the tab is hidden and catches up when it is visible again.

const DEFAULTS = {
  intervalMs: 60000,
  tickMs: 5000,
  maxConcurrent: 4,
  maxBackoffMs: 5 * 60000,
};

export function createRefreshCoordinator(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const now = options.now ?? (() => Date.now());
  const random = options.random ?? Math.random;
  const isVisible = options.isVisible ?? (() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  const entries = new Map();
  const queue = [];
  let running = 0;
  let timer = null;

  function backoffMs(entry) {
    const exp = Math.min(cfg.maxBackoffMs, entry.intervalMs * 2 ** Math.min(entry.failures, 6));
    return exp * (0.8 + random() * 0.4); // ±20% jitter so screens do not retry in lockstep
  }

  function notify(entry) {
    for (const l of [...entry.listeners]) l(snapshot(entry));
  }

  function snapshot(entry) {
    return {
      key: entry.key,
      data: entry.data,
      lastSuccessAt: entry.lastSuccessAt,
      lastAttemptAt: entry.lastAttemptAt,
      failures: entry.failures,
      error: entry.error,
      inFlight: Boolean(entry.promise),
      nextDueAt: entry.nextDueAt,
    };
  }

  function pump() {
    while (running < cfg.maxConcurrent && queue.length) {
      const entry = queue.shift();
      entry.queued = false;
      execute(entry);
    }
  }

  function execute(entry) {
    running++;
    const controller = new AbortController();
    entry.controller = controller;
    entry.lastAttemptAt = now();
    notify(entry);
    let started;
    try {
      started = Promise.resolve(entry.loader({ signal: controller.signal, force: entry.forceNext }));
    } catch (error) {
      started = Promise.reject(error);
    }
    entry.promise = started
      .then((data) => ({ data }), (error) => ({ error }))
      .then(({ data, error }) => {
        entry.forceNext = false;
        if (controller.signal.aborted || entries.get(entry.key) !== entry) return;
        if (error || data === null || data === undefined) {
          entry.failures += 1;
          entry.error = error?.message ?? 'no data';
          const wait = Number.isFinite(error?.retryAfterMs) ? error.retryAfterMs : backoffMs(entry);
          entry.nextDueAt = now() + wait;
        } else {
          entry.data = data;
          entry.failures = 0;
          entry.error = null;
          entry.lastSuccessAt = now();
          entry.nextDueAt = now() + entry.intervalMs;
        }
      })
      .finally(() => {
        running--;
        entry.promise = null;
        entry.controller = null;
        if (entries.get(entry.key) === entry) notify(entry);
        pump();
      });
    return entry.promise;
  }

  function request(entry, force) {
    if (entry.promise) return entry.promise; // one request per resource, however many screens ask
    if (force) entry.forceNext = true;
    if (entry.queued) return Promise.resolve();
    entry.queued = true;
    queue.push(entry);
    pump();
    return entry.promise ?? Promise.resolve();
  }

  function tick() {
    if (!isVisible()) return;
    const t = now();
    for (const entry of entries.values()) {
      if (!entry.promise && !entry.queued && entry.nextDueAt <= t) request(entry, true);
    }
  }

  function ensureTimer() {
    if (timer === null && entries.size > 0) timer = setInterval(tick, cfg.tickMs);
  }

  function stopTimerIfIdle() {
    if (timer !== null && entries.size === 0) {
      clearInterval(timer);
      timer = null;
    }
  }

  /** Subscribe to a resource. Returns an unsubscribe function. Subscribers to one key share one loader. */
  function subscribe(key, loader, listener, subOptions = {}) {
    let entry = entries.get(key);
    if (!entry) {
      entry = {
        key, loader, listeners: new Set(), intervalMs: subOptions.intervalMs ?? cfg.intervalMs,
        data: null, lastSuccessAt: null, lastAttemptAt: null, failures: 0, error: null,
        nextDueAt: 0, promise: null, controller: null, queued: false, forceNext: false,
      };
      entries.set(key, entry);
    } else {
      entry.loader = loader; // latest closure wins (same key means same resource)
    }
    if (listener) entry.listeners.add(listener);
    ensureTimer();
    if (listener && entry.lastSuccessAt !== null) listener(snapshot(entry));
    // Fresh enough? Use it. Otherwise load now (immediately, not on the next tick).
    if (!entry.promise && !entry.queued && entry.nextDueAt <= now()) request(entry, false);
    return () => {
      if (listener) entry.listeners.delete(listener);
      if (entry.listeners.size === 0 && entries.get(key) === entry) {
        entry.controller?.abort();
        entries.delete(key);
        const i = queue.indexOf(entry);
        if (i >= 0) queue.splice(i, 1);
        stopTimerIfIdle();
      }
    };
  }

  /** Refresh a subscribed resource now (shared with any request already running). */
  function refresh(key) {
    const entry = entries.get(key);
    return entry ? request(entry, true) : Promise.resolve();
  }

  /** Call when the tab becomes visible or the network returns: overdue resources reload at once. */
  function reconcile() {
    tick();
  }

  function getStatus(key) {
    const entry = entries.get(key);
    return entry ? snapshot(entry) : null;
  }

  function stats() {
    return { resources: entries.size, running, queued: queue.length, timerActive: timer !== null };
  }

  function dispose() {
    if (timer !== null) clearInterval(timer);
    timer = null;
    for (const e of entries.values()) e.controller?.abort();
    entries.clear();
    queue.length = 0;
  }

  return { subscribe, refresh, reconcile, getStatus, stats, dispose };
}

let shared = null;

/** The application-wide coordinator. Created lazily; also reconciles on tab focus / back online. */
export function getRefreshCoordinator() {
  if (!shared) {
    shared = createRefreshCoordinator();
    if (typeof window !== 'undefined') {
      const wake = () => shared.reconcile();
      document.addEventListener('visibilitychange', wake);
      window.addEventListener('online', wake);
      window.addEventListener('focus', wake);
    }
  }
  return shared;
}
