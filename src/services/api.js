export const API_BASE = 'http://localhost:3001/api';

// Helper to make API calls with timeout and error handling.
// Resolves to { data, headers } on success, null on any failure.
async function apiRequest(endpoint, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeout);
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
export async function fetchHistory(symbol, range = '6mo', interval = '1d', { bulk = false } = {}) {
  const data = await apiFetch(
    `/history/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}${bulk ? '&bulk=1' : ''}`
  );
  return data?.candles?.length ? data : null;
}

// Get options chain data
export async function fetchOptions(symbol) {
  return await apiFetch(`/options/${encodeURIComponent(symbol)}`);
}

// Get all Nifty 50 quotes: { quotes, dataStatus, asOf, staleAgeSec } (status comes from response headers)
export async function fetchNifty50() {
  const result = await apiRequest('/nifty50');
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
  return await apiFetch('/market-status');
}

// Broker sign-in (server runs on this machine; these calls are loopback-only)
export async function fetchAuthStatus() {
  return await apiFetch('/auth/status');
}

// Resolves { connected } on success or { connected: false, error } with the server's reason
export async function submitBrokerSession(session) {
  try {
    const response = await fetch(`${API_BASE}/auth/breeze/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session }),
    });
    return await response.json();
  } catch {
    return { connected: false, error: 'Could not reach the server' };
  }
}

export async function disconnectBroker() {
  return await apiFetch('/auth/breeze/disconnect', { method: 'POST' });
}

// Read-only ICICI Direct holdings (loopback-only on the server). Resolves the portfolio or { error }.
export async function fetchPortfolio() {
  try {
    const response = await fetch(`${API_BASE}/portfolio`, { cache: 'no-store' });
    const body = await response.json();
    return response.ok ? body : { error: body.error || `Request failed (${response.status})` };
  } catch {
    return { error: 'Could not reach the server' };
  }
}

// Server health, broker request budget and live-stream status (loopback-only on the server)
export async function fetchDiagnostics() {
  return await apiFetch('/diagnostics');
}
