import { describe, it, expect } from 'vitest';
import { nearestAtOrBefore, clampRange, createChartLink } from './chartLink';

const daily = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-09'].map((time, i) => ({ time, close: 100 + i }));
const intraday = [1000, 1300, 1600, 1900].map((time, i) => ({ time, close: 10 + i }));

describe('nearestAtOrBefore', () => {
  it('finds the bar at or before a time, for dates and for epoch numbers', () => {
    expect(nearestAtOrBefore(daily, '2026-10-07').close).toBe(102);
    expect(nearestAtOrBefore(daily, '2026-10-08').close).toBe(102); // a gap (no bar on the 8th): the previous bar
    expect(nearestAtOrBefore(daily, '2027-01-01').close).toBe(103);
    expect(nearestAtOrBefore(intraday, 1650).close).toBe(12);
    expect(nearestAtOrBefore(intraday, 1000).close).toBe(10);
  });
  it('gives nothing before the first bar, for a different kind of time, or for empty input', () => {
    expect(nearestAtOrBefore(daily, '2026-10-01')).toBeNull();
    expect(nearestAtOrBefore(daily, 1650)).toBeNull(); // an intraday time on a daily chart
    expect(nearestAtOrBefore(intraday, '2026-10-07')).toBeNull();
    expect(nearestAtOrBefore([], '2026-10-07')).toBeNull();
    expect(nearestAtOrBefore(null, 5)).toBeNull();
    expect(nearestAtOrBefore(daily, null)).toBeNull();
  });
  it('handles a single bar', () => {
    expect(nearestAtOrBefore([{ time: 5, close: 1 }], 9).close).toBe(1);
    expect(nearestAtOrBefore([{ time: 5, close: 1 }], 4)).toBeNull();
  });
});

describe('clampRange', () => {
  it('keeps the part of a range the chart has, and drops ranges that miss it or are of another kind', () => {
    expect(clampRange(daily, { from: '2026-10-06', to: '2026-10-08' })).toEqual({ from: '2026-10-06', to: '2026-10-08' });
    expect(clampRange(daily, { from: '2026-09-01', to: '2026-12-01' })).toEqual({ from: '2026-10-05', to: '2026-10-09' });
    expect(clampRange(daily, { from: '2026-11-01', to: '2026-12-01' })).toBeNull();
    expect(clampRange(daily, { from: 1, to: 2 })).toBeNull();
    expect(clampRange(daily, null)).toBeNull();
    expect(clampRange([], { from: 1, to: 2 })).toBeNull();
  });
});

describe('createChartLink', () => {
  const member = (log, name) => ({
    show: (t) => log.push([name, 'show', t]),
    clear: () => log.push([name, 'clear']),
    setRange: (r) => log.push([name, 'range', r]),
  });

  it('shows a crosshair on every chart except the one the pointer is on', () => {
    const log = [];
    const hub = createChartLink();
    hub.register('a', member(log, 'a'));
    hub.register('b', member(log, 'b'));
    hub.register('c', member(log, 'c'));
    hub.crosshair('b', '2026-10-07');
    expect(log).toEqual([['a', 'show', '2026-10-07'], ['c', 'show', '2026-10-07']]);
  });

  it('clears the others when the pointer leaves', () => {
    const log = [];
    const hub = createChartLink();
    hub.register('a', member(log, 'a'));
    hub.register('b', member(log, 'b'));
    hub.crosshair('a', null);
    expect(log).toEqual([['b', 'clear']]);
  });

  it('passes zoom and scroll on, ignoring an empty range', () => {
    const log = [];
    const hub = createChartLink();
    hub.register('a', member(log, 'a'));
    hub.register('b', member(log, 'b'));
    hub.range('a', { from: 1, to: 2 });
    hub.range('a', null);
    expect(log).toEqual([['b', 'range', { from: 1, to: 2 }]]);
  });

  it('does not echo: an event raised while one is being sent is dropped', () => {
    const log = [];
    const hub = createChartLink();
    hub.register('a', { show: (t) => { log.push(['a', t]); hub.crosshair('a', 'echo'); }, clear() {}, setRange() {} });
    hub.register('b', { show: (t) => { log.push(['b', t]); hub.crosshair('b', 'echo'); }, clear() {}, setRange() {} });
    hub.crosshair('b', 'first');
    expect(log).toEqual([['a', 'first']]);
  });

  it('stops sending to a chart that unregistered, and a stale unregister cannot remove its replacement', () => {
    const log = [];
    const hub = createChartLink();
    const off = hub.register('a', member(log, 'a'));
    hub.register('b', member(log, 'b'));
    off();
    hub.crosshair('b', 't');
    expect(log).toEqual([]);
    expect(hub.size()).toBe(1);

    const first = member(log, 'old');
    const offOld = hub.register('x', first);
    hub.register('x', member(log, 'new')); // the chart was re-created under the same id
    offOld();
    hub.crosshair('b', 't2');
    expect(log).toEqual([['new', 'show', 't2']]);
  });

  it('keeps sending after one member throws, and recovers its flag', () => {
    const log = [];
    const hub = createChartLink();
    hub.register('a', { show: () => { throw new Error('chart gone'); }, clear() {}, setRange() {} });
    hub.register('b', member(log, 'b'));
    expect(() => hub.crosshair('c', 't')).toThrow('chart gone');
    hub.crosshair('a', 't'); // the guard flag was reset, so later events still go out
    expect(log).toEqual([['b', 'show', 't']]);
  });
});
