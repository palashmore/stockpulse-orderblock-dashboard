import { describe, it, expect } from 'vitest';
import { tradeCosts, simulate, summarize, benchmarkReturn, backtest, COSTS_DEFAULTS } from './backtest';
import { swingSignals, intradaySignals, validateConfig, SWING_DEFAULTS, INTRADAY_DEFAULTS } from './strategies';

const NO_COSTS = { ...Object.fromEntries(Object.keys(COSTS_DEFAULTS).map((k) => [k, 0])) };
const bar = (time, o, h, l, c, volume = 1000) => ({ time, open: o, high: h, low: l, close: c, volume });
// A long signal from a reference price of 1000 with a 10-point stop; shorts mirror it
const sig = (index, o = {}) => ({
  id: `s${index}`, index, side: 'BUY', strategy: 'test',
  stop: 990, target1: 1010, target2: 1020, ...(o.side === 'SELL_SHORT' ? { stop: 1010, target1: 990, target2: 980 } : {}), ...o,
});
const cfg = { capital: 100000, riskPct: 1, leverage: 1, maxHoldBars: 5 };
const days = (n) => Array.from({ length: n }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`);

describe('trade costs', () => {
  it('computes intraday charges from the assumed rates (hand-checked)', () => {
    // buy 100 @ 1000 and sell 100 @ 1010: turnover 100000 and 101000
    const c = tradeCosts([{ side: 'BUY', qty: 100, price: 1000 }, { side: 'SELL', qty: 100, price: 1010 }], 'intraday');
    expect(c.brokerage).toBeCloseTo(20 + 20, 10); // 0.03% of ~100k is ~30, capped at 20 per order
    expect(c.stt).toBeCloseTo(101000 * 0.00025, 8); // sell side only
    expect(c.stamp).toBeCloseTo(100000 * 0.00003, 8);
    expect(c.exchange).toBeCloseTo(201000 * 0.00003, 8);
    expect(c.gst).toBeCloseTo((c.brokerage + c.exchange + c.sebi) * 0.18, 8);
    expect(c.total).toBeCloseTo(c.brokerage + c.stt + c.exchange + c.sebi + c.stamp + c.gst, 8);
    expect(c.dp).toBe(0);
  });

  it('delivery pays STT on both sides, a DP charge on the sell, and no brokerage cap', () => {
    const c = tradeCosts([{ side: 'BUY', qty: 10, price: 1000 }, { side: 'SELL', qty: 10, price: 1100 }], 'delivery');
    expect(c.stt).toBeCloseTo((10000 + 11000) * 0.001, 8);
    expect(c.dp).toBe(15.34);
    expect(c.brokerage).toBeCloseTo((10000 + 11000) * 0.001, 8);
  });
});

describe('simulate: fills and exits', () => {
  // risk 10 per share, risk budget 1000 -> qty 100 at price ~1000 (capital 100000, no leverage cap issue)
  const base = (extra) => [bar(days(20)[0], 1000, 1002, 998, 1000), ...extra];

  it('enters at the next open, takes half at target 1, then the rest at target 2', () => {
    const c = base([
      bar('d1', 1000, 1004, 996, 1002), // entry bar: no stop (990), no target (1010)
      bar('d2', 1002, 1012, 1001, 1011), // target 1 (1010) reached; stop moves to 1000
      bar('d3', 1011, 1021, 1008, 1020), // target 2 (1020) reached
    ]);
    const r = simulate(c, [sig(0)], cfg, 'swing', NO_COSTS);
    expect(r.trades).toHaveLength(1);
    const t = r.trades[0];
    expect(t.entry).toBe(1000);
    expect(t.qty).toBe(100);
    expect(t.exits.map((e) => [e.qty, e.price, e.reason])).toEqual([[50, 1010, 'target 1'], [50, 1020, 'target 2']]);
    expect(t.gross).toBe(50 * 10 + 50 * 20);
    expect(t.rMultiple).toBeCloseTo(1500 / 1000, 10);
  });

  it('assumes the stop hits first when one bar touches both the stop and a target', () => {
    const c = base([bar('d1', 1000, 1012, 989, 1005)]); // touches stop 990 and target 1010
    const t = simulate(c, [sig(0)], cfg, 'swing', NO_COSTS).trades[0];
    expect(t.exits).toEqual([expect.objectContaining({ price: 990, reason: 'stop' })]);
    expect(t.rMultiple).toBeCloseTo(-1, 10);
  });

  it('moves the stop to breakeven after target 1 and does not allow target 2 on the same bar', () => {
    const c = base([
      bar('d1', 1000, 1003, 997, 1001),
      bar('d2', 1002, 1025, 1001, 1020), // reaches target 1 AND the price of target 2 on one bar
      bar('d3', 1020, 1022, 999, 1000), // falls back through the entry
    ]);
    const t = simulate(c, [sig(0)], cfg, 'swing', NO_COSTS).trades[0];
    expect(t.exits.map((e) => e.reason)).toEqual(['target 1', 'stop at breakeven']);
    expect(t.exits[1].price).toBe(1000);
  });

  it('fills a gap through the stop at the open, not at the stop price', () => {
    const c = base([bar('d1', 1000, 1003, 997, 1001), bar('d2', 970, 975, 965, 970)]);
    const t = simulate(c, [sig(0)], cfg, 'swing', NO_COSTS).trades[0];
    expect(t.exits[0].price).toBe(970);
    expect(t.rMultiple).toBeCloseTo(-3, 10);
  });

  it('skips a trade that opens beyond its stop and a signal with no later bar', () => {
    const gapped = base([bar('d1', 985, 990, 980, 988)]);
    const r = simulate(gapped, [sig(0)], cfg, 'swing', NO_COSTS);
    expect(r.trades).toHaveLength(0);
    expect(r.skipped['gapped through the stop']).toBe(1);
    expect(simulate(base([]), [sig(0)], cfg, 'swing', NO_COSTS).skipped['no later bar']).toBe(1);
  });

  it('applies slippage against the trade on entry', () => {
    const c = base([bar('d1', 1000, 1004, 996, 1002), bar('d2', 1002, 1012, 1001, 1011), bar('d3', 1011, 1021, 1008, 1020)]);
    const t = simulate(c, [sig(0)], cfg, 'swing', { ...NO_COSTS, slippageBps: 50 }).trades[0];
    expect(t.entry).toBeCloseTo(1005, 8); // 0.5% against a long
    expect(t.qty).toBe(Math.floor(1000 / 15)); // sized from the real 15-point distance to the stop
    const tooFar = simulate(c, [sig(0)], cfg, 'swing', { ...NO_COSTS, slippageBps: 100 });
    expect(tooFar.skipped['gapped beyond target 1']).toBe(1); // a 1% slip puts the fill at target 1
  });

  it('closes a swing trade after the maximum holding period and reports open trades separately', () => {
    const quiet = base(Array.from({ length: 8 }, (_, i) => bar(`q${i}`, 1000, 1004, 996, 1001)));
    const t = simulate(quiet, [sig(0)], { ...cfg, maxHoldBars: 3 }, 'swing', NO_COSTS).trades[0];
    expect(t.exitReason).toBe('time stop');
    expect(t.bars).toBe(3);
    const openEnd = simulate(base([bar('d1', 1000, 1004, 996, 1001), bar('d2', 1001, 1004, 997, 1002)]), [sig(0)], cfg, 'swing', NO_COSTS);
    expect(openEnd.trades).toHaveLength(0);
    expect(openEnd.open).toMatchObject({ side: 'BUY', qty: 100 });
  });

  it('shorts profit when price falls, and costs reduce the net result', () => {
    const c = base([bar('d1', 1000, 1003, 997, 999), bar('d2', 999, 1000, 988, 990), bar('d3', 990, 991, 975, 976)]); // target 1 (990) on d2, target 2 (980) on d3
    const free = simulate(c, [sig(0, { side: 'SELL_SHORT' })], cfg, 'swing', NO_COSTS).trades[0];
    expect(free.gross).toBeGreaterThan(0);
    const costly = simulate(c, [sig(0, { side: 'SELL_SHORT' })], cfg, 'swing', COSTS_DEFAULTS).trades[0];
    expect(costly.net).toBeLessThan(costly.gross);
    expect(costly.costs).toBeGreaterThan(0);
  });

  it('sizes the position from the risk budget and never beyond the capital', () => {
    const c = base([bar('d1', 1000, 1004, 1000, 1002)]); // stays above the tighter stops used below
    const small = simulate(c, [sig(0, { stop: 999.9 })], cfg, 'swing', NO_COSTS); // 100000*1%/0.1 = 10000 shares, capped by capital 100 shares
    expect(small.open.qty).toBe(100);
    expect(simulate(c, [sig(0, { stop: -4000 })], cfg, 'swing', NO_COSTS).skipped['position size below 1 share']).toBe(1);
  });
});

describe('simulate: intraday limits', () => {
  const t0 = 100 * 86400 + (9 * 60 + 30) * 60; // 09:30 on day 100 (times are IST-shifted epoch seconds)
  const at = (n) => t0 + n * 300; // n-th 5-minute bar
  const icfg = { ...cfg, exitMin: 15 * 60 + 15, maxTradesPerDay: 1, maxDailyLossR: 1 };
  const quiet = (i) => bar(at(i), 1000, 1002, 998, 1000);
  // bar 3 trades down through the 990 stop, ending the first trade at -1R
  const withStopOut = Array.from({ length: 40 }, (_, i) => (i === 3 ? bar(at(i), 1000, 1001, 985, 988) : quiet(i)));

  it('allows only the configured number of trades per day', () => {
    const r = simulate(withStopOut, [sig(1), sig(10)], icfg, 'intraday', NO_COSTS);
    expect(r.trades).toHaveLength(1);
    expect(r.skipped['max trades per day']).toBe(1);
  });

  it('stops trading for the day after the loss limit is reached', () => {
    const r = simulate(withStopOut, [sig(1), sig(10)], { ...icfg, maxTradesPerDay: 5, maxDailyLossR: 1 }, 'intraday', NO_COSTS);
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0].rMultiple).toBeLessThanOrEqual(-1 + 1e-9);
    expect(r.skipped['daily loss limit reached']).toBe(1);
  });

  it('allows more trades after a win when the loss limit has not been hit', () => {
    const r = simulate(withStopOut, [sig(1), sig(10)], { ...icfg, maxTradesPerDay: 5, maxDailyLossR: 3 }, 'intraday', NO_COSTS);
    expect(r.trades.length + (r.open ? 1 : 0)).toBe(2);
  });

  it('closes at the session cutoff using the first bar at or after it', () => {
    const late = 100 * 86400 + (14 * 60 + 55) * 60; // 14:55
    const c = [
      bar(late, 1000, 1002, 998, 1000), bar(late + 300, 1000, 1002, 998, 1000), bar(late + 600, 1001, 1003, 999, 1001),
      bar(late + 900, 1002, 1004, 1000, 1002), bar(late + 1200, 1003, 1005, 1001, 1004), // 15:15 bar opens at 1003
    ];
    const t = simulate(c, [sig(0)], icfg, 'intraday', NO_COSTS).trades[0];
    expect(t.exitReason).toBe('session cutoff');
    expect(t.exits[0].price).toBe(1003);
  });

  it('does not carry an intraday signal into the next session', () => {
    const lateDay = 100 * 86400 + (15 * 60 + 25) * 60;
    const nextDay = 101 * 86400 + (9 * 60 + 30) * 60;
    const c = [bar(lateDay, 1000, 1002, 998, 1000), bar(nextDay, 1000, 1002, 998, 1000)];
    expect(simulate(c, [sig(0)], icfg, 'intraday', NO_COSTS).skipped['next bar is a new session']).toBe(1);
  });
});

describe('statistics', () => {
  const trade = (net, r, costs = 1) => ({ net, rMultiple: r, costs });

  it('computes win rate, profit factor, expectancy, drawdown and return (hand-checked)', () => {
    const s = summarize([trade(300, 3), trade(-100, -1), trade(-100, -1), trade(200, 2)], 10000);
    expect(s).toMatchObject({ count: 4, wins: 2, winRate: 0.5, netPnl: 300, grossProfit: 500, grossLoss: -200, avgWin: 250, avgLoss: -100, totalCosts: 4 });
    expect(s.profitFactor).toBeCloseTo(2.5, 10);
    expect(s.avgR).toBeCloseTo(0.75, 10);
    // equity: 10300, 10200, 10100, 10300 -> peak 10300, deepest 10100 -> drawdown 200
    expect(s.maxDrawdown).toBe(200);
    expect(s.maxDrawdownPct).toBeCloseTo((200 / 10300) * 100, 8);
    expect(s.returnPct).toBeCloseTo(3, 10);
  });

  it('handles no trades and no losing trades', () => {
    expect(summarize([], 1000)).toMatchObject({ count: 0, winRate: null, profitFactor: null, expectancyR: null });
    expect(summarize([trade(10, 1)], 1000).profitFactor).toBeNull();
  });

  it('benchmark is buy and hold from first open to last close', () => {
    expect(benchmarkReturn([bar('a', 100, 1, 1, 1), bar('b', 1, 1, 1, 110)])).toBeCloseTo(10, 10);
    expect(benchmarkReturn([])).toBeNull();
  });
});

// ---- strategy engines
function trendingDaily(n, { start = 100, drift = 0.4, noise = 1.2 } = {}) {
  let seed = 12345;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const out = [];
  let price = start;
  const d0 = Date.UTC(2025, 0, 6);
  let day = 0;
  while (out.length < n) {
    const dt = new Date(d0 + day * 86400000);
    day++;
    if (dt.getUTCDay() === 0 || dt.getUTCDay() === 6) continue;
    const o = price;
    const c = o + drift + (rnd() - 0.5) * 2 * noise;
    const h = Math.max(o, c) + rnd() * noise;
    const l = Math.min(o, c) - rnd() * noise;
    out.push({ time: dt.toISOString().slice(0, 10), open: o, high: h, low: l, close: c, volume: 1000 + Math.floor(rnd() * 2000) + (rnd() > 0.9 ? 3000 : 0) });
    price = c;
  }
  return out;
}

function intradaySeries(daysCount) {
  let seed = 777;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const out = [];
  let price = 500;
  for (let d = 0; d < daysCount; d++) {
    const dayStart = (20000 + d) * 86400 + (9 * 60 + 15) * 60;
    const trend = rnd() > 0.5 ? 0.06 : -0.06;
    for (let m = 0; m < 75; m++) { // 5-minute bars, 09:15 to 15:25
      const o = price;
      const c = o + trend + (rnd() - 0.5) * 0.8;
      out.push({ time: dayStart + m * 300, open: o, high: Math.max(o, c) + rnd() * 0.4, low: Math.min(o, c) - rnd() * 0.4, close: c, volume: 1000 + Math.floor(rnd() * 1500) + (rnd() > 0.85 ? 2500 : 0) });
      price = c;
    }
  }
  return out;
}

describe('strategy configuration', () => {
  it('clamps numbers, keeps booleans, and falls back to defaults for junk', () => {
    const c = validateConfig({ stopAtr: 99, riskPct: -5, adxMin: 'x', weeklyFilter: 'yes', bogus: 1 }, SWING_DEFAULTS);
    expect(c.stopAtr).toBe(6);
    expect(c.riskPct).toBe(0.05);
    expect(c.adxMin).toBe(SWING_DEFAULTS.adxMin);
    expect(c.weeklyFilter).toBe(SWING_DEFAULTS.weeklyFilter);
    expect(c).not.toHaveProperty('bogus');
    expect(validateConfig({ target1R: 5, target2R: 2 }, SWING_DEFAULTS).target2R).toBe(5);
    expect(validateConfig({ entryStartMin: 900, entryEndMin: 600 }, INTRADAY_DEFAULTS).entryEndMin).toBe(INTRADAY_DEFAULTS.entryEndMin);
  });

  it('keeps the two engines configurations separate', () => {
    expect(SWING_DEFAULTS).not.toBe(INTRADAY_DEFAULTS);
    expect(validateConfig({}, SWING_DEFAULTS)).not.toHaveProperty('maxTradesPerDay');
    expect(validateConfig({}, INTRADAY_DEFAULTS)).not.toHaveProperty('weeklyFilter');
  });
});

describe('swing engine', () => {
  const candles = trendingDaily(320);
  const signals = swingSignals(candles);

  it('finds setups in a persistent uptrend, each with complete, consistent trade details', () => {
    expect(signals.length).toBeGreaterThan(0);
    for (const s of signals) {
      expect(s.side).toBe('BUY');
      expect(s.stop).toBeLessThan(s.entry);
      expect(s.target1).toBeGreaterThan(s.entry);
      expect(s.target2).toBeGreaterThan(s.target1);
      expect(s.risk).toBeCloseTo(s.entry - s.stop, 8);
      expect((s.target2 - s.entry) / s.risk).toBeCloseTo(SWING_DEFAULTS.target2R, 8);
      expect(s.confirmations.length).toBeGreaterThanOrEqual(3);
      expect(s.explanation).toBeTruthy();
      expect(s.invalidation).toMatch(/below/);
      expect(s.time).toBe(candles[s.index].time);
    }
  });

  it('is deterministic and respects the cooldown between signals', () => {
    expect(swingSignals(candles)).toEqual(signals);
    for (let k = 1; k < signals.length; k++) expect(signals[k].index - signals[k - 1].index).toBeGreaterThanOrEqual(SWING_DEFAULTS.cooldownBars);
  });

  it('has no look-ahead: signals up to a bar do not change when later bars are added or removed', () => {
    for (const cut of [200, 250, 290]) {
      const truncated = swingSignals(candles.slice(0, cut));
      const same = signals.filter((s) => s.index < cut - 1);
      expect(truncated.filter((s) => s.index < cut - 1)).toEqual(same);
    }
  });

  it('returns nothing without enough history, and nothing long in a downtrend', () => {
    expect(swingSignals(candles.slice(0, 30))).toEqual([]);
    expect(swingSignals(trendingDaily(300, { start: 500, drift: -0.5 }))).toEqual([]);
  });

  it('allows shorts only when configured', () => {
    const down = trendingDaily(300, { start: 500, drift: -0.5 });
    const shorts = swingSignals(down, { allowShort: true });
    expect(shorts.length).toBeGreaterThan(0);
    expect(shorts.every((s) => s.side === 'SELL_SHORT' && s.stop > s.entry && s.target1 < s.entry)).toBe(true);
  });

  it('a backtest of the signals runs end to end with costs and consistent totals', () => {
    const bt = backtest(candles, signals, validateConfig({}, SWING_DEFAULTS), 'swing');
    expect(bt.overall.count).toBe(bt.trades.length);
    expect(bt.overall.count).toBeGreaterThan(0);
    expect(bt.overall.netPnl).toBeCloseTo(bt.trades.reduce((s, t) => s + t.net, 0), 6);
    expect(bt.overall.totalCosts).toBeGreaterThan(0);
    const segCount = bt.segments.training.count + bt.segments.validation.count + bt.segments.outOfSample.count;
    expect(segCount).toBe(bt.overall.count);
    expect(bt.walkForward).toHaveLength(4);
    expect(bt.walkForward.reduce((s, w) => s + w.count, 0)).toBe(bt.overall.count);
    expect(bt.assumptions.costsAssumed).toBe(true);
    expect(bt.benchmarkPct).toBeGreaterThan(0);
  });
});

describe('intraday engine', () => {
  const candles = intradaySeries(25);
  const loose = { adxMin: 10, relVolMin: 0.8, minAtrPct: 0, maxAtrPct: 20 };
  const signals = intradaySignals(candles, loose);

  it('only signals inside the entry window and respects the per-day trade cap', () => {
    expect(signals.length).toBeGreaterThan(0);
    const perDay = new Map();
    for (const s of signals) {
      const m = Math.floor((s.time % 86400) / 60);
      expect(m).toBeGreaterThanOrEqual(INTRADAY_DEFAULTS.entryStartMin);
      expect(m).toBeLessThanOrEqual(INTRADAY_DEFAULTS.entryEndMin);
      const d = Math.floor(s.time / 86400);
      perDay.set(d, (perDay.get(d) ?? 0) + 1);
    }
    for (const n of perDay.values()) expect(n).toBeLessThanOrEqual(INTRADAY_DEFAULTS.maxTradesPerDay);
  });

  it('long signals sit above session VWAP and carry the intraday confirmations', () => {
    for (const s of signals.filter((x) => x.side === 'BUY')) {
      expect(s.entry).toBeGreaterThan(s.vwap);
      expect(s.confirmations.join(' ')).toMatch(/VWAP/);
      expect(s.confirmations.join(' ')).toMatch(/Higher timeframe/);
    }
    for (const s of signals.filter((x) => x.side === 'SELL_SHORT')) expect(s.entry).toBeLessThan(s.vwap);
  });

  it('has no look-ahead: truncating the data leaves earlier signals unchanged', () => {
    const cut = Math.floor(candles.length * 0.6);
    const truncated = intradaySignals(candles.slice(0, cut), loose);
    expect(truncated.filter((s) => s.index < cut - 1)).toEqual(signals.filter((s) => s.index < cut - 1));
  });

  it('is deterministic, needs minute-stamped candles, and rejects daily candles', () => {
    expect(intradaySignals(candles, loose)).toEqual(signals);
    expect(intradaySignals(trendingDaily(100))).toEqual([]);
    expect(intradaySignals(candles.slice(0, 20))).toEqual([]);
  });

  it('backtest enforces the daily limits and never holds past the session', () => {
    const cfg = validateConfig(loose, INTRADAY_DEFAULTS);
    const bt = backtest(candles, signals, cfg, 'intraday');
    const byDay = new Map();
    for (const t of bt.trades) {
      const d = Math.floor(t.entryTime / 86400);
      expect(Math.floor(t.exitTime / 86400)).toBe(d);
      byDay.set(d, (byDay.get(d) ?? 0) + 1);
    }
    for (const n of byDay.values()) expect(n).toBeLessThanOrEqual(cfg.maxTradesPerDay);
    expect(bt.overall.count).toBe(bt.trades.length);
  });
});
