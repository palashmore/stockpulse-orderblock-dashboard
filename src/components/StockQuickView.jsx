import { useEffect, useMemo, useState } from 'react';
import { X, Star } from 'lucide-react';
import TradingChart from './TradingChart';
import { fetchHistory, createServerAlert } from '../services/api';
import { useWatchlist } from '../hooks/useWatchlist';
import { summariseStock } from '../data/quickView';
import { loadStrategyConfig } from '../data/strategyStore';
import { STATUS_META } from '../data/dataStatus';

const GREEN = '#00e676';
const RED = '#ff1744';
const rule = { borderBottom: '1px solid rgba(30, 45, 61, 0.3)' };
const INDICATORS = { ema20: true, ema50: true, ema200: true, vwap: true };
const STATE_COLOR = { VALID: GREEN, INVALID: '#ffd600', REVIEW: '#94a3b8', NONE: '#64748b', UNAVAILABLE: '#64748b' };

const px = (n) => (Number.isFinite(n) ? `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—');
const pct = (n) => (Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(2)}%` : '—');
const stamp = (v) => {
  if (!v) return null;
  const d = typeof v === 'string' && v.includes('T') ? new Date(v) : null;
  return d ? `${d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST` : String(v);
};

function Status({ title, status }) {
  return (
    <div className="px-4 py-2" style={rule}>
      <div className="text-[10px] text-gray-500 uppercase tracking-wider">{title}</div>
      <div className="text-xs" style={{ color: STATE_COLOR[status.state] }}>{status.label}</div>
      {status.levels && (
        <>
          <div className="mt-1 grid grid-cols-4 gap-2 text-[11px] font-mono">
            {[['Entry', status.levels.entry, '#e2e8f0'], ['Stop', status.levels.stop, RED], ['Target 1', status.levels.target1, GREEN], ['Target 2', status.levels.target2, GREEN]].map(([label, value, color]) => (
              <div key={label}><div className="text-[9px] text-gray-600 font-sans">{label}</div><div style={{ color }}>{Number.isFinite(value) ? value.toFixed(2) : '—'}</div></div>
            ))}
          </div>
          <div className="mt-1 text-[10px] text-gray-500">
            {status.levels.rr ? `${status.levels.rr}R to target 2 · ` : ''}{status.invalidation}. A rule match, not a forecast or advice.
          </div>
        </>
      )}
    </div>
  );
}

function AlertForm({ symbol, price }) {
  const [type, setType] = useState('above');
  const [level, setLevel] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const r = await createServerAlert({ symbol, type, threshold: Number(level) });
    setBusy(false);
    if (r.ok) { setNote('Alert created. The server checks it while the market is open.'); setLevel(''); }
    else if (r.status === 403) setNote('Server alerts work only on the computer running the server.');
    else setNote(r.body?.error || 'Could not create the alert');
  };
  return (
    <form onSubmit={submit} className="px-4 py-2" style={rule}>
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Price alert</div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Alert condition" className="px-2 py-1 text-xs rounded text-gray-200 border border-gray-700 outline-none" style={{ backgroundColor: '#0d1117' }}>
          <option value="above">Rises to / above</option>
          <option value="below">Falls to / below</option>
        </select>
        <input type="number" step="any" min="0" value={level} onChange={(e) => { setLevel(e.target.value); setNote(''); }} placeholder={Number.isFinite(price) ? price.toFixed(2) : 'Price'} aria-label="Alert price" className="w-24 px-2 py-1 text-xs rounded bg-transparent text-gray-200 border border-gray-700 focus:border-green-500 outline-none" />
        <button type="submit" disabled={busy || level === ''} className="px-2 py-1 text-xs rounded cursor-pointer bg-green-500/15 text-green-400 disabled:opacity-40">{busy ? 'Adding…' : 'Create alert'}</button>
      </div>
      {note && <p role="status" className="mt-1 text-[11px] text-gray-400">{note}</p>}
    </form>
  );
}

/** Side panel for one stock: chart, status, levels and actions, without leaving the Dashboard (its filters and index stay as they are). */
export default function StockQuickView({ stock, row, market, onClose, onOpen }) {
  const { symbol } = stock;
  const [state, setState] = useState({ symbol: '', daily: null, intraday: null, done: false, at: 0 });
  const [showZones, setShowZones] = useState(false);
  const daily = useWatchlist('daily');
  const swingList = useWatchlist('swing');

  // Each request is tied to its symbol, so a slow answer for an earlier stock can never replace the current one
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchHistory(symbol, '6mo', '1d', { bulk: true }), fetchHistory(symbol, '5d', '5m', { bulk: true })]).then(([d, i]) => {
      if (!cancelled) setState({ symbol, daily: d, intraday: i, done: true, at: Date.now() });
    });
    return () => { cancelled = true; };
  }, [symbol]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const marketOpen = market ? market.isOpen : null;
  const current = state.symbol === symbol && state.done;
  const view = useMemo(
    () => (current ? summariseStock(state.daily, state.intraday, { marketOpen, nowMs: state.at, intradayConfig: loadStrategyConfig('intraday', window.localStorage) }) : null),
    [current, state.daily, state.intraday, state.at, marketOpen],
  );

  const price = row?.price ?? view?.metrics?.price ?? null;
  const change = row?.changePct ?? view?.metrics?.changePct ?? null;
  const meta = STATUS_META[view?.source.status] ?? null;
  const onDaily = daily.symbols.has(symbol);
  const onSwing = swingList.symbols.has(symbol);
  const lv = view?.levels;

  return (
    <aside
      className="fixed inset-y-0 right-0 z-[67] w-full sm:w-[28rem] flex flex-col overflow-y-auto"
      style={{ backgroundColor: '#0d1117', borderLeft: '1px solid #1e2d3d', paddingBottom: 'var(--mobile-nav, 0px)' }}
      aria-label={`${symbol} quick view`}
    >
      <div className="flex items-start gap-2 px-4 py-3" style={rule}>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h2 className="text-base font-semibold text-gray-100">{symbol}</h2>
            {price !== null && <span className="text-sm font-mono text-gray-200">{px(price)}</span>}
            {change !== null && <span className="text-xs font-mono" style={{ color: change >= 0 ? GREEN : RED }}>{pct(change)}</span>}
          </div>
          <div className="text-[11px] text-gray-500 truncate">{stock.name}{stock.sector ? ` · ${stock.sector}` : ''}</div>
          {row?.indices?.length > 0 && <div className="text-[10px] text-gray-600 truncate" title={row.indices.join(', ')}>{row.indices.join(' · ')}</div>}
        </div>
        <button onClick={onClose} aria-label="Close quick view" className="p-1.5 text-gray-400 hover:text-gray-200 cursor-pointer"><X size={18} /></button>
      </div>

      {!current && <p className="px-4 py-6 text-xs text-gray-500">Loading {symbol}…</p>}
      {current && !view && <p className="px-4 py-6 text-xs text-gray-500">No usable price history for {symbol} right now. Nothing is shown rather than a guess.</p>}

      {view && (
        <>
          <div className="px-2 pt-2" style={{ height: 260 }}>
            <TradingChart candleData={view.candles} indicators={INDICATORS} orderBlocks={showZones ? view.blocks : null} resetKey={symbol} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 text-[10px] text-gray-500" style={rule}>
            <span>EMA 20 / 50 / 200 and VWAP on daily candles</span>
            <label className="flex items-center gap-1 cursor-pointer text-gray-400">
              <input type="checkbox" checked={showZones} onChange={(e) => setShowZones(e.target.checked)} aria-label="Show order block zones" /> order block zones
            </label>
          </div>

          <div className="grid grid-cols-3 gap-2 px-4 py-2 text-[11px]" style={rule}>
            {[
              ['Rel. volume', Number.isFinite(row?.relVolume) ? `${row.relVolume.toFixed(1)}x` : view.metrics?.relVol ? `${view.metrics.relVol.toFixed(1)}x` : '—'],
              ['RSI / ADX', view.metrics ? `${view.metrics.rsi?.toFixed(0) ?? '—'} / ${view.metrics.adx?.toFixed(0) ?? '—'}` : '—'],
              ['Daily trend', view.metrics?.trend ?? '—'],
              ['Support', lv?.support ? px(lv.support) : '—'],
              ['Resistance', lv?.resistance ? px(lv.resistance) : '—'],
              ['20-day VWAP', view.metrics?.vwap20 ? px(view.metrics.vwap20) : '—'],
            ].map(([label, value]) => (
              <div key={label}><div className="text-[9px] text-gray-600 uppercase tracking-wider">{label}</div><div className="font-mono text-gray-300">{value}</div></div>
            ))}
          </div>

          {(lv?.demandZone || lv?.supplyZone) && (
            <div className="px-4 py-2 text-[11px] text-gray-400" style={rule}>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">Nearest order blocks</div>
              {lv.demandZone && <div>Demand (support) zone {px(lv.demandZone.low)} to {px(lv.demandZone.high)}</div>}
              {lv.supplyZone && <div>Supply (resistance) zone {px(lv.supplyZone.low)} to {px(lv.supplyZone.high)}</div>}
            </div>
          )}

          <Status title="Intraday status" status={view.intraday} />
          <Status title="Swing status" status={view.swing} />

          <div className="px-4 py-2 text-[10px] text-gray-600" style={rule}>
            Source: {view.source.provider ?? 'unknown'}{meta ? <> · <span style={{ color: meta.color }}>{meta.label}</span></> : ''}{view.source.asOf ? ` · daily data as of ${stamp(view.source.asOf)}` : ''}.
            Order block and FVG zones follow the daily chart rules; FVG zones are not drawn here.
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-2 px-4 py-2" style={rule}>
        <button onClick={() => daily.toggle(symbol, price)} aria-pressed={onDaily} className="flex items-center gap-1 px-2 py-1 text-xs rounded cursor-pointer bg-white/5 text-gray-300 hover:bg-white/10">
          <Star size={12} fill={onDaily ? '#ffd600' : 'none'} color={onDaily ? '#ffd600' : '#94a3b8'} /> {onDaily ? 'In Daily trading list' : 'Add to Daily trading'}
        </button>
        <button onClick={() => swingList.toggle(symbol, price)} aria-pressed={onSwing} className="flex items-center gap-1 px-2 py-1 text-xs rounded cursor-pointer bg-white/5 text-gray-300 hover:bg-white/10">
          <Star size={12} fill={onSwing ? '#ffd600' : 'none'} color={onSwing ? '#ffd600' : '#94a3b8'} /> {onSwing ? 'In Swing list' : 'Add to Swing'}
        </button>
      </div>

      <AlertForm symbol={symbol} price={price} />

      <div className="flex flex-wrap gap-2 px-4 py-3">
        <button onClick={() => onOpen(stock, 'orderblock')} className="px-3 py-1.5 text-xs rounded cursor-pointer bg-green-500/15 text-green-400 hover:bg-green-500/25">Open full chart</button>
        <button onClick={() => onOpen(stock, 'intraday')} className="px-3 py-1.5 text-xs rounded cursor-pointer bg-white/5 text-gray-300 hover:bg-white/10">Intraday workspace</button>
        <button onClick={() => onOpen(stock, 'swing')} className="px-3 py-1.5 text-xs rounded cursor-pointer bg-white/5 text-gray-300 hover:bg-white/10">Swing workspace</button>
      </div>
    </aside>
  );
}
