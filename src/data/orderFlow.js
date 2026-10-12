// Liquidity and order-flow figures. Liquidity comes from traded history; order-flow figures come from
// the exchange depth feed, which only exists while the market is open and the broker stream is
// connected. Anything worked out here from depth levels is labelled calculated, and is a snapshot of
// resting orders, not a forecast.
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export const LIQUIDITY_TIERS = [
  { id: 'high', label: 'High', minTurnoverCr: 100 },
  { id: 'medium', label: 'Medium', minTurnoverCr: 20 },
  { id: 'low', label: 'Low', minTurnoverCr: 5 },
  { id: 'thin', label: 'Thin', minTurnoverCr: 0 },
];

export function liquidityTier(turnoverCr) {
  if (!isNum(turnoverCr)) return null;
  return LIQUIDITY_TIERS.find((t) => turnoverCr >= t.minTurnoverCr) ?? LIQUIDITY_TIERS.at(-1);
}

/** Stocks ranked by 20-day average turnover (price x volume), with their tier and daily range. */
export function liquidityList(rows, limit = 50) {
  return rows
    .filter((r) => r.metrics && isNum(r.metrics.turnoverCr))
    .map((r) => ({ symbol: r.symbol, name: r.name, sector: r.sector, indices: r.indices, price: r.metrics.price, turnoverCr: r.metrics.turnoverCr, atrPct: r.metrics.atrPct, tier: liquidityTier(r.metrics.turnoverCr) }))
    .sort((a, b) => b.turnoverCr - a.turnoverCr || a.symbol.localeCompare(b.symbol))
    .slice(0, limit);
}

/**
 * Figures from depth levels ([{ bidPrice, bidQty, askPrice, askQty }], best first).
 *   spread / spreadPct   best ask minus best bid
 *   bidQty / askQty      total resting quantity across the visible levels
 *   imbalance            (bidQty - askQty) / (bidQty + askQty), from -1 (all asks) to +1 (all bids)
 * Returns null when there is no usable top of book.
 */
export function depthStats(levels) {
  const top = levels?.[0];
  if (!top || !(top.bidPrice > 0) || !(top.askPrice > 0)) return null;
  const sum = (key) => levels.reduce((s, l) => s + (isNum(l[key]) ? l[key] : 0), 0);
  const bidQty = sum('bidQty');
  const askQty = sum('askQty');
  const mid = (top.bidPrice + top.askPrice) / 2;
  return {
    bestBid: top.bidPrice,
    bestAsk: top.askPrice,
    spread: Math.round((top.askPrice - top.bidPrice) * 1e4) / 1e4,
    spreadPct: ((top.askPrice - top.bidPrice) / mid) * 100,
    bidQty,
    askQty,
    imbalance: bidQty + askQty > 0 ? (bidQty - askQty) / (bidQty + askQty) : null,
    levels: levels.length,
  };
}
