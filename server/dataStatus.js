import { getMarketState, istDateKey } from './marketCalendar.js';

// Data status labels attached to every provider-backed response.
// LIVE is only emitted for a broker feed whose own exchange timestamps are fresh in-session;
// Yahoo Finance and the NSE website are unofficial feeds and top out at DELAYED.
// MARKET_CLOSED means the market is shut and the data is the latest completed session.
// SIMULATED is only ever produced by the frontend's explicit demo mode.
export const DATA_STATUS = {
  LIVE: 'LIVE',
  DELAYED: 'DELAYED',
  MARKET_CLOSED: 'MARKET_CLOSED',
  HISTORICAL: 'HISTORICAL',
  SIMULATED: 'SIMULATED',
  STALE: 'STALE',
  UNAVAILABLE: 'UNAVAILABLE',
};

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// A quote during the regular session older than this is reported as STALE.
export const MAX_IN_SESSION_AGE_MS = 20 * 60 * 1000;

/**
 * NSE equity session state at an instant. Pass the exchange holiday map (parseNseHolidays) so
 * holidays are detected; without it only weekends are, and `calendar` says so.
 */
export function getMarketStatus(date = new Date(), holidays = null) {
  return getMarketState(date.getTime(), holidays);
}

/**
 * Status for data read while the market is closed: MARKET_CLOSED when its timestamp falls in the
 * latest completed session (or a session that is just starting), STALE when it is older,
 * HISTORICAL when it carries no timestamp to check.
 */
export function classifyClosedMarketData(asOfMs, market) {
  if (!Number.isFinite(asOfMs)) return DATA_STATUS.HISTORICAL;
  const day = istDateKey(asOfMs);
  return day === market.lastSession || day === market.currentSession ? DATA_STATUS.MARKET_CLOSED : DATA_STATUS.STALE;
}

/** Status of a quote from Yahoo `marketState` and the quote's own timestamp. */
export function classifyQuoteStatus({ marketState, quoteTimeMs, nowMs, market }) {
  if (market && !market.isOpen) return classifyClosedMarketData(quoteTimeMs, market);
  if (marketState !== 'REGULAR') return DATA_STATUS.HISTORICAL;
  if (!Number.isFinite(quoteTimeMs)) return DATA_STATUS.STALE;
  if (nowMs - quoteTimeMs > MAX_IN_SESSION_AGE_MS) return DATA_STATUS.STALE;
  return DATA_STATUS.DELAYED;
}

/** Status of an options chain from the session clock and the provider timestamp. */
export function classifyOptionsStatus({ marketOpen, asOfMs, nowMs, market }) {
  if (!marketOpen) return market ? classifyClosedMarketData(asOfMs, market) : DATA_STATUS.HISTORICAL;
  if (!Number.isFinite(asOfMs)) return DATA_STATUS.DELAYED;
  if (nowMs - asOfMs > MAX_IN_SESSION_AGE_MS) return DATA_STATUS.STALE;
  return DATA_STATUS.DELAYED;
}

/**
 * Status of a history response. Daily/weekly series are HISTORICAL. For intraday series the
 * newest bar's start is compared with the clock: during the session a recent bar is DELAYED
 * (unofficial feed), an old one STALE; outside the session it is HISTORICAL.
 */
export function classifyHistoryStatus({ intraday, marketOpen, lastBarMs, intervalMs, nowMs }) {
  if (!intraday || !marketOpen) return DATA_STATUS.HISTORICAL;
  if (!Number.isFinite(lastBarMs)) return DATA_STATUS.STALE;
  return nowMs - lastBarMs > intervalMs + MAX_IN_SESSION_AGE_MS ? DATA_STATUS.STALE : DATA_STATUS.DELAYED;
}

// A broker feed may be called LIVE only while the session is open AND the provider's own
// timestamp is fresh. Anything we cannot verify stays at the weaker label.
export const LIVE_QUOTE_MAX_AGE_MS = 2 * 60 * 1000;

/** Status of a broker quote from the session clock and the exchange's last-trade time. */
export function classifyLiveQuoteStatus({ marketOpen, lastTradeMs, nowMs, market }) {
  if (!marketOpen) return market ? classifyClosedMarketData(lastTradeMs, market) : DATA_STATUS.HISTORICAL;
  if (!Number.isFinite(lastTradeMs)) return DATA_STATUS.DELAYED;
  return nowMs - lastTradeMs <= LIVE_QUOTE_MAX_AGE_MS ? DATA_STATUS.LIVE : DATA_STATUS.STALE;
}

/** Status of broker history: LIVE only when the newest intraday bar is current. */
export function classifyLiveHistoryStatus({ intraday, marketOpen, lastBarMs, intervalMs, nowMs }) {
  if (!intraday || !marketOpen) return DATA_STATUS.HISTORICAL;
  if (!Number.isFinite(lastBarMs)) return DATA_STATUS.DELAYED;
  return nowMs - lastBarMs <= intervalMs + 60 * 1000 ? DATA_STATUS.LIVE : DATA_STATUS.STALE;
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
