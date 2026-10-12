// Average buy price per stock, typed in by the user and saved in this browser only. ICICI's holdings feed carries
// quantity but no cost, so without this the app can show value and day change but never profit or loss.
export const COST_KEY = 'stockpulse.portfolio.cost.v1';
export const MAX_COSTS = 300;
const SYMBOL = /^[A-Z0-9&.-]{1,20}$/;

/** Keep only plausible { SYMBOL: price } entries from untrusted stored data. */
export function sanitizeCosts(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [symbol, price] of Object.entries(raw)) {
    if (Object.keys(out).length >= MAX_COSTS) break;
    if (SYMBOL.test(symbol) && typeof price === 'number' && Number.isFinite(price) && price > 0) out[symbol] = price;
  }
  return out;
}

export function loadCosts(storage) {
  try {
    return sanitizeCosts(JSON.parse(storage.getItem(COST_KEY)));
  } catch {
    return {};
  }
}

export function saveCosts(costs, storage) {
  try {
    storage.setItem(COST_KEY, JSON.stringify(sanitizeCosts(costs)));
    return true;
  } catch {
    return false;
  }
}

/** New map with the price set, or removed when `price` is blank or not a positive number. Invalid symbols are ignored. */
export function setCost(costs, symbol, price) {
  const next = { ...costs };
  const n = typeof price === 'string' ? Number(price.replace(/,/g, '')) : price;
  if (!SYMBOL.test(symbol)) return costs;
  if (typeof n === 'number' && Number.isFinite(n) && n > 0) next[symbol] = n;
  else delete next[symbol];
  return next;
}
