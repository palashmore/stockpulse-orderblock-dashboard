import { createLoadCache } from '../data/loadCache';

// The API lives on port 3001 of whatever host served this page, so the app also works when opened from a
// phone on the same network. VITE_API_BASE overrides it (for example for a hosted server).
export function resolveApiBase(env = {}, location = null) {
  if (env.VITE_API_BASE) return String(env.VITE_API_BASE).replace(/\/$/, '');
  if (location && /^https?:$/.test(location.protocol) && location.hostname) return `${location.protocol}//${location.hostname}:3001/api`;
  return 'http://localhost:3001/api';
}

export const API_BASE = resolveApiBase(import.meta.env, typeof window !== 'undefined' ? window.location : null);

/** How long to wait after a 429: the server's Retry-After seconds, capped, or 5 s when it gave none. */
export function retryDelayMs(value, maxSeconds = 20) {
  const seconds = Number(value);
  return (Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, maxSeconds) : 5) * 1000;
}

// Read-only market data is kept for a short time and shared: opening another screen that needs the same data (or the same
// screen again) gets it at once instead of waiting for a new request, and two screens asking at the same moment share one
// request. A failed request is remembered for only a few seconds, so a retry is quick. `force` skips the stored copy.
const responses = createLoadCache({ ttlMs: 60_000, failTtlMs: 3_000, max: 600 });
export const clearApiCache = () => responses.clear();

const TTL = {
  quotes: 20_000,
  nifty50: 20_000,
  levels: 30_000,
  historyDaily: 3 * 60_000,
  historyIntraday: 45_000,
  menus: 10 * 60_000,
  marketStatus: 15_000,
};

async function cachedRequest(endpoint, ttlMs, { force = false, ...options } = {}) {
  if (force) responses.clear(endpoint);
  return responses.get(endpoint, () => apiRequest(endpoint, options), undefined, ttlMs);
}

// Helper to make API calls with timeout and error handling.
// Resolves to { data, headers } on success, null on any failure.
async function apiRequest(endpoint, { retried = false, ...options } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    // The server is busy, not broken: wait as long as it asks (once) instead of reporting "no data"
    if (response.status === 429 && !retried) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs(response.headers.get('retry-after'))));
      return apiRequest(endpoint, { ...options, retried: true });
    }
    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }
    return { data: await response.json(), headers: response.headers };
  } catch (error) {
    clearTimeout(timeout);
    console.warn(`API call failed for ${endpoint}:`, error.message);
    return null;
  }
}

async function apiFetch(endpoint, options) {
  const result = await apiRequest(endpoint, options);
  return result ? result.data : null;
}

// Check if backend is available
export async function checkBackendHealth() {
  try {
    const result = await apiFetch('/health');
    return result?.status === 'ok';
  } catch {
    return false;
  }
}

// Get real-time quote
export async function fetchQuote(symbol) {
  return await apiFetch(`/quote/${encodeURIComponent(symbol)}`);
}

// Get historical candle data: { candles, dataStatus, asOf, provider, ... }
export async function fetchHistory(symbol, range = '6mo', interval = '1d', { bulk = false, force = false } = {}) {
  const result = await cachedRequest(
    `/history/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}${bulk ? '&bulk=1' : ''}`,
    interval === '1d' || interval === '1wk' ? TTL.historyDaily : TTL.historyIntraday,
    { force },
  );
  const data = result ? result.data : null;
  return data?.candles?.length ? data : null;
}

// Get options chain data
export async function fetchOptions(symbol) {
  return await apiFetch(`/options/${encodeURIComponent(symbol)}`);
}

// Get all Nifty 50 quotes: { quotes, dataStatus, asOf, staleAgeSec } (status comes from response headers)
export async function fetchNifty50({ force = false } = {}) {
  const result = await cachedRequest('/nifty50', TTL.nifty50, { force });
  if (!result || !Array.isArray(result.data)) return null;
  const { headers } = result;
  return {
    quotes: result.data,
    dataStatus: headers.get('x-data-status'),
    asOf: headers.get('x-data-as-of'),
    staleAgeSec: Number(headers.get('x-data-stale-age-sec')) || null,
  };
}

// Search stocks
export async function searchStocks(query) {
  if (!query || query.length < 1) return [];
  const results = await apiFetch(`/search?q=${encodeURIComponent(query)}`);
  return results || [];
}

// Get market status
export async function fetchMarketStatus() {
  const result = await cachedRequest('/market-status', TTL.marketStatus);
  return result ? result.data : null;
}

// Broker sign-in (server runs on this machine; these calls are loopback-only)
// Resolves the status, { remote: true } when the server refused because this page is not on the server's own machine
// (a hosted copy), or null when the server cannot be reached.
export async function fetchAuthStatus() {
  try {
    const response = await fetch(`${API_BASE}/auth/status`, { cache: 'no-store', headers: accountHeaders(), signal: AbortSignal.timeout(10000) });
    if (response.status === 403) return { remote: true };
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

// Resolves { connected } on success or { connected: false, error } with the server's reason
// On a hosted copy the server keeps no broker session: it hands the session token to this browser tab, which sends it with each
// account request. It lives in sessionStorage (cleared when the tab closes, and never sent anywhere but this app's own API).
export const SESSION_KEY = 'stockpulse.breeze.session';
export function getBrokerSession(storage = typeof window !== 'undefined' ? window.sessionStorage : null) {
  try { return storage?.getItem(SESSION_KEY) || null; } catch { return null; }
}
export function setBrokerSession(token, storage = typeof window !== 'undefined' ? window.sessionStorage : null) {
  try {
    if (token) storage?.setItem(SESSION_KEY, token);
    else storage?.removeItem(SESSION_KEY);
  } catch { /* storage blocked: sign-in lasts until reload */ }
}
const accountHeaders = (extra = {}) => {
  const token = getBrokerSession();
  return token ? { ...extra, 'X-Breeze-Session': token } : extra;
};
// A refusal that means the stored token is no longer good: forget it so the sign-in box comes back
const dropExpiredSession = (message) => { if (/session expired|sign in again/i.test(String(message ?? ''))) setBrokerSession(null); };

export async function submitBrokerSession(session) {
  try {
    const response = await fetch(`${API_BASE}/auth/breeze/session`, {
      method: 'POST',
      headers: accountHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ session }),
    });
    const result = await response.json();
    if (result.sessionToken) {
      setBrokerSession(result.sessionToken);
      delete result.sessionToken;
    }
    return result;
  } catch {
    return { connected: false, error: 'Could not reach the server' };
  }
}

export async function disconnectBroker() {
  setBrokerSession(null);
  return await apiFetch('/auth/breeze/disconnect', { method: 'POST' });
}

// Read-only ICICI Direct holdings (loopback-only on the server). Resolves the portfolio or { error }.
export async function fetchPortfolio() {
  try {
    const response = await fetch(`${API_BASE}/portfolio`, { cache: 'no-store', headers: accountHeaders() });
    const body = await response.json();
    if (!response.ok) dropExpiredSession(body.error);
    return response.ok ? body : { error: body.error || `Request failed (${response.status})` };
  } catch {
    return { error: 'Could not reach the server' };
  }
}

// Server health, broker request budget and live-stream status (loopback-only on the server)
// Resolves the diagnostics, { remote: true } when the server refuses because this page is not on its own machine, or null when unreachable.
export async function fetchDiagnostics() {
  try {
    const response = await fetch(`${API_BASE}/diagnostics`, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (response.status === 403) return { remote: true };
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

// Read-only broker books (loopback-only on the server). Resolves the response body, or { error }.
export async function fetchBroker(path) {
  try {
    const response = await fetch(`${API_BASE}/broker${path}`, { cache: 'no-store', headers: accountHeaders() });
    const body = await response.json();
    if (!response.ok) dropExpiredSession(body.error);
    return response.ok ? body : { error: body.error || `Request failed (${response.status})` };
  } catch {
    return { error: 'Could not reach the server' };
  }
}

// Index lists (Nifty 50, Midcap, Smallcap, sectors...) and quotes for any list of symbols
export async function fetchIndices() {
  const result = await cachedRequest('/indices', TTL.menus);
  return result ? result.data : null;
}

export async function fetchIndexStocks(id) {
  const data = await apiFetch(`/indices/${encodeURIComponent(id)}`);
  return data?.stocks ? data : null;
}

// Resolves { quotes, missing, dataStatus, asOf, provider } or null. Symbols are sent in requests of up to 250.
export async function fetchQuotes(symbols, { force = false } = {}) {
  const unique = [...new Set(symbols)];
  const parts = [];
  for (let i = 0; i < unique.length; i += 250) {
    const result = await cachedRequest(`/quotes?symbols=${unique.slice(i, i + 250).map(encodeURIComponent).join(',')}`, TTL.quotes, { force });
    const part = result ? result.data : null;
    if (!part) return parts.length ? mergeQuoteParts(parts) : null;
    parts.push(part);
  }
  return parts.length ? mergeQuoteParts(parts) : null;
}

function mergeQuoteParts(parts) {
  const order = ['UNAVAILABLE', 'STALE', 'SIMULATED', 'HISTORICAL', 'MARKET_CLOSED', 'DELAYED', 'LIVE'];
  const worst = parts.map((p) => p.dataStatus).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
  return {
    quotes: parts.flatMap((p) => p.quotes),
    missing: parts.flatMap((p) => p.missing ?? []),
    dataStatus: worst,
    asOf: parts.map((p) => p.asOf).filter(Boolean).sort().at(-1) ?? null,
    fetchedAt: parts.map((p) => p.fetchedAt).filter(Boolean).sort().at(0) ?? null, // the oldest part decides how fresh the whole is
    provider: parts[0].provider,
    partial: parts.length > 1 && parts.some((p) => p.dataStatus !== parts[0].dataStatus),
  };
}

// Depth for up to 10 symbols (broker live feed). Resolves { depths: [...] } or null.
export async function fetchDepths(symbols) {
  return await apiFetch(`/depth?symbols=${symbols.map(encodeURIComponent).join(',')}`);
}

// Server-side alerts (loopback-only on the server). Every call resolves { ok, status, body } where body is the
// parsed response (or { error } when the server could not be reached), so callers can tell "not available here"
// (403) from "request refused" (400) from "server down".
async function alertsRequest(method, path, payload) {
  try {
    const response = await fetch(`${API_BASE}/alerts${path}`, {
      method,
      cache: 'no-store',
      headers: payload === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  } catch {
    return { ok: false, status: 0, body: { error: 'Could not reach the server' } };
  }
}

export const fetchServerAlerts = () => alertsRequest('GET', '');
export const createServerAlert = (input) => alertsRequest('POST', '', input);
export const deleteServerAlert = (id) => alertsRequest('DELETE', `/${encodeURIComponent(id)}`);
export const pauseServerAlert = (id) => alertsRequest('POST', `/${encodeURIComponent(id)}/pause`);
export const activateServerAlert = (id) => alertsRequest('POST', `/${encodeURIComponent(id)}/activate`);
export const importServerAlerts = (alerts) => alertsRequest('POST', '/import', { alerts });
export const checkServerAlertsNow = () => alertsRequest('POST', '/check');
export const testAlertNotification = () => alertsRequest('POST', '/test-notification');
export const saveFeedAlertSettings = (settings) => alertsRequest('POST', '/feed-settings', settings);

// Mainboard IPOs from NSE's public feeds (through the server). Resolves { ok: true, ipos, todayKey, calendar,
// dataStatus, provider, fetchedAt, staleAgeSec } or { ok: false, error }. The first load makes several NSE calls, so allow longer.
export async function fetchIpos() {
  try {
    const response = await fetch(`${API_BASE}/ipos`, { cache: 'no-store', signal: AbortSignal.timeout(40000) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(body.ipos)) return { ok: false, error: body.message || body.error || `Request failed (${response.status})` };
    return { ok: true, ...body };
  } catch {
    return { ok: false, error: 'Could not reach the server' };
  }
}

// Level and day change of the configured NSE indices. Resolves { indices, missing, dataStatus, asOf, fetchedAt } or null.
export async function fetchIndexLevels({ force = false } = {}) {
  const result = await cachedRequest('/index-levels', TTL.levels, { force });
  return result ? result.data : null;
}
