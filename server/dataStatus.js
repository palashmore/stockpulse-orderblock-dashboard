// Data status labels attached to every provider-backed response.
// The server never emits LIVE: Yahoo Finance and the NSE website are unofficial,
// unauthenticated feeds whose real-time delivery cannot be verified from the response.
// SIMULATED is only ever produced by the frontend's explicit demo mode.
export const DATA_STATUS = {
  LIVE: 'LIVE',
  DELAYED: 'DELAYED',
  HISTORICAL: 'HISTORICAL',
  SIMULATED: 'SIMULATED',
  STALE: 'STALE',
  UNAVAILABLE: 'UNAVAILABLE',
};

// A quote during the regular session older than this is reported as STALE.
export const MAX_IN_SESSION_AGE_MS = 20 * 60 * 1000;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * NSE equity session from the clock only (09:15-15:30 IST, Mon-Fri).
 * Exchange holidays are not modelled.
 */
export function getMarketStatus(date = new Date()) {
  const istNow = new Date(date.getTime() + IST_OFFSET_MS);
  const day = istNow.getUTCDay();
  const timeInMinutes = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();

  const isWeekday = day >= 1 && day <= 5;
  const isMarketHours = timeInMinutes >= 555 && timeInMinutes <= 930;
  const isPreOpen = timeInMinutes >= 540 && timeInMinutes < 555;

  return {
    isOpen: isWeekday && isMarketHours,
    isPreOpen: isWeekday && isPreOpen,
    currentTime: istNow.toISOString(),
    marketOpen: '09:15',
    marketClose: '15:30',
    timezone: 'IST',
    day: DAYS[day],
  };
}

/** Status of a quote from Yahoo `marketState` and the quote's own timestamp. */
export function classifyQuoteStatus({ marketState, quoteTimeMs, nowMs }) {
  if (marketState !== 'REGULAR') return DATA_STATUS.HISTORICAL;
  if (!Number.isFinite(quoteTimeMs)) return DATA_STATUS.STALE;
  if (nowMs - quoteTimeMs > MAX_IN_SESSION_AGE_MS) return DATA_STATUS.STALE;
  return DATA_STATUS.DELAYED;
}

/** Status of an options chain from the session clock and the provider timestamp. */
export function classifyOptionsStatus({ marketOpen, asOfMs, nowMs }) {
  if (!marketOpen) return DATA_STATUS.HISTORICAL;
  if (!Number.isFinite(asOfMs)) return DATA_STATUS.DELAYED;
  if (nowMs - asOfMs > MAX_IN_SESSION_AGE_MS) return DATA_STATUS.STALE;
  return DATA_STATUS.DELAYED;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parse NSE's "DD-Mon-YYYY HH:mm:ss" (IST) timestamp to epoch ms, or null. */
export function parseNseTimestamp(text) {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/.exec(String(text || '').trim());
  if (!m) return null;
  const month = MONTHS.findIndex((n) => n.toLowerCase() === m[2].toLowerCase());
  if (month < 0) return null;
  const [, d, , y, hh = '0', mm = '0', ss = '0'] = m;
  return Date.UTC(+y, month, +d, +hh, +mm, +ss) - IST_OFFSET_MS;
}
