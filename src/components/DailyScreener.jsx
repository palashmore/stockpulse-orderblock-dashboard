import { useMemo, useState } from 'react';
import { ArrowUpDown, Star, RefreshCw, Filter, TrendingUp, TrendingDown, Activity, Sparkles, X } from 'lucide-react';
import { useScreenerData, MAX_SCAN } from '../hooks/useScreenerData';
import { scanCoverage } from '../data/coverage';
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
  ['symbol', 'Stock', 'left'],
  ['price', 'Price', 'right'],
  ['changePct', 'Day %', 'right'],
  ['rsi', 'RSI (14)', 'right'],
  ['adx', 'ADX (14)', 'right'],
  ['atrPct', 'ATR %', 'right'],
  ['relVol', 'Rel Vol', 'right'],
  ['vsEma20Pct', 'vs EMA20', 'right'],
  ['turnoverCr', 'Turnover ₹Cr', 'right'],
];

function NumInput({ label, value, onChange, width = 'w-20' }) {
  return (
    <label className="flex flex-col gap-1 text-[10px] text-gray-500 uppercase tracking-wider font-medium">
      {label}
      <input
        type="number"
        step="any"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className={`${width} px-2.5 py-1 text-xs rounded font-mono text-gray-200 border border-gray-700 focus:border-green-500 outline-none`}
        style={{ backgroundColor: '#111827' }}
      />
    </label>
  );
}

function SelectInput({ label, value, options, onChange }) {
  return (
    <label className="flex flex-col gap-1 text-[10px] text-gray-500 uppercase tracking-wider font-medium">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2.5 py-1 text-xs rounded text-gray-200 border border-gray-700 outline-none cursor-pointer"
        style={{ backgroundColor: '#111827' }}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function DailyScreener({ stocks = null, universeLabel = null, onSelectStock }) {
  const fullUniverse = useMemo(() => (stocks && stocks.length > 0 ? stocks : NIFTY_STOCKS), [stocks]);
  const universe = useMemo(() => fullUniverse.slice(0, MAX_SCAN), [fullUniverse]);
  const { rows, excluded, done, total, loading, loadedAt, reload } = useScreenerData(universe, true);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState({ key: 'turnoverCr', dir: 'desc' });
  const [saved, setSaved] = useState(() => loadSavedFilters(window.localStorage));
  const swingWatch = useWatchlist('swing');
  const watch = swingWatch.symbols;
  const [name, setName] = useState('');
  const [storageOk, setStorageOk] = useState(true);
  const [showFilters, setShowFilters] = useState(true);

  const result = useMemo(() => screen(rows, filters, watch, sort.key, sort.dir), [rows, filters, watch, sort]);
  const set = (patch) => setFilters((cur) => validateFilters({ ...cur, ...patch }));
  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'symbol' ? 'asc' : 'desc' }));

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

  // Overview quick-stats
  const stats = useMemo(() => {
    let buySetups = 0;
    let sellSetups = 0;
    let oversold = 0;
    let overbought = 0;
    let strongTrend = 0;
    for (const r of rows) {
      const m = r.metrics;
      if (m.setupSide === 'BUY') buySetups++;
      if (m.setupSide === 'SELL_SHORT') sellSetups++;
      if (m.rsi <= 30) oversold++;
      if (m.rsi >= 70) overbought++;
      if (m.adx >= 25) strongTrend++;
    }
    return { buySetups, sellSetups, oversold, overbought, strongTrend };
  }, [rows]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col" style={{ backgroundColor: '#0a0e17' }}>
      {/* Quick Stats Metric Cards */}
      <div
        className="grid grid-cols-2 sm:grid-cols-5 gap-2 px-4 py-2.5 flex-shrink-0"
        style={{ backgroundColor: '#0d1117', borderBottom: '1px solid rgba(30, 45, 61, 0.4)' }}
      >
        <div className="flex items-center gap-2 px-3 py-1.5 rounded" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
          <TrendingUp size={14} style={{ color: '#00e676' }} />
          <div>
            <div className="text-[10px] text-gray-500 uppercase">Bull Setups</div>
            <div className="text-xs font-mono font-bold" style={{ color: '#00e676' }}>{stats.buySetups}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
          <TrendingDown size={14} style={{ color: '#ff1744' }} />
          <div>
            <div className="text-[10px] text-gray-500 uppercase">Bear Setups</div>
            <div className="text-xs font-mono font-bold" style={{ color: '#ff1744' }}>{stats.sellSetups}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
          <Activity size={14} style={{ color: '#00e676' }} />
          <div>
            <div className="text-[10px] text-gray-500 uppercase">RSI Oversold (&le;30)</div>
            <div className="text-xs font-mono font-bold text-emerald-400">{stats.oversold}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
          <Activity size={14} style={{ color: '#ff1744' }} />
          <div>
            <div className="text-[10px] text-gray-500 uppercase">RSI Overbought (&ge;70)</div>
            <div className="text-xs font-mono font-bold text-rose-400">{stats.overbought}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
          <Sparkles size={14} style={{ color: '#00e5ff' }} />
          <div>
            <div className="text-[10px] text-gray-500 uppercase">Trend (ADX &ge;25)</div>
            <div className="text-xs font-mono font-bold text-cyan-400">{stats.strongTrend}</div>
          </div>
        </div>
      </div>

      {/* Presets and Saved Filters Bar */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)', backgroundColor: '#0a0e17' }}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider mr-1">Presets:</span>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setFilters(presetFilters(p.id))}
              className="px-2.5 py-1 text-xs rounded cursor-pointer bg-white/5 text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              {p.label}
            </button>
          ))}
          {saved.length > 0 && (
            <>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider ml-3 mr-1">Saved:</span>
              {saved.map((s) => (
                <span key={s.name} className="inline-flex items-center rounded text-xs" style={{ backgroundColor: 'rgba(0, 230, 118, 0.12)', color: '#00e676' }}>
                  <button onClick={() => setFilters(s.filters)} className="pl-2.5 pr-1 py-1 cursor-pointer font-medium">
                    {s.name}
                  </button>
                  <button onClick={() => deleteSaved(s.name)} aria-label={`Delete saved filter ${s.name}`} className="px-1.5 py-1 text-gray-500 hover:text-red-400 cursor-pointer">
                    ×
                  </button>
                </span>
              ))}
            </>
          )}
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-white/5 text-gray-400 hover:text-gray-200 cursor-pointer"
        >
          <Filter size={12} />
          {showFilters ? 'Hide Criteria' : 'Show Criteria'}
          {active > 0 && <span className="ml-1 px-1 rounded-full text-[9px] bg-emerald-500/20 text-emerald-400 font-bold">{active}</span>}
        </button>
      </div>

      {/* Criteria Filter Drawer */}
      {showFilters && (
        <div
          className="flex flex-wrap items-end gap-3 px-4 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.4)', backgroundColor: '#111827' }}
        >
          <SelectInput
            label="Daily Trend"
            value={filters.trend}
            options={[['ANY', 'Any'], ['UP', 'Up'], ['DOWN', 'Down']]}
            onChange={(v) => set({ trend: v })}
          />
          <SelectInput
            label="Swing Setup"
            value={filters.setup}
            options={[
              ['ANY', 'Any'],
              ['ANY_SETUP', 'Any Setup'],
              ['PULLBACK', 'Pullback'],
              ['BREAKOUT', 'Breakout / Breakdown'],
            ]}
            onChange={(v) => set({ setup: v })}
          />
          <NumInput label="RSI ≥" value={filters.minRsi} onChange={(v) => set({ minRsi: v })} />
          <NumInput label="RSI ≤" value={filters.maxRsi} onChange={(v) => set({ maxRsi: v })} />
          <NumInput label="ADX ≥" value={filters.minAdx} onChange={(v) => set({ minAdx: v })} />
          <NumInput label="Rel Vol ≥" value={filters.minRelVol} onChange={(v) => set({ minRelVol: v })} />
          <NumInput label="ATR % ≥" value={filters.minAtrPct} onChange={(v) => set({ minAtrPct: v })} />
          <NumInput label="Turnover ₹Cr ≥" value={filters.minTurnoverCr} onChange={(v) => set({ minTurnoverCr: v })} width="w-28" />

          <div className="flex flex-col gap-1.5 pb-0.5">
            <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
              <input type="checkbox" checked={filters.aboveVwap} onChange={(e) => set({ aboveVwap: e.target.checked })} />
              Above 20-day VWAP
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
              <input type="checkbox" checked={filters.starredOnly} onChange={(e) => set({ starredOnly: e.target.checked })} />
              Swing Watchlist ({watch.size})
            </label>
          </div>

          <button
            onClick={() => setFilters(DEFAULT_FILTERS)}
            disabled={active === 0}
            className="px-3 py-1.5 text-xs rounded bg-white/5 text-gray-400 enabled:hover:text-gray-200 enabled:cursor-pointer disabled:opacity-40"
          >
            Clear{active ? ` (${active})` : ''}
          </button>

          <div className="flex items-end gap-1.5 ml-auto">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name this filter"
              aria-label="Name for saved filter"
              className="w-36 px-2.5 py-1 text-xs rounded font-medium text-gray-200 border border-gray-700 focus:border-green-500 outline-none"
              style={{ backgroundColor: '#0d1117' }}
            />
            <button
              onClick={saveCurrent}
              disabled={!name.trim()}
              className="px-3 py-1.5 text-xs rounded font-medium text-emerald-400 enabled:hover:bg-green-500/25 enabled:cursor-pointer disabled:opacity-40"
              style={{ backgroundColor: 'rgba(0, 230, 118, 0.15)' }}
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Status Bar */}
      <div
        className="flex items-center justify-between px-4 py-2 text-[11px] text-gray-500 flex-shrink-0"
        aria-live="polite"
        style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.2)' }}
      >
        <span>
          {loading ? (
            `Loading daily candles… ${done} of ${total}`
          ) : (
            <span className="font-medium text-gray-400">
              <span className="text-emerald-400 font-bold">{result.length}</span> of {rows.length} covered stocks match
            </span>
          )}
          {!loading && ` · ${scanCoverage({ universe: fullUniverse.length, scanned: total, failed: excluded.length, reasons: [...new Set(excluded.map((e) => e.reason))] }).text}`}
          {!storageOk && <span style={{ color: RED }}> · browser storage is blocked, so saves will not last</span>}
        </span>
        <span className="flex items-center gap-2">
          {loadedAt && <span>Loaded {new Date(loadedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} IST</span>}
          <button
            onClick={reload}
            disabled={loading}
            aria-label="Reload"
            className="p-1 rounded text-gray-500 hover:text-gray-200 hover:bg-white/5 cursor-pointer"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </span>
      </div>

      {/* Table State or Empty State */}
      {!loading && rows.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-8 text-center text-xs text-gray-500">
          No stocks could be loaded. Daily candles come from Yahoo Finance, which may be blocked on this network.
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex-1 overflow-x-auto min-h-0">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10" style={{ backgroundColor: '#0d1117' }}>
              <tr className="text-[10px] text-gray-500 uppercase tracking-wider" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.5)' }}>
                <th className="w-8 pl-3 py-2 text-left" />
                {COLUMNS.map(([key, label, align]) => (
                  <th
                    key={key}
                    className={`px-3 py-2 font-medium text-${align}`}
                    aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 cursor-pointer hover:text-gray-200">
                      {label} <ArrowUpDown size={8} />
                    </button>
                  </th>
                ))}
                <th className="px-3 py-2 font-medium text-left">Trend</th>
                <th className="px-3 py-2 font-medium text-left">Swing Setup</th>
              </tr>
            </thead>
            <tbody>
              {result.map((r) => {
                const m = r.metrics;
                const isStarred = watch.has(r.symbol);
                return (
                  <tr
                    key={r.symbol}
                    className="hover:bg-white/5 transition-colors"
                    style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}
                  >
                    <td className="pl-3 py-2">
                      <button
                        onClick={() => toggleStar(r.symbol, m.price)}
                        aria-label={isStarred ? `Remove ${r.symbol} from watchlist` : `Add ${r.symbol} to watchlist`}
                        className="cursor-pointer"
                      >
                        <Star size={13} fill={isStarred ? '#ffd600' : 'none'} color={isStarred ? '#ffd600' : '#64748b'} />
                      </button>
                    </td>
                    <td
                      className="px-3 py-2 cursor-pointer"
                      onClick={() => onSelectStock({ symbol: r.symbol, name: r.name, sector: r.sector })}
                    >
                      <div className="font-semibold text-gray-200 hover:text-emerald-400 transition-colors">{r.symbol}</div>
                      <div className="text-[10px] text-gray-500">{r.sector}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-gray-200 font-medium">₹{f(m.price, 2)}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: color(m.changePct) }}>
                      {signed(m.changePct)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      <span
                        className="px-1.5 py-0.5 rounded text-[11px]"
                        style={{
                          backgroundColor:
                            m.rsi >= 70 ? 'rgba(255, 23, 68, 0.15)' : m.rsi <= 30 ? 'rgba(0, 230, 118, 0.15)' : 'transparent',
                          color: m.rsi >= 70 ? RED : m.rsi <= 30 ? GREEN : '#d1d5db',
                          fontWeight: m.rsi >= 70 || m.rsi <= 30 ? 600 : 400,
                        }}
                      >
                        {f(m.rsi)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-gray-300">
                      <span className={m.adx >= 25 ? 'font-bold text-cyan-400' : ''}>{f(m.adx)}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-gray-300">{f(m.atrPct, 2)}%</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {Number.isFinite(m.relVol) ? (
                        <span className={m.relVol >= 2 ? 'font-bold text-amber-400' : 'text-gray-300'}>
                          {m.relVol.toFixed(1)}x
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: color(m.vsEma20Pct) }}>
                      {signed(m.vsEma20Pct)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-gray-300">{f(m.turnoverCr, 0)}</td>
                    <td className="px-3 py-2">
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                        style={{
                          backgroundColor:
                            m.trend === 'up'
                              ? 'rgba(0, 230, 118, 0.12)'
                              : m.trend === 'down'
                              ? 'rgba(255, 23, 68, 0.12)'
                              : 'rgba(255, 255, 255, 0.04)',
                          color: m.trend === 'up' ? GREEN : m.trend === 'down' ? RED : '#9ca3af',
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: m.trend === 'up' ? GREEN : m.trend === 'down' ? RED : '#9ca3af' }}
                        />
                        {m.trend}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {m.setup ? (
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase"
                          style={{
                            backgroundColor: m.setupSide === 'BUY' ? 'rgba(0, 230, 118, 0.15)' : 'rgba(255, 23, 68, 0.15)',
                            color: m.setupSide === 'BUY' ? GREEN : RED,
                          }}
                        >
                          {m.setupSide === 'BUY' ? 'BUY ' : 'SELL '}{m.setup}
                        </span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Descriptive Footer */}
      <div className="px-4 py-2.5 text-[10px] text-gray-600 flex-shrink-0" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.3)' }}>
        Covers {rows.length} of {total} {universeLabel ? `${universeLabel} ` : ''}stocks. Indicators use completed daily candles only.
        &quot;Swing setup&quot; reflects the Swing workspace rules matched on the last completed bar. Turnover = 20-day average volume × price.
      </div>
    </div>
  );
}
