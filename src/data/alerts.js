/**
 * Price alerts (pure logic).
 *
 * Semantics
 * - An alert watches one symbol's last price against a level, with a direction:
 *     above: fires when the price crosses UP to the level  (previous < level <= current)
 *     below: fires when the price crosses DOWN to the level (previous > level >= current)
 * - "Previous" is the last price this alert observed (`lastPrice`). A new alert starts with the
 *   price at creation, so it can only fire on a later move, and creation is refused when the
 *   price is already beyond the level. A paused or re-armed alert has no previous price and
 *   simply records the next one before it can fire (no instant refire, no firing on stale state).
 * - A gap between two observations counts as a crossing (the app may be closed overnight).
 * - An alert fires once. It stays TRIGGERED (kept as history, with time and price) until re-armed.
 * - Alerts are only evaluated against quotes whose status is LIVE or DELAYED. They are checked
 *   whenever fresh quotes arrive in this browser tab; nothing runs while the app is closed.
 */
export const ALERT_TYPES = ['above', 'below'];
export const ALERT_STATUSES = ['active', 'paused', 'triggered'];
export const MAX_ALERTS = 100;

const EVALUABLE_STATUSES = new Set(['LIVE', 'DELAYED']);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function isEvaluableStatus(status) {
  return EVALUABLE_STATUSES.has(status);
}

/** Describe the condition for display, e.g. "Price rises to ₹1,500.00 or above". */
export function describeAlert(alert) {
  const level = `₹${alert.threshold.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return alert.type === 'above' ? `Rises to ${level} or above` : `Falls to ${level} or below`;
}

/** Validate input and build a new active alert, or return { error }. */
export function createAlert({ symbol, type, threshold }, currentPrice, { id, now }) {
  if (typeof symbol !== 'string' || symbol.trim() === '') return { error: 'Choose a stock' };
  if (!ALERT_TYPES.includes(type)) return { error: 'Choose a condition' };
  if (!isNum(threshold) || threshold <= 0) return { error: 'Enter a price greater than 0' };
  if (!isNum(currentPrice)) return { error: 'No current price for this stock yet' };
  if (type === 'above' && currentPrice >= threshold) {
    return { error: `Price is already at or above ₹${threshold}. Choose a higher level.` };
  }
  if (type === 'below' && currentPrice <= threshold) {
    return { error: `Price is already at or below ₹${threshold}. Choose a lower level.` };
  }
  return {
    alert: {
      id,
      symbol: symbol.trim().toUpperCase(),
      type,
      threshold,
      status: 'active',
      createdAt: now,
      lastPrice: currentPrice,
      triggeredAt: null,
      triggeredPrice: null,
      triggerCount: 0,
    },
  };
}

function crossed(alert, price) {
  if (alert.type === 'above') return alert.lastPrice < alert.threshold && price >= alert.threshold;
  return alert.lastPrice > alert.threshold && price <= alert.threshold;
}

/**
 * Evaluate active alerts against the latest quotes. Returns new alert objects (inputs are not
 * mutated), the alerts that fired this round, and whether anything changed.
 */
export function evaluateAlerts(alerts, quotes, nowIso) {
  const prices = new Map();
  for (const q of quotes || []) if (isNum(q?.price)) prices.set(q.symbol, q.price);

  const fired = [];
  let changed = false;
  const next = alerts.map((alert) => {
    if (alert.status !== 'active') return alert;
    const price = prices.get(alert.symbol);
    if (price === undefined) return alert;

    if (alert.lastPrice === null) {
      changed = true;
      return { ...alert, lastPrice: price };
    }
    if (crossed(alert, price)) {
      changed = true;
      fired.push({ id: alert.id, symbol: alert.symbol, type: alert.type, threshold: alert.threshold, price });
      return {
        ...alert,
        status: 'triggered',
        triggeredAt: nowIso,
        triggeredPrice: price,
        triggerCount: alert.triggerCount + 1,
        lastPrice: price,
      };
    }
    if (price !== alert.lastPrice) {
      changed = true;
      return { ...alert, lastPrice: price };
    }
    return alert;
  });

  return { alerts: next, fired, changed };
}

/** Pause an active alert. Triggered alerts stay as they are. */
export function pauseAlert(alert) {
  return alert.status === 'active' ? { ...alert, status: 'paused' } : alert;
}

/** Resume a paused alert or re-arm a triggered one; the next observed price becomes its baseline. */
export function activateAlert(alert) {
  return alert.status === 'active' ? alert : { ...alert, status: 'active', lastPrice: null };
}
