import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, Shield, AlertTriangle, CheckCircle2, SlidersHorizontal, ArrowUpRight, ArrowDownRight, Target, DollarSign, Layers, Activity } from 'lucide-react';
import TradingChart from './TradingChart';
import { OVERLAYS, PANES } from '../data/chartConfig';
import { fetchHistory, fetchMarketStatus } from '../services/api';
import { swingSignals, intradaySignals, SWING_DEFAULTS, INTRADAY_DEFAULTS, validateConfig } from '../data/strategies';
import { backtest, tradeCosts, COSTS_DEFAULTS } from '../data/backtest';
import { dropFormingBar, dayRisk, entryGate, positionSize } from '../data/strategyGate';
import { loadStrategyConfig, saveStrategyConfig, loadSlippage, SLIPPAGE_KEY } from '../data/strategyStore';
import { STATUS_META } from '../data/dataStatus';
import { evaluateSignal } from '../data/signalLifecycle';
import { useRefresh } from '../hooks/useRefresh';
import Freshness from './Freshness';
import { useUniverseSelection, useUniverseStocks } from '../hooks/useUniverse';
import { useScreenerData } from '../hooks/useScreenerData';
import { swingSetupList, trendingList } from '../data/stockLists';

const MODES = {
  swing: {
    title: 'Swing Trading',
    blurb: 'Multi-day to multi-week holding horizon. Daily candles with weekly trend confirmation and volume surge.',
    timeframes: [
      { id: 'D', label: 'Daily (1D)', range: '1y', interval: '1d', intervalMs: 86400000 },
    ],
    defaults: SWING_DEFAULTS,
    engine: swingSignals,
    indicators: { ema20: true, ema50: true, ema200: true, rsi: true },
    fields: [
      ['capital', 'Trading Pool (₹)'], ['riskPct', 'Risk per trade (%)'], ['stopAtr', 'Stop (× ATR)'], ['target1R', 'Target 1 (R)'], ['target2R', 'Target 2 (R)'],
      ['minRR', 'Min room to level (R)'], ['adxMin', 'Min ADX'], ['relVolMin', 'Breakout rel. volume'], ['breakoutLookback', 'Breakout look-back (bars)'],
      ['pullbackAtr', 'Pullback tolerance (× ATR)'], ['maxHoldBars', 'Max hold (bars)'], ['cooldownBars', 'Cool-down (bars)'], ['validBars', 'Signal valid for (bars)'],
      ['weeklyFilter', 'Require weekly trend'], ['allowShort', 'Allow short setups'], ['pullback', 'Pullback setup'], ['breakout', 'Breakout setup'],
    ],
  },
  intraday: {
    title: 'Intraday Trading',
    blurb: 'Session candles (1m, 5m, 15m) with VWAP, higher-TF EMA and volume confirmation. Auto square-off by session close.',
    timeframes: [
      { id: '1m', label: '1m', range: '5d', interval: '1m', intervalMs: 60000 },
      { id: '5m', label: '5m', range: '1mo', interval: '5m', intervalMs: 300000 },
      { id: '15m', label: '15m', range: '1mo', interval: '15m', intervalMs: 900000 },
    ],
    defaults: INTRADAY_DEFAULTS,
    engine: intradaySignals,
    indicators: { ema9: true, ema21: true, vwap: true, rsi: true },
    fields: [
      ['capital', 'Trading Pool (₹)'], ['riskPct', 'Risk per trade (%)'], ['leverage', 'Leverage (×)'], ['stopAtr', 'Stop (× ATR)'], ['target1R', 'Target 1 (R)'], ['target2R', 'Target 2 (R)'],
      ['adxMin', 'Min ADX'], ['relVolMin', 'Min rel. volume'], ['htfMultiple', 'Higher TF (× bars)'], ['htfEma', 'Higher TF EMA'], ['orMinutes', 'Opening range (min)'],
      ['entryStartMin', 'Entries from (min of day)'], ['entryEndMin', 'Entries until (min of day)'], ['exitMin', 'Exit by (min of day)'],
      ['maxTradesPerDay', 'Max trades / day'], ['maxDailyLossR', 'Max daily loss (R)'], ['minAtrPct', 'Min ATR (% of price)'], ['maxAtrPct', 'Max ATR (% of price)'],
      ['cooldownBars', 'Cool-down (bars)'], ['validBars', 'Signal valid for (bars)'], ['allowShort', 'Allow short setups'], ['emaCross', 'EMA cross setup'], ['openingRange', 'Opening-range setup'],
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
  if (typeof t === 'number') return new Date(t * 1000).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  if (typeof t === 'string' && t.includes('T')) return `${new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST`;
  return t;
}

function estimateFee(price, qty, isIntraday) {
  if (!price || !qty || qty < 1) return 0;
  const legs = [
    { side: 'BUY', qty, price },
    { side: 'SELL', qty, price: price * (isIntraday ? 1.01 : 1.03) },
  ];
  return tradeCosts(legs, isIntraday ? 'intraday' : 'delivery').total;
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
      <h4 className="text-[11px] text-gray-400 uppercase tracking-wider mb-1.5 font-semibold">{title}</h4>
      {s.count === 0 ? (
        <p className="text-[11px] text-gray-500">No closed trades in this period.</p>
      ) : (
        <>
          {/* Visual Win Rate Bar */}
          <div className="p-2 rounded mb-2" style={{ backgroundColor: '#111827', border: '1px solid rgba(30, 45, 61, 0.4)' }}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-[10px] text-gray-400 uppercase font-medium">Win Rate</span>
              <span className="font-mono font-bold text-xs" style={{ color: GREEN }}>
                {pct(s.winRate * 100)} ({s.wins}W / {s.count - s.wins}L)
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden flex" style={{ backgroundColor: 'rgba(30, 45, 61, 0.8)' }}>
              <div style={{ width: `${s.winRate * 100}%`, backgroundColor: GREEN }} />
              <div style={{ width: `${(1 - s.winRate) * 100}%`, backgroundColor: RED }} />
            </div>
          </div>
          <Row label="Trades Count" value={`${s.count} (${s.wins} won)`} />
          <Row label="Net P&L (after costs)" value={inr(s.netPnl)} color={s.netPnl >= 0 ? GREEN : RED} />
          <Row label="Profit Factor" value={s.profitFactor === null ? '—' : num(s.profitFactor)} />
          <Row label="Expectancy (avg R)" value={num(s.expectancyR)} color={s.expectancyR >= 0 ? GREEN : RED} />
          <Row label="Max Drawdown" value={`${inr(s.maxDrawdown)} (${pct(s.maxDrawdownPct)})`} />
          <Row label="Total Costs Paid" value={inr(s.totalCosts)} />
        </>
      )}
    </div>
  );
}

// Swing Candidates Explorer Component
function SwingCandidatesExplorer({ onSelectStock, currentSymbol }) {
  const selection = useUniverseSelection();
  const { stocks } = useUniverseStocks(selection.universe);
  const scanStocks = useMemo(() => (stocks ? stocks.slice(0, 40) : []), [stocks]);
  const daily = useScreenerData(scanStocks, true);
  const [filter, setFilter] = useState('all');

  const candidates = useMemo(() => {
    const rows = daily.rows || [];
    const validSetups = swingSetupList(rows, { actionable: true });
    const uptrends = trendingList(rows, 'up', 22);

    const map = new Map();
    validSetups.forEach((s) => {
      map.set(s.symbol, {
        symbol: s.symbol,
        name: s.name,
        sector: s.sector,
        price: s.price,
        changePct: s.changePct,
        type: (s.signal?.strategy || 'Swing Setup').toUpperCase(),
        entry: s.signal?.entry,
        stop: s.signal?.stop,
        target1: s.signal?.target1,
        rr: s.signal?.rr || 2,
        adx: s.adx,
        rsi: s.rsi,
        isSetup: true,
      });
    });

    uptrends.forEach((u) => {
      if (!map.has(u.symbol)) {
        map.set(u.symbol, {
          symbol: u.symbol,
          name: u.name,
          sector: u.sector,
          price: u.price,
          changePct: u.changePct,
          type: 'STRONG UPTREND',
          entry: u.price,
          stop: u.price * 0.96,
          target1: u.price * 1.06,
          rr: 1.5,
          adx: u.adx,
          rsi: u.rsi,
          isSetup: false,
        });
      }
    });

    let list = Array.from(map.values());
    if (filter === 'setups') list = list.filter((c) => c.isSetup);
    if (filter === 'trends') list = list.filter((c) => !c.isSetup);
    return list;
  }, [daily.rows, filter]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-1 pb-2 mb-2" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <div className="flex gap-1">
          {[
            ['all', 'All'],
            ['setups', 'Setups'],
            ['trends', 'Trends'],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`px-2 py-0.5 text-[10px] rounded cursor-pointer transition-colors ${
                filter === id ? 'bg-green-500/15 text-green-400 font-medium' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-gray-500">
          {daily.loading ? `Scanning… ${daily.done}/${daily.total}` : `${candidates.length} candidates`}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5">
        {candidates.length === 0 ? (
          <p className="py-4 text-xs text-gray-500 text-center">
            {daily.loading ? 'Scanning universe for setups…' : 'No candidates match current criteria.'}
          </p>
        ) : (
          candidates.map((c, i) => {
            const isSelected = currentSymbol === c.symbol;
            return (
              <div
                key={c.symbol}
                onClick={() => onSelectStock?.({ symbol: c.symbol, name: c.name, sector: c.sector })}
                className="p-2 rounded cursor-pointer transition-all hover:bg-white/5"
                style={{
                  backgroundColor: isSelected ? 'rgba(0, 230, 118, 0.08)' : '#111827',
                  border: isSelected ? '1px solid rgba(0, 230, 118, 0.3)' : '1px solid rgba(30, 45, 61, 0.4)',
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-bold text-gray-200">{c.symbol}</span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold" style={{ backgroundColor: c.isSetup ? 'rgba(0, 230, 118, 0.15)' : 'rgba(0, 229, 255, 0.15)', color: c.isSetup ? GREEN : '#00e5ff' }}>
                      {c.type}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-xs text-gray-200">₹{px(c.price)}</span>
                    <span className="ml-1 text-[10px] font-mono" style={{ color: (c.changePct ?? 0) >= 0 ? GREEN : RED }}>
                      {(c.changePct ?? 0) >= 0 ? '+' : ''}{pct(c.changePct)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono">
                  <span>Entry: ₹{px(c.entry)} | Stop: ₹{px(c.stop)}</span>
                  <span style={{ color: '#00e5ff' }}>R:R 1:{num(c.rr, 1)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function StrategyWorkspace({ mode, selectedStock, demoMode, onSelectStock }) {
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
    if (h) setHistory(h);
    else setHistory((prev) => prev ?? null);
    if (m) setMarket(m);
    setLoading(false);
    if (h) setLoadedAt(Date.now());
    return Boolean(h);
  }, [symbol, frame.range, frame.interval]);

  // Intraday and Swing both refresh on the shared 60 s scheduler without remounting the chart
  const feed = useRefresh(
    `workspace:${mode}:${symbol}:${frame.range}:${frame.interval}`,
    async () => ((await load()) ? { ok: true } : null),
    !demoMode,
  );

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
  
  // What has happened to each signal since it fired
  const lifecycles = useMemo(
    () => new Map(signals.map((s) => [s.id, evaluateSignal(s, analysis, { validBars: config.validBars, intraday: mode === 'intraday' })])),
    [signals, analysis, config.validBars, mode]
  );
  const active = signals.filter((s) => lifecycles.get(s.id)?.actionable);
  const selected = signals.find((s) => s.id === selectedId) ?? active.at(-1) ?? signals.at(-1) ?? null;
  const selectedLife = selected ? lifecycles.get(selected.id) : null;
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
  const estCost = selected && size ? estimateFee(selected.entry, size.qty, mode === 'intraday') : 0;

  // Tabs list based on mode
  const tabsList = mode === 'swing'
    ? [
        ['signal', 'Trade Setup'],
        ['candidates', 'Candidates Scan'],
        ['history', `Past Setups (${signals.length})`],
        ['performance', 'Performance & Walk-Forward'],
        ['settings', 'Capital Allocator'],
      ]
    : [
        ['signal', 'Active Signal'],
        ['history', `Trade History (${signals.length})`],
        ['performance', 'Performance'],
        ['settings', 'Risk & Settings'],
      ];

  return (
    <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-y-auto lg:overflow-hidden" style={{ backgroundColor: '#0a0e17' }}>
      {/* Primary Chart Area */}
      <div className="flex flex-col flex-1 min-w-0 min-h-[420px]">
        {/* Top Header Bar */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)', backgroundColor: '#0d1117' }}>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-gray-200">{def.title}</span>
            <span className="text-xs font-mono font-semibold" style={{ color: '#00e5ff' }}>{symbol}</span>
            {selectedStock.name && <span className="hidden sm:inline text-[11px] text-gray-400">({selectedStock.name})</span>}
          </div>

          {/* Timeframe Selectors */}
          <div className="flex items-center gap-1 ml-2">
            {def.timeframes.map((t) => (
              <button
                key={t.id}
                onClick={() => setTf(t.id)}
                className={`px-2 py-1 text-xs rounded cursor-pointer transition-colors ${
                  tf === t.id ? 'bg-green-500/15 text-green-400 font-medium' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Indicators Dropdown */}
          <details className="relative">
            <summary className="px-2 py-1 text-xs rounded cursor-pointer text-gray-400 hover:text-gray-200 list-none flex items-center gap-1">
              <SlidersHorizontal size={12} /> Indicators ▾
            </summary>
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

          {/* Session / Market Status Pill */}
          <span
            className="text-[10px] px-2 py-0.5 rounded font-medium"
            style={{ color: statusMeta.color, backgroundColor: 'rgba(30, 45, 61, 0.4)' }}
            title={statusMeta.description}
          >
            {statusMeta.label}
          </span>
          {history?.asOf && <span className="hidden sm:inline text-[10px] text-gray-500">as of {formatTime(history.asOf)}</span>}
          {!demoMode && <Freshness lastSuccessAt={feed.lastSuccessAt} failures={feed.failures} />}
          <button onClick={load} disabled={loading} aria-label="Refresh" className="p-1.5 rounded text-gray-400 hover:text-gray-200 hover:bg-white/5 cursor-pointer">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Subtitle / Horizon Badge */}
        <div className="flex items-center justify-between px-3 py-1 text-[10px] text-gray-500" style={{ backgroundColor: '#0a0e17' }}>
          <span>{def.blurb}</span>
          {mode === 'intraday' && (
            <span className="font-mono text-gray-400">Session: 09:15 – 15:15 IST (Auto Square-Off 15:15)</span>
          )}
          {mode === 'swing' && (
            <span className="font-mono text-gray-400">Holding Horizon: 3 to 15 Trading Days</span>
          )}
        </div>

        {/* Market Session & Entry Gate Alert */}
        {!gate.actionable && (
          <div
            className="mx-3 my-1 px-3 py-2 rounded text-[11px] flex items-center gap-2"
            role="status"
            style={{ backgroundColor: 'rgba(255, 214, 0, 0.08)', color: '#ffd600', border: '1px solid rgba(255, 214, 0, 0.25)' }}
          >
            <AlertTriangle size={14} className="flex-shrink-0" />
            <div>
              <span className="font-semibold">New entries currently locked:</span> {gate.reasons.join('; ')}. Past setups remain on the chart for historical review.
            </div>
          </div>
        )}

        {/* Candlestick & Indicator Chart */}
        <div className="flex flex-col flex-1 min-h-0">
          {analysis.length === 0 ? (
            <p className="px-4 py-8 text-xs text-gray-500">{loading ? 'Loading candles…' : 'No candles available for this stock and timeframe.'}</p>
          ) : (
            <TradingChart
              candleData={analysis}
              indicators={indicators}
              signals={signals}
              trades={result.trades}
              selectedId={selected?.id ?? null}
              onSelectSignal={setSelectedId}
              intraday={mode === 'intraday'}
              resetKey={`${symbol}|${frame.interval}|${frame.range}`}
            />
          )}
        </div>
      </div>

      {/* Institutional Trade Setup & Management Console */}
      <aside className="flex flex-col flex-shrink-0 overflow-hidden w-full lg:w-[380px] max-h-[75vh] lg:max-h-none" style={{ borderLeft: '1px solid rgba(30, 45, 61, 0.3)', backgroundColor: '#0d1117' }}>
        {/* Navigation Tabs */}
        <div className="flex gap-1 px-2 py-2 flex-shrink-0 overflow-x-auto" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
          {tabsList.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-2 py-1 text-xs rounded whitespace-nowrap cursor-pointer transition-colors ${
                tab === id ? 'bg-green-500/15 text-green-400 font-medium' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Scrollable Tab Content */}
        <div className="flex-1 overflow-y-auto px-3 py-2.5">
          {/* TAB 1: ACTIVE SIGNAL / TRADE PLAN */}
          {tab === 'signal' && (
            selected ? (
              <div className="space-y-3">
                {/* 1. Action Hero Header */}
                <div
                  className="p-3 rounded-lg overflow-hidden"
                  style={{
                    backgroundColor: '#111827',
                    border: `1px solid ${selected.side === 'BUY' ? 'rgba(0, 230, 118, 0.3)' : 'rgba(255, 23, 68, 0.3)'}`,
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="px-2.5 py-1 text-xs font-bold rounded tracking-wider flex items-center gap-1.5"
                        style={{
                          backgroundColor: selected.side === 'BUY' ? 'rgba(0, 230, 118, 0.2)' : 'rgba(255, 23, 68, 0.2)',
                          color: selected.side === 'BUY' ? GREEN : RED,
                          border: `1px solid ${selected.side === 'BUY' ? 'rgba(0, 230, 118, 0.4)' : 'rgba(255, 23, 68, 0.4)'}`,
                        }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: selected.side === 'BUY' ? GREEN : RED }} />
                        {selected.side === 'BUY' ? 'BUY LONG' : 'SELL SHORT'}
                      </span>
                      <span className="text-xs font-semibold text-gray-200 uppercase tracking-wide">
                        {selected.strategy}
                      </span>
                    </div>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded font-medium"
                      style={{
                        backgroundColor: 'rgba(30, 45, 61, 0.6)',
                        color: selectedLife?.actionable && gate.actionable ? GREEN : '#94a3b8',
                        border: '1px solid rgba(30, 45, 61, 0.8)',
                      }}
                    >
                      {selectedLife?.actionable ? (gate.actionable ? 'ACTIVE' : 'LOCKED (SESSION)') : (selectedLife?.label ?? 'PAST').toUpperCase()}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-gray-400">
                    <span>Signal: <strong className="text-gray-200">{formatTime(selected.time)}</strong></span>
                    <span>{Number.isFinite(selectedLife?.ageBars) ? `${selectedLife.ageBars} bars ago` : 'Latest'}</span>
                  </div>
                </div>

                {/* 2. For Swing Mode: Multi-Horizon Trend Concordance */}
                {mode === 'swing' && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Multi-Horizon Trend Concordance</h4>
                      <span className="text-[9px] font-mono font-bold" style={{ color: GREEN }}>ALIGNED</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <div className="p-2 rounded text-center" style={{ backgroundColor: '#111827', border: '1px solid rgba(30, 45, 61, 0.4)' }}>
                        <div className="text-[9px] text-gray-400 uppercase font-medium mb-0.5">Weekly (1W)</div>
                        <div className="text-[10px] font-bold" style={{ color: GREEN }}>BULLISH</div>
                        <div className="text-[8px] text-gray-400 mt-0.5">&gt; 10W EMA</div>
                      </div>
                      <div className="p-2 rounded text-center" style={{ backgroundColor: '#111827', border: '1px solid rgba(30, 45, 61, 0.4)' }}>
                        <div className="text-[9px] text-gray-400 uppercase font-medium mb-0.5">Daily (1D)</div>
                        <div className="text-[10px] font-bold" style={{ color: GREEN }}>UPTREND</div>
                        <div className="text-[8px] text-gray-400 mt-0.5">20 &gt; 50 EMA</div>
                      </div>
                      <div className="p-2 rounded text-center" style={{ backgroundColor: '#111827', border: '1px solid rgba(30, 45, 61, 0.4)' }}>
                        <div className="text-[9px] text-gray-400 uppercase font-medium mb-0.5">Momentum</div>
                        <div className="text-[10px] font-bold" style={{ color: '#00e5ff' }}>HEALTHY</div>
                        <div className="text-[8px] text-gray-400 mt-0.5">RSI 40–65</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. Execution Levels Grid */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-lg" style={{ backgroundColor: '#111827', border: '1px solid rgba(30, 45, 61, 0.5)' }}>
                    <div className="text-[10px] uppercase tracking-wider text-gray-400 font-medium mb-0.5">Entry Zone</div>
                    <div className="text-xs font-mono font-semibold text-gray-200">
                      ₹{px(selected.entryZone[0])} – ₹{px(selected.entryZone[1])}
                    </div>
                    <div className="text-[9px] text-gray-400 mt-0.5">Spread: ₹{(selected.entryZone[1] - selected.entryZone[0]).toFixed(2)}</div>
                  </div>

                  <div className="p-2.5 rounded-lg" style={{ backgroundColor: '#111827', border: '1px solid rgba(255, 23, 68, 0.3)' }}>
                    <div className="text-[10px] uppercase tracking-wider font-medium mb-0.5" style={{ color: RED }}>Stop-Loss Floor</div>
                    <div className="text-xs font-mono font-bold" style={{ color: RED }}>
                      ₹{px(selected.stop)}
                    </div>
                    <div className="text-[9px] text-red-400/80 mt-0.5">
                      -{Math.abs(selected.entry - selected.stop).toFixed(2)} pts (-{((Math.abs(selected.entry - selected.stop) / selected.entry) * 100).toFixed(1)}%)
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg" style={{ backgroundColor: '#111827', border: '1px solid rgba(0, 230, 118, 0.3)' }}>
                    <div className="text-[10px] uppercase tracking-wider font-medium mb-0.5" style={{ color: GREEN }}>Target 1 (+{num(config.target1R, 1)}R)</div>
                    <div className="text-xs font-mono font-bold" style={{ color: GREEN }}>
                      ₹{px(selected.target1)}
                    </div>
                    <div className="text-[9px] text-green-400/80 mt-0.5">
                      +{Math.abs(selected.target1 - selected.entry).toFixed(2)} pts (+{((Math.abs(selected.target1 - selected.entry) / selected.entry) * 100).toFixed(1)}%)
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg" style={{ backgroundColor: '#111827', border: '1px solid rgba(0, 230, 118, 0.3)' }}>
                    <div className="text-[10px] uppercase tracking-wider font-medium mb-0.5" style={{ color: GREEN }}>Target 2 (+{num(config.target2R, 1)}R)</div>
                    <div className="text-xs font-mono font-bold" style={{ color: GREEN }}>
                      ₹{px(selected.target2)}
                    </div>
                    <div className="text-[9px] text-green-400/80 mt-0.5">
                      +{Math.abs(selected.target2 - selected.entry).toFixed(2)} pts (+{((Math.abs(selected.target2 - selected.entry) / selected.entry) * 100).toFixed(1)}%)
                    </div>
                  </div>
                </div>

                {/* 4. Risk-to-Reward Ratio Gauge */}
                <div className="p-2.5 rounded-lg" style={{ backgroundColor: '#111827', border: '1px solid rgba(30, 45, 61, 0.5)' }}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-[11px] text-gray-400 font-medium">Risk : Reward Ratio</span>
                    <span className="font-mono font-bold text-xs" style={{ color: '#00e5ff' }}>
                      1 : {num(selected.rr, 1)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden flex" style={{ backgroundColor: 'rgba(30, 45, 61, 0.8)' }}>
                    <div style={{ width: `${(1 / (1 + (selected.rr || 1))) * 100}%`, backgroundColor: RED }} title="1R Risk" />
                    <div style={{ width: `${((selected.rr || 1) / (1 + (selected.rr || 1))) * 100}%`, backgroundColor: GREEN }} title={`${selected.rr}R Reward`} />
                  </div>
                  <div className="flex justify-between text-[9px] text-gray-500 mt-1 font-mono">
                    <span style={{ color: RED }}>1.0R Risk (Stop Floor)</span>
                    <span style={{ color: GREEN }}>{num(selected.rr, 1)}R Target Potential</span>
                  </div>
                </div>

                {/* 5. Dynamic Position Sizing & Allocation Box */}
                <div className="p-2.5 rounded-lg" style={{ backgroundColor: '#111827', border: '1px solid rgba(30, 45, 61, 0.5)' }}>
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Position Sizing & Risk</span>
                    {size?.cappedByCapital && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: 'rgba(255, 214, 0, 0.15)', color: '#ffd600' }}>
                        Capital Capped
                      </span>
                    )}
                  </div>
                  {size ? (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400">Order Quantity</span>
                        <span className="font-mono font-semibold text-gray-200">{size.qty} shares</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400">Capital Outlay</span>
                        <span className="font-mono font-semibold text-gray-200">{inr(size.outlay)}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400">Risk at Stake ({config.riskPct}%)</span>
                        <span className="font-mono font-semibold" style={{ color: RED }}>{inr(size.riskAmount)}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400">Est. Brokerage & Taxes</span>
                        <span className="font-mono font-semibold text-gray-300">{inr(estCost)}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-500">Capital pool or risk budget rounds to below 1 share.</p>
                  )}
                </div>

                {/* 6. Rule Confluence Matrix */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Rule Confluence Matrix</h4>
                    <span className="text-[9px] font-mono font-bold" style={{ color: GREEN }}>CONDITIONS MET</span>
                  </div>
                  <div className="p-2.5 rounded-lg" style={{ backgroundColor: '#111827', border: '1px solid rgba(30, 45, 61, 0.4)' }}>
                    <p className="text-xs text-gray-300 mb-2 leading-relaxed">{selected.explanation}</p>
                    <ul className="space-y-1.5">
                      {selected.confirmations.map((c, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-300">
                          <CheckCircle2 size={13} className="text-green-400 flex-shrink-0 mt-0.5" />
                          <span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* 7. Structural Invalidation */}
                <div className="p-2.5 rounded-lg" style={{ backgroundColor: 'rgba(255, 23, 68, 0.04)', border: '1px solid rgba(255, 23, 68, 0.2)' }}>
                  <div className="flex items-center gap-1.5 mb-1 text-red-400">
                    <Shield size={12} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Structural Invalidation</span>
                  </div>
                  <p className="text-[11px] text-gray-300 leading-relaxed">{selected.invalidation}</p>
                </div>

                {/* 8. For Swing Mode: Overnight Gap-Risk Advisory */}
                {mode === 'swing' && (
                  <div className="p-2.5 rounded-lg" style={{ backgroundColor: 'rgba(255, 214, 0, 0.05)', border: '1px solid rgba(255, 214, 0, 0.25)' }}>
                    <div className="flex items-center gap-1.5 mb-1" style={{ color: '#ffd600' }}>
                      <AlertTriangle size={12} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Overnight Holding Gap-Risk Advisory</span>
                    </div>
                    <p className="text-[10px] text-gray-300 leading-relaxed">
                      Swing positions hold overnight across market sessions. Price can gap over session breaks. Use GTT or SL-M stop orders and size positions strictly within risk limits.
                    </p>
                  </div>
                )}

                {/* 9. Simulated Backtest Outcome if resolved */}
                {outcome && (
                  <div className="p-2.5 rounded-lg" style={{ backgroundColor: '#111827', border: '1px solid rgba(30, 45, 61, 0.5)' }}>
                    <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Simulated Backtest Outcome</div>
                    <div className="flex items-center justify-between text-xs font-mono font-bold">
                      <span className="text-gray-200">{outcome.exitReason}</span>
                      <span style={{ color: outcome.net >= 0 ? GREEN : RED }}>
                        {num(outcome.rMultiple)}R ({inr(outcome.net)})
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-lg text-center space-y-2" style={{ backgroundColor: '#111827', border: '1px solid rgba(30, 45, 61, 0.4)' }}>
                <Activity size={24} className="mx-auto text-gray-500" />
                <h4 className="text-xs font-semibold text-gray-300">WAIT / NO SETUP MATCHED</h4>
                <p className="text-[11px] text-gray-400">
                  No setup currently meets the strict {mode} rules on {symbol}. Capital preservation is active; wait for rule confluence before entering.
                </p>
                {mode === 'swing' && (
                  <button
                    onClick={() => setTab('candidates')}
                    className="mt-2 px-3 py-1.5 text-xs rounded font-medium cursor-pointer"
                    style={{ backgroundColor: 'rgba(0, 230, 118, 0.15)', color: GREEN, border: '1px solid rgba(0, 230, 118, 0.3)' }}
                  >
                    Explore Swing Candidates Scan →
                  </button>
                )}
              </div>
            )
          )}

          {/* TAB 2: CANDIDATES SCAN (Swing Mode Only) */}
          {tab === 'candidates' && mode === 'swing' && (
            <SwingCandidatesExplorer
              onSelectStock={(stock) => {
                onSelectStock?.(stock);
                setTab('signal');
              }}
              currentSymbol={symbol}
            />
          )}

          {/* TAB: TRADE HISTORY */}
          {tab === 'history' && (
            <div className="space-y-1.5">
              {signals.length === 0 ? (
                <p className="py-4 text-xs text-gray-500 text-center">No signals detected in this period.</p>
              ) : (
                [...signals].reverse().slice(0, 80).map((s) => {
                  const o = outcomeOf(s.id);
                  const isCur = selected?.id === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => { setSelectedId(s.id); setTab('signal'); }}
                      className="w-full flex items-center justify-between gap-2 p-2 rounded text-left cursor-pointer transition-all hover:bg-white/5"
                      style={{
                        backgroundColor: isCur ? 'rgba(0, 230, 118, 0.08)' : '#111827',
                        border: isCur ? '1px solid rgba(0, 230, 118, 0.3)' : '1px solid rgba(30, 45, 61, 0.3)',
                      }}
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold" style={{ color: s.side === 'BUY' ? GREEN : RED }}>
                            {s.side === 'BUY' ? 'BUY' : 'SHORT'}
                          </span>
                          <span className="text-xs text-gray-200">{s.strategy}</span>
                        </div>
                        <div className="text-[10px] text-gray-500">{formatTime(s.time)}</div>
                      </div>
                      <span className="text-xs font-mono font-semibold" style={{ color: o ? (o.net >= 0 ? GREEN : RED) : '#64748b' }}>
                        {o ? `${num(o.rMultiple)}R` : 'pending'}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* TAB: PERFORMANCE & BACKTEST */}
          {tab === 'performance' && (
            <div className="space-y-3">
              <p className="text-[10px] text-gray-500">
                Simulated on {analysis.length} {frame.label} candles of {symbol} using current rules and assumed statutory transaction charges.
              </p>

              <Stats title="All Historical Trades" s={result.overall} />
              <Row label="Buy & Hold (Same Period)" value={pct(result.benchmarkPct)} />

              {risk && (
                <div className="p-2.5 rounded" style={{ backgroundColor: '#111827', border: '1px solid rgba(30, 45, 61, 0.4)' }}>
                  <h4 className="text-[11px] text-gray-400 uppercase tracking-wider mb-1.5 font-semibold">Today&apos;s Simulated Risk Budget</h4>
                  <Row label="Trades Executed" value={`${risk.trades} of ${config.maxTradesPerDay}`} />
                  <Row label="Net Realised Today" value={`${num(risk.netR)}R (${inr(risk.net)})`} color={risk.net >= 0 ? GREEN : RED} />
                  <Row label="Loss Budget Left" value={`${num(risk.lossRLeft)}R of ${config.maxDailyLossR}R`} />
                </div>
              )}

              <Stats title="In-Sample Training (60%)" s={result.segments.training} />
              <Stats title="Validation (20%)" s={result.segments.validation} />
              <Stats title="Out-of-Sample Test (20%)" s={result.segments.outOfSample} />

              <div>
                <h4 className="text-[11px] text-gray-400 uppercase tracking-wider mb-1 font-semibold">Walk-Forward Rolling Windows</h4>
                {result.walkForward.map((w, i) => (
                  <Row
                    key={i}
                    label={`${formatTime(w.from)} → ${formatTime(w.to)}`}
                    value={w.count ? `${w.count} trades · ${num(w.expectancyR)}R` : 'no trades'}
                    color={w.count && w.expectancyR < 0 ? RED : undefined}
                  />
                ))}
              </div>

              <p className="text-[10px] text-gray-500 leading-relaxed pt-2">
                Fills at next bar open + {slippage} bps slippage. Bars hitting stop and target simultaneously count as stopped out. STT, exchange fees, SEBI, stamp duty, and GST reflect standard Indian broker rates.
              </p>
            </div>
          )}

          {/* TAB: SETTINGS & CAPITAL ALLOCATOR */}
          {tab === 'settings' && (
            <div className="space-y-2.5">
              <p className="text-[10px] text-gray-500">
                Rule and risk parameters stored locally for {mode}.
              </p>
              {def.fields.map(([key, label]) => (
                typeof def.defaults[key] === 'boolean' ? (
                  <label key={key} className="flex items-center justify-between text-xs text-gray-300 cursor-pointer py-1">
                    {label}
                    <input
                      type="checkbox"
                      checked={Boolean(config[key])}
                      onChange={(e) => updateConfig(key, e.target.checked)}
                      className="cursor-pointer"
                    />
                  </label>
                ) : (
                  <label key={key} className="flex items-center justify-between gap-2 text-xs text-gray-300 py-1">
                    <span>{label}</span>
                    <input
                      type="number"
                      step="any"
                      value={config[key]}
                      onChange={(e) => e.target.value !== '' && updateConfig(key, Number(e.target.value))}
                      className="w-24 px-2 py-1 text-xs rounded bg-transparent text-gray-200 border border-gray-700 focus:border-green-500 outline-none text-right font-mono"
                    />
                  </label>
                )
              ))}

              <label className="flex items-center justify-between gap-2 text-xs text-gray-300 py-1">
                <span>Slippage per side (bps)</span>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={slippage}
                  onChange={(e) => {
                    const v = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                    setSlippage(v);
                    window.localStorage.setItem(SLIPPAGE_KEY, JSON.stringify(v));
                  }}
                  className="w-24 px-2 py-1 text-xs rounded bg-transparent text-gray-200 border border-gray-700 focus:border-green-500 outline-none text-right font-mono"
                />
              </label>

              <button
                onClick={resetConfig}
                className="w-full mt-2 px-3 py-1.5 text-xs rounded font-medium cursor-pointer transition-colors"
                style={{ backgroundColor: 'rgba(30, 45, 61, 0.5)', color: '#d1d5db', border: '1px solid #1e2d3d' }}
              >
                Reset to Recommended Defaults
              </button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
