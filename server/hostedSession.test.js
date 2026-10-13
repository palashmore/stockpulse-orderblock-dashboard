import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp } from './app.js';
import { createBreezeClient } from './breeze.js';

const realFetch = globalThis.fetch;
const FWD = { 'x-forwarded-for': '203.0.113.7' }; // as if arriving through the platform proxy

describe('hosted broker sessions (the browser holds the token)', () => {
  let server;
  let base;
  let calls; // { endpoint, sessionHeader }

  beforeEach(async () => {
    calls = [];
    const request = async ({ path, headers, body }) => {
      const endpoint = path.split('/').pop();
      calls.push({ endpoint, token: headers['X-SessionToken'] ?? null, body });
      if (endpoint === 'customerdetails') {
        const sent = JSON.parse(body).SessionToken;
        return sent === 'GOODSESSION' ? { status: 200, text: '{}', json: { Success: { session_token: 'VGVzdFVzZXI6dG9rZW4=' }, Status: 200 } } : { status: 200, text: '{}', json: { Error: 'Invalid session.', Success: null } };
      }
      if (endpoint === 'dematholdings') return { status: 200, text: '{}', json: { Success: [{ stock_code: 'TCS', quantity: '5', stock_ISIN: 'INE467B01029' }], Status: 200 } };
      if (endpoint === 'funds') return { status: 200, text: '{}', json: { Success: { unallocated_balance: '1000' }, Status: 200 } };
      if (endpoint === 'quotes') return { status: 200, text: '{}', json: { Success: [{ ltp: 100, previous_close: 99, ltt: '' }], Status: 200 } };
      return { status: 200, text: '{}', json: { Success: [], Status: 200 } };
    };
    const breeze = createBreezeClient({ appKey: 'KEY', secret: 'SECRET', request, retryDelaysMs: [0] });
    const { app } = createApp({ fetchFn: async () => new Response('{}', { status: 404 }), breeze, hostedSessions: true, alertIntervalMs: 0 });
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}/api`;
  });
  afterEach(() => new Promise((resolve) => server.close(resolve)));

  const call = async (method, path, { headers = {}, body } = {}) => {
    const res = await realFetch(`${base}${path}`, { method, headers: { ...FWD, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { res, body: await res.json() };
  };

  it('reports not signed in, and the login link, to a visitor without a token', async () => {
    const { res, body } = await call('GET', '/auth/status');
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ hosted: true, configured: true, connected: false });
    expect(body.loginUrl).toContain('apiuser/login?api_key='); // the key itself comes from the BREEZE_API_KEY environment variable
    expect(JSON.stringify(body)).not.toContain('SECRET');
  });

  it('exchanges the pasted address for a session token and hands it to the browser', async () => {
    const { res, body } = await call('POST', '/auth/breeze/session', { body: { session: 'https://127.0.0.1/?apisession=GOODSESSION' } });
    expect(res.status).toBe(200);
    expect(body).toEqual({ connected: true, sessionToken: 'VGVzdFVzZXI6dG9rZW4=' });
    const bad = await call('POST', '/auth/breeze/session', { body: { session: 'https://127.0.0.1/?apisession=WRONG' } });
    expect(bad.res.status).toBe(502);
    expect(bad.body.error).toMatch(/Invalid session/);
  });

  it('keeps no session on the server: another visitor is still signed out', async () => {
    await call('POST', '/auth/breeze/session', { body: { session: 'GOODSESSION' } });
    expect((await call('GET', '/auth/status')).body.connected).toBe(false);
    expect((await call('GET', '/portfolio')).res.status).toBe(409);
  });

  it('uses the visitor\'s own token for account requests, and a token only counts if it looks like one', async () => {
    const withToken = await call('GET', '/auth/status', { headers: { 'X-Breeze-Session': 'VGVzdFVzZXI6dG9rZW4=' } });
    expect(withToken.body.connected).toBe(true);
    const junk = await call('GET', '/auth/status', { headers: { 'X-Breeze-Session': '<script>alert(1)</script>' } });
    expect(junk.body.connected).toBe(false);

    const portfolio = await call('GET', '/portfolio', { headers: { 'X-Breeze-Session': 'VGVzdFVzZXI6dG9rZW4=' } });
    expect(portfolio.res.status).toBe(200);
    expect(portfolio.body.holdings).toHaveLength(1);
    expect(calls.filter((c) => c.endpoint === 'dematholdings').every((c) => c.token === 'VGVzdFVzZXI6dG9rZW4=')).toBe(true);
  });

  it('never serves one visitor\'s account data from another\'s cache', async () => {
    const a = { 'X-Breeze-Session': 'QUFBQUFBQUE6dG9rZW4=' };
    const b = { 'X-Breeze-Session': 'QkJCQkJCQkI6dG9rZW4=' };
    await call('GET', '/broker/positions', { headers: a });
    await call('GET', '/broker/positions', { headers: b });
    const positionCalls = calls.filter((c) => c.endpoint === 'portfoliopositions');
    expect(positionCalls.map((c) => c.token)).toEqual(['QUFBQUFBQUE6dG9rZW4=', 'QkJCQkJCQkI6dG9rZW4=']);
  });

  it('still keeps alerts and diagnostics closed to everyone arriving through the proxy', async () => {
    expect((await call('GET', '/alerts')).res.status).toBe(403);
    expect((await call('GET', '/diagnostics')).res.status).toBe(403);
  });

  it('disconnect does nothing on the server (the browser forgets its token)', async () => {
    const { res, body } = await call('POST', '/auth/breeze/disconnect');
    expect(res.status).toBe(200);
    expect(body).toEqual({ connected: false });
  });
});
