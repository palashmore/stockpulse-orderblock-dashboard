import { describe, it, expect } from 'vitest';
import { dropFormingBar, dayRisk, entryGate, positionSize } from './strategyGate';

const NOW = Date.UTC(2026, 9, 12, 5, 32); // 11:02 IST
const barAt = (istMinutes) => ({ time: Math.floor(Date.UTC(2026, 9, 12) / 1000) + istMinutes * 60 }); // IST-shifted seconds

describe('dropFormingBar', () => {
  it('drops the newest bar while it is still forming and keeps it once complete', () => {
    // a 5-minute bar that started 11:00 IST is still forming at 11:02, and complete at 11:06
    const candles = [barAt(10 * 60 + 55), barAt(11 * 60)];
    expect(dropFormingBar(candles, 300000, NOW)).toHaveLength(1);
    expect(dropFormingBar(candles, 300000, NOW + 4 * 60000)).toHaveLength(2);
  });

  it('leaves daily candles and empty input alone', () => {
    const daily = [{ time: '2026-10-12' }];
    expect(dropFormingBar(daily, 300000, NOW)).toBe(daily);
    expect(dropFormingBar(null, 300000, NOW)).toEqual([]);
  });
});

describe('dayRisk', () => {
  const config = { maxTradesPerDay: 3, maxDailyLossR: 2 };
  const day = Math.floor(Date.UTC(2026, 9, 12) / 1000 / 86400) * 86400;
  const candles = [{ time: day + 600 }, { time: day + 36000 }];
  const t = (offset, r, net) => ({ entryTime: day + offset, rMultiple: r, net });

  it('counts only the newest day and works out what is left', () => {
    const trades = [t(-86400, -1, -100), t(600, -1, -50), t(1200, 0.5, 20)];
    expect(dayRisk(trades, candles, config)).toMatchObject({ trades: 2, netR: -0.5, net: -30, tradesLeft: 1, lossRLeft: 1.5 });
  });

  it('shows no room left after the limits are used', () => {
    const trades = [t(600, -1, -1), t(1200, -1.5, -2), t(1800, 0.2, 1)];
    const r = dayRisk(trades, candles, config);
    expect(r.tradesLeft).toBe(0);
    expect(r.lossRLeft).toBe(0);
  });

  it('is empty without intraday candles', () => {
    expect(dayRisk([], [{ time: '2026-10-12' }], config)).toMatchObject({ trades: 0, tradesLeft: 3, lossRLeft: 2 });
  });
});

describe('entryGate', () => {
  const config = { maxTradesPerDay: 3, maxDailyLossR: 2 };
  const okRisk = { tradesLeft: 2, lossRLeft: 1 };

  it('allows an intraday entry only with usable data, an open market and room left', () => {
    expect(entryGate({ mode: 'intraday', dataStatus: 'DELAYED', marketOpen: true, risk: okRisk, config })).toEqual({ actionable: true, reasons: [] });
    expect(entryGate({ mode: 'intraday', dataStatus: 'LIVE', marketOpen: true, risk: okRisk, config }).actionable).toBe(true);
  });

  it('blocks on stale, unavailable or simulated data and says why', () => {
    for (const s of ['STALE', 'UNAVAILABLE', 'SIMULATED', null]) {
      const g = entryGate({ mode: 'swing', dataStatus: s, marketOpen: true, config });
      expect(g.actionable).toBe(false);
      expect(g.reasons[0]).toMatch(/Data is/);
    }
  });

  it('blocks intraday entries when the market is closed or its state is unknown, but not swing', () => {
    expect(entryGate({ mode: 'intraday', dataStatus: 'MARKET_CLOSED', marketOpen: false, risk: okRisk, config }).reasons.join(' ')).toMatch(/market is closed/);
    expect(entryGate({ mode: 'intraday', dataStatus: 'DELAYED', marketOpen: null, risk: okRisk, config }).actionable).toBe(false);
    expect(entryGate({ mode: 'swing', dataStatus: 'MARKET_CLOSED', marketOpen: false, config }).actionable).toBe(true);
    expect(entryGate({ mode: 'swing', dataStatus: 'HISTORICAL', marketOpen: false, config }).actionable).toBe(true);
  });

  it('blocks when the trade cap or the daily loss limit is used up, listing every reason', () => {
    const g = entryGate({ mode: 'intraday', dataStatus: 'DELAYED', marketOpen: true, risk: { tradesLeft: 0, lossRLeft: 0 }, config });
    expect(g.actionable).toBe(false);
    expect(g.reasons).toHaveLength(2);
  });
});

describe('positionSize', () => {
  const config = { capital: 100000, riskPct: 1, leverage: 1 };

  it('sizes from the risk budget (hand-checked)', () => {
    // risk 1000 rupees / 10 per share = 100 shares; outlay 100 * 500 = 50000 <= capital
    expect(positionSize({ entry: 500, stop: 490 }, config)).toEqual({ qty: 100, outlay: 50000, riskAmount: 1000, cappedByCapital: false });
  });

  it('caps by capital and reports it, and returns null when it rounds to zero', () => {
    expect(positionSize({ entry: 1000, stop: 999 }, config)).toMatchObject({ qty: 100, cappedByCapital: true });
    expect(positionSize({ entry: 1000, stop: 0 }, { ...config, riskPct: 0.05 })).toBeNull();
    expect(positionSize({ entry: 500, stop: 500 }, config)).toBeNull();
  });

  it('handles shorts the same way', () => {
    expect(positionSize({ entry: 500, stop: 510 }, config).qty).toBe(100);
  });
});
