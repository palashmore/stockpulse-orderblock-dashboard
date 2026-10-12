import { describe, it, expect } from 'vitest';
import { resolveHeadlineStatus, isDemoModeRequested, STATUS_META } from './dataStatus';

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
    for (const s of ['LIVE', 'DELAYED', 'HISTORICAL', 'SIMULATED', 'STALE', 'UNAVAILABLE']) {
      expect(STATUS_META[s].label).toBe(s);
    }
  });
});

describe('isDemoModeRequested', () => {
  it('requires an explicit ?demo=1', () => {
    expect(isDemoModeRequested('?demo=1')).toBe(true);
    expect(isDemoModeRequested('')).toBe(false);
    expect(isDemoModeRequested('?demo=0')).toBe(false);
  });
});
