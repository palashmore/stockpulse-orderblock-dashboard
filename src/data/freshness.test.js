import { describe, expect, it } from 'vitest';
import { freshness } from './freshness';

describe('freshness', () => {
  const now = 1_000_000_000;
  it('is fresh within 1.5 intervals', () => {
    expect(freshness({ lastSuccessAt: now - 30000, now }).state).toBe('fresh');
    expect(freshness({ lastSuccessAt: now - 89000, now }).state).toBe('fresh');
  });
  it('becomes delayed then stale', () => {
    expect(freshness({ lastSuccessAt: now - 120000, now }).state).toBe('delayed');
    expect(freshness({ lastSuccessAt: now - 400000, now }).state).toBe('stale');
  });
  it('says so when refreshes are failing', () => {
    expect(freshness({ lastSuccessAt: now - 10000, now, failures: 2 }).text).toMatch(/last good data/);
    expect(freshness({ lastSuccessAt: null, now, failures: 1 }).state).toBe('unknown');
  });
});
