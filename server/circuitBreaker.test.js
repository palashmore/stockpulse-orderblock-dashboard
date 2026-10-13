import { describe, it, expect, beforeEach } from 'vitest';
import { createExecutionCircuitBreaker } from './circuitBreaker.js';

describe('Execution Circuit Breaker', () => {
  let clock = 1000000;
  const now = () => clock;

  beforeEach(() => {
    clock = 1000000;
  });

  it('allows valid order and blocks duplicate order within window', () => {
    const cb = createExecutionCircuitBreaker({ now, dedupeWindowMs: 60000 });
    const order = { symbol: 'RELIANCE', side: 'BUY', quantity: 10, price: 2850 };

    // 1st order accepted
    const r1 = cb.validateOrder(order);
    expect(r1.ok).toBe(true);

    // Immediate duplicate rejected
    const r2 = cb.validateOrder(order);
    expect(r2.ok).toBe(false);
    expect(r2.code).toBe('DUPLICATE_ORDER');

    // After dedupe window, order is accepted again
    clock += 65000;
    const r3 = cb.validateOrder(order);
    expect(r3.ok).toBe(true);
  });

  it('trips circuit breaker when order rate ceiling is breached (loop prevention)', () => {
    const cb = createExecutionCircuitBreaker({ now, maxOrdersPerMin: 3 });

    expect(cb.validateOrder({ symbol: 'INFY', side: 'BUY', quantity: 1, price: 1500 }).ok).toBe(true);
    clock += 1000;
    expect(cb.validateOrder({ symbol: 'TCS', side: 'BUY', quantity: 1, price: 3900 }).ok).toBe(true);
    clock += 1000;
    expect(cb.validateOrder({ symbol: 'HDFCBANK', side: 'BUY', quantity: 1, price: 1600 }).ok).toBe(true);
    clock += 1000;

    // 4th order in 60s exceeds maxOrdersPerMin (3) -> trips breaker
    const r4 = cb.validateOrder({ symbol: 'SBIN', side: 'BUY', quantity: 1, price: 800 });
    expect(r4.ok).toBe(false);
    expect(r4.code).toBe('RATE_LIMIT_TRIPPED');

    // Subsequent orders blocked because circuit is TRIPPED
    const r5 = cb.validateOrder({ symbol: 'ITC', side: 'BUY', quantity: 1, price: 400 });
    expect(r5.ok).toBe(false);
    expect(r5.code).toBe('CIRCUIT_TRIPPED');

    // Manual reset restores ACTIVE state
    expect(cb.reset().ok).toBe(true);
    expect(cb.status().state).toBe('ACTIVE');
  });

  it('trips circuit breaker after consecutive execution errors', () => {
    const cb = createExecutionCircuitBreaker({ now, maxConsecutiveErrors: 3 });

    cb.recordOrderResult({ success: false, error: 'Rejected by exchange' });
    cb.recordOrderResult({ success: false, error: 'Margin shortfall' });
    expect(cb.status().state).toBe('ACTIVE');

    cb.recordOrderResult({ success: false, error: 'API timeout' });
    expect(cb.status().state).toBe('TRIPPED');
    expect(cb.status().tripReason).toMatch(/consecutive/);
  });

  it('supports emergency manual halt and reset', () => {
    const cb = createExecutionCircuitBreaker({ now });

    expect(cb.halt('User emergency kill switch clicked').ok).toBe(true);
    expect(cb.status().state).toBe('HALTED');

    const res = cb.validateOrder({ symbol: 'TCS', side: 'BUY', quantity: 1, price: 3900 });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('CIRCUIT_HALTED');

    cb.reset();
    expect(cb.status().state).toBe('ACTIVE');
  });

  it('trips when max daily loss limit is breached', () => {
    const cb = createExecutionCircuitBreaker({ now, maxDailyLoss: 5000 });

    cb.recordOrderResult({ success: true, pnl: -3000 });
    expect(cb.status().state).toBe('ACTIVE');

    cb.recordOrderResult({ success: true, pnl: -2500 }); // total loss = 5500 >= 5000
    expect(cb.status().state).toBe('TRIPPED');
    expect(cb.status().tripReason).toMatch(/Max daily loss/);
  });
});
