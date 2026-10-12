// Crosshair and zoom linking between charts (pure; the chart library is driven by the members' callbacks).
//
// Every chart registers with a hub. When the pointer moves over one chart the hub tells the others which bar time to
// show their crosshair at; when one chart is scrolled or zoomed the others follow. Charts may show different timeframes
// (a daily and an hourly chart of the same stock), so a time is mapped to the nearest bar at or before it in each chart.
// A hub never echoes an event back to the chart that sent it.

/**
 * The bar at or before `time` in a time-sorted candle list, or null when `time` is earlier than the first bar or is a
 * different kind of time (a date string against an epoch number) than the list uses.
 */
export function nearestAtOrBefore(candles, time) {
  if (!candles || candles.length === 0 || time === null || time === undefined) return null;
  if (typeof candles[0].time !== typeof time) return null;
  let lo = 0;
  let hi = candles.length - 1;
  if (time < candles[0].time) return null;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (candles[mid].time <= time) lo = mid;
    else hi = mid - 1;
  }
  return candles[lo];
}

/** A time range clamped to what a chart actually holds, or null when they do not overlap or the kinds differ. */
export function clampRange(candles, range) {
  if (!candles || candles.length === 0 || !range) return null;
  const first = candles[0].time;
  const last = candles[candles.length - 1].time;
  if (typeof first !== typeof range.from || typeof first !== typeof range.to) return null;
  const from = range.from < first ? first : range.from;
  const to = range.to > last ? last : range.to;
  return from <= to ? { from, to } : null;
}

/**
 * @returns hub with register(id, member) -> unregister, crosshair(fromId, time|null), range(fromId, range)
 *   member: { show(time), clear(), setRange(range) }
 */
export function createChartLink() {
  const members = new Map();
  let sending = false;

  const forEachOther = (fromId, fn) => {
    if (sending) return;
    sending = true;
    try {
      for (const [id, member] of members) if (id !== fromId) fn(member);
    } finally {
      sending = false;
    }
  };

  return {
    register(id, member) {
      members.set(id, member);
      return () => { if (members.get(id) === member) members.delete(id); };
    },
    crosshair(fromId, time) {
      forEachOther(fromId, (m) => (time === null || time === undefined ? m.clear() : m.show(time)));
    },
    range(fromId, range) {
      if (!range) return;
      forEachOther(fromId, (m) => m.setRange(range));
    },
    size: () => members.size,
  };
}
