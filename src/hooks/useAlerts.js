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
import { unseenEvents, eventLine, eventTitle } from '../data/serverAlerts';
import {
  fetchServerAlerts,
  createServerAlert,
  deleteServerAlert,
  pauseServerAlert,
  activateServerAlert,
  importServerAlerts,
  checkServerAlertsNow,
  testAlertNotification,
  saveFeedAlertSettings,
} from '../services/api';

const MAX_RECENT = 20;
const SERVER_POLL_MS = 15_000;

const notificationsSupported = () => typeof Notification !== 'undefined';
const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

function showNotification(title, body) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body });
  } catch {
    // Notification construction can throw on some platforms; the in-app list still shows it
  }
}

/**
 * Alerts kept in this browser and evaluated whenever fresh Nifty 50 quotes arrive in this tab.
 * Used only when the server's alert service is not available (it never runs together with it).
 * Evaluation is skipped unless the quotes are LIVE or DELAYED (never stale, historical or simulated).
 */
function useBrowserAlerts(nifty, enabled) {
  const [alerts, setAlerts] = useState(() => loadAlerts(window.localStorage));
  const [recent, setRecent] = useState([]);
  const [saveFailed, setSaveFailed] = useState(false);
  const alertsRef = useRef(alerts);

  const commit = useCallback((next) => {
    alertsRef.current = next;
    setAlerts(next);
    setSaveFailed(!saveAlerts(next, window.localStorage));
  }, []);

  const { quotes, status, failed } = nifty;
  const evaluating = enabled && isEvaluableStatus(status) && !failed;

  useEffect(() => {
    if (!evaluating || quotes.length === 0) return;
    const nowIso = new Date().toISOString();
    const result = evaluateAlerts(alertsRef.current, quotes, nowIso);
    if (result.changed) commit(result.alerts);
    if (result.fired.length === 0) return;

    setRecent((prev) => [...result.fired.map((f) => ({ ...f, at: nowIso })), ...prev].slice(0, MAX_RECENT));
    for (const f of result.fired) {
      showNotification(`${f.symbol} alert`, `${describeAlert(f)}. Last price ₹${f.price.toFixed(2)} (data may be delayed).`);
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
  const clear = useCallback(() => commit([]), [commit]);

  return { alerts, recent, evaluating, saveFailed, addAlert, removeAlert, pause, activate, clear, alertsRef };
}

/**
 * Alerts kept and checked by the server (so they work with the browser closed). This hook only mirrors the
 * server's list, refreshing every few seconds, and raises a browser notification for events it has not seen.
 * `mode` is "checking" until the first answer, "server" when the service answered, "local" when it did not
 * (server down, or the page is opened from another device: the service answers on the server machine only).
 */
function useServerAlerts() {
  const [view, setView] = useState({ mode: 'checking', alerts: [], events: [], engine: null, offline: false });
  const seen = useRef(null); // ids of events already shown; null until the first load so history is not re-announced

  const apply = useCallback((body) => {
    const events = body.events ?? [];
    if (seen.current === null) {
      seen.current = new Set(events.map((e) => e.id));
    } else {
      for (const e of unseenEvents(events, seen.current).reverse()) {
        seen.current.add(e.id);
        showNotification(eventTitle(e), e.kind === 'price' ? `${eventLine(e)}. This is a price level being reached, not advice.` : eventLine(e));
      }
    }
    setView({ mode: 'server', alerts: body.alerts ?? [], events, engine: body.engine ?? null, offline: false });
  }, []);

  const refresh = useCallback(async () => {
    const result = await fetchServerAlerts();
    if (result.ok) apply(result.body);
    else setView((v) => (v.mode === 'server' ? { ...v, offline: true } : { ...v, mode: 'local' }));
  }, [apply]);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const timer = setInterval(() => { if (!document.hidden) refresh(); }, SERVER_POLL_MS);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [refresh]);

  const act = useCallback(async (promise) => {
    const result = await promise;
    if (result.ok && result.body.alerts) apply(result.body);
    else if (result.ok) await refresh();
    return result;
  }, [apply, refresh]);

  const addAlert = useCallback(async (input) => {
    const result = await act(createServerAlert(input));
    return result.ok ? { alert: result.body.alert } : { error: result.body.error || 'The server refused the alert' };
  }, [act]);

  return {
    view,
    refresh,
    addAlert,
    removeAlert: (id) => act(deleteServerAlert(id)),
    pause: (id) => act(pauseServerAlert(id)),
    activate: (id) => act(activateServerAlert(id)),
    checkNow: () => act(checkServerAlertsNow()),
    sendTest: () => testAlertNotification(),
    saveFeed: (settings) => act(saveFeedAlertSettings(settings)),
    importFrom: async (list) => {
      const result = await importServerAlerts(list);
      if (result.ok) await refresh();
      return result;
    },
  };
}

/**
 * Price alerts. Preferred: the server checks them on a timer (works with the browser closed, optional push to
 * a phone). Fallback: browser-only alerts that run while this tab is open.
 */
export function useAlerts(nifty) {
  const server = useServerAlerts();
  const mode = server.view.mode;
  const browser = useBrowserAlerts(nifty, mode === 'local');
  const [permission, setPermission] = useState(() => (notificationsSupported() ? Notification.permission : 'unsupported'));

  const requestNotifications = useCallback(async () => {
    if (!notificationsSupported()) return;
    setPermission(await Notification.requestPermission());
  }, []);

  const migrate = useCallback(async () => {
    const result = await server.importFrom(browser.alertsRef.current);
    if (result.ok) browser.clear();
    return result;
  }, [server, browser]);

  if (mode === 'server') {
    return {
      mode,
      alerts: server.view.alerts,
      events: server.view.events,
      engine: server.view.engine,
      offline: server.view.offline,
      recent: [],
      evaluating: !server.view.offline,
      saveFailed: Boolean(server.view.engine?.saveFailed),
      permission,
      browserAlertCount: browser.alerts.length,
      addAlert: server.addAlert,
      removeAlert: server.removeAlert,
      pause: server.pause,
      activate: server.activate,
      checkNow: server.checkNow,
      sendTest: server.sendTest,
      saveFeed: server.saveFeed,
      migrate,
      requestNotifications,
    };
  }

  return {
    mode,
    alerts: browser.alerts,
    events: [],
    engine: null,
    offline: false,
    recent: browser.recent,
    evaluating: browser.evaluating,
    saveFailed: browser.saveFailed,
    permission,
    browserAlertCount: 0,
    addAlert: browser.addAlert,
    removeAlert: browser.removeAlert,
    pause: browser.pause,
    activate: browser.activate,
    requestNotifications,
  };
}
