import { describe, it, expect } from 'vitest';
import { createProviderGuard, ProviderPausedError, parseRetryAfter } from './providerGuard.js';

const make = (extra = {}) => {
  let t = 1000;
  const guard = createProviderGuard({ now: () => t, failuresToPause: 3, pauseMs: 20_000, rateLimitMs: 30_000, ...extra });
  return { guard, advance: (ms) => { t += ms; } };
};

describe('provider guard', () => {
  it('lets requests through while the provider is healthy', () => {
    const { guard } = make();
    expect(() => guard.check('yahoo.com')).not.toThrow();
    guard.failure('yahoo.com');
    guard.failure('yahoo.com');
    expect(() => guard.check('yahoo.com')).not.toThrow(); // two failures are not enough
  });

  it('pauses after three failures in a row and refuses requests at once', () => {
    const { guard } = make();
    for (let i = 0; i < 3; i++) guard.failure('nseindia.com');
    expect(() => guard.check('nseindia.com')).toThrow(ProviderPausedError);
    try { guard.check('nseindia.com'); } catch (e) { expect(e.paused).toBe(true); expect(e.message).toMatch(/not reachable/); }
    expect(guard.paused()).toEqual([{ provider: 'nseindia.com', reason: 'not reachable', resumesInSec: 20 }]);
  });

  it('resumes after the pause', () => {
    const { guard, advance } = make();
    for (let i = 0; i < 3; i++) guard.failure('a.com');
    advance(19_999);
    expect(() => guard.check('a.com')).toThrow();
    advance(2);
    expect(() => guard.check('a.com')).not.toThrow();
    expect(guard.paused()).toEqual([]);
  });

  it('counts only failures in a row: a good answer clears them', () => {
    const { guard } = make();
    guard.failure('a.com');
    guard.failure('a.com');
    guard.success('a.com');
    guard.failure('a.com');
    guard.failure('a.com');
    expect(() => guard.check('a.com')).not.toThrow();
  });

  it('pauses at once on a rate limit, for its Retry-After or a default', () => {
    const { guard } = make();
    guard.rateLimited('yahoo.com', 45);
    expect(guard.paused()[0]).toMatchObject({ provider: 'yahoo.com', reason: 'rate limited', resumesInSec: 45 });
    const other = make();
    other.guard.rateLimited('yahoo.com');
    expect(other.guard.paused()[0].resumesInSec).toBe(30);
  });

  it('keeps providers apart', () => {
    const { guard } = make();
    guard.rateLimited('yahoo.com');
    expect(() => guard.check('nseindia.com')).not.toThrow();
    expect(() => guard.check('yahoo.com')).toThrow();
  });

  it('parses Retry-After safely', () => {
    expect(parseRetryAfter('30')).toBe(30);
    expect(parseRetryAfter('1')).toBe(5);
    expect(parseRetryAfter('9999')).toBe(120);
    for (const bad of [null, undefined, '', 'soon', '0', '-4', 'Wed, 21 Oct 2026 07:28:00 GMT']) expect(parseRetryAfter(bad)).toBeNull();
  });
});
