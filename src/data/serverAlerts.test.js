import { describe, it, expect } from 'vitest';
import { describeEngine, unseenEvents, eventLine, deliveryLabel } from './serverAlerts';

describe('describeEngine', () => {
  it('maps each outcome to a label and tone', () => {
    expect(describeEngine({ outcome: 'ok', detail: '3 of 3 symbols checked' })).toEqual({ label: 'Checked', tone: 'ok' });
    expect(describeEngine({ outcome: 'market-closed' }).tone).toBe('idle');
    expect(describeEngine({ outcome: 'no-active-alerts' }).tone).toBe('idle');
    expect(describeEngine({ outcome: 'not-run-yet' }).tone).toBe('warn');
  });

  it('appends the detail for problems', () => {
    expect(describeEngine({ outcome: 'data-unavailable', detail: 'network down' })).toEqual({
      label: 'Price feed unavailable (network down)', tone: 'bad',
    });
    expect(describeEngine({ outcome: 'data-not-live', detail: 'Quotes were STALE' }).label).toContain('STALE');
  });

  it('copes with a missing or unknown state', () => {
    expect(describeEngine(null).tone).toBe('warn');
    expect(describeEngine({ outcome: 'mystery' }).label).toBe('Unknown state');
  });
});

describe('unseenEvents', () => {
  it('returns only events not seen before', () => {
    const events = [{ id: 'c' }, { id: 'b' }, { id: 'a' }];
    expect(unseenEvents(events, new Set(['a', 'b']))).toEqual([{ id: 'c' }]);
    expect(unseenEvents(events, new Set(['a', 'b', 'c']))).toEqual([]);
    expect(unseenEvents(undefined, new Set())).toEqual([]);
  });
});

describe('eventLine and deliveryLabel', () => {
  it('describes a crossing in rupees with the data status', () => {
    expect(eventLine({ symbol: 'RELIANCE', type: 'above', threshold: 1510, price: 1512.5, status: 'LIVE' }))
      .toBe('RELIANCE rose to ₹1,510.00 or above; last price ₹1,512.50 (LIVE)');
    expect(eventLine({ symbol: 'TCS', type: 'below', threshold: 4000, price: 3990, status: null }))
      .toBe('TCS fell to ₹4,000.00 or below; last price ₹3,990.00');
  });

  it('labels delivery states, defaulting to "no push channel"', () => {
    expect(deliveryLabel('sent')).toBe('push sent');
    expect(deliveryLabel('failed')).toBe('push failed');
    expect(deliveryLabel(undefined)).toBe('no push channel');
  });
});
