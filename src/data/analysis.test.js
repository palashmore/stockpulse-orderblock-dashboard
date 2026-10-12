import { describe, it, expect } from 'vitest';
import { analyse, returnOver, volatility, marketStructure, keyLevels, observations, relativeToPeers } from './analysis';
import { screenerMetrics, MIN_CANDLES } from './screenerMetrics';
import { swingSignals } from './strategies';
import {
  DEFAULT_FILTERS, PRESETS, presetFilters, validateFilters, matchesRow, screen,
  loadSavedFilters, saveFilters, upsertSaved, loadWatchlist, saveWatchlist, SAVED_KEY, WATCH_KEY,
} from './screenFilters';

function daily(n, { start = 100, drift = 0.4, noise = 1.2, seed0 = 4242 } = {}) {
  let seed = seed0;
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
    out.push({ time: dt.toISOString().slice(0, 10), open: o, high: Math.max(o, c) + rnd() * noise, low: Math.min(o, c) - rnd() * noise, close: c, volume: 100000 + Math.floor(rnd() * 50000) + (rnd() > 0.9 ? 300000 : 0) });
    price = c;
  }
  return out;
}
const flat = (closes) => closes.map((c, i) => ({ time: `2026-01-${String(i + 1).padStart(2, '0')}`, open: c, high: c, low: c, close: c, volume: 1 }));

describe('returns and volatility', () => {
  it('returnOver is the change from n candles ago to the last close', () => {
    expect(returnOver(flat([100, 110, 121]), 1)).toBeCloseTo(10, 10);
    expect(returnOver(flat([100, 110, 121]), 2)).toBeCloseTo(21, 10);
    expect(returnOver(flat([100, 110]), 5)).toBeNull();
  });

  it('volatility is the annualised sample standard deviation of log returns (hand-checked)', () => {
    // closes 100, 101, 100 -> log returns ln(1.01), ln(100/101); mean ~ 0; sample sd = sqrt(2*r^2/1) with r = ln(1.01)
    const r = Math.log(1.01);
    const expected = Math.sqrt((r * r + r * r) / 1) * Math.sqrt(252) * 100;
    expect(volatility(flat([100, 101, 100]), 2)).toBeCloseTo(expected, 6);
    expect(volatility(flat([100, 101]), 20)).toBeNull();
    expect(volatility(flat(Array(25).fill(100)), 20)).toBe(0);
  });
});

describe('market structure and levels', () => {
  const zigzag = (highsLows) => highsLows.map((h, i) => ({ time: `d${i}`, open: h, high: h + 0.5, low: h - 0.5, close: h, volume: 1 }));

  it('reads higher highs and higher lows as an uptrend and the reverse as a downtrend', () => {
    const up = zigzag([10, 12, 14, 12, 10, 12, 15, 17, 15, 12, 14, 18, 20, 18, 15, 17, 19, 22, 24, 22, 19]);
    expect(marketStructure(up).state).toBe('uptrend');
    const down = zigzag([30, 28, 26, 28, 30, 28, 25, 23, 25, 28, 26, 22, 20, 22, 25, 23, 20, 18, 16, 18, 21]);
    expect(marketStructure(down).state).toBe('downtrend');
  });

  it('says unclear rather than guessing with too few swing points', () => {
    expect(marketStructure(zigzag([10, 11, 12, 13, 14, 15, 16, 17])).state).toBe('unclear');
  });

  it('lists the nearest confirmed support below and resistance above the last close', () => {
    const c = zigzag([10, 12, 14, 12, 10, 12, 15, 17, 15, 12, 14, 13]);
    const lv = keyLevels(c);
    expect(lv.resistance === undefined).toBe(true);
    expect(lv.resistances.every((x) => x > 13)).toBe(true);
    expect(lv.supports.every((x) => x < 13)).toBe(true);
    expect([...lv.supports].sort((a, b) => b - a)).toEqual(lv.supports);
  });
});

describe('analyse', () => {
  const c = daily(300);
  const a = analyse(c);

  it('returns null with too little history or daily-less data', () => {
    expect(analyse(c.slice(0, 20))).toBeNull();
    expect(analyse(null)).toBeNull();
    expect(analyse(c.map((x, i) => ({ ...x, time: i })))).toBeNull();
  });

  it('computes consistent readings for a persistent uptrend', () => {
    expect(a.asOf).toBe(c.at(-1).time);
    expect(a.trend.daily).toBe('up');
    expect(a.trend.weekly).toBe('up');
    expect(a.movingAverages.find((m) => m.name === 'SMA 20').above).toBe(true);
    expect(a.indicators.rsi).toBeGreaterThan(0);
    expect(a.indicators.rsi).toBeLessThan(100);
    expect(a.indicators.atrPct).toBeGreaterThan(0);
    expect(a.returns['1M']).toBeGreaterThan(0);
    expect(a.returns['1Y']).not.toBeNull();
    expect(a.range52.partial).toBe(false);
    expect(a.range52.fromHighPct).toBeLessThanOrEqual(0);
    expect(a.volume.relative).toBeGreaterThan(0);
  });

  it('marks readings that need more history as not available instead of inventing them', () => {
    const short = analyse(daily(80));
    expect(short.movingAverages.find((m) => m.name === 'EMA 200').value).toBeNull();
    expect(short.returns['1Y']).toBeNull();
    expect(short.range52.partial).toBe(true);
  });

  it('produces observations that describe without recommending', () => {
    const text = observations(a).join(' ');
    expect(text).toMatch(/Daily trend is up/);
    expect(text).toMatch(/RSI\(14\)/);
    expect(text).toMatch(/volatility/);
    expect(text.toLowerCase()).not.toMatch(/\b(buy|sell|short|long|recommend)\b/);
    expect(observations(null)).toEqual([]);
  });
});

describe('relativeToPeers', () => {
  const quotes = [
    { symbol: 'A', changePct: 2 }, { symbol: 'B', changePct: 1 }, { symbol: 'C', changePct: -1 }, { symbol: 'X', changePct: 5 },
  ];
  it('compares to the equal-weighted average of the other peers', () => {
    expect(relativeToPeers('A', quotes, ['A', 'B', 'C'])).toEqual({ stock: 2, peerAverage: 0, difference: 2, peers: 2 });
  });
  it('needs at least two peers with a change', () => {
    expect(relativeToPeers('A', quotes, ['A', 'B'])).toBeNull();
    expect(relativeToPeers('Z', quotes, ['A', 'B', 'C'])).toBeNull();
  });
});

describe('screenerMetrics', () => {
  const c = daily(MIN_CANDLES + 140);

  it('needs enough completed candles and ignores the in-progress day', () => {
    expect(screenerMetrics(c.slice(0, MIN_CANDLES - 1))).toBeNull();
    const withPartial = [...c, { ...c.at(-1), time: '2099-01-01', partial: true, close: 9999 }];
    expect(screenerMetrics(withPartial).price).toBe(screenerMetrics(c).price);
    expect(screenerMetrics(null)).toBeNull();
  });

  it('computes the row fields and flags the setup agreeing with the swing engine', () => {
    const m = screenerMetrics(c);
    expect(m.price).toBe(c.at(-1).close);
    expect(m.trend).toBe('up');
    expect(m.rsi).toBeGreaterThan(0);
    expect(m.atrPct).toBeGreaterThan(0);
    expect(m.turnoverCr).toBeCloseTo((c.slice(-20).reduce((s, x) => s + x.volume, 0) / 20 * c.at(-1).close) / 1e7, 8);
    expect(['pullback', 'breakout', null]).toContain(m.setup);
    // the setup column is exactly what the swing engine signals on the last bar, at every truncation
    let seen = 0;
    for (let n = MIN_CANDLES; n <= c.length; n++) {
      const slice = c.slice(0, n);
      const engine = swingSignals(slice).find((x) => x.index === n - 1);
      expect(screenerMetrics(slice).setup).toBe(engine ? engine.strategy : null);
      if (engine) seen++;
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('screen filters', () => {
  const row = (symbol, m) => ({ symbol, name: symbol, sector: '', metrics: { trend: 'up', setup: null, rsi: 50, adx: 25, relVol: 1, atrPct: 2, turnoverCr: 50, aboveVwap: true, price: 100, changePct: 0, vsEma20Pct: 0, ...m } });
  const rows = [
    row('A', { rsi: 30, setup: 'pullback', price: 300 }),
    row('B', { rsi: 70, setup: 'breakout', relVol: 2, adx: 35 }),
    row('C', { trend: 'down', rsi: 45, atrPct: 4, aboveVwap: false }),
    row('D', { adx: null, relVol: null, turnoverCr: null }),
    { symbol: 'E', metrics: null },
  ];
  const names = (f, s = new Set(), key = 'symbol', dir = 'asc') => screen(rows, f, s, key, dir).map((r) => r.symbol);

  it('applies each rule and drops rows without metrics', () => {
    expect(names(DEFAULT_FILTERS)).toEqual(['A', 'B', 'C', 'D']);
    expect(names({ ...DEFAULT_FILTERS, trend: 'DOWN' })).toEqual(['C']);
    expect(names({ ...DEFAULT_FILTERS, setup: 'ANY_SETUP' })).toEqual(['A', 'B']);
    expect(names({ ...DEFAULT_FILTERS, setup: 'PULLBACK' })).toEqual(['A']);
    expect(names({ ...DEFAULT_FILTERS, minRsi: 40, maxRsi: 60 })).toEqual(['C', 'D']);
    expect(names({ ...DEFAULT_FILTERS, aboveVwap: true })).toEqual(['A', 'B', 'D']);
  });

  it('a row missing a field a filter needs never matches that filter', () => {
    expect(names({ ...DEFAULT_FILTERS, minAdx: 0 })).toEqual(['A', 'B', 'C']);
    expect(names({ ...DEFAULT_FILTERS, minRelVol: 0 })).toEqual(['A', 'B', 'C']);
    expect(names({ ...DEFAULT_FILTERS, minTurnoverCr: 0 })).toEqual(['A', 'B', 'C']);
  });

  it('sorts either way with missing values last and honours the starred filter', () => {
    expect(names(DEFAULT_FILTERS, new Set(), 'rsi', 'desc')).toEqual(['B', 'D', 'C', 'A'].sort((x, y) => rows.find((r) => r.symbol === y).metrics.rsi - rows.find((r) => r.symbol === x).metrics.rsi));
    expect(names(DEFAULT_FILTERS, new Set(), 'adx', 'asc').at(-1)).toBe('D');
    expect(names(DEFAULT_FILTERS, new Set(), 'adx', 'desc').at(-1)).toBe('D');
    expect(names({ ...DEFAULT_FILTERS, starredOnly: true }, new Set(['B', 'C']))).toEqual(['B', 'C']);
  });

  it('presets layer on the defaults and every preset resolves', () => {
    for (const p of PRESETS) expect(presetFilters(p.id)).toMatchObject(p.filters);
    expect(presetFilters('nope')).toEqual(DEFAULT_FILTERS);
    expect(matchesRow(rows[1], presetFilters('breakout'))).toBe(true);
    expect(matchesRow(rows[0], presetFilters('breakout'))).toBe(false);
  });

  it('validates arbitrary input into a legal filter object', () => {
    expect(validateFilters(null)).toEqual(DEFAULT_FILTERS);
    expect(validateFilters({ trend: 'SIDEWAYS', setup: 'PULLBACK', minRsi: '5', minAdx: 20, aboveVwap: 'yes' })).toEqual({ ...DEFAULT_FILTERS, setup: 'PULLBACK', minAdx: 20 });
  });
});

describe('saved filters and watchlist storage', () => {
  const memory = (key, value) => {
    const data = new Map(value === undefined ? [] : [[key, value]]);
    return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  };

  it('saves, replaces by name and reloads filters, validating what comes back', () => {
    const s = memory();
    let list = upsertSaved([], 'My breakouts', { setup: 'BREAKOUT', minRelVolume: 9 });
    list = upsertSaved(list, 'my BREAKOUTS', { setup: 'PULLBACK' });
    expect(list).toHaveLength(1);
    expect(list[0].filters.setup).toBe('PULLBACK');
    expect(upsertSaved([], '   ', {})).toBeNull();
    expect(saveFilters(list, s)).toBe(true);
    expect(loadSavedFilters(s)[0]).toEqual({ name: 'my BREAKOUTS', filters: { ...DEFAULT_FILTERS, setup: 'PULLBACK' } });
  });

  it('survives corrupt or blocked storage', () => {
    expect(loadSavedFilters(memory(SAVED_KEY, '{bad'))).toEqual([]);
    expect(loadSavedFilters(memory(SAVED_KEY, JSON.stringify([{ name: '', filters: {} }, 5, { name: 'ok', filters: { trend: 'bogus' } }])))).toEqual([{ name: 'ok', filters: DEFAULT_FILTERS }]);
    const blocked = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
    expect(loadSavedFilters(blocked)).toEqual([]);
    expect(saveFilters([], blocked)).toBe(false);
    expect(loadWatchlist(blocked)).toEqual([]);
    expect(saveWatchlist(['A'], blocked)).toBe(false);
  });

  it('keeps only valid, unique symbols in the watchlist', () => {
    expect(loadWatchlist(memory(WATCH_KEY, JSON.stringify(['TCS', 'TCS', 'bad symbol', 'M&M', 5, null])))).toEqual(['TCS', 'M&M']);
    const s = memory();
    saveWatchlist(new Set(['TCS', 'INFY']), s);
    expect(loadWatchlist(s)).toEqual(['TCS', 'INFY']);
  });
});
