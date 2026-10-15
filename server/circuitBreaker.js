/**
 * Execution Circuit Breaker
 * Programmatic safety layer preventing duplicate orders, infinite execution loops,
 * runaway retries, and exceeding daily loss thresholds.
 */

export function createExecutionCircuitBreaker({
  maxOrdersPerMin = 5,
  dedupeWindowMs = 60000,
  maxConsecutiveErrors = 3,
  maxDailyLoss = null,
  now = Date.now,
} = {}) {
  let state = 'ACTIVE'; // 'ACTIVE' | 'TRIPPED' | 'HALTED'
  let tripReason = null;
  let trippedAt = null;
  let consecutiveErrors = 0;
  let realizedDailyLoss = 0;

  // Recent order executions: { key, at, order }
  const executionLog = [];
  // Recent orders within dedupe window
  const recentOrders = new Map(); // key -> timestamp

  function fingerprint(order) {
    if (!order) return '';
    if (order.clientOrderId) return `id:${order.clientOrderId}`;
    const symbol = String(order.symbol || '').toUpperCase().trim();
    const action = String(order.action || order.side || '').toUpperCase().trim();
    const qty = Number(order.quantity || 0);
    const price = Number(order.price || 0).toFixed(2);
    return `${symbol}:${action}:${qty}:${price}`;
  }

  function cleanOld(currentTime) {
    // Remove orders older than dedupeWindowMs
    for (const [key, timestamp] of recentOrders.entries()) {
      if (currentTime - timestamp > dedupeWindowMs) {
        recentOrders.delete(key);
      }
    }
  }

  function trip(reason) {
    state = 'TRIPPED';
    tripReason = reason;
    trippedAt = new Date(now()).toISOString();
    return { ok: false, state, reason: tripReason, trippedAt };
  }

  function halt(reason = 'Manual execution halt triggered by user') {
    state = 'HALTED';
    tripReason = reason;
    trippedAt = new Date(now()).toISOString();
    return { ok: true, state, reason: tripReason, trippedAt };
  }

  function reset() {
    state = 'ACTIVE';
    tripReason = null;
    trippedAt = null;
    consecutiveErrors = 0;
    return { ok: true, state: 'ACTIVE' };
  }

  function validateOrder(order) {
    const t = now();
    cleanOld(t);

    if (state === 'HALTED') {
      return {
        ok: false,
        code: 'CIRCUIT_HALTED',
        error: `Execution circuit breaker is HALTED: ${tripReason}`,
      };
    }

    if (state === 'TRIPPED') {
      return {
        ok: false,
        code: 'CIRCUIT_TRIPPED',
        error: `Execution circuit breaker is TRIPPED: ${tripReason}. Reset required before placing new orders.`,
      };
    }

    // 1. Duplicate order check (Nonce / Fingerprint deduplication)
    const key = fingerprint(order);
    if (recentOrders.has(key)) {
      const lastPlacedAt = recentOrders.get(key);
      const remainingSec = Math.ceil((dedupeWindowMs - (t - lastPlacedAt)) / 1000);
      return {
        ok: false,
        code: 'DUPLICATE_ORDER',
        error: `Duplicate order rejected. An identical order was submitted ${Math.round((t - lastPlacedAt) / 1000)}s ago. Cooldown: ${remainingSec}s.`,
      };
    }

    // 2. Infinite execution loop / rate limiter check (max orders per minute)
    const recentMinCount = executionLog.filter((e) => t - e.at <= 60000).length;
    if (recentMinCount >= maxOrdersPerMin) {
      trip(`Rate ceiling breached: ${recentMinCount} orders in 60 seconds (max allowed: ${maxOrdersPerMin}). Possible infinite loop halted.`);
      return {
        ok: false,
        code: 'RATE_LIMIT_TRIPPED',
        error: `Circuit breaker tripped: Exceeded rate limit of ${maxOrdersPerMin} orders/min. Trading auto-halted.`,
      };
    }

    // 3. Daily loss kill switch check
    if (maxDailyLoss !== null && realizedDailyLoss >= maxDailyLoss) {
      trip(`Max daily loss limit breached (₹${realizedDailyLoss} >= ₹${maxDailyLoss}). Trading auto-halted.`);
      return {
        ok: false,
        code: 'MAX_LOSS_TRIPPED',
        error: `Circuit breaker tripped: Maximum daily drawdown of ₹${maxDailyLoss} reached.`,
      };
    }

    // Order passes all safety checks
    recentOrders.set(key, t);
    executionLog.push({ key, at: t, order: { ...order } });
    if (executionLog.length > 100) executionLog.shift();

    return { ok: true, fingerprint: key };
  }

  function recordOrderResult({ success, error: _error = null, pnl = 0 }) {
    if (success) {
      consecutiveErrors = 0;
      if (typeof pnl === 'number' && pnl < 0) {
        realizedDailyLoss += Math.abs(pnl);
        if (maxDailyLoss !== null && realizedDailyLoss >= maxDailyLoss) {
          trip(`Max daily loss of ₹${maxDailyLoss} exceeded after trade result. Trading halted.`);
        }
      }
    } else {
      consecutiveErrors += 1;
      if (consecutiveErrors >= maxConsecutiveErrors) {
        trip(`Runaway error protection: ${consecutiveErrors} consecutive order rejections/errors. Trading auto-halted.`);
      }
    }
  }

  return {
    validateOrder,
    recordOrderResult,
    trip,
    halt,
    reset,
    status: () => {
      const t = now();
      cleanOld(t);
      const ordersLastMinute = executionLog.filter((e) => t - e.at <= 60000).length;
      return {
        state,
        tripReason,
        trippedAt,
        consecutiveErrors,
        maxConsecutiveErrors,
        ordersLastMinute,
        maxOrdersPerMin,
        dedupeWindowMs,
        realizedDailyLoss,
        maxDailyLoss,
        activeDedupeCount: recentOrders.size,
      };
    },
  };
}
