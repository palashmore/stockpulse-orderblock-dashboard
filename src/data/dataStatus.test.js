import { describe, it, expect } from 'vitest';
import { resolveHeadlineStatus, isDemoModeRequested, STATUS_META, describeMarketState, formatSessionDate } from './dataStatus';

const base = { demoMode: false, backendUp: true, attempted: true, hasData: true, refreshFailed: false, quote: null, history: null };

describe('resolveHeadlineStatus', () => {
  it('is SIMULATED only in demo mode', () => {
    expect(resolveHeadlineStatus({ ...base, demoMode: true })).toBe('SIMULATED');
    expect(resolveHeadlineStatus({ ...base, quote: { dataStatus: 'DELAYED' } })).not.toBe('SIMULATED');
  });

  it('is unknown (null) until the backend check and first load finish', () => {
    expect(resolveHeadlineStatus({ ...base, backendUp: null })).toBeNull();
    expect(resolveHeadlineStatus({ ...base, hasData: false, attempted: false })).toBeNull();
  });

  it('reports UNAVAILABLE rather than demo data when the backend or data is missing', () => {
    expect(resolveHeadlineStatus({ ...base, backendUp: false, hasData: false })).toBe('UNAVAILABLE');
    expect(resolveHeadlineStatus({ ...base, hasData: false })).toBe('UNAVAILABLE');
  });

  it('reports STALE when a refresh fails over previously loaded data', () => {
    expect(resolveHeadlineStatus({ ...base, refreshFailed: true })).toBe('STALE');
    expect(resolveHeadlineStatus({ ...base, backendUp: false })).toBe('STALE');
  });

  it('passes through the provider status, preferring the quote', () => {
    expect(resolveHeadlineStatus({ ...base, quote: { dataStatus: 'DELAYED' }, history: { dataStatus: 'HISTORICAL' } })).toBe('DELAYED');
    expect(resolveHeadlineStatus({ ...base, history: { dataStatus: 'HISTORICAL' } })).toBe('HISTORICAL');
  });

  it('never invents a status when the payload has none', () => {
    expect(resolveHeadlineStatus(base)).toBe('UNAVAILABLE');
  });

  it('every status has display metadata', () => {
    expect(Object.keys(STATUS_META).sort()).toEqual(['DELAYED', 'HISTORICAL', 'LIVE', 'MARKET_CLOSED', 'SIMULATED', 'STALE', 'UNAVAILABLE']);
    expect(STATUS_META.LIVE.label).toBe('LIVE MARKET');
    expect(STATUS_META.MARKET_CLOSED.label).toBe('MARKET CLOSED');
    expect(STATUS_META.UNAVAILABLE.label).toBe('DATA UNAVAILABLE');
  });

  it('passes MARKET_CLOSED through from the provider status', () => {
    expect(resolveHeadlineStatus({ ...base, quote: { dataStatus: 'MARKET_CLOSED' } })).toBe('MARKET_CLOSED');
  });
});

describe('market state text', () => {
  it('describes open, pre-open, holiday, weekend and after-hours', () => {
    expect(describeMarketState({ state: 'OPEN' })).toBe('Market open');
    expect(describeMarketState({ state: 'PRE_OPEN' })).toBe('Pre-open');
    expect(describeMarketState({ state: 'CLOSED', reason: 'holiday', holiday: 'Dussehra' })).toBe('Closed: Dussehra');
    expect(describeMarketState({ state: 'CLOSED', reason: 'weekend' })).toBe('Closed: weekend');
    expect(describeMarketState({ state: 'CLOSED', reason: 'after_close' })).toBe('Market closed');
    expect(describeMarketState(null)).toBeNull();
  });

  it('formats a session date', () => {
    expect(formatSessionDate('2026-10-09')).toMatch(/Fri/);
    expect(formatSessionDate('garbage')).toBeNull();
    expect(formatSessionDate(null)).toBeNull();
  });
});

describe('isDemoModeRequested', () => {
  it('requires an explicit ?demo=1', () => {
    expect(isDemoModeRequested('?demo=1')).toBe(true);
    expect(isDemoModeRequested('')).toBe(false);
    expect(isDemoModeRequested('?demo=0')).toBe(false);
  });
});
