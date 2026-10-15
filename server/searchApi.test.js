import { describe, it, expect } from 'vitest';
import { createApp } from './app.js';

const realFetch = globalThis.fetch;
const info = (symbol, name) => [symbol, { symbol, name, code: symbol }];

async function search(q, loadMaster) {
  const fetchFn = async () => { throw new Error('offline'); }; // Yahoo unreachable
  const { app } = createApp({ fetchFn, retryDelayMs: 0, loadMaster });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  try {
    const res = await realFetch(`http://127.0.0.1:${server.address().port}/api/search?q=${encodeURIComponent(q)}`);
    return await res.json();
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('/api/search', () => {
  const master = async () => {
    await new Promise((r) => setTimeout(r, 50)); // still loading when the first search arrives
    return { byCode: new Map(), byIsin: new Map(), bySymbol: new Map([info('IRFC', 'Indian Railway Finance Corp'), info('IRCTC', 'Indian Railway Catering'), info('KPITTECH', 'KPIT Technologies')]) };
  };

  it('finds any listed stock from the instrument list even while it loads and Yahoo is down', async () => {
    expect((await search('kpit', master)).map((s) => s.symbol)).toEqual(['KPITTECH']);
  });
  it('ranks prefix symbol matches first and finds by company name', async () => {
    expect((await search('irc', master))[0].symbol).toBe('IRCTC');
    expect((await search('railway', master)).map((s) => s.symbol).sort()).toEqual(['IRCTC', 'IRFC']);
  });
  it('supports one-letter prefix searches', async () => {
    expect((await search('k', master)).map((s) => s.symbol)).toEqual(['KPITTECH']);
  });
});
