import { ALERT_TYPES, ALERT_STATUSES, MAX_ALERTS } from './alerts.js';

export const STORAGE_KEY = 'stockpulse.alerts.v1';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Keep only well-formed alerts from untrusted stored data, filling optional fields. */
function sanitize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || typeof raw.symbol !== 'string' || raw.symbol === '') return null;
  if (!ALERT_TYPES.includes(raw.type) || !ALERT_STATUSES.includes(raw.status)) return null;
  if (!isNum(raw.threshold) || raw.threshold <= 0) return null;
  return {
    id: raw.id,
    symbol: raw.symbol,
    type: raw.type,
    threshold: raw.threshold,
    status: raw.status,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : null,
    lastPrice: isNum(raw.lastPrice) ? raw.lastPrice : null,
    triggeredAt: typeof raw.triggeredAt === 'string' ? raw.triggeredAt : null,
    triggeredPrice: isNum(raw.triggeredPrice) ? raw.triggeredPrice : null,
    triggerCount: Number.isInteger(raw.triggerCount) && raw.triggerCount >= 0 ? raw.triggerCount : 0,
  };
}

/** Load saved alerts. Corrupt or unavailable storage yields an empty list, never an exception. */
export function loadAlerts(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY));
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitize).filter(Boolean).slice(0, MAX_ALERTS);
  } catch {
    return [];
  }
}

/** Save alerts; returns false when storage is full or blocked. */
export function saveAlerts(alerts, storage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(alerts));
    return true;
  } catch {
    return false;
  }
}
