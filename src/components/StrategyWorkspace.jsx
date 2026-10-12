import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import TradingChart from './TradingChart';
import { OVERLAYS, PANES } from '../data/chartConfig';
import { fetchHistory, fetchMarketStatus } from '../services/api';
import { swingSignals, intradaySignals, SWING_DEFAULTS, INTRADAY_DEFAULTS, validateConfig } from '../data/strategies';
import { backtest, COSTS_DEFAULTS } from '../data/backtest';
import { dropFormingBar, dayRisk, entryGate, positionSize } from '../data/strategyGate';
import { loadStrategyConfig, saveStrategyConfig, loadSlippage, SLIPPAGE_KEY } from '../data/strategyStore';
import { STATUS_META } from '../data/dataStatus';

const MODES = {
  swing: {
    title: 'Swing Trading',
    blurb: 'Daily candles with weekly trend confirmation. Setups: trend pullback and breakout. Holds for days to weeks.',
    timeframes: [{ id: 'D', label: 'Daily', range: '1y', interval: '1d', intervalMs: 86400000 }],
    defaults: SWING_DEFAULTS,
    engine: swingSignals,
    indicators: { ema20: true, ema50: true, ema200: true, rsi: true },
    fields: [
      ['capital', 'Capital (₹)'], ['riskPct', 'Risk per trade (%)'], ['stopAtr', 'Stop (× ATR)'], ['target1R', 'Target 1 (R)'], ['target2R', 'Target 2 (R)'],
      ['minRR', 'Min room to level (R)'], ['adxMin', 'Min ADX'], ['relVolMin', 'Breakout rel. volume'], ['breakoutLookback', 'Breakout look-back (bars)'],
      ['pullbackAtr', 'Pullback tolerance (× ATR)'], ['maxHoldBars', 'Max hold (bars)'], ['cooldownBars', 'Cool-down (bars)'],
      ['weeklyFilter', 'Require weekly trend'], ['allowShort', 'Allow short setups'], ['pullback', 'Pullback setup'], ['breakout', 'Breakout setup'],
    ],
  },
  intraday: {
    title: 'Intraday Trading',
    blurb: 'Minute-level candles inside the session, with a higher-timeframe trend filter, VWAP and volume confirmation. All trades close by the exit time.',
    timeframes: [
      { id: '1m', label: '1m', range: '5d', interval: '1m', intervalMs: 60000 },
      { id: '5m', label: '5m', range: '1mo', interval: '5m', intervalMs: 300000 },
      { id: '15m', label: '15m', range: '1mo', interval: '15m', intervalMs: 900000 },
    ],
    defaults: INTRADAY_DEFAULTS,
    engine: intradaySignals,
    indicators: { ema9: true, ema21: true, vwap: true, rsi: true },
    fields: [
      ['capital', 'Capital (₹)'], ['riskPct', 'Risk per trade (%)'], ['leverage', 'Leverage (×)'], ['stopAtr', 'Stop (× ATR)'], ['target1R', 'Target 1 (R)'], ['target2R', 'Target 2 (R)'],
      ['adxMin', 'Min ADX'], ['relVolMin', 'Min rel. volume'], ['htfMultiple', 'Higher TF (× bars)'], ['htfEma', 'Higher TF EMA'], ['orMinutes', 'Opening range (min)'],
      ['entryStartMin', 'Entries from (min of day)'], ['entryEndMin', 'Entries until (min of day)'], ['exitMin', 'Exit by (min of day)'],
      ['maxTradesPerDay', 'Max trades / day'], ['maxDailyLossR', 'Max daily loss (R)'], ['minAtrPct', 'Min ATR (% of price)'], ['maxAtrPct', 'Max ATR (% of price)'],
      ['cooldownBars', 'Cool-down (bars)'], ['allowShort', 'Allow short setups'], ['emaCross', 'EMA cross setup'], ['openingRange', 'Opening-range setup'],
    ],
  },
};

const GREEN = '#00e676';
const RED = '#ff1744';
const inr = (n) => (Number.isFinite(n) ? `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—');
const px = (n) => (Number.isFinite(n) ? n.toFixed(2) : '—');
const pct = (n, d = 1) => (Number.isFinite(n) ? `${n.toFixed(d)}%` : '—');
const num = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : '—');

function formatTime(t) {
  // Intraday candle times are IST-shifted epoch seconds, so they are shown as UTC to read as IST clock time
  if (typeof t === 'number') return new Date(t * 1000).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  // A real instant (provider timestamp) is shown in IST
  if (typeof t === 'string' && t.includes('T')) return `${new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST`;
  return t;
}

function Row({ label, value, color }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}>
      <span className="text-[11px] text-gray-500">{label}</span>
      <span className="text-xs font-mono text-right" style={{ color: color || '#d1d5db' }}>{value}</span>
    </div>
  );
}

function Stats({ title, s }) {
  return (
    <div className="mb-3">
      <h4 className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">{title}</h4>
      {s.count === 0 ? <p className="text-[11px] text-gray-600">No closed trades in this period.</p> : (
        <>
          <Row label="Trades" value={`${s.count} (${s.wins} won)`} />
          <Row label="Win rate" value={pct(s.winRate * 100)} />
          <Row label="Net P&L after costs" value={inr(s.netPnl)} color={s.netPnl >= 0 ? GREEN : RED} />
          <Row label="Profit factor" value={s.profitFactor === null ? '—' : num(s.profitFactor)} />
          <Row label="Expectancy (avg R)" value={num(s.expectancyR)} color={s.expectancyR >= 0 ? GREEN : RED} />
          <Row label="Max drawdown" value={`${inr(s.maxDrawdown)} (${pct(s.maxDrawdownPct)})`} />
          <Row label="Costs paid" value={inr(s.totalCosts)} />
        </>
      )}
    </div>
  );
}

export default function StrategyWorkspace({ mode, selectedStock, demoMode }) {
  const def = MODES[mode];
  const [tf, setTf] = useState(def.timeframes[def.timeframes.length > 1 ? 1 : 0].id);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [market, setMarket] = useState(null);
  const [config, setConfig] = useState(() => loadStrategyConfig(mode, window.localStorage));
  const [slippage, setSlippage] = useState(() => loadSlippage(window.localStorage));
  const [indicators, setIndicators] = useState(def.indicators);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState('signal');
  const [loadedAt, setLoadedAt] = useState(0);

  const frame = def.timeframes.find((t) => t.id === tf) ?? def.timeframes[0];
  const symbol = selectedStock.symbol;

  const load = useCallback(async () => {
    setLoading(true);
    const [h, m] = await Promise.all([fetchHistory(symbol, frame.range, frame.interval), fetchMarketStatus()]);
    setHistory(h);
    if (m) setMarket(m);
    setLoading(false);
    setLoadedAt(Date.now());
  }, [symbol, frame.range, frame.interval]);

  useEffect(() => {
    if (demoMode) return undefined;
    load();
    const timer = mode === 'intraday' ? setInterval(load, 60000) : null;
    return () => { if (timer) clearInterval(timer); };
  }, [load, mode, demoMode]);

  useEffect(() => { setSelectedId(null); }, [symbol, tf]);

  // Completed candles only: swing drops the in-progress day, intraday drops a bar that is still forming
  const analysis = useMemo(() => {
    if (!history?.candles) return [];
    const done = history.candles.filter((c) => !c.partial);
    return mode === 'intraday' ? dropFormingBar(done, frame.intervalMs, loadedAt) : done;
  }, [history, mode, frame.intervalMs, loadedAt]);

  const signals = useMemo(() => def.engine(analysis, config), [analysis, config, def]);
  const result = useMemo(
    () => backtest(analysis, signals, config, mode, { costs: { ...COSTS_DEFAULTS, slippageBps: slippage } }),
    [analysis, signals, config, mode, slippage]
  );

  const risk = useMemo(() => (mode === 'intraday' ? dayRisk(result.trades, analysis, config) : null), [mode, result.trades, analysis, config]);
  const gate = entryGate({ mode, dataStatus: history?.dataStatus, marketOpen: market ? market.isOpen : null, risk, config });
  const lastIndex = analysis.length - 1;
  const active = signals.filter((s) => s.index >= lastIndex - 1);
  const selected = signals.find((s) => s.id === selectedId) ?? active.at(-1) ?? signals.at(-1) ?? null;
  const outcomeOf = (id) => result.trades.find((t) => t.signalId === id) ?? null;

  const updateConfig = (key, value) => {
    const next = validateConfig({ ...config, [key]: value }, def.defaults);
    setConfig(next);
    saveStrategyConfig(mode, next, window.localStorage);
  };
  const resetConfig = () => {
    setConfig(validateConfig({}, def.defaults));
    saveStrategyConfig(mode, def.defaults, window.localStorage);
  };

  if (demoMode) {
    return <p className="px-4 py-6 text-xs text-gray-500">Strategy workspaces need real market data and are off in simulated mode, so no signal is ever drawn on made-up prices.</p>;
  }

  const statusMeta = STATUS_META[history?.dataStatus] ?? STATUS_META.UNAVAILABLE;
  const size = selected ? positionSize(selected, config) : null;
  const outcome = selected ? outcomeOf(selected.id) : null;

  return (
    <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
      <div className="flex flex-col flex-1 min-w-0 min-h-[420px]">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
          <span className="text-xs font-semibold text-gray-300">{def.title}</span>
          <span className="text-xs text-gray-500">· {symbol}</span>
          {def.timeframes.length > 1 && def.timeframes.map((t) => (
            <button key={t.id} onClick={() => setTf(t.id)} className={`px-2 py-1 text-xs rounded cursor-pointer ${tf === t.id ? 'bg-green-500/15 text-green-400' : 'text-gray-500 hover:text-gray-300'}`}>{t.label}</button>
          ))}
          <details className="relative">
            <summary className="px-2 py-1 text-xs rounded cursor-pointer text-gray-400 hover:text-gray-200 list-none">Indicators ▾</summary>
            <div className="absolute z-20 mt-1 p-2 rounded-md grid grid-cols-2 gap-x-4 gap-y-1" style={{ backgroundColor: '#151d2b', border: '1px solid #1e2d3d', minWidth: 260 }}>
              {[...OVERLAYS, ...PANES].map((o) => (
                <label key={o.key} className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={Boolean(indicators[o.key])} onChange={(e) => setIndicators((s) => ({ ...s, [o.key]: e.target.checked }))} />
                  {o.label}
                </label>
              ))}
            </div>
          </details>
          <div className="flex-1" />
          <span className="text-[10px] px-2 py-0.5 rounded" style={{ color: statusMeta.color, backgroundColor: 'rgba(30,45,61,0.4)' }} title={statusMeta.description}>{statusMeta.label}</span>
          {history?.asOf && <span className="text-[10px] text-gray-600">as of {formatTime(history.asOf)}</span>}
          <button onClick={load} disabled={loading} aria-label="Refresh" className="p-1.5 rounded text-gray-500 hover:text-gray-200 hover:bg-white/5 cursor-pointer"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
        </div>

        <p className="px-3 py-1 text-[10px] text-gray-600">{def.blurb}</p>
        {!gate.actionable && (
          <div className="mx-3 mb-1 px-3 py-1.5 rounded text-[11px]" role="status" style={{ backgroundColor: 'rgba(255, 214, 0, 0.08)', color: '#ffd600', border: '1px solid rgba(255, 214, 0, 0.25)' }}>
            New entries are off: {gate.reasons.join('; ')}. Past signals stay on the chart for review.
          </div>
        )}

        <div className="flex flex-col flex-1 min-h-0">
          {analysis.length === 0 ? (
            <p className="px-4 py-8 text-xs text-gray-500">{loading ? 'Loading candles…' : 'No candles available for this stock and timeframe.'}</p>
          ) : (
            <TradingChart candleData={analysis} indicators={indicators} signals={signals} trades={result.trades} selectedId={selected?.id ?? null} onSelectSignal={setSelectedId} intraday={mode === 'intraday'} />
          )}
        </div>
      </div>

      <aside className="flex flex-col flex-shrink-0 overflow-hidden w-full lg:w-[360px] max-h-[70vh] lg:max-h-none" style={{ borderLeft: '1px solid rgba(30, 45, 61, 0.3)', backgroundColor: '#0d1117' }}>
        <div className="flex gap-1 px-2 py-2 flex-shrink-0" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
          {[['signal', 'Signal'], ['history', `History (${signals.length})`], ['performance', 'Performance'], ['settings', 'Settings']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`px-2 py-1 text-xs rounded cursor-pointer ${tab === id ? 'bg-green-500/15 text-green-400' : 'text-gray-500 hover:text-gray-300'}`}>{label}</button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {tab === 'signal' && (
            selected ? (
              <>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold" style={{ color: selected.side === 'BUY' ? GREEN : RED }}>{selected.side === 'BUY' ? 'BUY' : 'SELL SHORT'} · {selected.strategy}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(30,45,61,0.5)', color: active.includes(selected) && gate.actionable ? GREEN : '#94a3b8' }}>
                    {active.includes(selected) ? (gate.actionable ? 'ACTIVE' : 'NOT ACTIONABLE') : 'PAST'}
                  </span>
                </div>
                <Row label="Strategy / timeframe" value={`${mode} ${selected.strategy} · ${frame.label}`} />
                <Row label="Signal bar" value={formatTime(selected.time)} />
                <Row label="Entry zone" value={`${px(selected.entryZone[0])} – ${px(selected.entryZone[1])}`} />
                <Row label="Stop-loss" value={px(selected.stop)} color={RED} />
                <Row label="Target 1" value={`${px(selected.target1)} (${num(config.target1R, 1)}R)`} color={GREEN} />
                <Row label="Target 2" value={`${px(selected.target2)} (${num(config.target2R, 1)}R)`} color={GREEN} />
                <Row label="Risk : reward" value={`1 : ${num(selected.rr, 1)}`} />
                <Row label="Position size" value={size ? `${size.qty} sh · ${inr(size.outlay)} · risk ${inr(size.riskAmount)}${size.cappedByCapital ? ' (capped by capital)' : ''}` : 'below 1 share'} />
                {outcome && <Row label="Simulated outcome" value={`${outcome.exitReason}: ${num(outcome.rMultiple)}R (${inr(outcome.net)})`} color={outcome.net >= 0 ? GREEN : RED} />}
                <h4 className="text-[11px] text-gray-400 uppercase tracking-wider mt-3 mb-1">Why it matched</h4>
                <p className="text-xs text-gray-300 mb-1">{selected.explanation}</p>
                <ul className="text-[11px] text-gray-400 list-disc ml-4 space-y-0.5">{selected.confirmations.map((c, i) => <li key={i}>{c}</li>)}</ul>
                <h4 className="text-[11px] text-gray-400 uppercase tracking-wider mt-3 mb-1">Invalidation</h4>
                <p className="text-xs text-gray-300">{selected.invalidation}</p>
                <h4 className="text-[11px] text-gray-400 uppercase tracking-wider mt-3 mb-1">Data</h4>
                <p className="text-[11px] text-gray-500">{history?.provider ?? '—'} · {statusMeta.label}{history?.asOf ? ` · as of ${formatTime(history.asOf)}` : ''}</p>
                <p className="text-[10px] text-gray-600 mt-3">A rule match on completed candles, not a forecast or advice. Check the Performance tab to see how these rules would have done, after costs, before acting.</p>
              </>
            ) : (
              <div className="text-xs text-gray-500 space-y-2">
                <p style={{ color: '#94a3b8' }} className="font-medium">WAIT / NO TRADE</p>
                <p>No setup matches the current rules on {symbol}. Nothing is drawn, so no trade is implied.</p>
                {mode === 'swing' && analysis.length < 60 && <p>Only {analysis.length} daily candles loaded; the swing rules need about 60.</p>}
              </div>
            )
          )}

          {tab === 'history' && (
            <div>
              {signals.length === 0 && <p className="text-xs text-gray-600">No signals in this window.</p>}
              {[...signals].reverse().slice(0, 100).map((s) => {
                const o = outcomeOf(s.id);
                return (
                  <button key={s.id} onClick={() => { setSelectedId(s.id); setTab('signal'); }} className="w-full flex items-center justify-between gap-2 py-1.5 text-left cursor-pointer hover:bg-white/5" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}>
                    <span>
                      <span className="text-xs font-medium" style={{ color: s.side === 'BUY' ? GREEN : RED }}>{s.side === 'BUY' ? 'BUY' : 'SHORT'}</span>
                      <span className="text-[11px] text-gray-500"> {s.strategy} · {formatTime(s.time)}</span>
                    </span>
                    <span className="text-[11px] font-mono" style={{ color: o ? (o.net >= 0 ? GREEN : RED) : '#64748b' }}>{o ? `${num(o.rMultiple)}R` : 'not taken'}</span>
                  </button>
                );
              })}
            </div>
          )}

          {tab === 'performance' && (
            <div>
              <p className="text-[10px] text-gray-600 mb-2">Simulated on {analysis.length} {frame.label} candles of {symbol} with the current settings. Not your broker account.</p>
              <Stats title="All trades" s={result.overall} />
              <Row label="Buy & hold, same period" value={pct(result.benchmarkPct)} />
              {risk && (
                <>
                  <h4 className="text-[11px] text-gray-400 uppercase tracking-wider mt-3 mb-1">Today (simulated)</h4>
                  <Row label="Trades taken" value={`${risk.trades} of ${config.maxTradesPerDay}`} />
                  <Row label="Net today" value={`${num(risk.netR)}R (${inr(risk.net)})`} color={risk.net >= 0 ? GREEN : RED} />
                  <Row label="Loss budget left" value={`${num(risk.lossRLeft)}R of ${config.maxDailyLossR}R`} />
                </>
              )}
              <div className="mt-3" />
              <Stats title="Training (first 60%)" s={result.segments.training} />
              <Stats title="Validation (next 20%)" s={result.segments.validation} />
              <Stats title="Out-of-sample (last 20%)" s={result.segments.outOfSample} />
              <h4 className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">Walk-forward windows</h4>
              {result.walkForward.map((w, i) => <Row key={i} label={`${formatTime(w.from)} → ${formatTime(w.to)}`} value={w.count ? `${w.count} trades · ${num(w.expectancyR)}R` : 'no trades'} color={w.count && w.expectancyR < 0 ? RED : undefined} />)}
              {Object.keys(result.skipped).length > 0 && (
                <>
                  <h4 className="text-[11px] text-gray-400 uppercase tracking-wider mt-3 mb-1">Signals not taken</h4>
                  {Object.entries(result.skipped).map(([k, v]) => <Row key={k} label={k} value={v} />)}
                </>
              )}
              <p className="text-[10px] text-gray-600 mt-3">
                Fills at the next bar&apos;s open plus {slippage} bps slippage; a bar touching both stop and target counts as stopped. Brokerage, STT, exchange, SEBI, stamp duty, GST and DP charges use
                assumed rates, so check them against your contract note. The rules have no fitted parameters, so the segments show consistency over time, not tuning.
                A few trades on one stock say very little.
              </p>
            </div>
          )}

          {tab === 'settings' && (
            <div className="space-y-2">
              <p className="text-[10px] text-gray-600">Saved in this browser for {mode} only. Out-of-range values are corrected.</p>
              {def.fields.map(([key, label]) => (
                typeof def.defaults[key] === 'boolean' ? (
                  <label key={key} className="flex items-center justify-between text-xs text-gray-300 cursor-pointer">
                    {label}
                    <input type="checkbox" checked={Boolean(config[key])} onChange={(e) => updateConfig(key, e.target.checked)} />
                  </label>
                ) : (
                  <label key={key} className="flex items-center justify-between gap-2 text-xs text-gray-300">
                    {label}
                    <input type="number" step="any" value={config[key]} onChange={(e) => e.target.value !== '' && updateConfig(key, Number(e.target.value))} className="w-24 px-2 py-1 text-xs rounded bg-transparent text-gray-200 border border-gray-700 focus:border-green-500 outline-none text-right" />
                  </label>
                )
              ))}
              <label className="flex items-center justify-between gap-2 text-xs text-gray-300">
                Slippage per side (bps)
                <input type="number" step="1" min="0" max="100" value={slippage} onChange={(e) => { const v = Math.min(100, Math.max(0, Number(e.target.value) || 0)); setSlippage(v); window.localStorage.setItem(SLIPPAGE_KEY, JSON.stringify(v)); }} className="w-24 px-2 py-1 text-xs rounded bg-transparent text-gray-200 border border-gray-700 focus:border-green-500 outline-none text-right" />
              </label>
              <button onClick={resetConfig} className="px-3 py-1.5 text-xs rounded bg-white/5 text-gray-300 hover:bg-white/10 cursor-pointer">Reset to defaults</button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
