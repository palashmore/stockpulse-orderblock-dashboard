// What has happened to a signal since it fired, using only the completed bars that came after it.
// A signal is "actionable" only while it is still valid: not stopped out, not past a target, not
// stretched far from its entry, and not older than its validity window. The same stop-first rule as
// the backtester applies when one bar touches both the stop and a target.
export const EXTENDED_R = 0.5; // price already this many R beyond the entry: chasing, not an entry

const LABELS = {
  ACTIVE: 'Active',
  TARGET_1: 'Target 1 reached',
  TARGET_2: 'Target 2 reached',
  STOPPED: 'Stopped out',
  BREAKEVEN: 'Stopped at breakeven',
  EXPIRED: 'Expired',
  EXTENDED: 'Moved away from entry',
  PAST_SESSION: 'Past session',
};

export const lifecycleLabel = (status) => LABELS[status] ?? status;

/**
 * Evaluate one signal against the candles that followed it.
 *   signal   { time, side, entry, stop, target1, target2 }
 *   candles  completed candles, oldest first (must contain the signal's own bar)
 *   options  { validBars }   how many bars after the signal it may still be acted on
 * Returns { status, actionable, ageBars, resolvedAt, label }.
 */
export function evaluateSignal(signal, candles, { validBars = 12, intraday = false } = {}) {
  const i = candles.findIndex((c) => c.time === signal.time);
  if (i < 0) return { status: 'EXPIRED', actionable: false, ageBars: null, resolvedAt: null, label: LABELS.EXPIRED };

  const dir = signal.side === 'BUY' ? 1 : -1;
  const n = candles.length;
  const ageBars = n - 1 - i;
  const risk = Math.abs(signal.entry - signal.stop);
  const done = (status, k) => ({ status, actionable: false, ageBars, resolvedAt: k === null ? null : candles[k].time, label: LABELS[status] });

  let t1At = null;
  for (let k = i + 1; k < n; k++) {
    const c = candles[k];
    if (t1At === null) {
      if (dir > 0 ? c.low <= signal.stop : c.high >= signal.stop) return done('STOPPED', k);
      if (dir > 0 ? c.high >= signal.target1 : c.low <= signal.target1) { t1At = k; continue; } // no target 2 on the same bar
    } else {
      if (dir > 0 ? c.low <= signal.entry : c.high >= signal.entry) return done('BREAKEVEN', k);
      if (dir > 0 ? c.high >= signal.target2 : c.low <= signal.target2) return done('TARGET_2', k);
    }
  }
  if (t1At !== null) return done('TARGET_1', t1At);

  if (intraday && Math.floor(candles[n - 1].time / 86400) !== Math.floor(signal.time / 86400)) return done('PAST_SESSION', null);
  if (ageBars > validBars) return done('EXPIRED', null);

  const lastClose = candles[n - 1].close;
  if (risk > 0 && dir * (lastClose - signal.entry) > EXTENDED_R * risk) return done('EXTENDED', null);

  return { status: 'ACTIVE', actionable: true, ageBars, resolvedAt: null, label: LABELS.ACTIVE };
}
