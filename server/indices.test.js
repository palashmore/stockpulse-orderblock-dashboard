import { describe, it, expect, afterEach } from 'vitest';
import { parseIndexCsv, INDEX_DEFS, indexDef } from './indices.js';
import { createApp } from './app.js';

const CSV = [
  'Company Name,Industry,Symbol,Series,ISIN Code',
  'HDFC Bank Ltd.,Financial Services,HDFCBANK,EQ,INE040A01034',
  '"Mahindra & Mahindra Ltd.",Automobile and Auto Components,M&M,EQ,INE101A01026',
  'Some ETF,Other,ETFX,BE,INE000000000',
  'HDFC Bank Ltd.,Financial Services,HDFCBANK,EQ,INE040A01034',
  'Bad Symbol Co,Other,bad symbol,EQ,INE000000001',
].join('\r\n');

describe('index csv parsing', () => {
  it('keeps EQ-series stocks once each, with names and industries, and drops malformed rows', () => {
    expect(parseIndexCsv(CSV)).toEqual([
      { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd.', industry: 'Financial Services' },
      { symbol: 'M&M', name: 'Mahindra & Mahindra Ltd.', industry: 'Automobile and Auto Components' },
    ]);
  });

  it('accepts a byte-order mark', () => {
    expect(parseIndexCsv(`﻿${CSV}`)).toHaveLength(2);
  });

  it('rejects an HTML error page or a changed layout instead of reading it as an empty index', () => {
    expect(() => parseIndexCsv('<html><body>Access Denied</body></html>')).toThrow(/format/);
    expect(() => parseIndexCsv('Name,Symbol\nA,B')).toThrow(/format/);
    expect(() => parseIndexCsv('Company Name,Industry,Symbol,Series,ISIN Code')).toThrow(/format/);
    expect(() => parseIndexCsv('Company Name,Industry,Symbol,Series,ISIN Code\nX,Y,Z,BE,I')).toThrow(/no stocks/);
  });
});

describe('index definitions', () => {
  it('have unique ids, labels and groups, and cover broad, mid, small, sector and theme indices', () => {
    expect(new Set(INDEX_DEFS.map((d) => d.id)).size).toBe(INDEX_DEFS.length);
    const groups = new Set(INDEX_DEFS.map((d) => d.group));
    for (const g of ['Broad market', 'Mid cap', 'Small cap', 'Sector', 'Theme']) expect(groups.has(g)).toBe(true);
    expect(indexDef('bank').file).toBe('niftybank');
    expect(indexDef('nope')).toBeNull();
  });
});

describe('index and batch-quote endpoints', () => {
  let server;
  let base;
  let calls;
  let clock;
  afterEach(() => new Promise((resolve) => server.close(resolve)));

  const yahooQuote = (symbol, price) => ({ symbol: `${symbol}.NS`, longName: symbol, regularMarketPrice: price, regularMarketChange: 1, regularMarketChangePercent: 0.5, regularMarketVolume: 100, averageDailyVolume3Month: 90, regularMarketTime: Math.floor(Date.UTC(2026, 9, 12, 5, 29) / 1000), marketState: 'REGULAR' });

  async function start(upstream) {
    calls = [];
    clock = Date.UTC(2026, 9, 12, 5, 30);
    const { app } = createApp({ fetchFn: async (url) => { calls.push(String(url)); return upstream(String(url)); }, now: () => clock, retryDelayMs: 0 });
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}/api`;
  }
  const get = async (p) => { const res = await fetch(`${base}${p}`); return { res, body: await res.json() }; };

  it('lists the available indices', async () => {
    await start(() => new Response('{}'));
    const { body } = await get('/indices');
    expect(body.length).toBe(INDEX_DEFS.length);
    expect(body[0]).toEqual({ id: 'nifty50', label: 'Nifty 50', group: 'Broad market' });
  });

  it('serves a constituent list from the NSE file and caches it for a day', async () => {
    await start((url) => (url.includes('ind_niftybanklist.csv') ? new Response(CSV) : new Response('', { status: 404 })));
    const first = await get('/indices/bank');
    expect(first.body).toMatchObject({ id: 'bank', label: 'Nifty Bank', count: 2, provider: 'NSE Indices (niftyindices.com)' });
    expect(first.body.stocks[1].symbol).toBe('M&M');
    clock += 3 * 60 * 60 * 1000;
    await get('/indices/bank');
    expect(calls.filter((u) => u.includes('niftybank'))).toHaveLength(1);
  });

  it('rejects unknown indices, and reports unavailable when NSE returns something that is not a list', async () => {
    await start(() => new Response('<html>blocked</html>'));
    expect((await get('/indices/doesnotexist')).res.status).toBe(404);
    const bad = await get('/indices/bank');
    expect(bad.res.status).toBe(503);
    expect(bad.body.dataStatus).toBe('UNAVAILABLE');
  });

  it('keeps serving the last good list (as STALE) when a refresh fails', async () => {
    let ok = true;
    await start(() => (ok ? new Response(CSV) : new Response('', { status: 500 })));
    await get('/indices/it');
    ok = false;
    clock += 25 * 60 * 60 * 1000;
    const { body } = await get('/indices/it');
    expect(body.dataStatus).toBe('STALE');
    expect(body.count).toBe(2);
  });

  it('returns batch quotes for many symbols in chunks of 50 and reports the ones Yahoo did not know', async () => {
    const symbols = Array.from({ length: 120 }, (_, i) => `S${String(i).padStart(3, '0')}`);
    await start((url) => {
      if (url === 'https://fc.yahoo.com') return new Response('', { headers: { 'set-cookie': 'A3=a' } });
      if (url.includes('getcrumb')) return new Response('CRUMB');
      const asked = decodeURIComponent(new URL(url).searchParams.get('symbols')).split(',').map((s) => s.replace('.NS', ''));
      return new Response(JSON.stringify({ quoteResponse: { result: asked.filter((s) => s !== 'S005').map((s, i) => yahooQuote(s, 100 + i)) } }), { headers: { 'content-type': 'application/json' } });
    });
    const { res, body } = await get(`/quotes?symbols=${symbols.join(',')}`);
    expect(res.status).toBe(200);
    expect(body.quotes).toHaveLength(119);
    expect(body.missing).toEqual(['S005']);
    expect(body.dataStatus).toBe('DELAYED');
    expect(calls.filter((u) => u.includes('v7/finance/quote'))).toHaveLength(3); // 120 symbols = three chunks of at most 50
  });

  it('validates the symbol list', async () => {
    await start(() => new Response('{}'));
    expect((await get('/quotes')).res.status).toBe(400);
    expect((await get('/quotes?symbols=bad%20sym')).res.status).toBe(400);
    expect((await get(`/quotes?symbols=${Array.from({ length: 301 }, (_, i) => `A${i}`).join(',')}`)).res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});
