import { describe, it, expect, afterEach } from 'vitest';
import {
  isEmptyResult, parseWindow, mapOrder, mapTrade, mapTradeDetail, mapPosition, realisedRoundTrips, orderSummary, depthSummary, MAX_WINDOW_DAYS,
} from './brokerBooks.js';
import { createBreezeClient } from './breeze.js';
import { createStreamHub, depthKey } from './breezeStream.js';
import { createApp } from './app.js';
import { parseNseMaster } from './securityMaster.js';

describe('window and empty-result handling', () => {
  it('recognises Breeze "nothing to show" replies but not real failures', () => {
    for (const m of ['Breeze: No Positions available.', 'No Data Found', 'No orders available', 'No Trades found']) expect(isEmptyResult(m)).toBe(true);
    for (const m of ['Breeze HTTP 503', 'Breeze session expired; sign in again', 'Public Key does not exist.', '']) expect(isEmptyResult(m)).toBe(false);
  });

  it('validates the date window against ICICI\'s 10-day limit', () => {
    expect(parseWindow(undefined, undefined, '2026-10-12')).toEqual({ from: '2026-10-12', to: '2026-10-12' });
    expect(parseWindow('2026-10-03', '2026-10-12', 'x')).toEqual({ from: '2026-10-03', to: '2026-10-12' });
    expect(parseWindow('2026-10-02', '2026-10-12', 'x').error).toMatch(/10 days/);
    expect(parseWindow('2026-10-12', '2026-10-01', 'x').error).toMatch(/after/);
    expect(parseWindow('12-10-2026', undefined, 'x').error).toMatch(/Dates/);
    expect(MAX_WINDOW_DAYS).toBe(10);
  });
});

describe('order mapping', () => {
  const raw = { order_id: '20250205N300001234', exchange_order_id: null, exchange_code: 'NSE', stock_code: 'ITC', product_type: 'Cash', action: 'Buy', order_type: 'Limit', stoploss: '0.00', quantity: '10', price: '420.00', validity: 'Day', average_price: '0', cancelled_quantity: '2', pending_quantity: '3', status: 'Partially Executed And Cancelled', user_remark: '', order_datetime: '05-Feb-2025 09:26' };

  it('maps the documented fields, keeps missing ones null, and derives the filled quantity separately', () => {
    const o = mapOrder(raw);
    expect(o).toMatchObject({ orderId: '20250205N300001234', exchangeOrderId: null, symbol: 'ITC', action: 'BUY', orderType: 'Limit', quantity: 10, price: 420, pendingQuantity: 3, cancelledQuantity: 2, status: 'Partially Executed And Cancelled', remark: null, timestamp: '05-Feb-2025 09:26' });
    expect(o.derived.filledQuantity).toBe(5);
    expect(o).not.toHaveProperty('filledQuantity');
  });

  it('does not invent a filled quantity when pending is unknown', () => {
    expect(mapOrder({ ...raw, pending_quantity: undefined }).derived.filledQuantity).toBeNull();
  });

  it('labels derivative instruments with expiry, strike and right', () => {
    expect(mapOrder({ ...raw, exchange_code: 'NFO', stock_code: 'NIFTY', expiry_date: '27-Feb-2025', strike_price: '24800', right: 'Call' }).instrument).toBe('NIFTY 27-Feb-2025 24800 Call');
    expect(mapOrder({ ...raw, right: '*', strike_price: '0' }).instrument).toBe('ITC');
  });

  it('summarises orders by status', () => {
    expect(orderSummary([{ status: 'Executed' }, { status: 'Executed' }, { status: 'Rejected' }, {}])).toEqual({ total: 4, byStatus: { Executed: 2, Rejected: 1, Unknown: 1 } });
  });
});

describe('trade and position mapping', () => {
  it('maps trade-book rows and trade detail', () => {
    const t = mapTrade({ order_id: 'A1', exchange_code: 'NSE', stock_code: 'ITC', action: 'Sell', quantity: '5', average_cost: '420.5', trade_date: '05-Feb-2025', brokerage_amount: '1.2', total_taxes: '0.8', product_type: 'Cash', segment: 'cash' });
    expect(t).toMatchObject({ orderId: 'A1', action: 'SELL', quantity: 5, averageCost: 420.5, brokerage: 1.2, taxes: 0.8, tradeDate: '05-Feb-2025' });
    const d = mapTradeDetail({ trade_id: 'T9', exchange_trade_id: 'E1', executed_quantity: '5', execution_price: '420.5', exchange_trade_time: '05-Feb-2025 10:41:24', total_transaction_cost: '2' });
    expect(d).toMatchObject({ tradeId: 'T9', exchangeTradeId: 'E1', executedQuantity: 5, executionPrice: 420.5, totalTransactionCost: 2 });
  });

  it('computes unrealised P&L only when the direction is explicit, and labels it as derived', () => {
    const long = mapPosition({ stock_code: 'ITC', exchange_code: 'NSE', action: 'Buy', quantity: '10', average_price: '400', ltp: '410' });
    expect(long.derived).toEqual({ unrealisedPnl: 100, marketValue: 4100 });
    const short = mapPosition({ stock_code: 'ITC', action: 'Sell', quantity: '10', average_price: '400', ltp: '410' });
    expect(short.derived.unrealisedPnl).toBe(-100);
    const flat = mapPosition({ stock_code: 'NIFTY', action: 'NA', quantity: '0', average_price: '0', ltp: '29.95' });
    expect(flat.derived.unrealisedPnl).toBeNull();
    expect(flat.action).toBe('NA');
    expect(mapPosition({ stock_code: 'ITC', action: 'Buy', quantity: '10', average_price: '400' }).derived.unrealisedPnl).toBeNull();
  });
});

describe('realisedRoundTrips', () => {
  const trade = (action, quantity, averageCost, o = {}) => mapTrade({ exchange_code: 'NSE', stock_code: 'ITC', product_type: 'Cash', trade_date: '05-Feb-2025', action, quantity, average_cost: averageCost, brokerage_amount: 1, total_taxes: 1, ...o });

  it('matches same-day buys and sells at their average prices and shares the charges (hand-checked)', () => {
    // buy 10 @ 100 and 10 @ 110 -> avg 105; sell 15 @ 120. matched 15: gross 15 * (120 - 105) = 225.
    // charges: buy legs 4 total * (15/20) = 3, sell leg 2 * (15/15) = 2 -> 5
    const r = realisedRoundTrips([trade('Buy', 10, 100), trade('Buy', 10, 110), trade('Sell', 15, 120)]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ matchedQuantity: 15, averageBuy: 105, averageSell: 120, gross: 225, charges: 5, net: 220, unmatchedBuy: 5, unmatchedSell: 0 });
    expect(r.totals).toEqual({ gross: 225, charges: 5, net: 220 });
  });

  it('does not value a leg that has no opposite trade the same day', () => {
    expect(realisedRoundTrips([trade('Buy', 10, 100)]).rows).toEqual([]);
    expect(realisedRoundTrips([trade('Sell', 10, 100, { trade_date: '06-Feb-2025' }), trade('Buy', 10, 90)]).rows).toEqual([]);
  });

  it('keeps instruments and days separate and ignores rows it cannot read', () => {
    const r = realisedRoundTrips([
      trade('Buy', 5, 100), trade('Sell', 5, 101),
      trade('Buy', 5, 200, { stock_code: 'TCS' }), trade('Sell', 5, 190, { stock_code: 'TCS' }),
      trade('Buy', null, null), trade('Hold', 5, 1),
    ]);
    expect(r.rows.map((x) => [x.symbol, x.net])).toEqual([['ITC', 1], ['TCS', -54]]); // ITC: gross 5 less 4 charges; TCS: gross -50 less 4 charges
  });

  it('handles an empty trade book', () => {
    expect(realisedRoundTrips([])).toEqual({ rows: [], totals: { gross: 0, charges: 0, net: 0 } });
  });
});

describe('depth summary', () => {
  it('reports best bid/ask and spread, and nothing for an unusable top of book', () => {
    const s = depthSummary([{ bidPrice: 99.9, askPrice: 100.1 }]);
    expect(s.spread).toBeCloseTo(0.2, 6);
    expect(s.spreadPct).toBeCloseTo(0.2, 3);
    expect(depthSummary([{ bidPrice: 0, askPrice: 100 }])).toBeNull();
    expect(depthSummary([])).toBeNull();
    expect(depthSummary(null)).toBeNull();
  });
});

describe('/api/broker endpoints', () => {
  const MASTER = '"Token","ShortName","Series","CompanyName","ISINCode","ExchangeCode"\n"2885","RELIND","EQ","RELIANCE INDUSTRIES LTD","INE002A01018","RELIANCE"';
  let server;
  let base;
  let calls;
  let hub;
  afterEach(() => new Promise((resolve) => { hub?.stop(); server.close(resolve); }));

  async function start({ connected = true, reply } = {}) {
    calls = [];
    const clock = () => Date.UTC(2026, 9, 12, 5, 30);
    hub = createStreamHub({ now: clock, ioFactory: () => ({ on() {}, emit() {}, close() {}, removeAllListeners() {} }) });
    const breeze = createBreezeClient({
      appKey: 'K', secret: 'S', now: clock,
      request: async (req) => {
        if (req.path.endsWith('customerdetails')) return { status: 200, json: { Success: { session_token: Buffer.from('U:T').toString('base64') } } };
        calls.push({ path: req.path, body: JSON.parse(req.body) });
        return reply(req);
      },
    });
    if (connected) await breeze.connect('S');
    const { app } = createApp({ fetchFn: async () => new Response('{}'), now: clock, breeze, streamHub: hub, loadMaster: async () => parseNseMaster(MASTER) });
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}/api`;
    await new Promise((r) => setTimeout(r, 20));
  }
  const get = async (p) => { const res = await fetch(`${base}${p}`); return { res, body: await res.json() }; };

  it('requires sign-in and never lets the browser cache account data', async () => {
    await start({ connected: false, reply: () => ({ status: 200, json: { Success: [] } }) });
    const { res } = await get('/broker/orders');
    expect(res.status).toBe(409);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('lists orders from both exchanges for today, newest first, with a status summary', async () => {
    await start({
      reply: (req) => ({ status: 200, json: { Success: req.path.endsWith('/order')
        ? [{ order_id: 'O1', exchange_code: req.body ? 'NSE' : '', stock_code: 'ITC', action: 'Buy', quantity: '1', pending_quantity: '0', cancelled_quantity: '0', status: 'Executed', order_datetime: '12-Oct-2026 09:30' },
           { order_id: 'O2', stock_code: 'TCS', action: 'Sell', quantity: '2', pending_quantity: '2', status: 'Ordered', order_datetime: '12-Oct-2026 10:30' }]
        : [] } }),
    });
    const { body } = await get('/broker/orders');
    const orderCalls = calls.filter((c) => c.path.endsWith('/order'));
    expect(orderCalls.map((c) => c.body.exchange_code).sort()).toEqual(['NFO', 'NSE']);
    expect(orderCalls[0].body.from_date).toBe('2026-10-12T00:00:00.000Z');
    expect(body.orders[0].orderId).toBe('O2'); // newest first
    expect(body.summary.byStatus).toEqual({ Executed: 2, Ordered: 2 }); // both exchange calls return the same two rows in this fixture
    expect(body.window).toEqual({ from: '2026-10-12', to: '2026-10-12' });
  });

  it('treats "No ... available" as an empty list, not an error', async () => {
    await start({ reply: () => ({ status: 200, json: { Success: null, Error: 'No Positions available.' } }) });
    const { res, body } = await get('/broker/positions');
    expect(res.status).toBe(200);
    expect(body.positions).toEqual([]);
  });

  it('rejects bad windows before calling the broker, and a window over ten days', async () => {
    await start({ reply: () => ({ status: 200, json: { Success: [] } }) });
    expect((await get('/broker/trades?from=2026-09-01&to=2026-10-12')).res.status).toBe(400);
    expect((await get('/broker/trades?from=nope')).res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('returns trades with locally calculated round-trip P&L kept separate', async () => {
    await start({
      reply: () => ({ status: 200, json: { Success: [
        { order_id: 'A', exchange_code: 'NSE', stock_code: 'ITC', product_type: 'Cash', action: 'Buy', quantity: '10', average_cost: '100', trade_date: '12-Oct-2026', brokerage_amount: '1', total_taxes: '0' },
        { order_id: 'B', exchange_code: 'NSE', stock_code: 'ITC', product_type: 'Cash', action: 'Sell', quantity: '10', average_cost: '102', trade_date: '12-Oct-2026', brokerage_amount: '1', total_taxes: '1' },
      ] } }),
    });
    const { body } = await get('/broker/trades?exchange=NSE');
    expect(body.trades).toHaveLength(2);
    expect(body.realised.rows[0]).toMatchObject({ symbol: 'ITC', gross: 20, charges: 3, net: 17 });
  });

  it('validates the trade-detail order id and calls the documented endpoint', async () => {
    await start({ reply: () => ({ status: 200, json: { Success: [{ trade_id: 'T1', executed_quantity: '5', execution_price: '10' }] } }) });
    expect((await get('/broker/trades/detail?orderId=bad id!')).res.status).toBe(400);
    const { body } = await get('/broker/trades/detail?orderId=20250205N300001234&exchange=NSE');
    expect(body.fills[0]).toMatchObject({ tradeId: 'T1', executedQuantity: 5 });
    expect(calls.at(-1)).toMatchObject({ path: '/breezeapi/api/v1/trades', body: { exchange_code: 'NSE', order_id: '20250205N300001234' } });
  });

  it('caches for 30 seconds and a provider failure becomes a clear 502', async () => {
    await start({ reply: () => ({ status: 200, json: { Success: [] } }) });
    await get('/broker/positions');
    await get('/broker/positions');
    expect(calls.filter((c) => c.path.endsWith('portfoliopositions'))).toHaveLength(1);
    await new Promise((resolve) => server.close(resolve));
    await start({ reply: () => ({ status: 503, json: null }) });
    const { res, body } = await get('/broker/orders');
    expect(res.status).toBe(502);
    expect(body.error).toMatch(/503/);
  });

  it('exposes no endpoint that places, changes or cancels an order', async () => {
    await start({ reply: () => ({ status: 200, json: { Success: [] } }) });
    for (const [method, path] of [['POST', '/broker/orders'], ['PUT', '/broker/orders'], ['DELETE', '/broker/orders'], ['POST', '/broker/order']]) {
      expect((await fetch(`${base}${path}`, { method })).status).toBe(404);
    }
  });

  it('market depth says plainly when it is unavailable, and parses it when the feed supplies it', async () => {
    await start({ reply: () => ({ status: 200, json: { Success: [] } }) });
    const none = await get('/depth/RELIANCE');
    expect(none.body.available).toBe(false);
    expect(none.body.reason).toMatch(/stream not connected/i);
    expect(depthKey('2885')).toBe('4.2!2885');
  });
});
