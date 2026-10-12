const MAX_BUCKETS = 5000;

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * Fixed-window per-client request limiter. `/api/health` is exempt.
 * Clients on the machine running the server (the person using the app, whose screens scan hundreds of
 * stocks) get the higher `loopbackMax`; other network clients get `max`. Upstream providers stay protected
 * by the response cache and the concurrency limit, not by this.
 * Returns Express middleware; `now` is injectable for tests.
 */
export function createRateLimiter({ windowMs = 60_000, max = 120, loopbackMax = 1200, now = Date.now } = {}) {
  const buckets = new Map();

  return (req, res, next) => {
    if (req.path === '/api/health') return next();

    const t = now();
    if (buckets.size > MAX_BUCKETS) {
      for (const [key, bucket] of buckets) if (t >= bucket.resetAt) buckets.delete(key);
    }

    const key = req.ip || 'unknown';
    let bucket = buckets.get(key);
    if (!bucket || t >= bucket.resetAt) {
      bucket = { count: 0, resetAt: t + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count++;
    if (bucket.count > (LOOPBACK.has(key) ? Math.max(max, loopbackMax) : max)) {
      res.set('Retry-After', String(Math.ceil((bucket.resetAt - t) / 1000)));
      return res.status(429).json({ error: 'Too many requests', dataStatus: 'UNAVAILABLE' });
    }
    next();
  };
}

/** Runs async tasks with at most `limit` in flight; the rest wait in FIFO order. */
export function createConcurrencyLimiter(limit = 4) {
  let active = 0;
  const queue = [];

  const release = () => {
    active--;
    const next = queue.shift();
    if (next) next();
  };

  return async function run(task) {
    if (active >= limit) await new Promise((resolve) => queue.push(resolve));
    active++;
    try {
      return await task();
    } finally {
      release();
    }
  };
}
