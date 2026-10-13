import { screenerMetrics } from './screenerMetrics';
import { detectOrderBlocks } from './marketAnalysis';
import { zoneLevels } from './ranking';
import { intradaySignals } from './strategies';
import { dropFormingBar } from './strategyGate';
import { evaluateSignal } from './signalLifecycle';

// Quick view of one stock (pure): the facts, the swing and intraday status, and the levels. Entry, stop and targets are
// included ONLY when the setup is still valid and the data is current; otherwise the status says why not.
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const FRAME_MS = 300000;
const BAD = new Set(['STALE', 'UNAVAILABLE', 'SIMULATED']);

const levels = (s) => ({ entry: s.entry, stop: s.stop, target1: s.target1, target2: s.target2, rr: isNum(s.rr) ? s.rr : null });

/** Swing status from the screener metrics of the daily candles. */
export function swingStatus(metrics, dataOk) {
  const s = metrics?.swing ?? null;
  if (!s) return { state: 'NONE', label: 'No swing setup in the last 3 daily bars', levels: null };
  const side = s.side === 'BUY' ? 'long' : 'short';
  if (!dataOk) return { state: 'REVIEW', label: `Last ${side} ${s.strategy} setup (data not current): for review only`, side, levels: null };
  if (!s.actionable) return { state: 'INVALID', label: `${side} ${s.strategy} setup is no longer valid: ${s.label}`, side, levels: null };
  return { state: 'VALID', label: `Valid ${side} ${s.strategy} setup (${s.label}, ${s.ageBars === 0 ? 'last bar' : `${s.ageBars} bars ago`})`, side, levels: levels(s), invalidation: `Invalid if price closes beyond ${s.stop.toFixed(2)}` };
}

/**
 * Intraday status from 5-minute candles. A signal's levels are shown only while the market is open, the data is not stale and
 * the signal itself is still valid (not stopped, past a target, stretched, expired or from an earlier session).
 * @param candles 5-minute candles (may include the forming bar), config the saved intraday settings
 */
export function intradayStatus(history, config, { marketOpen, nowMs }) {
  if (!history || !Array.isArray(history.candles)) return { state: 'UNAVAILABLE', label: 'Intraday data unavailable', levels: null };
  if (BAD.has(history.dataStatus)) return { state: 'UNAVAILABLE', label: `Intraday data is ${history.dataStatus.toLowerCase()}`, levels: null };
  const usable = dropFormingBar(history.candles.filter((c) => !c.partial), FRAME_MS, nowMs);
  if (usable.length < 60) return { state: 'UNAVAILABLE', label: 'Too little intraday history', levels: null };
  const lastDay = Math.floor(usable[usable.length - 1].time / 86400);
  const sig = intradaySignals(usable, config).filter((s) => Math.floor(s.time / 86400) === lastDay).at(-1) ?? null;
  if (!sig) return { state: 'NONE', label: 'No intraday signal this session', levels: null };
  const side = sig.side === 'BUY' ? 'long' : 'short';
  const life = evaluateSignal(sig, usable, { validBars: config.validBars, intraday: true });
  if (marketOpen !== true) return { state: 'REVIEW', label: `Last session's ${side} ${sig.strategy} signal (market closed): for review only`, side, levels: null };
  if (!life.actionable) return { state: 'INVALID', label: `${side} ${sig.strategy} signal is no longer valid: ${life.label}`, side, levels: null };
  return { state: 'VALID', label: `Valid ${side} ${sig.strategy} signal (${life.label})`, side, levels: levels(sig), invalidation: `Invalid if price reaches ${sig.stop.toFixed(2)}` };
}

/**
 * Everything the panel shows from the daily history (and optionally the intraday history).
 * @param daily     fetchHistory result for 1d candles, or null
 * @param intraday  fetchHistory result for 5m candles, or null
 * @param context   { marketOpen, nowMs, intradayConfig }
 */
export function summariseStock(daily, intraday, { marketOpen = null, nowMs = Date.now(), intradayConfig = {} } = {}) {
  if (!daily || !Array.isArray(daily.candles) || daily.candles.length === 0) return null;
  const candles = daily.candles.filter((c) => !c.partial);
  const dataOk = !BAD.has(daily.dataStatus) && marketOpen !== null;
  const metrics = screenerMetrics(candles);
  const last = candles[candles.length - 1];
  const blocks = detectOrderBlocks(candles);
  return {
    candles,
    blocks,
    metrics,
    levels: zoneLevels(candles, blocks, last.close),
    swing: swingStatus(metrics, dataOk && marketOpen === true),
    intraday: intradayStatus(intraday, intradayConfig, { marketOpen, nowMs }),
    source: { provider: daily.provider ?? null, status: daily.dataStatus ?? null, asOf: daily.asOf ?? null },
  };
}
