import { describe, it, expect } from 'vitest';
import { createApp } from './app.js';
import { createRateLimiter, createConcurrencyLimiter } from './limits.js';

const jsonResponse = (body) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const quoteBody = { quoteResponse: { result: [{ symbol: 'X.NS', regularMarketPrice: 10, marketState: 'CLOSED' }] } };

async function listen(app) {
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  return { server, base: `http://127.0.0.1:${server.address().port}/api`, close: () => new Promise((r) => server.close(r)) };
}

describe('rate limiter', () => {
  it('blocks after max requests per window, exempts health, and resets', async () => {
    let t = 1000;
    const { app } = createApp({
      fetchFn: async () => jsonResponse(quoteBody),
      rateLimit: { windowMs: 60_000, max: 2, loopbackMax: 2 },
      now: () => t,
    });
    const { base, close } = await listen(app);
    try {
      expect((await fetch(`${base}/market-status`)).status).toBe(200);
      expect((await fetch(`${base}/market-status`)).status).toBe(200);
      const blocked = await fetch(`${base}/market-status`);
      expect(blocked.status).toBe(429);
      expect(blocked.headers.get('retry-after')).toBe('60');
      expect((await fetch(`${base}/health`)).status).toBe(200);
      t += 60_000;
      expect((await fetch(`${base}/market-status`)).status).toBe(200);
    } finally {
      await close();
    }
  });

  it('gives clients on the server machine a higher limit than other network clients', () => {
    const limiter = createRateLimiter({ max: 2, loopbackMax: 5, now: () => 0 });
    const run = (ip) => {
      let status = 200;
      const res = { set() {}, status(code) { status = code; return this; }, json() {} };
      limiter({ path: '/api/x', ip }, res, () => {});
      return status;
    };
    const statuses = (ip, n) => Array.from({ length: n }, () => run(ip));
    expect(statuses('192.168.1.20', 4)).toEqual([200, 200, 429, 429]);
    for (const local of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
      expect(statuses(local, 6)).toEqual([200, 200, 200, 200, 200, 429]);
    }
  });

  it('never lets the local limit fall below the general one', () => {
    const limiter = createRateLimiter({ max: 4, loopbackMax: 1, now: () => 0 });
    let blocked = 0;
    for (let i = 0; i < 5; i++) {
      const res = { set() {}, status() { blocked++; return this; }, json() {} };
      limiter({ path: '/api/x', ip: '127.0.0.1' }, res, () => {});
    }
    expect(blocked).toBe(1);
  });

  it('unit: counts per client key', () => {
    const limiter = createRateLimiter({ max: 1, now: () => 0 });
    const run = (ip) => {
      let status = 200;
      const res = { set() {}, status(code) { status = code; return this; }, json() {} };
      limiter({ path: '/api/x', ip }, res, () => {});
      return status;
    };
    expect(run('a')).toBe(200);
    expect(run('a')).toBe(429);
    expect(run('b')).toBe(200);
  });
});

describe('concurrency limiter', () => {
  it('never exceeds the limit and runs every task', async () => {
    const run = createConcurrencyLimiter(2);
    let active = 0;
    let peak = 0;
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => run(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return i;
      }))
    );
    expect(peak).toBe(2);
    expect(results).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('releases the slot when a task throws', async () => {
    const run = createConcurrencyLimiter(1);
    await expect(run(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(run(async () => 'ok')).resolves.toBe('ok');
  });
});

describe('request coalescing', () => {
  it('shares one provider call between concurrent identical requests', async () => {
    let calls = 0;
    let release;
    const gate = new Promise((r) => { release = r; });
    const { app } = createApp({
      fetchFn: async () => { calls++; await gate; return jsonResponse(quoteBody); },
      retryDelayMs: 0,
    });
    const { base, close } = await listen(app);
    try {
      const pending = Promise.all([fetch(`${base}/quote/X`), fetch(`${base}/quote/X`), fetch(`${base}/quote/X`)]);
      await new Promise((r) => setTimeout(r, 50));
      release();
      const responses = await pending;
      expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
      expect(calls).toBe(1);
    } finally {
      await close();
    }
  });
});
