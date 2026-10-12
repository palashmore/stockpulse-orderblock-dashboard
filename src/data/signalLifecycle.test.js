import { describe, it, expect } from 'vitest';
import { evaluateSignal, lifecycleLabel, EXTENDED_R } from './signalLifecycle';

const bar = (time, o, h, l, c) => ({ time, open: o, high: h, low: l, close: c, volume: 1 });
// A long signal fires on bar 0: entry 100, stop 90 (risk 10), targets 110 and 120
const SIG = { time: 0, side: 'BUY', entry: 100, stop: 90, target1: 110, target2: 120 };
const SHORT = { time: 0, side: 'SELL_SHORT', entry: 100, stop: 110, target1: 90, target2: 80 };
const quiet = (t) => bar(t, 100, 102, 98, 101);

describe('evaluateSignal', () => {
  it('is active on the signal bar itself and while later bars stay inside the stop and target', () => {
    expect(evaluateSignal(SIG, [bar(0, 99, 101, 98, 100)])).toMatchObject({ status: 'ACTIVE', actionable: true, ageBars: 0 });
    expect(evaluateSignal(SIG, [bar(0, 99, 101, 98, 100), quiet(1), quiet(2)])).toMatchObject({ status: 'ACTIVE', actionable: true, ageBars: 2 });
  });

  it('is stopped out when a later bar reaches the stop, and records when', () => {
    const r = evaluateSignal(SIG, [bar(0, 99, 101, 98, 100), quiet(1), bar(2, 100, 101, 89, 90), quiet(3)]);
    expect(r).toMatchObject({ status: 'STOPPED', actionable: false, resolvedAt: 2 });
  });

  it('treats a bar that touches both the stop and target 1 as stopped (stop first)', () => {
    expect(evaluateSignal(SIG, [bar(0, 99, 101, 98, 100), bar(1, 100, 112, 88, 100)]).status).toBe('STOPPED');
  });

  it('is no longer actionable once target 1 is reached, and ends at target 2 or breakeven afterwards', () => {
    const t1 = [bar(0, 99, 101, 98, 100), bar(1, 100, 111, 100, 110)];
    expect(evaluateSignal(SIG, t1)).toMatchObject({ status: 'TARGET_1', actionable: false, resolvedAt: 1 });
    expect(evaluateSignal(SIG, [...t1, bar(2, 110, 121, 109, 120)]).status).toBe('TARGET_2');
    expect(evaluateSignal(SIG, [...t1, bar(2, 110, 112, 99, 100)]).status).toBe('BREAKEVEN');
    // target 2 is not credited on the same bar as target 1
    expect(evaluateSignal(SIG, [bar(0, 99, 101, 98, 100), bar(1, 100, 125, 100, 124)]).status).toBe('TARGET_1');
  });

  it('expires after the validity window', () => {
    const bars = [bar(0, 99, 101, 98, 100), ...Array.from({ length: 5 }, (_, i) => quiet(i + 1))];
    expect(evaluateSignal(SIG, bars, { validBars: 5 }).status).toBe('ACTIVE');
    expect(evaluateSignal(SIG, bars, { validBars: 4 })).toMatchObject({ status: 'EXPIRED', actionable: false });
  });

  it('marks a signal extended when price has run more than half the risk beyond the entry without a target', () => {
    const run = [bar(0, 99, 101, 98, 100), bar(1, 100, 106, 100, 106)]; // 6 > 0.5 * 10, but target 1 (110) not reached
    expect(evaluateSignal(SIG, run)).toMatchObject({ status: 'EXTENDED', actionable: false });
    expect(evaluateSignal(SIG, [bar(0, 99, 101, 98, 100), bar(1, 100, 104, 100, 104)]).status).toBe('ACTIVE');
    expect(EXTENDED_R).toBe(0.5);
  });

  it('handles shorts in the mirrored direction', () => {
    expect(evaluateSignal(SHORT, [bar(0, 101, 102, 99, 100), bar(1, 100, 111, 99, 108)]).status).toBe('STOPPED');
    expect(evaluateSignal(SHORT, [bar(0, 101, 102, 99, 100), bar(1, 100, 101, 89, 90)]).status).toBe('TARGET_1');
    expect(evaluateSignal(SHORT, [bar(0, 101, 102, 99, 100), bar(1, 100, 101, 94, 94)]).status).toBe('EXTENDED');
    expect(evaluateSignal(SHORT, [bar(0, 101, 102, 99, 100), quiet(1)]).status).toBe('ACTIVE');
  });

  it('intraday signals from an earlier session are past-session, not actionable', () => {
    const day = 86400;
    const sig = { ...SIG, time: 100 * day + 3600 };
    const bars = [bar(100 * day + 3600, 99, 101, 98, 100), bar(101 * day + 3600, 100, 102, 98, 101)];
    expect(evaluateSignal(sig, bars, { intraday: true }).status).toBe('PAST_SESSION');
    expect(evaluateSignal(sig, bars, { intraday: false, validBars: 5 }).status).toBe('ACTIVE');
  });

  it('is expired when the signal bar is not in the data, and labels every status', () => {
    expect(evaluateSignal({ ...SIG, time: 999 }, [quiet(0)])).toMatchObject({ status: 'EXPIRED', actionable: false, ageBars: null });
    for (const s of ['ACTIVE', 'TARGET_1', 'TARGET_2', 'STOPPED', 'BREAKEVEN', 'EXPIRED', 'EXTENDED', 'PAST_SESSION']) expect(lifecycleLabel(s)).not.toBe(s);
  });
});
