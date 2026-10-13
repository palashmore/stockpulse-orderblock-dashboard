import { useCallback, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import IndexSelect from './IndexSelect';
import MarketBoards from './MarketBoards';
import DiscoveryTabs from './DiscoveryTabs';
import StockQuickView from './StockQuickView';
import { UnavailableState } from './DataStatusBadge';
import { useUniverseSelection, useUniverseStocks } from '../hooks/useUniverse';
import { useQuotesBatch } from '../hooks/useQuotesBatch';
import { useIndexLevels } from '../hooks/useIndexLevels';
import { useScreenerData, MAX_SCAN } from '../hooks/useScreenerData';
import { rankStocks } from '../data/ranking';
import { buildBoards, loadBoardConfig, saveBoardConfig } from '../data/boards';
import { binDots, DOT_AXIS_LIMIT } from '../data/marketOverview';
import { STATUS_META } from '../data/dataStatus';
import { loadView, saveView } from '../data/discovery';
import {
  DEFAULT_FILTERS, REL_VOL_OPTIONS, SIGNAL_OPTIONS, buildRows, signalMap, filtersActive, filterRows, sectorsOf, universeStats,
  indexCards, coverageLine, dotLayout,
} from '../data/dashboardView';

const GREEN = '#00e676';
const RED = '#ff1744';
const rule = { borderBottom: '1px solid rgba(30, 45, 61, 0.3)' };
const inputClass = 'px-2 py-1 text-xs rounded bg-transparent text-gray-200 border border-gray-700 focus:border-green-500 outline-none';

const pct = (n) => (Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(2)}%` : '—');
const px = (n) => (Number.isFinite(n) ? `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—');
const level = (n) => (Number.isFinite(n) ? n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
const tone = (n) => (!Number.isFinite(n) || n === 0 ? '#9ca3af' : n > 0 ? GREEN : RED);
const stamp = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : null);
const SIGNAL_TEXT = { long: 'valid long setup', short: 'valid short setup', none: 'no valid setup' };

function Stat({ label, value, color, title }) {
  return (
    <div className="flex flex-col px-4 py-2" title={title}>
      <span className="text-[10px] text-gray-600 uppercase tracking-wider">{label}</span>
      <span className="text-sm font-mono font-medium" style={{ color: color || '#d1d5db' }}>{value}</span>
    </div>
  );
}

function IndexCards({ cards, state }) {
  if (cards.length === 0) return null;
  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-2" style={rule}>
      {cards.map((c) => (
        <div key={c.id} className="flex-shrink-0 rounded-md px-3 py-1.5 min-w-[9.5rem]" style={{ backgroundColor: 'rgba(30, 45, 61, 0.25)', border: '1px solid rgba(30, 45, 61, 0.5)' }}>
          <div className="text-[10px] text-gray-500 truncate">{c.label}</div>
          {c.level === null ? (
            <div className="text-[11px] text-gray-600">{state === 'loading' ? 'Loading level…' : state === 'failed' ? 'Level unavailable right now' : 'NSE does not report this index'}</div>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-mono text-gray-200">{level(c.level)}</span>
                <span className="text-[11px] font-mono" style={{ color: tone(c.changePct) }}>{pct(c.changePct)}</span>
              </div>
              {c.advances !== null && c.declines !== null && (
                <div className="text-[10px] text-gray-600" title="NSE's own count for the whole index">NSE: {c.advances} up · {c.declines} down</div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function DotPlot({ dots, size, step, onSelect, onHover, hovered }) {
  const maxLevel = dots.reduce((m, d) => Math.max(m, d.level), 0);
  const height = (maxLevel + 1) * step + 8;
  return (
    <div>
      <div className="relative mx-3" style={{ height }}>
        <div className="absolute left-1/2 top-0 bottom-0" style={{ borderLeft: '1px dashed rgba(100, 116, 139, 0.4)' }} />
        {dots.map((d) => (
          <button
            key={d.symbol}
            onClick={() => onSelect(d.symbol)}
            onMouseEnter={() => onHover(d.symbol)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(d.symbol)}
            onBlur={() => onHover(null)}
            aria-label={`${d.symbol} ${pct(d.changePct)}`}
            className="absolute rounded-full cursor-pointer"
            style={{
              width: size,
              height: size,
              left: `calc(${d.x}% - ${size / 2}px)`,
              bottom: 4 + d.level * step,
              backgroundColor: d.changePct >= 0 ? GREEN : RED,
              opacity: hovered && hovered !== d.symbol ? 0.35 : d.pinned ? 0.5 : 0.9,
              outline: hovered === d.symbol ? '2px solid #e2e8f0' : 'none',
            }}
          />
        ))}
      </div>
      <div className="flex justify-between mx-3 mt-1 text-[10px] text-gray-600 font-mono">
        <span>-{DOT_AXIS_LIMIT}%</span>
        <span>0</span>
        <span>+{DOT_AXIS_LIMIT}%</span>
      </div>
    </div>
  );
}

export default function MarketDashboard({ onSelectStock, demoMode = false, market = null }) {
  const selection = useUniverseSelection();
  const { stocks, labels, failedIds, loading } = useUniverseStocks(selection.universe);
  const symbols = useMemo(() => (stocks ? stocks.map((s) => s.symbol) : []), [stocks]);
  const quotes = useQuotesBatch(symbols, !demoMode);
  const levels = useIndexLevels(!demoMode);

  const [view, setViewState] = useState(() => loadView(window.localStorage));
  const [quick, setQuick] = useState(null); // { stock, target } while the quick-view panel is open
  const filters = view.filters;
  const updateView = useCallback((patch) => {
    setViewState((v) => {
      const next = { ...v, ...patch };
      saveView(next, window.localStorage);
      return next;
    });
  }, []);
  const scanOn = true; // the boards and the signal filter both need each stock's daily history
  const [boardConfig, setBoardConfig] = useState(() => loadBoardConfig(window.localStorage));
  const [hovered, setHovered] = useState(null);

  const scanStocks = useMemo(() => (stocks ? stocks.slice(0, MAX_SCAN) : []), [stocks]);
  const scan = useScreenerData(scanStocks, scanOn);
  const signals = useMemo(() => signalMap(scan.rows), [scan.rows]);
  const metricsBySymbol = useMemo(() => new Map(scan.rows.map((r) => [r.symbol, r.metrics])), [scan.rows]);
  const changeBoardConfig = useCallback((next) => {
    setBoardConfig(next);
    saveBoardConfig(next, window.localStorage);
  }, []);

  const result = quotes.result;
  const { rows, unpriced } = useMemo(() => buildRows(result?.quotes, stocks), [result, stocks]);
  const stats = useMemo(() => universeStats(rows), [rows]);
  const counts = useMemo(() => rankStocks(result?.quotes).counts, [result]);
  const sectors = useMemo(() => sectorsOf(rows), [rows]);
  const filtered = useMemo(() => filterRows(rows, filters, signals), [rows, filters, signals]);
  const dots = useMemo(() => binDots(filtered.rows), [filtered.rows]);
  const bySymbol = useMemo(() => new Map(rows.map((r) => [r.symbol, r])), [rows]);
  const cards = useMemo(() => indexCards(selection.universe, labels, levels.levels), [selection.universe, labels, levels.levels]);

  // Every click on a stock opens the quick view first; "Open full chart" there goes to the chart with the stock selected.
  const open = (symbol) => {
    const r = bySymbol.get(symbol);
    if (r) setQuick({ stock: { symbol: r.symbol, name: r.name, sector: r.sector === 'Unclassified' ? '' : r.sector }, target: 'orderblock' });
  };
  const openStock = useCallback((stock, target = 'orderblock') => setQuick({ stock, target }), []);
  const goToChart = useCallback((stock, tab) => { setQuick(null); onSelectStock(stock, tab); }, [onSelectStock]);
  const set = (patch) => { updateView({ filters: { ...view.filters, ...patch } }); };
  const setSignal = (signal) => set({ signal });

  const maxLevel = dots.reduce((m, d) => Math.max(m, d.level), 0);
  const layout = dotLayout(maxLevel + 1, dots.length);
  const hoveredRow = hovered ? bySymbol.get(hovered) : null;

  const status = quotes.failed ? (result ? 'STALE' : 'UNAVAILABLE') : result?.dataStatus;
  const meta = STATUS_META[status] ?? null;
  const fresh = (status === 'LIVE' || status === 'DELAYED') && !quotes.failed;
  const boardRows = useMemo(() => (filters.sector ? rows.filter((r) => r.sector === filters.sector) : rows), [rows, filters.sector]);
  const boards = useMemo(() => buildBoards(boardRows, metricsBySymbol, boardConfig, fresh), [boardRows, metricsBySymbol, boardConfig, fresh]);
  const levelMeta = levels.levels ? STATUS_META[levels.failed ? 'STALE' : levels.levels.dataStatus] : null;

  if (demoMode) return <p className="px-4 py-6 text-xs text-gray-500">The Dashboard needs real market data and is off in simulated mode.</p>;

  const header = (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2" style={rule}>
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Market X-Ray</h2>
      <IndexSelect selection={selection} labels={labels} count={stocks ? stocks.length : null} />
      <div className="flex-1" />
      {meta && <span className="text-[10px]" style={{ color: meta.color }} title={meta.description}>{meta.label}</span>}
      <button onClick={quotes.reload} aria-label="Reload quotes" className="p-1 rounded text-gray-500 hover:text-gray-200 cursor-pointer">
        <RefreshCw size={13} className={quotes.loading ? 'animate-spin' : ''} />
      </button>
    </div>
  );

  if (loading || (!result && quotes.loading)) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto" style={{ backgroundColor: '#0a0e17' }}>
        {header}
        <p className="px-4 py-6 text-xs text-gray-500">{loading ? 'Loading the selected indices…' : `Loading quotes for ${symbols.length} stocks…`}</p>
      </div>
    );
  }
  if (!result) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto" style={{ backgroundColor: '#0a0e17' }}>
        {header}
        <UnavailableState status="UNAVAILABLE" loading={false} onRetry={quotes.reload} />
      </div>
    );
  }

  const maxAbs = Math.max(0.5, ...stats.sectors.sectors.map((s) => Math.abs(s.avgChangePct)));
  const active = filtersActive(filters);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto" style={{ backgroundColor: '#0a0e17' }}>
      {header}

      <p className="px-4 py-1.5 text-[11px] text-gray-500" style={rule}>
        {coverageLine({ universeCount: stocks.length, pricedCount: rows.length, unpriced, failedIds })}
        {result.asOf ? ` · prices as of ${stamp(result.asOf)} IST` : ''}
        {result.fetchedAt ? ` · refreshed ${stamp(result.fetchedAt)}` : ''}
        {quotes.failed && result ? <span style={{ color: '#ffd600' }}> · the last refresh failed, showing older prices</span> : null}
        {levelMeta && <> · index levels <span style={{ color: levelMeta.color }}>{levelMeta.label}</span></>}
      </p>

      <IndexCards cards={cards} state={!levels.loaded ? 'loading' : levels.levels ? 'ok' : 'failed'} />

      <div className="flex flex-wrap" style={rule}>
        <Stat label="Advancers" value={stats.breadth.advancers} color={GREEN} title="Stocks in the selected universe that are up on the day" />
        <Stat label="Decliners" value={stats.breadth.decliners} color={RED} />
        <Stat label="Unchanged" value={stats.breadth.unchanged} />
        <Stat label="A/D ratio" value={stats.breadth.ratio ?? '—'} />
        <Stat label="Bullish" value={counts.bullish} color={GREEN} title="Strong, clean upward day (see how ranking works below)" />
        <Stat label="Bearish" value={counts.bearish} color={RED} />
        <Stat label="Choppy" value={counts.choppy} />
        <Stat label="Leading sector" value={stats.sectors.leading ? stats.sectors.leading.sector : '—'} color={GREEN} />
        <Stat label="Lagging sector" value={stats.sectors.lagging ? stats.sectors.lagging.sector : '—'} color={RED} />
      </div>

      <MarketBoards
        boards={boards}
        config={boardConfig}
        onConfig={changeBoardConfig}
        fresh={fresh}
        scan={scan}
        onOpen={open}
        asOf={stamp(result.asOf)}
        sector={filters.sector}
      />

      <section style={rule}>
        <div className="flex flex-wrap items-end gap-3 px-4 py-2">
          <label className="flex flex-col gap-1 text-[10px] text-gray-500 uppercase tracking-wider">
            Sector
            <select value={filters.sector} onChange={(e) => set({ sector: e.target.value })} className={inputClass} style={{ backgroundColor: '#0d1117' }} aria-label="Sector filter">
              <option value="">All sectors ({rows.length})</option>
              {sectors.map((s) => <option key={s.sector} value={s.sector}>{s.sector} ({s.count})</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] text-gray-500 uppercase tracking-wider">
            Change from %
            <input type="number" step="any" value={filters.minPct} onChange={(e) => set({ minPct: e.target.value })} placeholder="-5" className={`${inputClass} w-20`} aria-label="Minimum percent change" />
          </label>
          <label className="flex flex-col gap-1 text-[10px] text-gray-500 uppercase tracking-wider">
            to %
            <input type="number" step="any" value={filters.maxPct} onChange={(e) => set({ maxPct: e.target.value })} placeholder="5" className={`${inputClass} w-20`} aria-label="Maximum percent change" />
          </label>
          <label className="flex flex-col gap-1 text-[10px] text-gray-500 uppercase tracking-wider">
            Relative volume
            <select value={filters.minRelVol} onChange={(e) => set({ minRelVol: e.target.value })} className={inputClass} style={{ backgroundColor: '#0d1117' }} aria-label="Minimum relative volume">
              <option value="">Any</option>
              {REL_VOL_OPTIONS.map((v) => <option key={v} value={v}>at least {v}x</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] text-gray-500 uppercase tracking-wider">
            Signal status
            <select value={filters.signal} onChange={(e) => setSignal(e.target.value)} className={inputClass} style={{ backgroundColor: '#0d1117' }} aria-label="Signal status filter">
              {SIGNAL_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          {active && (
            <button onClick={() => updateView({ filters: DEFAULT_FILTERS })} className="px-2 py-1 text-xs rounded cursor-pointer bg-white/5 text-gray-300 hover:bg-white/10">Reset filters</button>
          )}
        </div>
        <div className="px-4 pb-2 text-[11px] text-gray-500 flex flex-wrap items-center gap-x-3 gap-y-1">
          {scan.loading && <span>loading swing-setup status and daily history: {scan.done} of {scan.total}…</span>}
          {!scan.loading && scan.total > 0 && <span>swing-setup status: {scan.rows.length} stocks scanned{scan.excluded.length ? `, ${scan.excluded.length} without usable history` : ''}{stocks.length > MAX_SCAN ? `; only the first ${MAX_SCAN} of ${stocks.length} are scanned` : ''}</span>}
          {filters.signal !== 'any' && filtered.unknownSignal > 0 && <span>{filtered.unknownSignal} stocks without a scan result are not matched</span>}
        </div>
      </section>

      <section className="py-3">
        <h3 className="px-4 pb-1 text-[11px] text-gray-500 uppercase tracking-wider">
          Every stock at its move today ({filtered.rows.length}{active ? ` of ${rows.length}` : ''})
        </h3>
        <p className="px-4 pb-2 text-[11px] h-4 text-gray-400" aria-live="polite">
          {hoveredRow ? (
            <>
              <span className="text-gray-200 font-medium">{hoveredRow.symbol}</span> {px(hoveredRow.price)} <span style={{ color: tone(hoveredRow.changePct) }}>{pct(hoveredRow.changePct)}</span>
              {' · '}rel vol {Number.isFinite(hoveredRow.relVolume) ? `${hoveredRow.relVolume.toFixed(1)}x` : '—'}
              {' · '}{hoveredRow.sector}
              {' · '}{signals.has(hoveredRow.symbol) ? SIGNAL_TEXT[signals.get(hoveredRow.symbol)] : 'signal not scanned yet'}
            </>
          ) : 'Hover a dot for details; click it to open the chart.'}
        </p>
        {filtered.rows.length === 0 ? (
          <p className="px-4 py-6 text-xs text-gray-500">No stock matches these filters.</p>
        ) : (
          <DotPlot dots={dots} size={layout.size} step={layout.step} onSelect={open} onHover={setHovered} hovered={hovered} />
        )}
      </section>

      <DiscoveryTabs
        rows={filtered.rows}
        stocks={stocks}
        scan={scan}
        market={market}
        view={view}
        onView={updateView}
        onOpen={openStock}
        lastSession={market?.lastSession ?? null}
      />

      <section className="py-3" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <h3 className="px-4 pb-2 text-[11px] text-gray-500 uppercase tracking-wider">Sector performance (equal-weighted average of the selected stocks)</h3>
        {stats.sectors.sectors.length === 0 && <p className="px-4 text-xs text-gray-600">Not enough sector data for this selection.</p>}
        {stats.sectors.sectors.map((s) => {
          const color = s.avgChangePct >= 0 ? GREEN : RED;
          return (
            <button
              key={s.sector}
              onClick={() => set({ sector: filters.sector === s.sector ? '' : s.sector })}
              aria-pressed={filters.sector === s.sector}
              title="Filter the plot to this sector"
              className="w-full grid grid-cols-[9rem_1fr_4.5rem] items-center gap-3 px-4 py-1 text-left cursor-pointer hover:bg-white/5"
              style={filters.sector === s.sector ? { backgroundColor: 'rgba(0, 230, 118, 0.08)' } : undefined}
            >
              <span className="text-xs text-gray-300 truncate">{s.sector} <span className="text-gray-600">({s.count})</span></span>
              <div className="relative h-2 rounded" style={{ backgroundColor: 'rgba(30, 45, 61, 0.3)' }}>
                <div
                  className="absolute top-0 bottom-0 rounded"
                  style={{
                    backgroundColor: color,
                    width: `${(Math.abs(s.avgChangePct) / maxAbs) * 50}%`,
                    left: s.avgChangePct >= 0 ? '50%' : undefined,
                    right: s.avgChangePct < 0 ? '50%' : undefined,
                  }}
                />
              </div>
              <span className="text-xs font-mono text-right" style={{ color }}>{pct(s.avgChangePct)}</span>
            </button>
          );
        })}
      </section>

      <p className="px-4 py-3 text-[10px] text-gray-600">
        Breadth, sector averages and the Bullish/Bearish/Choppy counts are calculated over the {rows.length} priced stocks of the selected indices (the filters only narrow the plot and list).
        {stats.sectors.uncovered > 0 && ` ${stats.sectors.uncovered} stocks have no sector and are left out of the sector view.`}
        {stats.sectors.thinSectors.length > 0 && ` Sectors with a single stock are not listed (${stats.sectors.thinSectors.join(', ')}).`}
        {' '}Bullish/Bearish combines the day's move and where the price sits in the day's range; it describes today's move and is not a buy or sell signal.
        Index levels and NSE's own advance/decline counts come from NSE and cover the whole index; BSE indices are not available.
        Relative volume is today's volume against the 3-month daily average, so it reads low early in the session.
        Dots beyond ±{DOT_AXIS_LIMIT}% are pinned to the edge (faded).
      </p>
      {quick && <StockQuickView key={quick.stock.symbol} stock={quick.stock} row={bySymbol.get(quick.stock.symbol)} market={market} onClose={() => setQuick(null)} onOpen={goToChart} />}
    </div>
  );
}
