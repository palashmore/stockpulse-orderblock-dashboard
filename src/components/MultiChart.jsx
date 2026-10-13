import { useEffect, useMemo, useState } from 'react';
import { Maximize2, Minimize2, RefreshCw, Layers, Grid, Link2, Unlink } from 'lucide-react';
import TradingChart from './TradingChart';
import { fetchHistory, searchStocks } from '../services/api';
import { TIMEFRAMES } from '../data/timeframes';
import { aggregateCandles } from '../data/timeframes';
import { loadLayout, saveLayout, cellTimeframe, setCellSymbol, setCellTimeframe, COUNTS, cellSymbol } from '../data/multiChart';
import { createChartLink } from '../data/chartLink';
import { useWatchlist } from '../hooks/useWatchlist';
import { STATUS_META } from '../data/dataStatus';

const INDICATORS = { ema20: true, ema50: true, vwap: true };

function SymbolPicker({ value, onPick, quick }) {
  const [text, setText] = useState('');
  const [hits, setHits] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const q = text.trim();
    if (q.length < 2) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const r = await searchStocks(q);
      if (!cancelled) setHits(r.slice(0, 8));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text]);
  const shown = text.trim().length >= 2 ? hits : [];

  return (
    <div className="relative">
      <input
        value={open ? text : value}
        onFocus={() => {
          setOpen(true);
          setText('');
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => setText(e.target.value)}
        aria-label={`Symbol (${value})`}
        className="w-28 px-2 py-1 text-xs font-bold rounded text-gray-100 border border-gray-700 focus:border-green-500 outline-none uppercase"
        style={{ backgroundColor: '#111827' }}
      />
      {open && (shown.length > 0 || (text.trim() === '' && quick.length > 0)) && (
        <div
          className="absolute z-30 mt-1 w-64 max-h-64 overflow-y-auto rounded-lg shadow-2xl"
          style={{ backgroundColor: '#151d2b', border: '1px solid #1e2d3d' }}
        >
          {text.trim() === '' && (
            <p className="px-3 py-1.5 text-[10px] text-gray-500 uppercase tracking-wider font-medium" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.4)' }}>
              From Your Watchlist
            </p>
          )}
          {(shown.length > 0 ? shown : quick.map((s) => ({ symbol: s, name: '' }))).map((s) => (
            <button
              key={s.symbol}
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(s.symbol);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-white/5 cursor-pointer flex items-center justify-between"
            >
              <span className="font-bold text-gray-200">{s.symbol}</span>
              <span className="text-[11px] text-gray-500">{s.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ChartCell({ symbol, frame, onSymbol, onFrame, linked, expanded, onExpand, quick, link, linkId }) {
  const request = `${symbol}|${frame.id}`;
  const [state, setState] = useState({ request: '', status: 'loading', data: null, error: '' });
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchHistory(symbol, frame.range, frame.interval, { force: reloadTick > 0 }).then((h) => {
      if (cancelled) return;
      setState(
        h
          ? { request, status: 'ready', data: h, error: '' }
          : { request, status: 'error', data: null, error: 'No candle data available for this symbol and timeframe' }
      );
    });
    return () => {
      cancelled = true;
    };
  }, [request, symbol, frame.range, frame.interval, reloadTick]);

  const current = state.request === request;
  const data = current ? state.data : null;
  const loading = !current;
  const candles = useMemo(() => {
    if (!data) return [];
    const done = data.candles.filter((c) => !c.partial);
    return frame.aggregate ? aggregateCandles(done, frame.aggregate) : done;
  }, [data, frame.aggregate]);
  const meta = STATUS_META[data?.dataStatus] ?? null;

  return (
    <div
      className="flex flex-col min-h-0 rounded-lg overflow-hidden"
      style={{ border: '1px solid rgba(30, 45, 61, 0.5)', backgroundColor: '#0d1117' }}
    >
      {/* Cell Header Toolbar */}
      <div
        className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.4)', backgroundColor: '#111827' }}
      >
        <SymbolPicker value={symbol} onPick={onSymbol} quick={quick} />
        {!linked && (
          <select
            value={frame.id}
            onChange={(e) => onFrame(e.target.value)}
            aria-label="Timeframe"
            className="px-2 py-1 text-xs rounded font-medium text-gray-200 border border-gray-700 outline-none cursor-pointer"
            style={{ backgroundColor: '#0d1117' }}
          >
            {TIMEFRAMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.id}
              </option>
            ))}
          </select>
        )}
        {linked && (
          <span className="text-[11px] px-1.5 py-0.5 rounded font-mono font-semibold bg-white/5 text-emerald-400">
            {frame.id}
          </span>
        )}
        <div className="flex-1" />
        {meta && (
          <span className="text-[10px] font-medium" style={{ color: meta.color }} title={meta.description}>
            {meta.label}
          </span>
        )}
        <button
          onClick={() => setReloadTick((t) => t + 1)}
          aria-label={`Reload ${symbol}`}
          className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/5 cursor-pointer"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
        <button
          onClick={onExpand}
          aria-label={expanded ? 'Back to grid' : `Expand ${symbol}`}
          className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/5 cursor-pointer"
        >
          {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        </button>
      </div>

      {/* Chart Viewport */}
      <div className="flex flex-col flex-1 min-h-0 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500 bg-black/20 z-10">
            Loading {symbol} ({frame.id})…
          </div>
        )}
        {!loading && state.status === 'error' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-xs text-center text-gray-500">
            <p style={{ color: '#ff1744' }}>{state.error}</p>
            <button onClick={() => setReloadTick((t) => t + 1)} className="mt-2 underline cursor-pointer font-medium" style={{ color: '#00e5ff' }}>
              Retry Fetch
            </button>
          </div>
        )}
        {!loading && candles.length > 0 && (
          <TradingChart
            candleData={candles}
            indicators={INDICATORS}
            intraday={frame.intraday}
            link={link}
            linkId={linkId}
            resetKey={request}
          />
        )}
      </div>

      {/* Timestamp footer */}
      {data && (
        <div
          className="px-3 py-1 text-[10px] text-gray-500 flex-shrink-0 flex items-center justify-between"
          style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)', backgroundColor: '#0a0e17' }}
        >
          <span>{data.provider}</span>
          <span>
            {typeof data.asOf === 'string' && data.asOf.includes('T')
              ? `${new Date(data.asOf).toLocaleString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'Asia/Kolkata',
                })} IST`
              : data.asOf}
          </span>
        </div>
      )}
    </div>
  );
}

export default function MultiChart({ initialSymbol }) {
  const [layout, setLayout] = useState(() => {
    const saved = loadLayout(window.localStorage);
    return initialSymbol ? setCellSymbol(saved, 0, initialSymbol) : saved;
  });
  const [expanded, setExpanded] = useState(null);
  const [storageOk, setStorageOk] = useState(true);
  const hub = useMemo(() => createChartLink(), []);
  const watch = useWatchlist();
  const quick = useMemo(() => [...watch.allSymbols].slice(0, 12), [watch.allSymbols]);

  const update = (next) => {
    setLayout(next);
    setStorageOk(saveLayout(next, window.localStorage));
  };

  const visible = expanded !== null ? [expanded] : [...Array(layout.count).keys()];
  const grid =
    expanded !== null
      ? 'grid-cols-1'
      : layout.count === 2
      ? 'grid-cols-1 md:grid-cols-2'
      : layout.count === 4
      ? 'grid-cols-1 md:grid-cols-2'
      : 'grid-cols-1 md:grid-cols-2 2xl:grid-cols-3';
  const rows = expanded !== null ? 1 : layout.count === 2 ? 1 : layout.count === 4 ? 2 : 2;

  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ backgroundColor: '#0a0e17' }}>
      {/* Institutional Top Control Toolbar */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.4)', backgroundColor: '#0d1117' }}
      >
        <div className="flex items-center gap-2">
          <Grid size={15} className="text-emerald-400" />
          <h2 className="text-xs font-bold text-gray-200 uppercase tracking-wider mr-2">Multi-Chart Terminal</h2>

          {/* Grid Count Selector */}
          <div className="flex items-center gap-1 rounded p-0.5" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
            {COUNTS.map((n) => (
              <button
                key={n}
                onClick={() => {
                  setExpanded(null);
                  update({ ...layout, count: n });
                }}
                className={`px-2.5 py-1 text-xs rounded font-medium cursor-pointer transition-all ${
                  layout.count === n ? 'bg-emerald-500/20 text-emerald-400 font-semibold' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {n} {n === 1 ? 'Chart' : 'Charts'}
              </button>
            ))}
          </div>
        </div>

        {/* Global Synchronizations */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={layout.linkTimeframe}
              onChange={(e) => update({ ...layout, linkTimeframe: e.target.checked })}
            />
            <span>Same Timeframe</span>
          </label>

          <label
            className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer"
            title="Move crosshair over one chart to sync across all charts"
          >
            <input
              type="checkbox"
              checked={layout.linkCrosshair}
              onChange={(e) => update({ ...layout, linkCrosshair: e.target.checked })}
            />
            <span className="flex items-center gap-1">
              <Link2 size={12} className={layout.linkCrosshair ? 'text-cyan-400' : 'text-gray-500'} />
              Sync Crosshairs
            </span>
          </label>

          <label
            className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer"
            title="Every chart shows the same stock; choosing a stock in any chart changes them all"
          >
            <input
              type="checkbox"
              checked={layout.linkSymbol}
              onChange={(e) => update({ ...layout, linkSymbol: e.target.checked })}
            />
            <span>Same Stock</span>
          </label>

          {/* Shared Timeframe bar when linked */}
          {layout.linkTimeframe && (
            <div className="flex items-center gap-1 ml-1 rounded p-0.5" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
              {TIMEFRAMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => update(setCellTimeframe(layout, 0, t.id))}
                  className={`px-2 py-0.5 text-xs rounded font-mono font-medium cursor-pointer transition-all ${
                    layout.timeframe === t.id
                      ? 'bg-emerald-500/20 text-emerald-400 font-bold'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {t.id}
                </button>
              ))}
            </div>
          )}

          {!storageOk && (
            <span className="text-[11px] font-medium" style={{ color: '#ff1744' }}>
              Browser storage blocked
            </span>
          )}
          {expanded !== null && (
            <button
              onClick={() => setExpanded(null)}
              className="px-2.5 py-1 text-xs rounded bg-white/10 text-gray-200 hover:bg-white/15 cursor-pointer font-medium"
            >
              Restore Grid
            </button>
          )}
        </div>
      </div>

      {/* Multi-Chart Grid Viewport */}
      <div
        className={`grid ${grid} gap-3 p-3 flex-1 min-h-0 overflow-y-auto`}
        style={{
          gridAutoRows: expanded !== null ? 'minmax(420px, 1fr)' : `minmax(340px, ${Math.floor(100 / rows)}%)`,
        }}
      >
        {visible.map((i) => (
          <ChartCell
            key={i}
            symbol={cellSymbol(layout, i)}
            frame={cellTimeframe(layout, i)}
            linked={layout.linkTimeframe}
            onSymbol={(s) => update(setCellSymbol(layout, i, s))}
            onFrame={(id) => update(setCellTimeframe(layout, i, id))}
            expanded={expanded === i}
            onExpand={() => setExpanded(expanded === i ? null : i)}
            quick={quick}
            link={layout.linkCrosshair ? hub : null}
            linkId={i}
          />
        ))}
      </div>

      <div className="px-4 py-2 text-[10px] text-gray-600 flex-shrink-0" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.3)' }}>
        Each chart cell operates in an isolated worker cycle with independent failure resilience. Linked crosshair matches nearest earlier timestamps across distinct timeframes.
      </div>
    </div>
  );
}
