import { describe, it, expect } from 'vitest';
import { createBreezeClient, isTransientNetworkError, describeNetworkError } from './breeze.js';

const NOW = Date.UTC(2026, 9, 12, 5, 30);
const networkError = (code, message = code) => Object.assign(new Error(message), { code });
const okSession = { status: 200, text: '{}', json: { Success: { user_id: 'X', session_token: 'abc' }, Status: 200 } };

const client = (request, extra = {}) => createBreezeClient({ appKey: 'KEY', secret: 'SECRET', request, now: () => NOW, retryDelaysMs: [0, 0, 0], ...extra });

describe('network failures during sign-in and requests', () => {
  it('recognises DNS and connection failures, but not an answer from ICICI', () => {
    for (const code of ['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENETUNREACH']) expect(isTransientNetworkError(networkError(code))).toBe(true);
    expect(isTransientNetworkError(new Error('Breeze request timed out'))).toBe(true);
    expect(isTransientNetworkError(new Error('Breeze: Invalid session.'))).toBe(false);
    expect(isTransientNetworkError(null)).toBe(false);
  });

  it('retries a failed DNS lookup and succeeds once the network is back', async () => {
    let calls = 0;
    const c = client(async () => {
      calls += 1;
      if (calls < 3) throw networkError('ENOTFOUND', 'getaddrinfo ENOTFOUND api.icicidirect.com');
      return okSession;
    });
    await c.connect('57324781');
    expect(calls).toBe(3);
    expect(c.isConnected()).toBe(true);
  });

  it('gives up after the retries with a plain explanation instead of the raw error', async () => {
    let calls = 0;
    const c = client(async () => {
      calls += 1;
      throw networkError('ENOTFOUND', 'getaddrinfo ENOTFOUND api.icicidirect.com');
    });
    await expect(c.connect('57324781')).rejects.toThrow(/could not look up api\.icicidirect\.com/);
    expect(calls).toBe(4); // the first try and three retries
    expect(c.isConnected()).toBe(false);
  });

  it('does not retry when ICICI answered, even with an error', async () => {
    let calls = 0;
    const c = client(async () => {
      calls += 1;
      return { status: 200, text: '{}', json: { Error: 'Invalid session.', Success: null } };
    });
    await expect(c.connect('1')).rejects.toThrow(/Invalid session/);
    expect(calls).toBe(1);
  });

  it('does not retry an unexpected error that is not a network failure', async () => {
    let calls = 0;
    const c = client(async () => {
      calls += 1;
      throw new TypeError('bad things');
    });
    await expect(c.connect('1')).rejects.toThrow('bad things');
    expect(calls).toBe(1);
  });

  it('describes each kind of failure in plain words', () => {
    expect(describeNetworkError(networkError('ENOTFOUND'))).toMatch(/DNS or internet problem/);
    expect(describeNetworkError(networkError('EAI_AGAIN'))).toMatch(/look up/);
    expect(describeNetworkError(networkError('ECONNRESET'))).toMatch(/could not connect/);
    expect(describeNetworkError(new Error('Breeze request timed out'))).toMatch(/timed out/);
  });
});
