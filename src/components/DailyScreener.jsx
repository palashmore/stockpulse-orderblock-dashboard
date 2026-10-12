import { useMemo, useState } from 'react';
import { ArrowUpDown, Star, RefreshCw } from 'lucide-react';
import { useScreenerData } from '../hooks/useScreenerData';
import {
  DEFAULT_FILTERS, PRESETS, presetFilters, validateFilters, screen,
  loadSavedFilters, saveFilters, upsertSaved,
} from '../data/screenFilters';
import { useWatchlist } from '../hooks/useWatchlist';
import { NIFTY_STOCKS } from '../data/stockData';

const GREEN = '#00e676';
const RED = '#ff1744';
const f = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '—');
const signed = (n, d = 2) => (Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(d)}%` : '—');
const color = (n) => (!Number.isFinite(n) || n === 0 ? '#9ca3af' : n > 0 ? GREEN : RED);

const COLUMNS = [
  ['symbol', 'Stock', 'left'], ['price', 'Price', 'right'], ['changePct', 'Day', 'right'], ['rsi', 'RSI', 'right'], ['adx', 'ADX', 'right'],
  ['atrPct', 'ATR %', 'right'], ['relVol', 'Rel vol', 'right'], ['vsEma20Pct', 'vs EMA20', 'right'], ['turnoverCr', 'Turnover ₹Cr', 'right'],
];

function Num({ label, value, onChange, width = 'w-20' }) {
  return (
    <label className="flex flex-col gap-1 text-[10px] text-gray-500 uppercase tracking-wider">
      {label}
      <input type="number" step="any" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className={`${width} px-2 py-1.5 text-xs rounded bg-transparent text-gray-200 border border-gray-700 focus:border-green-500 outline-none`} />
    </label>
  );
}

function Select({ label, value, options, onChange }) {
  return (
    <label className="flex flex-col gap-1 text-[10px] text-gray-500 uppercase tracking-wider">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="px-2 py-1.5 text-xs rounded text-gray-200 border border-gray-700 outline-none" style={{ backgroundColor: '#0d1117' }}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

// Screens the stocks below on daily indicators. Intraday setups are not included here: they need
// minute data per stock, which would use far too many requests; use the Intraday tab per stock.
export default function DailyScreener({ onSelectStock }) {
  const universe = useMemo(() => NIFTY_STOCKS, []);
  const { rows, excluded, done, total, loading, loadedAt, reload } = useScreenerData(universe, true);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState({ key: 'turnoverCr', dir: 'desc' });
  const [saved, setSaved] = useState(() => loadSavedFilters(window.localStorage));
  const swingWatch = useWatchlist('swing');
  const watch = swingWatch.symbols;
  const [name, setName] = useState('');
  const [storageOk, setStorageOk] = useState(true);

  const result = useMemo(() => screen(rows, filters, watch, sort.key, sort.dir), [rows, filters, watch, sort]);
  const set = (patch) => setFilters((cur) => validateFilters({ ...cur, ...patch }));
  const toggleSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'symbol' ? 'asc' : 'desc' }));

  const toggleStar = (symbol, price) => swingWatch.toggle(symbol, price);
  const saveCurrent = () => {
    const list = upsertSaved(saved, name, filters);
    if (!list) return;
    setSaved(list);
    setStorageOk(saveFilters(list, window.localStorage));
    setName('');
  };
  const deleteSaved = (n) => {
    const list = saved.filter((x) => x.name !== n);
    setSaved(list);
    setStorageOk(saveFilters(list, window.localStorage));
  };

  const active = Object.entries(filters).filter(([k, v]) => v !== DEFAULT_FILTERS[k]).length;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto" style={{ backgroundColor: '#0a0e17' }}>
      <div className="flex flex-wrap items-center gap-1.5 px-4 py-2" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <span className="text-[10px] text-gray-600 uppercase tracking-wider mr-1">Presets</span>
        {PRESETS.map((p) => (
          <button key={p.id} onClick={() => setFilters(presetFilters(p.id))} className="px-2.5 py-1 text-xs rounded cursor-pointer bg-white/5 text-gray-400 hover:text-gray-200">{p.label}</button>
        ))}
        {saved.length > 0 && <span className="text-[10px] text-gray-600 uppercase tracking-wider ml-3 mr-1">Saved</span>}
        {saved.map((s) => (
          <span key={s.name} className="inline-flex items-center rounded bg-green-500/10 text-green-300 text-xs">
            <button onClick={() => setFilters(s.filters)} className="pl-2.5 pr-1 py-1 cursor-pointer">{s.name}</button>
            <button onClick={() => deleteSaved(s.name)} aria-label={`Delete saved filter ${s.name}`} className="px-1.5 py-1 text-gray-500 hover:text-red-400 cursor-pointer">×</button>
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 px-4 py-3" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <Select label="Daily trend" value={filters.trend} options={[['ANY', 'Any'], ['UP', 'Up'], ['DOWN', 'Down']]} onChange={(v) => set({ trend: v })} />
        <Select label="Swing setup (last bar)" value={filters.setup} options={[['ANY', 'Any'], ['ANY_SETUP', 'Any setup'], ['PULLBACK', 'Pullback'], ['BREAKOUT', 'Breakout / breakdown']]} onChange={(v) => set({ setup: v })} />
        <Num label="RSI ≥" value={filters.minRsi} onChange={(v) => set({ minRsi: v })} />
        <Num label="RSI ≤" value={filters.maxRsi} onChange={(v) => set({ maxRsi: v })} />
        <Num label="ADX ≥" value={filters.minAdx} onChange={(v) => set({ minAdx: v })} />
        <Num label="Rel vol ≥" value={filters.minRelVol} onChange={(v) => set({ minRelVol: v })} />
        <Num label="ATR % ≥" value={filters.minAtrPct} onChange={(v) => set({ minAtrPct: v })} />
        <Num label="Turnover ₹Cr ≥" value={filters.minTurnoverCr} onChange={(v) => set({ minTurnoverCr: v })} width="w-28" />
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer"><input type="checkbox" checked={filters.aboveVwap} onChange={(e) => set({ aboveVwap: e.target.checked })} /> Above 20-day VWAP</label>
          <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer"><input type="checkbox" checked={filters.starredOnly} onChange={(e) => set({ starredOnly: e.target.checked })} /> Swing watchlist only ({watch.size})</label>
        </div>
        <button onClick={() => setFilters(DEFAULT_FILTERS)} disabled={active === 0} className="px-3 py-1.5 text-xs rounded bg-white/5 text-gray-400 enabled:hover:text-gray-200 enabled:cursor-pointer disabled:opacity-40">Clear{active ? ` (${active})` : ''}</button>
        <div className="flex items-end gap-1.5 ml-auto">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this filter" aria-label="Name for saved filter" className="w-36 px-2 py-1.5 text-xs rounded bg-transparent text-gray-200 border border-gray-700 focus:border-green-500 outline-none" />
          <button onClick={saveCurrent} disabled={!name.trim()} className="px-3 py-1.5 text-xs rounded bg-green-500/15 text-green-400 enabled:hover:bg-green-500/25 enabled:cursor-pointer disabled:opacity-40">Save</button>
        </div>
      </div>

      <div className="flex items-center justify-between px-4 py-2 text-[11px] text-gray-500" aria-live="polite">
        <span>
          {loading ? `Loading daily candles… ${done} of ${total}` : `${result.length} of ${rows.length} covered stocks match`}
          {!loading && excluded.length > 0 && ` · ${excluded.length} not covered (${[...new Set(excluded.map((e) => e.reason))].join(', ')})`}
          {!storageOk && <span style={{ color: RED }}> · browser storage is blocked, so saves will not last</span>}
        </span>
        <span className="flex items-center gap-2">
          {loadedAt && <span>Loaded {new Date(loadedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button onClick={reload} disabled={loading} aria-label="Reload" className="p-1 rounded text-gray-500 hover:text-gray-200 hover:bg-white/5 cursor-pointer"><RefreshCw size={12} className={loading ? 'animate-spin' : ''} /></button>
        </span>
      </div>

      {!loading && rows.length === 0 && (
        <p className="px-4 py-6 text-xs text-gray-500">No stocks could be loaded. Daily candles come from Yahoo Finance, which may be blocked on this network.</p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] text-gray-600 uppercase tracking-wider">
                <th className="w-8" />
                {COLUMNS.map(([key, label, align]) => (
                  <th key={key} className={`px-3 py-1.5 font-normal text-${align}`} aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 cursor-pointer hover:text-gray-300">{label} <ArrowUpDown size={8} /></button>
                  </th>
                ))}
                <th className="px-3 py-1.5 font-normal text-left">Trend</th>
                <th className="px-3 py-1.5 font-normal text-left">Swing setup</th>
              </tr>
            </thead>
            <tbody>
              {result.map((r) => {
                const m = r.metrics;
                return (
                  <tr key={r.symbol} className="hover:bg-white/5" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}>
                    <td className="pl-3">
                      <button onClick={() => toggleStar(r.symbol, m.price)} aria-label={watch.has(r.symbol) ? `Remove ${r.symbol} from watchlist` : `Add ${r.symbol} to watchlist`} className="cursor-pointer">
                        <Star size={13} fill={watch.has(r.symbol) ? '#ffd600' : 'none'} color={watch.has(r.symbol) ? '#ffd600' : '#64748b'} />
                      </button>
                    </td>
                    <td className="px-3 py-1.5 cursor-pointer" onClick={() => onSelectStock({ symbol: r.symbol, name: r.name, sector: r.sector })}>
                      <div className="font-medium text-gray-200">{r.symbol}</div>
                      <div className="text-[10px] text-gray-600">{r.sector}</div>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-gray-300">₹{f(m.price, 2)}</td>
                    <td className="px-3 py-1.5 text-right font-mono" style={{ color: color(m.changePct) }}>{signed(m.changePct)}</td>
                    <td className="px-3 py-1.5 text-right font-mono" style={{ color: m.rsi >= 70 ? RED : m.rsi <= 30 ? GREEN : '#d1d5db' }}>{f(m.rsi)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-gray-300">{f(m.adx)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-gray-300">{f(m.atrPct, 2)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-gray-300">{Number.isFinite(m.relVol) ? `${m.relVol.toFixed(1)}x` : '—'}</td>
                    <td className="px-3 py-1.5 text-right font-mono" style={{ color: color(m.vsEma20Pct) }}>{signed(m.vsEma20Pct)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-gray-300">{f(m.turnoverCr, 0)}</td>
                    <td className="px-3 py-1.5" style={{ color: m.trend === 'up' ? GREEN : m.trend === 'down' ? RED : '#9ca3af' }}>{m.trend}</td>
                    <td className="px-3 py-1.5" style={{ color: m.setup ? (m.setupSide === 'BUY' ? GREEN : RED) : '#64748b' }}>{m.setup ? `${m.setup}${m.setupSide === 'SELL_SHORT' ? ' (short)' : ''}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="px-4 py-3 text-[10px] text-gray-600">
        Covers {rows.length} of the {total} Nifty 50 stocks, not the whole market. Indicators use completed daily candles only (the in-progress day is ignored). Stocks with stale or missing data are left out.
        &quot;Swing setup&quot; is whether the Swing workspace rules matched on the last completed bar; it is a rule match, not a recommendation. Intraday setups are not screened here: open a stock in the Intraday tab.
        Turnover is the 20-day average volume × price. Stars add to your Swing watchlist (saved in this browser).
      </p>
    </div>
  );
}
