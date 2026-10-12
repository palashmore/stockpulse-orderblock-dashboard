import { describe, it, expect } from 'vitest';
import { computeBreadth, sectorPerformance, binDots } from './marketOverview';

const q = (symbol, changePct) => ({ symbol, name: symbol, changePct });

describe('computeBreadth', () => {
  it('counts advancers, decliners, unchanged and unknown', () => {
    const b = computeBreadth([q('A', 1), q('B', 2), q('C', -1), q('D', 0), q('E', null), { symbol: 'F' }]);
    expect(b).toEqual({ advancers: 2, decliners: 1, unchanged: 1, unknown: 2, ratio: 2 });
  });

  it('has no ratio without decliners and tolerates empty input', () => {
    expect(computeBreadth([q('A', 1)]).ratio).toBeNull();
    expect(computeBreadth(null).advancers).toBe(0);
  });
});

describe('sectorPerformance', () => {
  const map = { A: 'IT', B: 'IT', C: 'Banking', D: 'Banking', E: 'Pharma' };

  it('averages equal-weighted, sorts best first and names leader and laggard', () => {
    const r = sectorPerformance([q('A', 2), q('B', 1), q('C', -1), q('D', -3), q('E', 5), q('ZZ', 9)], map);
    expect(r.sectors).toEqual([
      { sector: 'IT', avgChangePct: 1.5, count: 2 },
      { sector: 'Banking', avgChangePct: -2, count: 2 },
    ]);
    expect(r.leading.sector).toBe('IT');
    expect(r.lagging.sector).toBe('Banking');
    expect(r.uncovered).toBe(1); // ZZ has no sector
    expect(r.thinSectors).toEqual(['Pharma']); // one stock is too thin to list
  });

  it('does not name a leader or laggard from fewer than two sectors', () => {
    const r = sectorPerformance([q('A', 2), q('B', 1)], map);
    expect(r.sectors).toHaveLength(1);
    expect(r.leading).toBeNull();
    expect(r.lagging).toBeNull();
  });

  it('ignores quotes without a change', () => {
    expect(sectorPerformance([q('A', null), q('B', 1)], map).sectors).toEqual([]);
  });
});

describe('binDots', () => {
  it('positions dots on the -3..+3 axis and stacks same-bin dots deterministically', () => {
    const dots = binDots([q('B', 1.1), q('A', 1.0), q('C', -3), q('D', 3)]);
    const bySymbol = Object.fromEntries(dots.map((d) => [d.symbol, d]));
    expect(bySymbol.C.x).toBe(0);
    expect(bySymbol.D.x).toBe(100);
    expect(bySymbol.A.x).toBeCloseTo((4 / 6) * 100, 10);
    // A (1.0) and B (1.1) share the 1.0 bin; symbol order decides the stack
    expect(bySymbol.A.level).toBe(0);
    expect(bySymbol.B.level).toBe(1);
  });

  it('pins moves beyond the axis at the edge and flags them', () => {
    const [d] = binDots([q('A', 7.5)]);
    expect(d.x).toBe(100);
    expect(d.pinned).toBe(true);
    expect(d.changePct).toBe(7.5);
  });

  it('drops quotes without a change', () => {
    expect(binDots([q('A', null), q('B', 0)])).toHaveLength(1);
  });
});
