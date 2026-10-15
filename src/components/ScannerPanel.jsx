import { useMemo, useState } from 'react';
import { ArrowUpDown, Filter, TrendingUp, TrendingDown, Zap, Activity, RefreshCw } from 'lucide-react';
import { runScan, presetCriteria, DEFAULT_CRITERIA, PRESETS, NEAR_EDGE } from '../data/scanner';
import { NIFTY_STOCKS, generateCandlestickData } from '../data/stockData';
import { STATUS_META } from '../data/dataStatus';
import { UnavailableState } from './DataStatusBadge';
import DailyScreener from './DailyScreener';
import { useUniverseSelection, useUniverseStocks } from '../hooks/useUniverse';
import { useQuotesBatch } from '../hooks/useQuotesBatch';
import { describeUniverse } from '../data/universe';
import { useIndexMenu } from '../hooks/useIndexUniverse';
import IndexSelect from './IndexSelect';

const GREEN = '#00e676';
const RED = '#ff1744';

const COLUMNS = [
  { key: 'symbol', label: 'Stock', align: 'left' },
  { key: 'price', label: 'Price', align: 'right' },
  { key: 'changePct', label: 'Change %', align: 'right' },
  { key: 'gapPct', label: 'Gap %', align: 'right' },
  { key: 'relVolume', label: 'Rel Vol', align: 'right' },
  { key: 'strength', label: 'Strength', align: 'right' },
];

const pct = (n) => (Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(2)}%` : '—');
const color = (n) => (!Number.isFinite(n) || n === 0 ? '#9ca3af' : n > 0 ? GREEN : RED);

function NumberField({ label, value, onChange, step = 'any' }) {
  return (
    <label className="flex flex-col gap-1 text-[10px] text-gray-500 uppercase tracking-wider font-medium">
      {label}
      <input
        type="number"
        step={step}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="w-24 px-2.5 py-1 text-xs rounded font-mono text-gray-200 border border-gray-700 focus:border-green-500 outline-none"
        style={{ backgroundColor: '#111827' }}
      />
    </label>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function MovesScanner({
  quotes,
  status,
  failed,
  loaded,
  retry,
  universeLabel,
  sectors,
  loadingMore,
  onSelectStock,
}) {
  const [criteria, setCriteria] = useState(DEFAULT_CRITERIA);
  const [preset, setPreset] = useState(null);
  const [sort, setSort] = useState({ key: 'strength', dir: 'desc' });
  const [showFilters, setShowFilters] = useState(false);

  const result = useMemo(() => runScan(quotes, criteria, sort.key, sort.dir), [quotes, criteria, sort]);

  // Stats for the active scan
  const stats = useMemo(() => {
    let bullish = 0;
    let bearish = 0;
    let surges = 0;
    let gaps = 0;
    for (const q of quotes) {
      if ((q.changePct ?? 0) > 0.5) bullish++;
      if ((q.changePct ?? 0) < -0.5) bearish++;
      const rel = q.avgVolume > 0 ? (q.volume ?? 0) / q.avgVolume : 0;
      if (rel >= 1.5) surges++;
      const prev = q.previousClose ?? q.price;
      const gap = prev > 0 && q.open ? ((q.open - prev) / prev) * 100 : 0;
      if (Math.abs(gap) >= 0.75) gaps++;
    }
    return { bullish, bearish, surges, gaps };
  }, [quotes]);

  if (quotes.length === 0) {
    return <UnavailableState status={failed ? 'UNAVAILABLE' : null} loading={!loaded} onRetry={retry} />;
  }

  const statusMeta = failed ? STATUS_META.STALE : STATUS_META[status];
  const update = (patch) => {
    setPreset(null);
    setCriteria((c) => ({ ...c, ...patch }));
  };
  const applyPreset = (id) => {
    setPreset(id);
    setCriteria(presetCriteria(id));
  };
  const reset = () => {
    setPreset(null);
    setCriteria(DEFAULT_CRITERIA);
  };
  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'symbol' ? 'asc' : 'desc' }));
  const open = (m) => onSelectStock({ symbol: m.symbol, name: m.name, sector: sectors[m.symbol] || '' });

  const active = Object.entries(criteria).filter(([k, v]) => v !== DEFAULT_CRITERIA[k]).length;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col" style={{ backgroundColor: '#0a0e17' }}>
      {/* Top Header Metrics Bar */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 py-2.5 flex-shrink-0"
        style={{ backgroundColor: '#0d1117', borderBottom: '1px solid rgba(30, 45, 61, 0.4)' }}
      >
        <div className="flex items-center gap-2 px-3 py-1.5 rounded" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
          <TrendingUp size={14} style={{ color: '#00e676' }} />
          <div>
            <div className="text-[10px] text-gray-500 uppercase">Bullish (&gt;0.5%)</div>
            <div className="text-xs font-mono font-bold" style={{ color: '#00e676' }}>{stats.bullish}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
          <TrendingDown size={14} style={{ color: '#ff1744' }} />
          <div>
            <div className="text-[10px] text-gray-500 uppercase">Bearish (&lt;-0.5%)</div>
            <div className="text-xs font-mono font-bold" style={{ color: '#ff1744' }}>{stats.bearish}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
          <Zap size={14} style={{ color: '#00e5ff' }} />
          <div>
            <div className="text-[10px] text-gray-500 uppercase">Volume Surges (&ge;1.5x)</div>
            <div className="text-xs font-mono font-bold text-cyan-400">{stats.surges}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
          <Activity size={14} style={{ color: '#ffd600' }} />
          <div>
            <div className="text-[10px] text-gray-500 uppercase">Gap Moves (&ge;0.75%)</div>
            <div className="text-xs font-mono font-bold text-amber-400">{stats.gaps}</div>
          </div>
        </div>
      </div>

      {/* Preset Filter Bar */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)', backgroundColor: '#0a0e17' }}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider mr-1">Presets:</span>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id)}
              className={`px-2.5 py-1 text-xs rounded cursor-pointer transition-colors ${
                preset === p.id
                  ? 'bg-emerald-500/20 text-emerald-400 font-medium'
                  : 'bg-white/5 text-gray-300 hover:text-white hover:bg-white/10'
              }`}
            >
              {p.label}
            </button>
          ))}
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
          <label className="flex flex-col gap-1 text-[10px] text-gray-500 uppercase tracking-wider font-medium">
            Direction
            <select
              value={criteria.direction}
              onChange={(e) => update({ direction: e.target.value })}
              className="px-2.5 py-1 text-xs rounded text-gray-200 border border-gray-700 outline-none cursor-pointer"
              style={{ backgroundColor: '#0d1117' }}
            >
              <option value="ANY">Any</option>
              <option value="BULLISH">Bullish</option>
              <option value="BEARISH">Bearish</option>
              <option value="CHOPPY">Choppy</option>
            </select>
          </label>
          <NumberField label="Change ≥ %" value={criteria.minChangePct} onChange={(v) => update({ minChangePct: v })} />
          <NumberField label="Change ≤ %" value={criteria.maxChangePct} onChange={(v) => update({ maxChangePct: v })} />
          <NumberField label="Gap ≥ %" value={criteria.minGapPct} onChange={(v) => update({ minGapPct: v })} />
          <NumberField label="Gap ≤ %" value={criteria.maxGapPct} onChange={(v) => update({ maxGapPct: v })} />
          <NumberField label="Rel Vol ≥ x" value={criteria.minRelVolume} onChange={(v) => update({ minRelVolume: v })} />
          <NumberField label="Strength ≥" value={criteria.minStrength} onChange={(v) => update({ minStrength: v })} step="1" />
          <div className="flex flex-col gap-1.5 pb-0.5">
            <Toggle label="Near Day High" checked={criteria.nearHigh} onChange={(v) => update({ nearHigh: v })} />
            <Toggle label="Near Day Low" checked={criteria.nearLow} onChange={(v) => update({ nearLow: v })} />
          </div>
          <button
            onClick={reset}
            disabled={active === 0}
            className="px-3 py-1.5 text-xs rounded bg-white/5 text-gray-400 enabled:hover:text-gray-200 enabled:cursor-pointer disabled:opacity-40"
          >
            Clear Filters{active > 0 ? ` (${active})` : ''}
          </button>
        </div>
      )}

      {/* Table Status Bar */}
      <div
        className="flex items-center justify-between px-4 py-2 text-[11px] text-gray-500 flex-shrink-0"
        aria-live="polite"
        style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.2)' }}
      >
        <span>
          <span className="text-emerald-400 font-bold">{result.rows.length}</span> of {quotes.length} stocks match
          {result.unscannable > 0 && ` · ${result.unscannable} could not be scanned (no price data)`}
          {loadingMore && <span className="ml-2 text-cyan-400 font-medium">· Syncing live prices…</span>}
        </span>
        {statusMeta && (
          <span className="text-[10px]" style={{ color: statusMeta.color }} title={statusMeta.description}>
            {statusMeta.label}
          </span>
        )}
      </div>

      {/* Table or Empty State */}
      {result.rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-8 text-center text-xs text-gray-500">
          No stocks match these filters. Loosen a rule or clear the filters.
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto min-h-0">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10" style={{ backgroundColor: '#0d1117' }}>
              <tr className="text-[10px] text-gray-500 uppercase tracking-wider" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.5)' }}>
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    className={`px-4 py-2 font-medium text-${c.align}`}
                    aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 cursor-pointer hover:text-gray-200">
                      {c.label} <ArrowUpDown size={8} />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((m) => (
                <tr
                  key={m.symbol}
                  onClick={() => open(m)}
                  className="cursor-pointer hover:bg-white/5 transition-colors"
                  style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}
                >
                  <td className="px-4 py-2">
                    <div className="font-semibold text-gray-200 hover:text-emerald-400 transition-colors">{m.symbol}</div>
                    <div className="text-[10px] text-gray-500">{sectors[m.symbol] || ''}</div>
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-gray-200 font-medium">₹{m.price.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right font-mono font-semibold" style={{ color: color(m.changePct) }}>
                    {pct(m.changePct)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono" style={{ color: color(m.gapPct) }}>
                    {pct(m.gapPct)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {m.relVolume === null ? (
                      '—'
                    ) : (
                      <span className={m.relVolume >= 2 ? 'font-bold text-amber-400' : 'text-gray-300'}>
                        {m.relVolume.toFixed(1)}x
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    <div className="flex items-center justify-end gap-1.5">
                      <div className="h-1 rounded-full bg-gray-800" style={{ width: '35px' }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, Math.max(10, m.strength))}%`,
                            backgroundColor: m.direction === 'BULLISH' ? GREEN : m.direction === 'BEARISH' ? RED : '#64748b',
                          }}
                        />
                      </div>
                      <span
                        className="font-semibold"
                        style={{ color: m.direction === 'BULLISH' ? GREEN : m.direction === 'BEARISH' ? RED : '#9ca3af' }}
                      >
                        {m.strength}
                      </span>
                      {m.direction === 'CHOPPY' && <span className="text-[9px] text-gray-600">chop</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Descriptive Footer */}
      <div className="px-4 py-2.5 text-[10px] text-gray-600 flex-shrink-0" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.3)' }}>
        Gap = open vs previous close. Near day high/low = price in the top/bottom {Math.round((1 - NEAR_EDGE) * 50)}% of today&apos;s range.
        Relative volume compares today&apos;s volume with the 3-month daily average. Click a row to open its chart.
      </div>
    </div>
  );
}

// Two views: today's quote-based moves, and a screener on daily indicators and setups across the selected universe
export default function ScannerPanel({
  nifty = null,
  universeSelection = null,
  universeStocks = null,
  universeLabels = null,
  demoMode = false,
  onSelectStock,
}) {
  const ownSelection = useUniverseSelection();
  const selection = universeSelection || ownSelection;
  const ownUniverse = useUniverseStocks(selection.universe);
  const stocks = universeStocks || ownUniverse.stocks;
  const labels = universeLabels || ownUniverse.labels;

  const activeStocks = useMemo(() => (stocks && stocks.length > 0 ? stocks : NIFTY_STOCKS), [stocks]);
  const symbols = useMemo(() => activeStocks.map((s) => s.symbol), [activeStocks]);

  const quotesBatch = useQuotesBatch(symbols, !demoMode);

  const demoQuotesList = useMemo(() => {
    return activeStocks.map((stock) => {
      const candles = generateCandlestickData(stock.symbol);
      const last = candles[candles.length - 1];
      const prev = candles[candles.length - 2];
      const volumes = candles.map((c) => c.volume);
      return {
        symbol: stock.symbol,
        name: stock.name,
        price: last.close,
        change: last.close - prev.close,
        changePct: ((last.close - prev.close) / prev.close) * 100,
        open: last.open,
        high: last.high,
        low: last.low,
        previousClose: prev.close,
        volume: last.volume,
        avgVolume: volumes.reduce((s, v) => s + v, 0) / volumes.length,
      };
    });
  }, [activeStocks]);

  const quotes = useMemo(() => {
    if (demoMode) return demoQuotesList;
    if (quotesBatch.result?.quotes?.length) return quotesBatch.result.quotes;
    if (symbols.length === 50 && nifty?.quotes?.length) return nifty.quotes;
    return [];
  }, [demoMode, demoQuotesList, quotesBatch.result, symbols.length, nifty]);

  const menu = useIndexMenu();
  const menuLabels = useMemo(() => {
    if (!menu) return {};
    const map = {};
    for (const group of menu) {
      if (group.members) {
        for (const m of group.members) map[m.id] = m.label;
      }
      if (group.id && group.label) map[group.id] = group.label;
    }
    return map;
  }, [menu]);

  const universeLabel = useMemo(() => {
    return describeUniverse(selection.universe, { ...menuLabels, ...(labels || {}) });
  }, [selection.universe, menuLabels, labels]);

  const sectors = useMemo(() => {
    const map = {};
    for (const s of activeStocks) {
      if (s.sector) map[s.symbol] = s.sector;
    }
    for (const s of NIFTY_STOCKS) {
      if (!map[s.symbol]) map[s.symbol] = s.sector;
    }
    return map;
  }, [activeStocks]);

  const status = demoMode ? 'SIMULATED' : (quotesBatch.result?.dataStatus || nifty?.status || 'LIVE');
  const failed = demoMode ? false : quotesBatch.failed;
  const loaded = demoMode ? true : Boolean(quotes.length > 0 || !quotesBatch.loading);
  const retry = () => {
    quotesBatch.reload();
    if (nifty?.retry) nifty.retry();
  };

  const [view, setView] = useState('moves');

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div
        className="flex items-center justify-between px-4 py-2 flex-shrink-0"
        style={{ backgroundColor: '#0a0e17', borderBottom: '1px solid rgba(30, 45, 61, 0.4)' }}
      >
        <div className="flex items-center gap-1">
          {[
            ['moves', "Today's Moves"],
            ['daily', 'Daily Analysis'],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`px-3 py-1 text-xs rounded font-medium cursor-pointer transition-all ${
                view === id
                  ? 'bg-emerald-500/15 text-emerald-400 font-semibold'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <IndexSelect selection={selection} labels={labels || {}} count={activeStocks.length} />
        </div>
      </div>
      {view === 'moves' ? (
        <MovesScanner
          quotes={quotes}
          status={status}
          failed={failed}
          loaded={loaded}
          retry={retry}
          universeLabel={universeLabel}
          sectors={sectors}
          loadingMore={quotesBatch.loading}
          onSelectStock={onSelectStock}
        />
      ) : (
        <DailyScreener
          stocks={activeStocks}
          universeLabel={universeLabel}
          onSelectStock={onSelectStock}
        />
      )}
    </div>
  );
}
