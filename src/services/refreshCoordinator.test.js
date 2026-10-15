import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRefreshCoordinator } from './refreshCoordinator';

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

describe('refresh coordinator', () => {
  let c;
  let visible;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    visible = true;
    c = createRefreshCoordinator({ intervalMs: 60000, tickMs: 5000, random: () => 0.5, isVisible: () => visible });
  });
  afterEach(() => { c.dispose(); vi.useRealTimers(); });

  it('loads at once and then every 60 seconds with a single timer', async () => {
    const loader = vi.fn().mockResolvedValue({ n: 1 });
    c.subscribe('q', loader, () => {});
    await flush();
    expect(loader).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60000);
    expect(loader).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(20 * 60000);
    expect(loader.mock.calls.length).toBeGreaterThanOrEqual(20);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('shares one request and one entry between screens asking for the same resource', async () => {
    const loader = vi.fn().mockResolvedValue(1);
    const a = vi.fn();
    const b = vi.fn();
    c.subscribe('q', loader, a);
    c.subscribe('q', loader, b);
    await flush();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(c.stats().resources).toBe(1);
    expect(b).toHaveBeenCalled();
  });

  it('never overlaps requests for a slow resource', async () => {
    let release;
    const loader = vi.fn(() => new Promise((r) => { release = r; }));
    c.subscribe('q', loader, () => {});
    await vi.advanceTimersByTimeAsync(180000);
    expect(loader).toHaveBeenCalledTimes(1);
    release({ ok: true });
    await vi.advanceTimersByTimeAsync(60000);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('bounds concurrency', async () => {
    const small = createRefreshCoordinator({ maxConcurrent: 2, random: () => 0.5, isVisible: () => true });
    let active = 0;
    let peak = 0;
    const loader = () => new Promise((r) => { active++; peak = Math.max(peak, active); setTimeout(() => { active--; r(1); }, 100); });
    ['a', 'b', 'c', 'd', 'e'].forEach((k) => small.subscribe(k, loader, () => {}));
    await vi.advanceTimersByTimeAsync(1000);
    expect(peak).toBe(2);
    expect(small.stats().running).toBe(0);
    small.dispose();
  });

  it('backs off after failures, keeps the last good data, and recovers', async () => {
    const loader = vi.fn()
      .mockResolvedValueOnce({ v: 1 })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ v: 2 });
    const seen = [];
    c.subscribe('q', loader, (s) => seen.push(s));
    await vi.advanceTimersByTimeAsync(60000); // second call fails
    expect(c.getStatus('q').failures).toBe(1);
    expect(c.getStatus('q').data).toEqual({ v: 1 });
    // failure 1 waits interval*2 = 120 s, not another 60 s
    await vi.advanceTimersByTimeAsync(60000);
    expect(loader).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(65000);
    expect(loader).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(5 * 60000);
    expect(c.getStatus('q').failures).toBe(0);
    expect(c.getStatus('q').data).toEqual({ v: 2 });
  });

  it('honours a rate-limit retry-after', async () => {
    const err = Object.assign(new Error('429'), { retryAfterMs: 90000 });
    const loader = vi.fn().mockRejectedValueOnce(err).mockResolvedValue(1);
    c.subscribe('q', loader, () => {});
    await vi.advanceTimersByTimeAsync(85000);
    expect(loader).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10000);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('pauses while hidden and catches up when visible again', async () => {
    const loader = vi.fn().mockResolvedValue(1);
    c.subscribe('q', loader, () => {});
    await flush();
    visible = false;
    await vi.advanceTimersByTimeAsync(10 * 60000);
    expect(loader).toHaveBeenCalledTimes(1);
    visible = true;
    c.reconcile();
    await flush();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('ignores a result that arrives after the last screen left, and stops the timer', async () => {
    let release;
    const loader = vi.fn(() => new Promise((r) => { release = r; }));
    const listener = vi.fn();
    const off = c.subscribe('q', loader, listener);
    const calls = listener.mock.calls.length;
    off();
    release(1);
    await flush();
    expect(listener.mock.calls.length).toBe(calls);
    expect(c.stats()).toMatchObject({ resources: 0, timerActive: false });
  });

  it('aborts the in-flight request when the last screen unsubscribes', async () => {
    let signal;
    c.subscribe('q', (o) => { signal = o.signal; return new Promise(() => {}); }, () => {})();
    expect(signal.aborted).toBe(true);
  });

  it('manual refresh joins a running request instead of starting another', async () => {
    let release;
    const loader = vi.fn(() => new Promise((r) => { release = r; }));
    c.subscribe('q', loader, () => {});
    c.refresh('q');
    c.refresh('q');
    expect(loader).toHaveBeenCalledTimes(1);
    release(1);
    await flush();
  });
});
