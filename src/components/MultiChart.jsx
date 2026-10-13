import { useEffect, useMemo, useState } from 'react';
import { Maximize2, Minimize2, RefreshCw } from 'lucide-react';
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
    return () => { cancelled = true; clearTimeout(timer); };
  }, [text]);
  const shown = text.trim().length >= 2 ? hits : [];

  return (
    <div className="relative">
      <input
        value={open ? text : value}
        onFocus={() => { setOpen(true); setText(''); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => setText(e.target.value)}
        aria-label={`Symbol (${value})`}
        className="w-28 px-2 py-1 text-xs font-semibold rounded bg-transparent text-gray-200 border border-gray-700 focus:border-green-500 outline-none"
      />
      {open && (shown.length > 0 || (text.trim() === '' && quick.length > 0)) && (
        <div className="absolute z-30 mt-1 w-64 max-h-64 overflow-y-auto rounded-md" style={{ backgroundColor: '#151d2b', border: '1px solid #1e2d3d' }}>
          {text.trim() === '' && <p className="px-3 py-1 text-[10px] text-gray-600 uppercase tracking-wider">From your watchlist</p>}
          {(shown.length > 0 ? shown : quick.map((s) => ({ symbol: s, name: '' }))).map((s) => (
            <button key={s.symbol} onMouseDown={(e) => { e.preventDefault(); onPick(s.symbol); setOpen(false); }} className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-white/5 cursor-pointer">
              <span className="font-medium">{s.symbol}</span> <span className="text-gray-500">{s.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ChartCell({ symbol, frame, onSymbol, onFrame, linked, expanded, onExpand, quick, link, linkId }) {
  // Each cell loads its own data. The response is applied only if it still matches this cell's current
  // request, so changing the stock or timeframe quickly can never leave an older answer on screen.
  const request = `${symbol}|${frame.id}`;
  const [state, setState] = useState({ request: '', status: 'loading', data: null, error: '' });
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchHistory(symbol, frame.range, frame.interval, { force: reloadTick > 0 }).then((h) => {
      if (cancelled) return;
      setState(h ? { request, status: 'ready', data: h, error: '' } : { request, status: 'error', data: null, error: 'No data for this stock and timeframe' });
    });
    return () => { cancelled = true; };
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
    <div className="flex flex-col min-h-0 rounded-md overflow-hidden" style={{ border: '1px solid rgba(30, 45, 61, 0.5)', backgroundColor: 'rgba(13, 17, 23, 0.8)' }}>
      <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <SymbolPicker value={symbol} onPick={onSymbol} quick={quick} />
        {!linked && (
          <select value={frame.id} onChange={(e) => onFrame(e.target.value)} aria-label="Timeframe" className="px-1.5 py-1 text-xs rounded text-gray-300 border border-gray-700 outline-none" style={{ backgroundColor: '#0d1117' }}>
            {TIMEFRAMES.map((t) => <option key={t.id} value={t.id}>{t.id}</option>)}
          </select>
        )}
        {linked && <span className="text-[11px] text-gray-500">{frame.id}</span>}
        <div className="flex-1" />
        {meta && <span className="text-[10px]" style={{ color: meta.color }} title={meta.description}>{meta.label}</span>}
        <button onClick={() => setReloadTick((t) => t + 1)} aria-label={`Reload ${symbol}`} className="p-1 text-gray-500 hover:text-gray-200 cursor-pointer"><RefreshCw size={12} className={loading ? 'animate-spin' : ''} /></button>
        <button onClick={onExpand} aria-label={expanded ? 'Back to grid' : `Expand ${symbol}`} className="p-1 text-gray-500 hover:text-gray-200 cursor-pointer">{expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}</button>
      </div>

      <div className="flex flex-col flex-1 min-h-0">
        {loading && <p className="px-3 py-6 text-xs text-gray-500">Loading {symbol} {frame.id}…</p>}
        {!loading && state.status === 'error' && (
          <div className="px-3 py-6 text-xs text-gray-500">
            <p style={{ color: '#ff1744' }}>{state.error}.</p>
            <button onClick={() => setReloadTick((t) => t + 1)} className="mt-2 underline cursor-pointer" style={{ color: '#00e5ff' }}>Retry</button>
          </div>
        )}
        {!loading && candles.length > 0 && <TradingChart candleData={candles} indicators={INDICATORS} intraday={frame.intraday} link={link} linkId={linkId} resetKey={request} />}
      </div>

      {data && <p className="px-2 py-1 text-[10px] text-gray-600 flex-shrink-0">{data.provider} · as of {typeof data.asOf === 'string' && data.asOf.includes('T') ? `${new Date(data.asOf).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST` : data.asOf}</p>}
    </div>
  );
}

// Several charts side by side. Each chart owns its stock (and optionally its timeframe) and loads
// independently, so one slow or failed chart never affects the others. The layout is saved.
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
  const grid = expanded !== null ? 'grid-cols-1' : layout.count === 2 ? 'grid-cols-1 md:grid-cols-2' : layout.count === 4 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 2xl:grid-cols-3';
  const rows = expanded !== null ? 1 : layout.count === 2 ? 1 : layout.count === 4 ? 2 : 2;

  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ backgroundColor: '#0a0e17' }}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 flex-shrink-0" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mr-2">Multi-Chart</h2>
        {COUNTS.map((n) => (
          <button key={n} onClick={() => { setExpanded(null); update({ ...layout, count: n }); }} className={`px-2.5 py-1 text-xs rounded cursor-pointer ${layout.count === n ? 'bg-green-500/15 text-green-400' : 'text-gray-500 hover:text-gray-300'}`}>{n} charts</button>
        ))}
        <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer ml-2">
          <input type="checkbox" checked={layout.linkTimeframe} onChange={(e) => update({ ...layout, linkTimeframe: e.target.checked })} /> Same timeframe for all
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer" title="Move the pointer over one chart and the others show the same moment; scrolling or zooming one moves them all">
          <input type="checkbox" checked={layout.linkCrosshair} onChange={(e) => update({ ...layout, linkCrosshair: e.target.checked })} /> Link crosshair and zoom
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer" title="Every chart shows the same stock; choosing a stock in any chart changes them all. Turn off 'Same timeframe for all' to compare timeframes of one stock.">
          <input type="checkbox" checked={layout.linkSymbol} onChange={(e) => update({ ...layout, linkSymbol: e.target.checked })} /> Same stock in every chart
        </label>
        {layout.linkTimeframe && (
          <div className="flex gap-1">
            {TIMEFRAMES.map((t) => (
              <button key={t.id} onClick={() => update(setCellTimeframe(layout, 0, t.id))} className={`px-2 py-1 text-xs rounded cursor-pointer ${layout.timeframe === t.id ? 'bg-green-500/15 text-green-400' : 'text-gray-500 hover:text-gray-300'}`}>{t.id}</button>
            ))}
          </div>
        )}
        <div className="flex-1" />
        {!storageOk && <span className="text-[11px]" style={{ color: '#ff1744' }}>Layout could not be saved (browser storage blocked)</span>}
        {expanded !== null && <button onClick={() => setExpanded(null)} className="px-2 py-1 text-xs rounded bg-white/5 text-gray-300 hover:bg-white/10 cursor-pointer">Back to grid</button>}
      </div>

      <div className={`grid ${grid} gap-3 p-3 flex-1 min-h-0 overflow-y-auto`} style={{ gridAutoRows: expanded !== null ? 'minmax(420px, 1fr)' : `minmax(340px, ${Math.floor(100 / rows)}%)` }}>
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
      <p className="px-4 pb-2 text-[10px] text-gray-600 flex-shrink-0">
        Every chart loads on its own; a failure in one does not affect the others. With the crosshair linked, charts on different timeframes line up on the nearest earlier bar; a daily and an intraday chart cannot be matched to each other and stay independent. Choose a stock from search or your watchlist.
      </p>
    </div>
  );
}
