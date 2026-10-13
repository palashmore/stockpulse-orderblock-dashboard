import { describe, it, expect } from 'vitest';
import { createLoadCache } from './loadCache';

const make = (extra = {}) => {
  let t = 0;
  const cache = createLoadCache({ ttlMs: 1000, failTtlMs: 100, now: () => t, ...extra });
  return { cache, advance: (ms) => { t += ms; } };
};

describe('createLoadCache', () => {
  it('loads once and serves the stored value until it expires', async () => {
    const { cache, advance } = make();
    let calls = 0;
    const loader = async () => ++calls;
    expect(await cache.get('A', loader)).toBe(1);
    expect(await cache.get('A', loader)).toBe(1);
    advance(999);
    expect(await cache.get('A', loader)).toBe(1);
    advance(2);
    expect(await cache.get('A', loader)).toBe(2);
    expect(calls).toBe(2);
  });

  it('shares one request between callers that ask while it is still loading', async () => {
    const { cache } = make();
    let calls = 0;
    let release;
    const gate = new Promise((r) => { release = r; });
    const loader = async () => { calls++; await gate; return 'v'; };
    const a = cache.get('A', loader);
    const b = cache.get('A', loader);
    release();
    expect(await Promise.all([a, b])).toEqual(['v', 'v']);
    expect(calls).toBe(1);
  });

  it('keeps keys apart', async () => {
    const { cache } = make();
    expect(await cache.get('A', async () => 'a')).toBe('a');
    expect(await cache.get('B', async () => 'b')).toBe('b');
  });

  it('retries a failed result soon, but not at once', async () => {
    const { cache, advance } = make();
    let calls = 0;
    const loader = async () => { calls++; return calls < 3 ? null : 'ok'; };
    expect(await cache.get('A', loader)).toBeNull();
    expect(await cache.get('A', loader)).toBeNull(); // within 100 ms: remembered
    expect(calls).toBe(1);
    advance(101);
    expect(await cache.get('A', loader)).toBeNull();
    advance(101);
    expect(await cache.get('A', loader)).toBe('ok');
    expect(calls).toBe(3);
    expect(cache.has('A')).toBe(true);
  });

  it('can be told what counts as a failure', async () => {
    const { cache, advance } = make();
    let calls = 0;
    const loader = async () => { calls++; return { reason: 'no data' }; };
    const isFailure = (v) => Boolean(v.reason);
    await cache.get('A', loader, isFailure);
    advance(101);
    await cache.get('A', loader, isFailure);
    expect(calls).toBe(2);
  });

  it('never caches an exception', async () => {
    const { cache } = make();
    let calls = 0;
    const loader = async () => { calls++; if (calls === 1) throw new Error('boom'); return 'fine'; };
    await expect(cache.get('A', loader)).rejects.toThrow('boom');
    expect(await cache.get('A', loader)).toBe('fine');
  });

  it('reports what is stored, and can be cleared', async () => {
    const { cache, advance } = make();
    expect(cache.has('A')).toBe(false);
    await cache.get('A', async () => 1);
    expect(cache.has('A')).toBe(true);
    advance(1001);
    expect(cache.has('A')).toBe(false);
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  it('forgets the oldest entries beyond its limit', async () => {
    const { cache } = make({ max: 2 });
    await cache.get('A', async () => 1);
    await cache.get('B', async () => 2);
    await cache.get('C', async () => 3);
    expect(cache.size()).toBe(2);
    expect(cache.has('A')).toBe(false);
    expect(cache.has('C')).toBe(true);
  });

  it('lets each call set its own lifetime, and forgets a single key', async () => {
    const { cache, advance } = make();
    let calls = 0;
    const loader = async () => ++calls;
    await cache.get('short', loader, undefined, 50);
    await cache.get('long', loader);
    advance(60);
    await cache.get('short', loader, undefined, 50);
    await cache.get('long', loader);
    expect(calls).toBe(3); // only 'short' expired
    cache.clear('long');
    await cache.get('long', loader);
    expect(calls).toBe(4);
    expect(cache.size()).toBe(2);
  });
});

