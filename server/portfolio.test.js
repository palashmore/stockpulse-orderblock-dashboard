import { describe, it, expect, afterEach } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { buildPortfolio, mapFunds, maskAccount } from './portfolio.js';
import { readZipEntry, splitCsvLine, parseNseMaster } from './securityMaster.js';
import { createApp } from './app.js';
import { createBreezeClient } from './breeze.js';

// ---- helpers: a tiny in-memory zip and security-master text
function makeZip(files) {
  const locals = [];
  const dirs = [];
  let offset = 0;
  for (const [name, content, method] of files) {
    const raw = Buffer.from(content);
    const data = method === 0 ? raw : deflateRawSync(raw);
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const entry = Buffer.concat([local, nameBuf, data]);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(method, 10);
    dir.writeUInt32LE(data.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE(offset, 42);
    dirs.push(Buffer.concat([dir, nameBuf]));
    locals.push(entry);
    offset += entry.length;
  }
  const dirBuf = Buffer.concat(dirs);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dirBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dirBuf, end]);
}

const MASTER_TEXT = [
  '"Token", "ShortName", "Series", "CompanyName", "ISINCode", "ExchangeCode"',
  '"0","RELIND","EQ","RELIANCE INDUSTRIES LTD","INE002A01018","RELIANCE"',
  '"0","AAA","BE","NOT EQ SERIES","INE000000001","AAA"',
  '"0","TEST","EQ","COMPANY, WITH ""QUOTES"" INC","INE000000002","TESTCO"',
].join('\n');

describe('zip and master parsing', () => {
  it('reads deflated and stored entries and returns null for a missing one', () => {
    const zip = makeZip([['a.txt', 'hello world', 8], ['NSEScripMaster.txt', MASTER_TEXT, 0]]);
    expect(readZipEntry(zip, 'a.txt').toString()).toBe('hello world');
    expect(readZipEntry(zip, 'NSEScripMaster.txt').toString()).toBe(MASTER_TEXT);
    expect(readZipEntry(zip, 'nope.txt')).toBeNull();
    expect(() => readZipEntry(Buffer.from('not a zip at all, just some text here'), 'a')).toThrow(/Not a zip/);
  });

  it('splits CSV lines with quotes and escaped quotes', () => {
    expect(splitCsvLine('"a","b, c","d ""e"" f",g')).toEqual(['a', 'b, c', 'd "e" f', 'g']);
  });

  it('keeps EQ series only and indexes by code and ISIN', () => {
    const m = parseNseMaster(MASTER_TEXT);
    expect(m.byCode.get('RELIND')).toEqual({ symbol: 'RELIANCE', name: 'RELIANCE INDUSTRIES LTD', isin: 'INE002A01018' });
    expect(m.byIsin.get('INE002A01018').symbol).toBe('RELIANCE');
    expect(m.byCode.has('AAA')).toBe(false);
    expect(m.byCode.get('TEST').name).toBe('COMPANY, WITH "QUOTES" INC');
  });

  it('rejects an unexpected layout instead of guessing', () => {
    expect(() => parseNseMaster('"A","B"\n"1","2"')).toThrow(/layout/);
  });
});

describe('funds mapping', () => {
  it('masks the account number and converts numeric strings', () => {
    expect(maskAccount('123456789012')).toBe('9012');
    expect(maskAccount('12')).toBeNull();
    const f = mapFunds({ bank_account: '123456789012', total_bank_balance: 800, unallocated_balance: '87500', allocated_equity: 'x' });
    expect(f).toMatchObject({ bankAccountLast4: '9012', totalBankBalance: 800, unallocatedBalance: 87500, allocatedEquity: null });
    expect(JSON.stringify(f)).not.toContain('123456789012');
    expect(mapFunds(null)).toBeNull();
  });
});

describe('buildPortfolio', () => {
  const master = parseNseMaster(MASTER_TEXT);
  const holdings = [
    { stock_code: 'RELIND', stock_ISIN: 'INE002A01018', quantity: '10', demat_avail_quantity: '10' },
    { stock_code: 'TEST', stock_ISIN: 'INE000000002', quantity: '5', demat_avail_quantity: '0' },
    { stock_code: 'GONE', stock_ISIN: 'INE999999999', quantity: '0' },
    { stock_code: 'MYSTERY', stock_ISIN: '', quantity: '3' },
  ];
  const quotes = new Map([['RELIND', { price: 1000, previousClose: 1100 }], ['TEST', { price: 50, previousClose: 40 }]]);
  const p = buildPortfolio(holdings, { master, niftyByCode: {}, quotes });

  it('drops zero-quantity holdings and resolves names via ISIN or code', () => {
    expect(p.holdings.map((h) => h.code)).toEqual(['RELIND', 'TEST', 'MYSTERY']);
    expect(p.holdings[0]).toMatchObject({ symbol: 'RELIANCE', name: 'RELIANCE INDUSTRIES LTD' });
    expect(p.holdings[2]).toMatchObject({ symbol: null, name: 'MYSTERY' }); // unknown: shows the code, not a guess
  });

  it('computes value, day change and weight from price and previous close', () => {
    expect(p.holdings[0]).toMatchObject({ value: 10000, dayChange: -1000, dayChangePct: -9.09 });
    expect(p.holdings[1]).toMatchObject({ value: 250, dayChange: 50, dayChangePct: 25 });
    expect(p.holdings[0].weightPct).toBeCloseTo(97.56, 2);
  });

  it('totals only priced holdings and reports the rest as unpriced rather than zero', () => {
    expect(p.holdings[2]).toMatchObject({ price: null, value: null, dayChange: null, weightPct: null });
    expect(p.totals).toEqual({ value: 10250, dayChange: -950, dayChangePct: -8.48, count: 3, unpriced: 1 });
  });

  it('falls back to the Nifty code map when the master is unavailable', () => {
    const q = buildPortfolio([{ stock_code: 'RELIND', quantity: '1' }], { master: null, niftyByCode: { RELIND: 'RELIANCE' } });
    expect(q.holdings[0]).toMatchObject({ symbol: 'RELIANCE', name: 'RELIANCE', price: null });
  });

  it('handles empty input', () => {
    expect(buildPortfolio(null).totals).toEqual({ value: 0, dayChange: 0, dayChangePct: null, count: 0, unpriced: 0 });
  });
});

describe('/api/portfolio', () => {
  let server;
  let base;
  let quoteCalls;
  afterEach(() => new Promise((resolve) => server.close(resolve)));

  async function start({ connected = true, fail = [], flaky = [] } = {}) {
    const seen = new Set();
    quoteCalls = 0;
    const clock = () => Date.UTC(2026, 9, 12, 5, 30);
    const breeze = createBreezeClient({
      appKey: 'KEY',
      secret: 'SECRET',
      now: clock,
      request: async (req) => {
        if (req.path.endsWith('customerdetails')) return { status: 200, json: { Success: { session_token: 'T' } } };
        if (req.path.endsWith('dematholdings')) {
          return { status: 200, json: { Success: [
            { stock_code: 'RELIND', stock_ISIN: 'INE002A01018', quantity: '10', demat_avail_quantity: '10' },
            { stock_code: 'BADQ', stock_ISIN: '', quantity: '2' },
          ] } };
        }
        if (req.path.endsWith('funds')) {
          return { status: 200, json: { Success: { bank_account: '123456789012', total_bank_balance: 5000, unallocated_balance: '4000' } } };
        }
        if (req.path.endsWith('quotes')) {
          quoteCalls++;
          const code = JSON.parse(req.body).stock_code;
          if (fail.includes(code) || code === 'BADQ') return { status: 200, json: { Success: null, Error: 'No data' } };
          if (flaky.includes(code) && !seen.has(code)) { seen.add(code); return { status: 503, json: null }; }
          return { status: 200, json: { Success: [{ ltp: '1000', previous_close: '1100', ltt: '2026-10-12 10:59:00' }] } };
        }
        return { status: 404, json: null };
      },
    });
    if (connected) await breeze.connect('S');
    const { app } = createApp({
      fetchFn: async () => new Response('{}'),
      now: clock,
      breeze,
      loadMaster: async () => parseNseMaster(MASTER_TEXT),
    });
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}/api`;
  }

  it('requires a broker sign-in', async () => {
    await start({ connected: false });
    const res = await fetch(`${base}/portfolio`);
    expect(res.status).toBe(409);
  });

  it('returns named, priced holdings with totals and masked funds, and is never cached by the browser', async () => {
    await start({ fail: ['BADQ'] });
    const res = await fetch(`${base}/portfolio`);
    const body = await res.json();
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(body.holdings[0]).toMatchObject({ symbol: 'RELIANCE', quantity: 10, value: 10000, dayChange: -1000 });
    expect(body.holdings[1]).toMatchObject({ code: 'BADQ', value: null });
    expect(body.totals).toMatchObject({ value: 10000, unpriced: 1, count: 2 });
    expect(body.funds).toMatchObject({ bankAccountLast4: '9012', unallocatedBalance: 4000 });
    expect(JSON.stringify(body)).not.toContain('123456789012');
    expect(body.priceBasis).toMatch(/market open/);
    expect(body.notes[0]).toMatch(/profit and loss/);
  });

  it('retries a throttled (HTTP 503) quote and prices the holding', async () => {
    await start({ flaky: ['RELIND'] });
    const body = await (await fetch(`${base}/portfolio`)).json();
    expect(body.holdings[0]).toMatchObject({ code: 'RELIND', value: 10000 });
    expect(body.totals.unpriced).toBe(1); // BADQ still has no data
  });

  it('serves a repeat request within a minute without calling the broker again', async () => {
    await start();
    await fetch(`${base}/portfolio`);
    const first = quoteCalls;
    await fetch(`${base}/portfolio`);
    expect(quoteCalls).toBe(first);
  });
});
