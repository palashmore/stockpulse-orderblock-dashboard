// Portfolio summary built from ICICI Direct's read-only demat holdings, funds and live quotes.
// Holdings carry quantity only (no buy price), so profit/loss versus cost cannot be computed:
// this reports current value and today's change, never an invented gain or loss.
const num = (v) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const round2 = (n) => (n === null ? null : Math.round(n * 100) / 100);

/** Last four digits of the bank account, or null. The full number is never sent to the browser. */
export function maskAccount(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}

/** Funds as numbers, using the API's own field names. */
export function mapFunds(raw) {
  if (!raw) return null;
  return {
    bankAccountLast4: maskAccount(raw.bank_account),
    totalBankBalance: num(raw.total_bank_balance),
    allocatedEquity: num(raw.allocated_equity),
    allocatedFno: num(raw.allocated_fno),
    blockedByTrade: num(raw.block_by_trade_balance),
    unallocatedBalance: num(raw.unallocated_balance),
  };
}

/**
 * Join raw demat holdings with names and quotes.
 *   master      { byCode, byIsin } from the ICICI security master, or null
 *   niftyByCode ICICI code -> NSE symbol for the built-in Nifty 50 (fallback when master is missing)
 *   quotes      Map of ICICI code -> { price, previousClose } for holdings that could be priced
 * Holdings with zero quantity are dropped. A holding with no price keeps value null and is counted
 * in totals.unpriced rather than being valued at 0.
 */
export function buildPortfolio(rawHoldings, { master = null, niftyByCode = {}, quotes = new Map() } = {}) {
  const holdings = [];
  for (const h of rawHoldings || []) {
    const quantity = num(h.quantity);
    if (!(quantity > 0)) continue;
    const code = String(h.stock_code ?? '').trim();
    const isin = String(h.stock_ISIN ?? '').trim() || null;
    const info = (isin && master?.byIsin.get(isin)) || master?.byCode.get(code) || null;
    const symbol = info?.symbol ?? niftyByCode[code] ?? null;
    const q = quotes.get(code);
    const price = num(q?.price);
    const previousClose = num(q?.previousClose);
    holdings.push({
      code,
      symbol,
      name: info?.name ?? symbol ?? code,
      isin,
      quantity,
      availableQuantity: num(h.demat_avail_quantity),
      price,
      previousClose,
      value: price === null ? null : round2(price * quantity),
      dayChange: price === null || previousClose === null ? null : round2((price - previousClose) * quantity),
      dayChangePct: price === null || !(previousClose > 0) ? null : round2(((price - previousClose) / previousClose) * 100),
    });
  }

  const priced = holdings.filter((h) => h.value !== null);
  const totalValue = priced.reduce((s, h) => s + h.value, 0);
  const withChange = holdings.filter((h) => h.dayChange !== null);
  const dayChange = withChange.reduce((s, h) => s + h.dayChange, 0);
  const previousValue = withChange.reduce((s, h) => s + h.previousClose * h.quantity, 0);

  for (const h of holdings) h.weightPct = h.value === null || totalValue <= 0 ? null : round2((h.value / totalValue) * 100);
  holdings.sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || a.name.localeCompare(b.name));

  return {
    holdings,
    totals: {
      value: round2(totalValue),
      dayChange: round2(dayChange),
      dayChangePct: previousValue > 0 ? round2((dayChange / previousValue) * 100) : null,
      count: holdings.length,
      unpriced: holdings.length - priced.length,
    },
  };
}
