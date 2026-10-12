import { describe, it, expect } from 'vitest';
import {
  istDateKey,
  parseNseHolidays,
  getMarketState,
  isTradingDay,
  previousTradingDay,
  nextTradingDay,
} from './marketCalendar.js';

// IST wall clock -> epoch ms
const ist = (y, mo, d, h, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) - 19800000;

const holidays = parseNseHolidays({
  CM: [
    { tradingDate: '02-Oct-2026', description: 'Mahatma Gandhi Jayanti' },
    { tradingDate: '20-Oct-2026', description: 'Dussehra' },
    { tradingDate: '08-Nov-2026', description: 'Diwali Laxmi Pujan*' }, // a Sunday
  ],
});

describe('parseNseHolidays', () => {
  it('reads the capital-market list into date keys', () => {
    expect(holidays.get('2026-10-20')).toBe('Dussehra');
    expect(holidays.get('2026-10-02')).toBe('Mahatma Gandhi Jayanti');
    expect(holidays.size).toBe(3);
  });

  it('returns null for unusable payloads so "no calendar" is distinguishable', () => {
    expect(parseNseHolidays(null)).toBeNull();
    expect(parseNseHolidays({})).toBeNull();
    expect(parseNseHolidays({ CM: [] })).toBeNull();
    expect(parseNseHolidays({ CM: [{ tradingDate: 'garbage' }] })).toBeNull();
  });
});

describe('trading days', () => {
  it('skips weekends and holidays in both directions', () => {
    expect(isTradingDay('2026-10-12', holidays)).toBe(true); // Monday
    expect(isTradingDay('2026-10-10', holidays)).toBe(false); // Saturday
    expect(isTradingDay('2026-10-20', holidays)).toBe(false); // Dussehra
    expect(previousTradingDay('2026-10-21', holidays)).toBe('2026-10-19');
    expect(nextTradingDay('2026-10-19', holidays)).toBe('2026-10-21');
    expect(previousTradingDay('2026-10-05', holidays)).toBe('2026-10-01'); // over the weekend and the 2 Oct holiday
  });

  it('treats everything Mon-Fri as a trading day without a calendar', () => {
    expect(isTradingDay('2026-10-20', null)).toBe(true);
  });

  it('converts to the IST calendar date', () => {
    expect(istDateKey(Date.UTC(2026, 9, 12, 20, 0))).toBe('2026-10-13'); // 01:30 IST next day
  });
});

describe('getMarketState transitions (Monday 12 Oct 2026)', () => {
  const at = (h, m) => getMarketState(ist(2026, 10, 12, h, m), holidays);

  it('moves closed -> pre-open -> open -> closed at the right minutes', () => {
    expect(at(8, 59)).toMatchObject({ state: 'CLOSED', reason: 'before_open', isOpen: false });
    expect(at(9, 0)).toMatchObject({ state: 'PRE_OPEN', isPreOpen: true });
    expect(at(9, 14)).toMatchObject({ state: 'PRE_OPEN' });
    expect(at(9, 15)).toMatchObject({ state: 'OPEN', isOpen: true });
    expect(at(15, 30)).toMatchObject({ state: 'OPEN' });
    expect(at(15, 31)).toMatchObject({ state: 'CLOSED', reason: 'after_close', isOpen: false });
  });

  it('only counts today as the last completed session after the close', () => {
    expect(at(11, 0).lastSession).toBe('2026-10-09'); // previous Friday while today is in progress
    expect(at(11, 0).currentSession).toBe('2026-10-12');
    expect(at(8, 0).lastSession).toBe('2026-10-09');
    expect(at(15, 31).lastSession).toBe('2026-10-12');
    expect(at(15, 31).currentSession).toBeNull();
  });

  it('reports the next open', () => {
    expect(at(8, 0).nextOpen).toBe(new Date(ist(2026, 10, 12, 9, 15)).toISOString());
    expect(at(16, 0).nextOpen).toBe(new Date(ist(2026, 10, 13, 9, 15)).toISOString());
  });
});

describe('weekends and holidays', () => {
  it('Saturday is closed for the weekend and last session is Friday', () => {
    const s = getMarketState(ist(2026, 10, 10, 11, 0), holidays);
    expect(s).toMatchObject({ state: 'CLOSED', reason: 'weekend', lastSession: '2026-10-09', currentSession: null });
    expect(s.nextOpen).toBe(new Date(ist(2026, 10, 12, 9, 15)).toISOString());
  });

  it('an exchange holiday is closed all day, names the holiday, and skips it for sessions', () => {
    const s = getMarketState(ist(2026, 10, 20, 11, 0), holidays);
    expect(s).toMatchObject({ state: 'CLOSED', reason: 'holiday', holiday: 'Dussehra', isOpen: false, lastSession: '2026-10-19' });
    expect(s.nextOpen).toBe(new Date(ist(2026, 10, 21, 9, 15)).toISOString());
    expect(getMarketState(ist(2026, 10, 21, 8, 0), holidays).lastSession).toBe('2026-10-19');
  });

  it('a special session day listed on a weekend is not modelled and stays closed', () => {
    expect(getMarketState(ist(2026, 11, 8, 18, 30), holidays)).toMatchObject({ state: 'CLOSED', reason: 'weekend' });
  });

  it('without a calendar it flags that holidays are not detected', () => {
    const s = getMarketState(ist(2026, 10, 20, 11, 0), null);
    expect(s.state).toBe('OPEN');
    expect(s.calendar).toBe('weekends-only');
    expect(getMarketState(ist(2026, 10, 20, 11, 0), holidays).calendar).toBe('nse');
  });

  it('uses the Asia/Kolkata zone regardless of the host zone', () => {
    // 04:00 UTC is 09:30 IST
    expect(getMarketState(Date.UTC(2026, 9, 12, 4, 0), holidays)).toMatchObject({ state: 'OPEN', timezone: 'Asia/Kolkata' });
  });
});
