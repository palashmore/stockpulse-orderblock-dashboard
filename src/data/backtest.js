// Historical simulation of the rule-based signals, with costs and slippage.
//
// Fill model (deliberately unflattering)
// - A signal is generated on a completed bar. The trade enters at the NEXT bar's open, moved against
//   you by the slippage setting. The stop and targets are the signal's own price levels; if the open
//   is already beyond the stop or beyond target 1 the trade is skipped, and the position is sized from
//   the real distance between the fill and the stop.
// - Inside a bar the order of events is unknown, so when a bar touches both the stop and a target the
//   stop is assumed to hit first. After target 1 the stop moves to the entry price, and target 2 is
//   not allowed on the same bar as target 1.
// - Gaps through the stop fill at the open, not at the stop.
// - Intraday trades are closed at the exit time; swing trades after a maximum holding period.
// - Trades still open at the end of the data are reported as open and excluded from the statistics.

export const COSTS_DEFAULTS = {
  // These rates are ASSUMPTIONS for illustration (typical Indian equity charges). Check them against
  // your own brokerage plan and contract note before relying on the net figures.
  intradayBrokeragePct: 0.03, intradayBrokerageCap: 20,
  deliveryBrokeragePct: 0.1,
  sttIntradaySellPct: 0.025, sttDeliveryPct: 0.1,
  exchangeTxnPct: 0.003, sebiPct: 0.0001,
  stampIntradayBuyPct: 0.003, stampDeliveryBuyPct: 0.015,
  gstPct: 18, dpChargePerSell: 15.34,
  slippageBps: 5,
};

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const minuteOfDay = (time) => (typeof time === 'number' ? Math.floor((time % 86400) / 60) : null);
const dayKey = (c) => (typeof c.time === 'number' ? Math.floor(c.time / 86400) : c.time);

/**
 * Charges for one round trip (entry order + exit orders). `legs` is [{ side: 'BUY'|'SELL', qty, price }].
 * Returns the rupee total and its parts.
 */
export function tradeCosts(legs, product, costs = COSTS_DEFAULTS) {
  const intraday = product === 'intraday';
  let brokerage = 0;
  let stt = 0;
  let exchange = 0;
  let sebi = 0;
  let stamp = 0;
  let sells = 0;
  for (const leg of legs) {
    const turnover = leg.qty * leg.price;
    const orderBrokerage = intraday
      ? Math.min(costs.intradayBrokerageCap, (turnover * costs.intradayBrokeragePct) / 100)
      : (turnover * costs.deliveryBrokeragePct) / 100;
    brokerage += orderBrokerage;
    exchange += (turnover * costs.exchangeTxnPct) / 100;
    sebi += (turnover * costs.sebiPct) / 100;
    if (leg.side === 'SELL') {
      sells++;
      stt += (turnover * (intraday ? costs.sttIntradaySellPct : costs.sttDeliveryPct)) / 100;
    } else {
      if (!intraday) stt += (turnover * costs.sttDeliveryPct) / 100;
      stamp += (turnover * (intraday ? costs.stampIntradayBuyPct : costs.stampDeliveryBuyPct)) / 100;
    }
  }
  const gst = ((brokerage + exchange + sebi) * costs.gstPct) / 100;
  const dp = intraday || sells === 0 ? 0 : costs.dpChargePerSell;
  const total = brokerage + stt + exchange + sebi + stamp + gst + dp;
  return { total, brokerage, stt, exchange, sebi, stamp, gst, dp };
}

/**
 * Simulate signals on candles. `config` supplies capital, riskPct, leverage and the strategy's
 * exit/limit settings (maxHoldBars, exitMin, maxTradesPerDay, maxDailyLossR).
 * Returns { trades, skipped, open } where `skipped` counts signals not taken, by reason.
 */
export function simulate(candles, signals, config, mode, costs = COSTS_DEFAULTS) {
  const intraday = mode === 'intraday';
  const trades = [];
  const skipped = {};
  const skip = (reason) => { skipped[reason] = (skipped[reason] ?? 0) + 1; };
  const dayState = new Map(); // day -> { trades, lossR }
  let busyUntil = -1;
  let open = null;
  const slip = (costs.slippageBps ?? 0) / 10000;

  for (const sig of signals) {
    const j = sig.index + 1;
    if (j >= candles.length) { skip('no later bar'); continue; }
    if (sig.index <= busyUntil) { skip('already in a trade'); continue; }
    const dir = sig.side === 'BUY' ? 1 : -1;
    const entryBar = candles[j];
    if (intraday && dayKey(entryBar) !== dayKey(candles[sig.index])) { skip('next bar is a new session'); continue; }
    const day = dayKey(entryBar);
    const ds = dayState.get(day) ?? { trades: 0, lossR: 0 };
    if (intraday && ds.trades >= config.maxTradesPerDay) { skip('max trades per day'); continue; }
    if (intraday && ds.lossR <= -config.maxDailyLossR) { skip('daily loss limit reached'); continue; }

    const fill = entryBar.open * (1 + dir * slip);
    const stop0 = sig.stop;
    const risk = dir * (fill - stop0);
    if (!(risk > 0)) { skip('gapped through the stop'); continue; }
    if (dir > 0 ? fill >= sig.target1 : fill <= sig.target1) { skip('gapped beyond target 1'); continue; }
    const qtyRisk = Math.floor(((config.capital * config.riskPct) / 100) / risk);
    const qtyCap = Math.floor((config.capital * (config.leverage ?? 1)) / fill);
    const qty = Math.min(qtyRisk, qtyCap);
    if (qty < 1) { skip('position size below 1 share'); continue; }

    const t1 = sig.target1;
    const t2 = sig.target2;
    let stop = stop0;
    let remaining = qty;
    let t1Done = false;
    const exits = []; // { qty, price, reason, index }
    let closedAt = -1;

    for (let k = j; k < candles.length && remaining > 0; k++) {
      const b = candles[k];
      if (intraday && (dayKey(b) !== day || minuteOfDay(b.time) >= config.exitMin) && k > j) {
        const price = dayKey(b) !== day ? candles[k - 1].close : b.open;
        exits.push({ qty: remaining, price, reason: 'session cutoff', index: dayKey(b) !== day ? k - 1 : k });
        remaining = 0; closedAt = exits.at(-1).index; break;
      }
      const stopHit = dir > 0 ? b.low <= stop : b.high >= stop;
      if (stopHit) {
        const gap = dir > 0 ? b.open <= stop : b.open >= stop;
        exits.push({ qty: remaining, price: (gap && k > j) ? b.open : stop, reason: t1Done ? 'stop at breakeven' : 'stop', index: k });
        remaining = 0; closedAt = k; break;
      }
      const t1Reached = !t1Done && (dir > 0 ? b.high >= t1 : b.low <= t1);
      if (t1Reached) {
        const half = Math.max(1, Math.floor(qty / 2));
        const q = Math.min(half, remaining);
        exits.push({ qty: q, price: t1, reason: 'target 1', index: k });
        remaining -= q;
        t1Done = true;
        stop = fill; // breakeven on the rest
        if (remaining === 0) { closedAt = k; break; }
        continue; // target 2 is not allowed on the same bar as target 1
      }
      if (t1Done && (dir > 0 ? b.high >= t2 : b.low <= t2)) {
        exits.push({ qty: remaining, price: t2, reason: 'target 2', index: k });
        remaining = 0; closedAt = k; break;
      }
      if (!intraday && k - j + 1 >= config.maxHoldBars) {
        exits.push({ qty: remaining, price: b.close, reason: 'time stop', index: k });
        remaining = 0; closedAt = k; break;
      }
    }

    if (remaining > 0) {
      const last = candles.length - 1;
      open = { signalId: sig.id, side: sig.side, entryIndex: j, entry: fill, qty, markPrice: candles[last].close };
      busyUntil = last;
      skip('still open at end of data');
      continue;
    }

    const product = intraday ? 'intraday' : 'delivery';
    const legs = [{ side: dir > 0 ? 'BUY' : 'SELL', qty, price: fill }, ...exits.map((e) => ({ side: dir > 0 ? 'SELL' : 'BUY', qty: e.qty, price: e.price }))];
    const c = tradeCosts(legs, product, costs);
    const gross = exits.reduce((s, e) => s + dir * (e.price - fill) * e.qty, 0);
    const net = gross - c.total;
    const riskRupees = risk * qty;
    const trade = {
      signalId: sig.id, strategy: sig.strategy, side: sig.side, entryIndex: j, exitIndex: closedAt,
      entryTime: entryBar.time, exitTime: candles[closedAt].time, entry: fill, qty,
      exits, gross, costs: c.total, net, rMultiple: riskRupees > 0 ? net / riskRupees : 0,
      exitReason: exits.length ? exits.at(-1).reason : 'n/a', bars: closedAt - j + 1,
    };
    trades.push(trade);
    busyUntil = closedAt;
    ds.trades++;
    ds.lossR += trade.rMultiple;
    dayState.set(day, ds);
  }
  return { trades, skipped, open };
}

/** Summary statistics of closed trades. Money figures use the trades' own quantities. */
export function summarize(trades, capital) {
  const n = trades.length;
  if (n === 0) return { count: 0, wins: 0, winRate: null, avgR: null, expectancyR: null, profitFactor: null, netPnl: 0, grossProfit: 0, grossLoss: 0, totalCosts: 0, maxDrawdown: 0, maxDrawdownPct: 0, avgWin: null, avgLoss: null, returnPct: 0 };
  const wins = trades.filter((t) => t.net > 0);
  const losses = trades.filter((t) => t.net <= 0);
  const grossProfit = wins.reduce((s, t) => s + t.net, 0);
  const grossLoss = losses.reduce((s, t) => s + t.net, 0);
  const netPnl = grossProfit + grossLoss;
  const avgR = trades.reduce((s, t) => s + t.rMultiple, 0) / n;
  let equity = capital;
  let peak = capital;
  let maxDd = 0;
  for (const t of trades) {
    equity += t.net;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak - equity);
  }
  return {
    count: n,
    wins: wins.length,
    winRate: wins.length / n,
    avgR,
    expectancyR: avgR,
    profitFactor: grossLoss < 0 ? grossProfit / -grossLoss : null,
    netPnl,
    grossProfit,
    grossLoss,
    totalCosts: trades.reduce((s, t) => s + t.costs, 0),
    maxDrawdown: maxDd,
    maxDrawdownPct: peak > 0 ? (maxDd / peak) * 100 : 0,
    avgWin: wins.length ? grossProfit / wins.length : null,
    avgLoss: losses.length ? grossLoss / losses.length : null,
    returnPct: (netPnl / capital) * 100,
  };
}

/** Buy-and-hold return over the same candles, from the first open to the last close. */
export function benchmarkReturn(candles) {
  if (!candles || candles.length < 2) return null;
  const first = candles[0].open;
  const last = candles[candles.length - 1].close;
  return first > 0 ? ((last - first) / first) * 100 : null;
}

/**
 * Run a full backtest. Chronological segments (training / validation / out-of-sample, 60/20/20 by
 * entry bar) are reported separately: because the rules have no fitted parameters, they show whether
 * results hold up over time rather than whether something was tuned. Rolling walk-forward windows
 * are reported the same way.
 */
export function backtest(candles, signals, config, mode, { costs = COSTS_DEFAULTS, windows = 4 } = {}) {
  const { trades, skipped, open } = simulate(candles, signals, config, mode, costs);
  const n = candles.length;
  const cut1 = Math.floor(n * 0.6);
  const cut2 = Math.floor(n * 0.8);
  const inRange = (lo, hi) => trades.filter((t) => t.entryIndex >= lo && t.entryIndex < hi);
  const size = Math.floor(n / windows);
  return {
    trades,
    skipped,
    open,
    overall: summarize(trades, config.capital),
    segments: {
      training: summarize(inRange(0, cut1), config.capital),
      validation: summarize(inRange(cut1, cut2), config.capital),
      outOfSample: summarize(inRange(cut2, n), config.capital),
    },
    walkForward: Array.from({ length: windows }, (_, w) => {
      const lo = w * size;
      const hi = w === windows - 1 ? n : (w + 1) * size;
      return { from: candles[lo]?.time ?? null, to: candles[hi - 1]?.time ?? null, ...summarize(inRange(lo, hi), config.capital) };
    }),
    benchmarkPct: benchmarkReturn(candles),
    assumptions: { slippageBps: costs.slippageBps, costsAssumed: true },
  };
}

export { isNum };
