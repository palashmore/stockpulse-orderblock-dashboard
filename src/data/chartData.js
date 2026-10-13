// Helpers that decide when the price chart must be refitted and when it can keep the user's zoom (pure).

/** A cheap content key for a candle list: it changes when the candles change, not when the array is merely re-created. */
export function dataKey(candles) {
  if (!Array.isArray(candles) || candles.length === 0) return 'empty';
  const first = candles[0];
  const last = candles[candles.length - 1];
  return `${candles.length}|${first.time}|${last.time}|${last.open}|${last.high}|${last.low}|${last.close}|${last.volume ?? ''}`;
}

const keyOf = (resetKey, data) => `${resetKey}|${data?.[0]?.time ?? ''}`;

/** More bars than this appearing or vanishing at once means a different history (another timeframe), not a live update. */
export const REFIT_LENGTH_JUMP = 3;

/**
 * Whether the chart should refit to show everything. True for the first data, when the stock or timeframe key changed,
 * when the history starts at a different bar, or when its size jumped. A live update (the last candle changing, or one new
 * bar) is false, so the zoom and scroll position stay as the user left them.
 * @param previous { key, length } remembered from the last time data was applied
 */
export function needsRefit(previous, { resetKey = '', data }) {
  if (!previous || !previous.key) return true;
  if (previous.key !== keyOf(resetKey, data)) return true;
  return Math.abs(data.length - previous.length) > REFIT_LENGTH_JUMP;
}
needsRefit.keyOf = keyOf;
