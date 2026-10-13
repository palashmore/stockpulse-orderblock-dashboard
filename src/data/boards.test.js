import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BOARD_CONFIG as D, WINDOWS, validateBoardConfig, loadBoardConfig, saveBoardConfig, avgRange, directionalMove, confirmations,
  tradeStatus, buildBoards, BOARDS_KEY,
} from './boards';

const metrics = (extra = {}) => ({
  ranges: Array(30).fill(10), turnoverCr: 50, trend: 'up', aboveVwap: true, atrPct: 2, swing: null, ...extra,
});
const row = (extra = {}) => ({ symbol: 'AAA', name: 'Alpha', sector: 'Bank', price: 110, open: 100, high: 112, low: 99, changePct: 2, relVolume: 1.5, ...extra });
const buy = { actionable: true, side: 'BUY', strategy: 'pullback', rr: 3 };
const sell = { actionable: true, side: 'SELL_SHORT', strategy: 'breakdown', rr: 3 };

describe('configuration', () => {
  it('has sensible defaults and validates each field', () => {
    expect(validateBoardConfig(null)).toEqual(D);
    expect(validateBoardConfig({ window: 20, minStrength: 1, minRelVol: 2, minTurnoverCr: 10, maxAtrPct: 4, minRR: 2, hide: { trend: true } })).toMatchObject({
      window: 20, minStrength: 1, minRelVol: 2, minTurnoverCr: 10, maxAtrPct: 4, minRR: 2, hide: { trend: true, volume: false },
    });
    expect(validateBoardConfig({ window: 7, minStrength: 'x', minRelVol: -1, maxAtrPct: 1000, hide: { trend: 'yes' } })).toEqual(D);
    expect(WINDOWS).toContain(D.window);
  });
  it('round-trips through storage and survives corrupt or blocked storage', () => {
    let value = null;
    const storage = { getItem: () => value, setItem: (_k, v) => { value = v; } };
    expect(saveBoardConfig({ ...D, window: 30 }, storage)).toBe(true);
    expect(loadBoardConfig(storage).window).toBe(30);
    expect(loadBoardConfig({ getItem: () => '{bad' })).toEqual(D);
    expect(loadBoardConfig({ getItem: () => { throw new Error('blocked'); } })).toEqual(D);
    expect(saveBoardConfig(D, { setItem: () => { throw new Error('full'); } })).toBe(false);
    expect(BOARDS_KEY).toMatch(/boards/);
  });
});

describe('avgRange', () => {
  it('averages the last N daily ranges', () => {
    expect(avgRange([1, 2, 3, 4, 5, 6], 3)).toBe(5);
    expect(avgRange(Array(14).fill(10), 14)).toBe(10);
  });
  it('refuses a history shorter than the window or with bad values', () => {
    expect(avgRange([1, 2], 5)).toBeNull();
    expect(avgRange([1, null, 3, 4, 5], 5)).toBeNull();
    expect(avgRange([0, 0, 0], 3)).toBeNull();
    expect(avgRange(null, 3)).toBeNull();
  });
});

describe('directionalMove', () => {
  it('is the move from the open in units of the average daily range', () => {
    const m = directionalMove(row(), 10);
    expect(m).toMatchObject({ move: 10, movePct: 10, strength: 1, direction: 'BULLISH' });
    expect(m.clean).toBeCloseTo(10 / 13);
    expect(directionalMove(row({ price: 95 }), 10)).toMatchObject({ move: -5, strength: 0.5, direction: 'BEARISH' });
    expect(directionalMove(row({ price: 100 }), 10).direction).toBeNull();
  });
  it('uses the same formula for every stock, so a bigger range means a weaker reading for the same move', () => {
    expect(directionalMove(row(), 5).strength).toBe(2);
    expect(directionalMove(row(), 20).strength).toBe(0.5);
  });
  it('gives nothing when an input is missing', () => {
    expect(directionalMove(row({ open: null }), 10)).toBeNull();
    expect(directionalMove(row({ open: 0 }), 10)).toBeNull();
    expect(directionalMove(row(), null)).toBeNull();
    expect(directionalMove(row({ high: null }), 10).clean).toBeNull();
    expect(directionalMove(null, 10)).toBeNull();
  });
});

describe('confirmations', () => {
  it('passes each check against the configured thresholds', () => {
    const c = confirmations(row(), metrics({ swing: buy }), 'BULLISH', D);
    expect(Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.pass]))).toEqual({ volume: true, liquidity: true, trend: true, volatility: true, setup: true });
  });
  it('fails them separately', () => {
    const c = confirmations(row({ relVolume: 0.4 }), metrics({ turnoverCr: 1, trend: 'mixed', atrPct: 9 }), 'BULLISH', D);
    expect(c.volume.pass).toBe(false);
    expect(c.liquidity.pass).toBe(false);
    expect(c.trend.pass).toBe(false);
    expect(c.volatility.pass).toBe(false);
    expect(c.setup.pass).toBe(false);
  });
  it('requires the VWAP side to agree with the direction, and ignores it when unknown', () => {
    expect(confirmations(row(), metrics({ aboveVwap: false }), 'BULLISH', D).trend.pass).toBe(false);
    expect(confirmations(row(), metrics({ aboveVwap: null }), 'BULLISH', D).trend.pass).toBe(true);
    expect(confirmations(row({ price: 90 }), metrics({ trend: 'down', aboveVwap: false }), 'BEARISH', D).trend.pass).toBe(true);
  });
  it('treats missing figures as unknown, not as a pass or a fail', () => {
    const c = confirmations(row({ relVolume: null }), metrics({ turnoverCr: null, atrPct: null }), 'BULLISH', D);
    expect([c.volume.pass, c.liquidity.pass, c.volatility.pass]).toEqual([null, null, null]);
  });
  it('judges a setup by direction, validity and risk/reward', () => {
    expect(confirmations(row(), metrics({ swing: sell }), 'BULLISH', D).setup.detail).toMatch(/other way/);
    expect(confirmations(row(), metrics({ swing: { ...buy, rr: 1 } }), 'BULLISH', D)).toMatchObject({ setup: { pass: false } });
    expect(confirmations(row(), metrics({ swing: { ...buy, actionable: false } }), 'BULLISH', D).setup.pass).toBe(false);
  });
});

describe('tradeStatus', () => {
  const status = (r, m, dir = 'BULLISH', fresh = true) => tradeStatus(confirmations(r, m, dir, D), dir, m, fresh);
  it('is SETUP only when a valid setup and every confirmation agree', () => {
    expect(status(row(), metrics({ swing: buy })).code).toBe('SETUP');
  });
  it('is WAIT for a strong, confirmed trend with no valid setup, or a setup that is not fully confirmed', () => {
    expect(status(row(), metrics()).code).toBe('WAIT');
    expect(status(row({ relVolume: 0.5 }), metrics({ swing: buy })).code).toBe('WAIT');
    expect(status(row(), metrics({ swing: { ...buy, rr: 1 } })).code).toBe('WAIT');
  });
  it('is NO_TRADE when liquidity or volatility fails, the trend disagrees with no setup, or a setup points the other way', () => {
    expect(status(row(), metrics({ turnoverCr: 0.5 })).code).toBe('NO_TRADE');
    expect(status(row(), metrics({ atrPct: 12 })).code).toBe('NO_TRADE');
    expect(status(row(), metrics({ trend: 'down', aboveVwap: false })).code).toBe('NO_TRADE');
    expect(status(row(), metrics({ swing: sell })).code).toBe('NO_TRADE');
  });
  it('is REVIEW for every stock when the data is not current, whatever the setup', () => {
    expect(status(row(), metrics({ swing: buy }), 'BULLISH', false)).toMatchObject({ code: 'REVIEW' });
    expect(status(row(), metrics({ turnoverCr: 0.1 }), 'BULLISH', false).code).toBe('REVIEW');
  });
  it('explains itself', () => {
    expect(status(row(), metrics({ turnoverCr: 0.5 })).reasons[0]).toMatch(/Liquidity/);
    expect(status(row(), metrics()).reasons.join(' ')).toMatch(/swing setup/i);
  });
});

describe('buildBoards', () => {
  const rows = [
    row({ symbol: 'UPBIG', price: 120, changePct: 20 }), // +20 on a 10 range = 2.0
    row({ symbol: 'UPSMALL', price: 106, changePct: 6 }), // 0.6
    row({ symbol: 'DOWN', price: 85, changePct: -15 }), // -1.5
    row({ symbol: 'WEAK', price: 102, changePct: 2 }), // 0.2 (below 0.5)
    row({ symbol: 'FLAT', price: 100, changePct: 0 }),
    row({ symbol: 'NOOPEN', open: null }),
    row({ symbol: 'NOHIST' }),
    row({ symbol: 'SHORTHIST' }),
  ];
  const map = new Map([
    ['UPBIG', metrics({ swing: buy })], ['UPSMALL', metrics()], ['DOWN', metrics({ trend: 'down', aboveVwap: false, swing: sell })],
    ['WEAK', metrics()], ['FLAT', metrics()], ['NOOPEN', metrics()], ['SHORTHIST', metrics({ ranges: [5, 5] })],
  ]);
  const boards = buildBoards(rows, map, D, true);

  it('splits and ranks by strength, strongest first', () => {
    expect(boards.bullish.map((e) => e.symbol)).toEqual(['UPBIG', 'UPSMALL']);
    expect(boards.bearish.map((e) => e.symbol)).toEqual(['DOWN']);
    expect(boards.bullish[0].strength).toBe(2);
    expect(boards.bearish[0].strength).toBe(1.5);
    expect(boards.counts).toEqual({ bullish: 2, bearish: 1 });
  });
  it('says what it left out and why, rather than ranking stocks it cannot judge', () => {
    expect(boards.excluded).toEqual({ noOpen: 1, noHistory: 2, weak: 1, flat: 1, hidden: 0 });
  });
  it('puts a strong mover on the board even when its status is WAIT or NO_TRADE', () => {
    expect(boards.bullish.map((e) => e.status)).toEqual(['SETUP', 'WAIT']);
    const risky = buildBoards([rows[0]], new Map([['UPBIG', metrics({ turnoverCr: 0.2, swing: buy })]]), D, true);
    expect(risky.bullish[0]).toMatchObject({ symbol: 'UPBIG', status: 'NO_TRADE' });
  });
  it('labels everything REVIEW when the data is not current', () => {
    const old = buildBoards(rows, map, D, false);
    expect([...old.bullish, ...old.bearish].every((e) => e.status === 'REVIEW')).toBe(true);
  });
  it('changes with the window: a bigger average range weakens the same move', () => {
    const wide = new Map([['UPBIG', metrics({ ranges: [...Array(16).fill(10), ...Array(14).fill(50)] })]]);
    expect(buildBoards([rows[0]], wide, { ...D, window: 14, minStrength: 0.1 }, true).bullish[0].strength).toBeCloseTo(20 / 50);
    expect(buildBoards([rows[0]], wide, { ...D, window: 30, minStrength: 0.1 }, true).bullish[0].strength).toBeCloseTo(20 / ((16 * 10 + 14 * 50) / 30));
  });
  it('respects the minimum strength', () => {
    expect(buildBoards(rows, map, { ...D, minStrength: 1 }, true).bullish.map((e) => e.symbol)).toEqual(['UPBIG']);
    expect(buildBoards(rows, map, { ...D, minStrength: 0.1 }, true).bullish.map((e) => e.symbol)).toContain('WEAK');
  });
  it('hides rows failing a confirmation only when asked to', () => {
    const cfg = { ...D, hide: { ...D.hide, setup: true } };
    const hidden = buildBoards(rows, map, cfg, true);
    expect(hidden.bullish.map((e) => e.symbol)).toEqual(['UPBIG']);
    expect(hidden.bearish.map((e) => e.symbol)).toEqual(['DOWN']); // it has a valid short setup
    expect(hidden.excluded.hidden).toBe(1);
  });
  it('breaks ties by symbol and copes with nothing', () => {
    const tie = buildBoards([row({ symbol: 'B', price: 120 }), row({ symbol: 'A', price: 120 })], new Map([['A', metrics()], ['B', metrics()]]), D, true);
    expect(tie.bullish.map((e) => e.symbol)).toEqual(['A', 'B']);
    expect(buildBoards([], new Map(), D, true)).toMatchObject({ bullish: [], bearish: [] });
  });
});
