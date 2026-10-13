import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveApiBase, retryDelayMs, fetchQuotes, fetchHistory, fetchIndexLevels, clearApiCache, getBrokerSession, setBrokerSession, submitBrokerSession, fetchPortfolio, SESSION_KEY } from './api';

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
    clearApiCache();
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

describe('stored and shared responses', () => {
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: {} });
  const history = { candles: [{ time: '2026-10-12', open: 1, high: 2, low: 0.5, close: 1.5 }], dataStatus: 'HISTORICAL' };
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    clearApiCache();
  });

  it('serves the same history again without a new request, until it is old', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(async () => reply(history));
    vi.stubGlobal('fetch', fetchMock);
    expect((await fetchHistory('TCS', '6mo', '1d')).candles).toHaveLength(1);
    await fetchHistory('TCS', '6mo', '1d');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3 * 60_000 + 1000);
    await fetchHistory('TCS', '6mo', '1d');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps intraday data for a much shorter time than daily data', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(async () => reply(history));
    vi.stubGlobal('fetch', fetchMock);
    await fetchHistory('TCS', '5d', '5m');
    await vi.advanceTimersByTimeAsync(46_000);
    await fetchHistory('TCS', '5d', '5m');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shares one request between callers that ask at the same moment', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const fetchMock = vi.fn().mockImplementation(async () => { await gate; return reply(history); });
    vi.stubGlobal('fetch', fetchMock);
    const a = fetchHistory('INFY', '6mo', '1d');
    const b = fetchHistory('INFY', '6mo', '1d');
    release();
    expect((await Promise.all([a, b])).every((h) => h.candles.length === 1)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps different stocks and timeframes apart', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => reply(history));
    vi.stubGlobal('fetch', fetchMock);
    await fetchHistory('TCS', '6mo', '1d');
    await fetchHistory('INFY', '6mo', '1d');
    await fetchHistory('TCS', '1y', '1d');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('asks again on request (force), and soon after a failure, never keeping an error for long', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply({ error: 'x' }, 500))
      .mockImplementation(async () => reply({ indices: {}, missing: [], dataStatus: 'DELAYED' }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchIndexLevels()).toBeNull();
    expect(await fetchIndexLevels()).toBeNull(); // a failure is remembered for a moment only
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3100);
    expect((await fetchIndexLevels()).dataStatus).toBe('DELAYED');
    await fetchIndexLevels();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await fetchIndexLevels({ force: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not store a history response that has no candles as if it were good', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => reply({ candles: [], dataStatus: 'UNAVAILABLE' }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchHistory('ZZZ', '6mo', '1d')).toBeNull();
  });
});

describe('browser-held broker session (hosted copy)', () => {
  const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: {} });
  afterEach(() => { vi.unstubAllGlobals(); setBrokerSession(null); });

  it('stores and clears the token, and survives blocked storage', () => {
    const s = store();
    setBrokerSession('abc12345', s);
    expect(getBrokerSession(s)).toBe('abc12345');
    expect(s.getItem(SESSION_KEY)).toBe('abc12345');
    setBrokerSession(null, s);
    expect(getBrokerSession(s)).toBeNull();
    const blocked = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); }, removeItem: () => { throw new Error('no'); } };
    expect(getBrokerSession(blocked)).toBeNull();
    expect(() => setBrokerSession('x', blocked)).not.toThrow();
  });

  it('keeps the token handed over at sign-in out of what the screen receives, and sends it on account requests', async () => {
    const mem = store();
    vi.stubGlobal('window', { sessionStorage: mem });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply({ connected: true, sessionToken: 'TOKEN1234' }))
      .mockResolvedValueOnce(reply({ holdings: [], totals: {} }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await submitBrokerSession('https://127.0.0.1/?apisession=1');
    expect(result).toEqual({ connected: true });
    expect(mem.getItem(SESSION_KEY)).toBe('TOKEN1234');
    await fetchPortfolio();
    expect(fetchMock.mock.calls[1][1].headers['X-Breeze-Session']).toBe('TOKEN1234');
  });

  it('forgets a token the server says has expired', async () => {
    const mem = store();
    vi.stubGlobal('window', { sessionStorage: mem });
    setBrokerSession('OLDTOKEN1');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ error: 'Breeze session expired; sign in again' }, 409)));
    expect((await fetchPortfolio()).error).toMatch(/expired/);
    expect(mem.getItem(SESSION_KEY)).toBeNull();
  });
});

