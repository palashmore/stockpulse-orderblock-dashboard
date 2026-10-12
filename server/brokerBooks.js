// Read-only views of the ICICI Direct order book, trade book and positions.
// Field names follow ICICI's published Breeze documentation. Nothing is invented: a value the API did
// not send is null, and anything this app works out itself is placed under `derived` so it is never
// mistaken for a broker-reported figure.
const num = (v) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const text = (v) => (v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim());

/** True for Breeze's "nothing to show" replies, which are empty results and not failures. */
export function isEmptyResult(message) {
  return /\bno\b.*\b(available|found|records?|data|orders?|trades?|positions?)\b/i.test(String(message || ''));
}

/** Longest window the order and trade endpoints accept, per the documentation. */
export const MAX_WINDOW_DAYS = 10;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate a from/to date pair (YYYY-MM-DD). Returns { from, to } or { error }. */
export function parseWindow(from, to, todayKey) {
  const f = from || todayKey;
  const t = to || f;
  if (!DATE.test(f) || !DATE.test(t)) return { error: 'Dates must look like 2026-10-12' };
  if (f > t) return { error: 'The start date is after the end date' };
  const days = (Date.parse(`${t}T00:00:00Z`) - Date.parse(`${f}T00:00:00Z`)) / 86400000 + 1;
  if (days > MAX_WINDOW_DAYS) return { error: `ICICI allows at most ${MAX_WINDOW_DAYS} days at a time` };
  return { from: f, to: t };
}

const instrumentLabel = (r) => {
  const parts = [r.stock_code];
  if (text(r.expiry_date)) parts.push(text(r.expiry_date));
  if (text(r.strike_price) && num(r.strike_price) !== 0) parts.push(String(num(r.strike_price) ?? r.strike_price));
  if (text(r.right) && r.right !== '*') parts.push(text(r.right));
  return parts.filter(Boolean).join(' ');
};

const side = (action) => {
  const a = String(action || '').toLowerCase();
  return a === 'buy' ? 'BUY' : a === 'sell' ? 'SELL' : null;
};

/** One order-book row (GetOrderList). */
export function mapOrder(r) {
  const quantity = num(r.quantity);
  const pending = num(r.pending_quantity);
  const cancelled = num(r.cancelled_quantity);
  return {
    orderId: text(r.order_id),
    exchangeOrderId: text(r.exchange_order_id),
    exchange: text(r.exchange_code),
    symbol: text(r.stock_code),
    instrument: instrumentLabel(r),
    product: text(r.product_type),
    action: side(r.action) ?? text(r.action),
    orderType: text(r.order_type),
    validity: text(r.validity),
    quantity,
    price: num(r.price),
    stoploss: num(r.stoploss),
    averagePrice: num(r.average_price),
    pendingQuantity: pending,
    cancelledQuantity: cancelled,
    status: text(r.status),
    timestamp: text(r.order_datetime),
    remark: text(r.user_remark),
    // Filled quantity is not a field in the documented response: worked out here as total minus pending minus cancelled
    derived: { filledQuantity: quantity !== null && pending !== null ? Math.max(0, quantity - pending - (cancelled ?? 0)) : null },
  };
}

/** One trade-book row (GetTradeList). */
export function mapTrade(r) {
  return {
    orderId: text(r.order_id),
    exchange: text(r.exchange_code),
    symbol: text(r.stock_code),
    instrument: instrumentLabel(r),
    product: text(r.product_type),
    segment: text(r.segment),
    action: side(r.action) ?? text(r.action),
    orderType: text(r.order_type),
    quantity: num(r.quantity),
    averageCost: num(r.average_cost),
    tradeDate: text(r.trade_date),
    brokerage: num(r.brokerage_amount),
    taxes: num(r.total_taxes),
    ltp: num(r.ltp),
    bookType: text(r.book_type),
    expiry: text(r.expiry_date),
    right: text(r.right),
    strike: num(r.strike_price),
  };
}

/** Per-trade detail (GetTradeDetail), fetched on demand by order id. */
export function mapTradeDetail(r) {
  return {
    tradeId: text(r.trade_id),
    exchangeTradeId: text(r.exchange_trade_id),
    settlementId: text(r.settlement_id),
    exchange: text(r.exchange_code),
    symbol: text(r.stock_code),
    action: side(r.action) ?? text(r.action),
    executedQuantity: num(r.executed_quantity),
    executionPrice: num(r.execution_price),
    exchangeTradeTime: text(r.exchange_trade_time),
    brokerage: num(r.brokerage_amount),
    taxes: num(r.taxes),
    totalTransactionCost: num(r.total_transaction_cost),
  };
}

/** One open position (GetPortfolioPositions). Broker fields only; derived figures are separate. */
export function mapPosition(r) {
  const quantity = num(r.quantity);
  const averagePrice = num(r.average_price);
  const ltp = num(r.ltp);
  const action = side(r.action);
  // Unrealised P&L is worked out here, and only when the direction is explicit (Buy or Sell)
  let unrealised = null;
  if (quantity > 0 && averagePrice !== null && ltp !== null && action) {
    unrealised = (action === 'BUY' ? ltp - averagePrice : averagePrice - ltp) * quantity;
  }
  return {
    exchange: text(r.exchange_code),
    segment: text(r.segment),
    symbol: text(r.stock_code),
    instrument: instrumentLabel(r),
    product: text(r.product_type),
    action: action ?? text(r.action),
    quantity,
    averagePrice,
    ltp,
    stoplossTrigger: num(r.stoploss_trigger),
    orderId: text(r.order_id),
    derived: {
      unrealisedPnl: unrealised === null ? null : Math.round(unrealised * 100) / 100,
      marketValue: quantity !== null && ltp !== null ? Math.round(quantity * ltp * 100) / 100 : null,
    },
  };
}

const key = (t) => [t.exchange, t.symbol, t.product, t.expiry, t.right, t.strike].join('|');
const dayOf = (t) => (t.tradeDate || '').slice(0, 11);

/**
 * Realised profit on same-day round trips, from the trade book. For each instrument and day, bought
 * and sold quantities are matched using each side's average price; charges (brokerage + taxes) are
 * shared across the matched quantity. Quantity left over (an open or carried-over leg) is NOT
 * valued, because its cost or sale price comes from a different day that this window may not hold.
 * This is a local calculation, not a broker figure.
 */
export function realisedRoundTrips(trades) {
  const groups = new Map();
  for (const t of trades) {
    if ((t.action !== 'BUY' && t.action !== 'SELL') || t.quantity === null || t.averageCost === null || !(t.quantity > 0)) continue;
    const g = groups.get(`${key(t)}|${dayOf(t)}`) ?? { symbol: t.symbol, instrument: t.instrument, day: dayOf(t), buy: { q: 0, v: 0, c: 0 }, sell: { q: 0, v: 0, c: 0 } };
    const leg = t.action === 'BUY' ? g.buy : g.sell;
    leg.q += t.quantity;
    leg.v += t.quantity * t.averageCost;
    leg.c += (t.brokerage ?? 0) + (t.taxes ?? 0);
    groups.set(`${key(t)}|${dayOf(t)}`, g);
  }

  const rows = [];
  for (const g of groups.values()) {
    const matched = Math.min(g.buy.q, g.sell.q);
    if (matched <= 0) continue;
    const avgBuy = g.buy.v / g.buy.q;
    const avgSell = g.sell.v / g.sell.q;
    const gross = matched * (avgSell - avgBuy);
    const charges = g.buy.c * (matched / g.buy.q) + g.sell.c * (matched / g.sell.q);
    rows.push({
      symbol: g.symbol, instrument: g.instrument, day: g.day, matchedQuantity: matched,
      averageBuy: Math.round(avgBuy * 100) / 100, averageSell: Math.round(avgSell * 100) / 100,
      gross: Math.round(gross * 100) / 100, charges: Math.round(charges * 100) / 100, net: Math.round((gross - charges) * 100) / 100,
      unmatchedBuy: g.buy.q - matched, unmatchedSell: g.sell.q - matched,
    });
  }
  rows.sort((a, b) => a.day.localeCompare(b.day) || a.symbol.localeCompare(b.symbol));
  return {
    rows,
    totals: {
      gross: Math.round(rows.reduce((s, r) => s + r.gross, 0) * 100) / 100,
      charges: Math.round(rows.reduce((s, r) => s + r.charges, 0) * 100) / 100,
      net: Math.round(rows.reduce((s, r) => s + r.net, 0) * 100) / 100,
    },
  };
}

/** Counts of orders by status, for the summary strip. */
export function orderSummary(orders) {
  const by = {};
  for (const o of orders) by[o.status ?? 'Unknown'] = (by[o.status ?? 'Unknown'] ?? 0) + 1;
  return { total: orders.length, byStatus: by };
}

/** Best bid/ask and spread from depth levels. Returns null when there is no usable top of book. */
export function depthSummary(levels) {
  const top = levels?.[0];
  if (!top || top.bidPrice === null || top.askPrice === null || !(top.bidPrice > 0) || !(top.askPrice > 0)) return null;
  return { bestBid: top.bidPrice, bestAsk: top.askPrice, spread: Math.round((top.askPrice - top.bidPrice) * 1e4) / 1e4, spreadPct: ((top.askPrice - top.bidPrice) / top.askPrice) * 100 };
}
