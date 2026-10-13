/**
 * Per-provider health guard. When a data provider (Yahoo, NSE, ...) cannot be reached several times in a row, or answers
 * HTTP 429 (rate limited), further requests to it are refused immediately for a short while instead of each one waiting
 * out its own 10-15 second timeout. Callers then fall back to cached data or report "unavailable" straight away, and the
 * provider is not hammered while it is struggling. Any good answer clears the failures.
 */
export class ProviderPausedError extends Error {
  constructor(provider, untilMs, reason) {
    super(`${provider} is paused (${reason}); retrying shortly`);
    this.name = 'ProviderPausedError';
    this.paused = true;
    this.provider = provider;
    this.untilMs = untilMs;
  }
}

/** Seconds from a Retry-After header (a number of seconds), clamped; null when absent or not a number. */
export function parseRetryAfter(value, { min = 5, max = 120 } = {}) {
  const s = Number(value);
  return Number.isFinite(s) && s > 0 ? Math.min(max, Math.max(min, s)) : null;
}

export function createProviderGuard({ now = Date.now, failuresToPause = 3, pauseMs = 20_000, rateLimitMs = 30_000 } = {}) {
  const state = new Map(); // provider -> { failures, pausedUntil, reason }
  const get = (p) => {
    if (!state.has(p)) state.set(p, { failures: 0, pausedUntil: 0, reason: '' });
    return state.get(p);
  };

  return {
    /** Throws ProviderPausedError while the provider is paused. */
    check(provider) {
      const s = get(provider);
      if (s.pausedUntil > now()) throw new ProviderPausedError(provider, s.pausedUntil, s.reason);
    },
    /** A usable answer arrived (any HTTP status other than 429): the provider is reachable. */
    success(provider) {
      const s = get(provider);
      s.failures = 0;
    },
    /** No answer at all (DNS failure, reset, timeout). Pauses the provider after several in a row. */
    failure(provider) {
      const s = get(provider);
      s.failures += 1;
      if (s.failures >= failuresToPause) {
        s.pausedUntil = now() + pauseMs;
        s.reason = 'not reachable';
        s.failures = 0;
      }
    },
    /** HTTP 429. Pauses at once, for the provider's own Retry-After when given. */
    rateLimited(provider, retryAfterSec = null) {
      const s = get(provider);
      s.pausedUntil = now() + (retryAfterSec ? retryAfterSec * 1000 : rateLimitMs);
      s.reason = 'rate limited';
      s.failures = 0;
    },
    /** Providers that are paused now, for the diagnostics screen. */
    paused() {
      const t = now();
      return [...state.entries()].filter(([, s]) => s.pausedUntil > t).map(([provider, s]) => ({ provider, reason: s.reason, resumesInSec: Math.ceil((s.pausedUntil - t) / 1000) }));
    },
  };
}
