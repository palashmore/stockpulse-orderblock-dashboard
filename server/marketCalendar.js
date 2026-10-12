// NSE capital-market calendar and session state (Asia/Kolkata, UTC+5:30, no DST).
//
// Sessions modelled: pre-open 09:00-09:15, normal market 09:15-15:30, Mon-Fri, minus the exchange
// holidays passed in. Special sessions (for example Muhurat trading, whose timing NSE announces
// separately) are NOT modelled: such a day is reported as closed.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 86400000;
const PRE_OPEN_MIN = 9 * 60;
const OPEN_MIN = 9 * 60 + 15;
const CLOSE_MIN = 15 * 60 + 30;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** 'YYYY-MM-DD' for the IST calendar date of an epoch-ms instant. */
export function istDateKey(ms) {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

const keyToUtcMs = (key) => Date.parse(`${key}T00:00:00Z`);
const addDays = (key, n) => new Date(keyToUtcMs(key) + n * DAY_MS).toISOString().slice(0, 10);
const weekday = (key) => new Date(keyToUtcMs(key)).getUTCDay();

/**
 * Build a date -> holiday-name Map from NSE's holiday-master JSON (`CM` = capital market segment).
 * Returns null when the payload has no usable CM list, so callers can tell "no calendar" from
 * "calendar with no holidays".
 */
export function parseNseHolidays(json) {
  const list = json?.CM;
  if (!Array.isArray(list)) return null;
  const map = new Map();
  for (const item of list) {
    const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(String(item?.tradingDate || '').trim());
    if (!m) continue;
    const month = MONTHS.indexOf(m[2].toLowerCase());
    if (month < 0) continue;
    const key = `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    map.set(key, String(item.description || 'Exchange holiday'));
  }
  return map.size > 0 ? map : null;
}

export function isTradingDay(key, holidays) {
  const wd = weekday(key);
  return wd !== 0 && wd !== 6 && !(holidays && holidays.has(key));
}

export function previousTradingDay(key, holidays) {
  let k = addDays(key, -1);
  for (let i = 0; i < 15 && !isTradingDay(k, holidays); i++) k = addDays(k, -1);
  return k;
}

export function nextTradingDay(key, holidays) {
  let k = addDays(key, 1);
  for (let i = 0; i < 15 && !isTradingDay(k, holidays); i++) k = addDays(k, 1);
  return k;
}

/** Epoch ms of 09:15 IST on a date key. */
const openMs = (key) => keyToUtcMs(key) + OPEN_MIN * 60000 - IST_OFFSET_MS;

/**
 * Market state at an instant.
 *  state          OPEN | PRE_OPEN | CLOSED
 *  reason         null | weekend | holiday | before_open | after_close
 *  lastSession    most recent COMPLETED trading date (today only once the close has passed)
 *  currentSession today's date while OPEN/PRE_OPEN, else null
 *  calendar       'nse' when holidays are known, 'weekends-only' otherwise (holidays not detected)
 */
export function getMarketState(nowMs, holidays = null) {
  const today = istDateKey(nowMs);
  const istNow = new Date(nowMs + IST_OFFSET_MS);
  const minutes = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();
  const trading = isTradingDay(today, holidays);

  let state = 'CLOSED';
  let reason;
  if (!trading) {
    const wd = weekday(today);
    reason = wd === 0 || wd === 6 ? 'weekend' : 'holiday';
  } else if (minutes < PRE_OPEN_MIN) {
    reason = 'before_open';
  } else if (minutes < OPEN_MIN) {
    state = 'PRE_OPEN';
  } else if (minutes <= CLOSE_MIN) {
    state = 'OPEN';
  } else {
    reason = 'after_close';
  }

  const inSession = state !== 'CLOSED';
  const sessionDone = trading && minutes > CLOSE_MIN;
  const lastSession = sessionDone ? today : previousTradingDay(today, holidays);
  const nextOpenKey = trading && minutes < OPEN_MIN ? today : nextTradingDay(today, holidays);

  return {
    state,
    reason: reason ?? null,
    holiday: reason === 'holiday' ? holidays.get(today) : null,
    isOpen: state === 'OPEN',
    isPreOpen: state === 'PRE_OPEN',
    lastSession,
    currentSession: inSession ? today : null,
    nextOpen: new Date(openMs(nextOpenKey)).toISOString(),
    calendar: holidays ? 'nse' : 'weekends-only',
    currentTime: istNow.toISOString(),
    marketOpen: '09:15',
    marketClose: '15:30',
    timezone: 'Asia/Kolkata',
    day: DAYS[istNow.getUTCDay()],
  };
}

/**
 * Flag the newest daily/weekly candle `partial: true` when its period is not finished, so
 * completed-session analysis can leave it out. Daily: the candle for the session in progress.
 * Weekly (candle time = the week's Monday): partial until the last completed session is the
 * week's final trading day. Intraday and monthly series are returned unchanged.
 * Mutates and returns the array.
 */
export function markPartialCandles(candles, interval, market, holidays = null) {
  const last = candles?.[candles.length - 1];
  if (!last || typeof last.time !== 'string') return candles;

  let partial = false;
  if (interval === '1d') {
    partial = market.currentSession === last.time;
  } else if (interval === '1wk') {
    const weekEnd = addDays(last.time, 6);
    const todayKey = market.currentSession ?? market.lastSession;
    const inThisWeek = todayKey >= last.time && todayKey <= weekEnd;
    const weekFinished = market.currentSession === null && nextTradingDay(market.lastSession, holidays) > weekEnd;
    partial = (market.currentSession !== null && inThisWeek) || (inThisWeek && !weekFinished);
  }
  if (partial) last.partial = true;
  return candles;
}
