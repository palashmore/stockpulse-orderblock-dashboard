import { describe, it, expect } from 'vitest';
import { loadStrategyConfig, saveStrategyConfig, loadSlippage, SLIPPAGE_KEY } from './strategyStore';
import { SWING_DEFAULTS, INTRADAY_DEFAULTS } from './strategies';

const memory = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
};

describe('strategy store', () => {
  it('keeps swing and intraday configurations separate', () => {
    const s = memory();
    saveStrategyConfig('swing', { stopAtr: 3 }, s);
    expect(loadStrategyConfig('swing', s).stopAtr).toBe(3);
    expect(loadStrategyConfig('intraday', s).stopAtr).toBe(INTRADAY_DEFAULTS.stopAtr);
    saveStrategyConfig('intraday', { maxTradesPerDay: 7 }, s);
    expect(loadStrategyConfig('swing', s)).not.toHaveProperty('maxTradesPerDay');
    expect(loadStrategyConfig('intraday', s).maxTradesPerDay).toBe(7);
  });

  it('clamps stored values and falls back to defaults on corrupt or blocked storage', () => {
    const s = memory();
    s.setItem('stockpulse.strategy.swing.v1', JSON.stringify({ riskPct: 500, stopAtr: 'x' }));
    const c = loadStrategyConfig('swing', s);
    expect(c.riskPct).toBe(5);
    expect(c.stopAtr).toBe(SWING_DEFAULTS.stopAtr);
    s.setItem('stockpulse.strategy.swing.v1', '{bad json');
    expect(loadStrategyConfig('swing', s)).toEqual(SWING_DEFAULTS);
    const blocked = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
    expect(loadStrategyConfig('intraday', blocked)).toEqual(INTRADAY_DEFAULTS);
    expect(saveStrategyConfig('swing', {}, blocked)).toBe(false);
  });

  it('slippage defaults to 5 bps and is bounded', () => {
    const s = memory();
    expect(loadSlippage(s)).toBe(5);
    s.setItem(SLIPPAGE_KEY, '250');
    expect(loadSlippage(s)).toBe(100);
    s.setItem(SLIPPAGE_KEY, '-3');
    expect(loadSlippage(s)).toBe(0);
  });
});
