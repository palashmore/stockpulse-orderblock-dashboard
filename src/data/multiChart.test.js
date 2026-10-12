import { describe, it, expect } from 'vitest';
import { defaultLayout, validateLayout, loadLayout, saveLayout, cellTimeframe, setCellSymbol, setCellTimeframe, LAYOUT_KEY, cellSymbol } from './multiChart';

const memory = (value) => {
  const data = new Map(value === undefined ? [] : [[LAYOUT_KEY, value]]);
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
};

describe('multi-chart layout', () => {
  it('defaults to four charts on the daily timeframe', () => {
    const d = defaultLayout();
    expect(d.count).toBe(4);
    expect(d.cells).toHaveLength(6);
    expect(d.linkTimeframe).toBe(true);
  });

  it('keeps valid values and replaces invalid ones field by field', () => {
    const v = validateLayout({ count: 6, linkTimeframe: false, timeframe: '5m', cells: [{ symbol: 'IRFC', timeframe: '15m' }, { symbol: 'bad symbol', timeframe: 'x' }, null] });
    expect(v.count).toBe(6);
    expect(v.timeframe).toBe('5m');
    expect(v.cells[0]).toEqual({ symbol: 'IRFC', timeframe: '15m' });
    expect(v.cells[1]).toEqual({ symbol: 'TCS', timeframe: 'D' });
    expect(v.cells[2].symbol).toBe('HDFCBANK');
    expect(validateLayout({ count: 3 }).count).toBe(4);
    expect(validateLayout(null)).toEqual(defaultLayout());
  });

  it('round-trips and survives corrupt or blocked storage', () => {
    const s = memory();
    const layout = setCellSymbol(defaultLayout(), 1, 'IRFC');
    expect(saveLayout(layout, s)).toBe(true);
    expect(loadLayout(s).cells[1].symbol).toBe('IRFC');
    expect(loadLayout(memory('{bad'))).toEqual(defaultLayout());
    const blocked = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
    expect(loadLayout(blocked)).toEqual(defaultLayout());
    expect(saveLayout(layout, blocked)).toBe(false);
  });

  it('changing one chart leaves every other chart untouched', () => {
    const before = defaultLayout();
    const after = setCellSymbol(before, 2, 'IRFC');
    expect(after.cells.map((c) => c.symbol)).toEqual(['RELIANCE', 'TCS', 'IRFC', 'INFY', 'ICICIBANK', 'SBIN']);
    expect(before.cells[2].symbol).toBe('HDFCBANK'); // the original is not mutated
    expect(setCellSymbol(before, 9, 'X')).toBe(before);
    expect(setCellSymbol(before, 0, 'not valid!')).toBe(before);
  });

  it('shares one timeframe when linked, and keeps per-chart timeframes when not', () => {
    const linked = setCellTimeframe(defaultLayout(), 1, '5m');
    expect(linked.timeframe).toBe('5m');
    expect([0, 1, 2].map((i) => cellTimeframe(linked, i).id)).toEqual(['5m', '5m', '5m']);
    const free = setCellTimeframe({ ...defaultLayout(), linkTimeframe: false }, 1, '15m');
    expect([0, 1, 2].map((i) => cellTimeframe(free, i).id)).toEqual(['D', '15m', 'D']);
    expect(setCellTimeframe(free, 0, 'bogus')).toBe(free);
  });
});

describe('linking charts', () => {
  it('links the crosshair by default and the stock never', () => {
    const d = defaultLayout();
    expect(d.linkCrosshair).toBe(true);
    expect(d.linkSymbol).toBe(false);
  });

  it('validates the two switches, falling back to their defaults', () => {
    expect(validateLayout({ linkCrosshair: false, linkSymbol: true })).toMatchObject({ linkCrosshair: false, linkSymbol: true });
    expect(validateLayout({ linkCrosshair: 'yes', linkSymbol: 1 })).toMatchObject({ linkCrosshair: true, linkSymbol: false });
    expect(validateLayout({})).toMatchObject({ linkCrosshair: true, linkSymbol: false });
  });

  it('lets each chart keep its own stock unless the stock is linked', () => {
    const layout = defaultLayout();
    expect([0, 1, 2].map((i) => cellSymbol(layout, i))).toEqual(['RELIANCE', 'TCS', 'HDFCBANK']);
    const linked = { ...layout, linkSymbol: true };
    expect([0, 1, 2, 5].map((i) => cellSymbol(linked, i))).toEqual(['RELIANCE', 'RELIANCE', 'RELIANCE', 'RELIANCE']);
  });

  it('changes the shared stock for every chart when linked, from whichever chart was used', () => {
    const linked = { ...defaultLayout(), linkSymbol: true };
    const after = setCellSymbol(linked, 3, 'IRFC');
    expect([0, 1, 2, 3].map((i) => cellSymbol(after, i))).toEqual(['IRFC', 'IRFC', 'IRFC', 'IRFC']);
    expect(after.cells[3].symbol).toBe('INFY'); // the chart's own choice is kept for when the link is turned off
    expect(setCellSymbol(linked, 3, 'bad symbol')).toBe(linked);
  });

  it('survives a save and load with the switches', () => {
    let value = null;
    const storage = { getItem: () => value, setItem: (_k, v) => { value = v; } };
    saveLayout({ ...defaultLayout(), linkCrosshair: false, linkSymbol: true }, storage);
    expect(loadLayout(storage)).toMatchObject({ linkCrosshair: false, linkSymbol: true });
  });
});

