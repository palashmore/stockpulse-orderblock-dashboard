import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveApiBase, retryDelayMs, fetchQuotes } from './api';

describe('resolveApiBase', () => {
  it('uses port 3001 on the host that served the page, so a phone on the same network reaches it', () => {
    expect(resolveApiBase({}, { protocol: 'http:', hostname: 'localhost' })).toBe('http://localhost:3001/api');
    expect(resolveApiBase({}, { protocol: 'http:', hostname: '192.168.1.20' })).toBe('http://192.168.1.20:3001/api');
  });

  it('lets VITE_API_BASE override it, ignoring a trailing slash', () => {
    expect(resolveApiBase({ VITE_API_BASE: 'https://api.example.com/api/' }, { protocol: 'http:', hostname: 'x' })).toBe('https://api.example.com/api');
  });

  it('falls back to localhost without a usable location', () => {
    expect(resolveApiBase({}, null)).toBe('http://localhost:3001/api');
    expect(resolveApiBase({}, { protocol: 'file:', hostname: '' })).toBe('http://localhost:3001/api');
  });
});

describe('busy server (HTTP 429)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reads Retry-After, capped, with a default', () => {
    expect(retryDelayMs('3')).toBe(3000);
    expect(retryDelayMs('600')).toBe(20000);
    expect(retryDelayMs(null)).toBe(5000);
    expect(retryDelayMs('soon')).toBe(5000);
    expect(retryDelayMs('0')).toBe(5000);
  });

  const quotes = { quotes: [{ symbol: 'A', price: 1 }], missing: [], dataStatus: 'DELAYED', provider: 'Yahoo Finance', asOf: null };
  const reply = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers });

  it('waits and retries once instead of reporting no data', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply(429, { error: 'Too many requests' }, { 'retry-after': '2' }))
      .mockResolvedValueOnce(reply(200, quotes));
    vi.stubGlobal('fetch', fetchMock);
    const pending = fetchQuotes(['A']);
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2);
    expect((await pending).quotes).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after one retry', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn().mockImplementation(async () => reply(429, {}, { 'retry-after': '1' }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = fetchQuotes(['A']);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await pending).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
