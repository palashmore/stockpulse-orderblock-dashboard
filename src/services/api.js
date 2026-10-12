const API_BASE = 'http://localhost:3001/api';

// Helper to make API calls with timeout and error handling
async function apiFetch(endpoint, options = {}) {
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
    return await response.json();
  } catch (error) {
    clearTimeout(timeout);
    console.warn(`API call failed for ${endpoint}:`, error.message);
    return null;
  }
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

// Get historical candle data
export async function fetchHistory(symbol, range = '6mo', interval = '1d') {
  const data = await apiFetch(
    `/history/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`
  );
  return data?.candles || null;
}

// Get options chain data
export async function fetchOptions(symbol) {
  return await apiFetch(`/options/${encodeURIComponent(symbol)}`);
}

// Get all Nifty 50 quotes
export async function fetchNifty50() {
  return await apiFetch('/nifty50');
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
