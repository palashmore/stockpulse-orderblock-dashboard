import { useState, useRef, useEffect, useCallback } from 'react';
import {
  createAlert,
  evaluateAlerts,
  pauseAlert,
  activateAlert,
  isEvaluableStatus,
  describeAlert,
  MAX_ALERTS,
} from '../data/alerts';
import { loadAlerts, saveAlerts } from '../data/alertStore';

const MAX_RECENT = 20;

const notificationsSupported = () => typeof Notification !== 'undefined';
const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

/**
 * Alerts stored in localStorage and evaluated whenever fresh Nifty 50 quotes arrive in this tab.
 * Evaluation is skipped unless the quotes are LIVE or DELAYED (never stale, historical or simulated).
 */
export function useAlerts(nifty) {
  const [alerts, setAlerts] = useState(() => loadAlerts(window.localStorage));
  const [recent, setRecent] = useState([]);
  const [saveFailed, setSaveFailed] = useState(false);
  const [permission, setPermission] = useState(() => (notificationsSupported() ? Notification.permission : 'unsupported'));
  const alertsRef = useRef(alerts);

  const commit = useCallback((next) => {
    alertsRef.current = next;
    setAlerts(next);
    setSaveFailed(!saveAlerts(next, window.localStorage));
  }, []);

  const { quotes, status, failed } = nifty;
  const evaluating = isEvaluableStatus(status) && !failed;

  useEffect(() => {
    if (!evaluating || quotes.length === 0) return;
    const nowIso = new Date().toISOString();
    const result = evaluateAlerts(alertsRef.current, quotes, nowIso);
    if (result.changed) commit(result.alerts);
    if (result.fired.length === 0) return;

    setRecent((prev) => [...result.fired.map((f) => ({ ...f, at: nowIso })), ...prev].slice(0, MAX_RECENT));
    if (notificationsSupported() && Notification.permission === 'granted') {
      for (const f of result.fired) {
        try {
          new Notification(`${f.symbol} alert`, {
            body: `${describeAlert(f)}. Last price ₹${f.price.toFixed(2)} (data may be delayed).`,
          });
        } catch {
          // Notification construction can throw on some platforms; the in-app list still shows it
        }
      }
    }
  }, [quotes, evaluating, commit]);

  const addAlert = useCallback((input) => {
    if (alertsRef.current.length >= MAX_ALERTS) return { error: `You can keep up to ${MAX_ALERTS} alerts` };
    const quote = quotes.find((q) => q.symbol === input.symbol);
    const result = createAlert(input, quote?.price, { id: newId(), now: new Date().toISOString() });
    if (result.alert) commit([result.alert, ...alertsRef.current]);
    return result;
  }, [quotes, commit]);

  const mapAlert = useCallback((id, fn) => {
    commit(alertsRef.current.map((a) => (a.id === id ? fn(a) : a)));
  }, [commit]);

  const removeAlert = useCallback((id) => commit(alertsRef.current.filter((a) => a.id !== id)), [commit]);
  const pause = useCallback((id) => mapAlert(id, pauseAlert), [mapAlert]);
  const activate = useCallback((id) => mapAlert(id, activateAlert), [mapAlert]);

  const requestNotifications = useCallback(async () => {
    if (!notificationsSupported()) return;
    setPermission(await Notification.requestPermission());
  }, []);

  return { alerts, recent, evaluating, saveFailed, permission, addAlert, removeAlert, pause, activate, requestNotifications };
}
