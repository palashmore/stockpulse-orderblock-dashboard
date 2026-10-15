import { useCallback, useMemo, useState } from 'react';
import { RefreshCw, Filter, Layers, BarChart2, ChevronDown, ChevronUp } from 'lucide-react';
import IndexSelect from './IndexSelect';
import MarketBoards from './MarketBoards';
import DiscoveryTabs from './DiscoveryTabs';
import StockQuickView from './StockQuickView';
import { UnavailableState } from './DataStatusBadge';
import { useUniverseSelection, useUniverseStocks } from '../hooks/useUniverse';
import { useQuotesBatch } from '../hooks/useQuotesBatch';
import Freshness from './Freshness';
import { scanCoverage } from '../data/coverage';
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

// Redesigned institutional dashboard modules
import IndexOverviewCards from './dashboard/IndexOverviewCards';
import MarketHeatmap from './dashboard/MarketHeatmap';
import TopMoversPanel from './dashboard/TopMoversPanel';
import MarketBreadthPanel from './dashboard/MarketBreadthPanel';
import DashboardChartPanel from './dashboard/DashboardChartPanel';
import SectorPerformancePanel from './dashboard/SectorPerformancePanel';
import OptionsChainSummary from './dashboard/OptionsChainSummary';
import DashboardBottomGrid from './dashboard/DashboardBottomGrid';

const GREEN = '#00e676';
const RED = '#ff1744';
const rule = { borderBottom: '1px solid rgba(30, 45, 61, 0.3)' };
const inputClass = 'px-2 py-1 text-xs rounded bg-transparent text-gray-200 border border-gray-700 focus:border-green-500 outline-none';

const pct = (n) => (Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(2)}%` : '—');
const px = (n) => (Number.isFinite(n) ? `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—');
const tone = (n) => (!Number.isFinite(n) || n === 0 ? '#9ca3af' : n > 0 ? GREEN : RED);
const stamp = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : null);
const SIGNAL_TEXT = { long: 'valid long setup', short: 'valid short setup', none: 'no valid setup' };

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

const SUB_NAV_TABS = [
  'Overview',
  'Indices',
  'Market Heatmap',
  'Sectors',
  'F&O',
  'Top Movers',
  'Sector Strength',
  'Breadth',
  'Deep Scan',
];

export default function MarketDashboard({ onSelectStock, demoMode = false, market = null }) {
  const selection = useUniverseSelection();
  const { stocks, labels, failedIds, loading } = useUniverseStocks(selection.universe);
  const symbols = useMemo(() => (stocks ? stocks.map((s) => s.symbol) : []), [stocks]);
  const quotes = useQuotesBatch(symbols, !demoMode);
  const levels = useIndexLevels(!demoMode);

  const [activeSubTab, setActiveSubTab] = useState('Overview');
  const [showDeepScan, setShowDeepScan] = useState(false);

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

  const scanOn = true;
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

  const open = (symbol) => {
    const r = bySymbol.get(symbol);
    if (r) {
      setQuick({ stock: { symbol: r.symbol, name: r.name, sector: r.sector === 'Unclassified' ? '' : r.sector }, target: 'orderblock' });
    } else {
      setQuick({ stock: { symbol, name: symbol, sector: '' }, target: 'orderblock' });
    }
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

  const active = filtersActive(filters);

  // Sub-Navigation Bar
  const subNav = (
    <div className="flex items-center gap-1 px-4 py-2 overflow-x-auto no-scrollbar" style={{ backgroundColor: '#0d1117', borderBottom: '1px solid rgba(30, 45, 61, 0.5)' }}>
      {SUB_NAV_TABS.map((tab) => (
        <button
          key={tab}
          onClick={() => {
            setActiveSubTab(tab);
            if (tab === 'Deep Scan') setShowDeepScan(true);
          }}
          className={`px-3 py-1 rounded text-xs transition-colors cursor-pointer whitespace-nowrap ${
            activeSubTab === tab
              ? 'bg-blue-600/20 text-blue-400 font-semibold border border-blue-500/30'
              : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar" style={{ backgroundColor: '#0a0e17' }}>
      {/* Sub-Navigation Strip */}
      {subNav}

      {/* Coverage Line & Timestamp Info */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-1.5 text-[11px] text-gray-500" style={{ backgroundColor: 'rgba(17, 24, 39, 0.5)', borderBottom: '1px solid rgba(30, 45, 61, 0.4)' }}>
        <div>
          {coverageLine({ universeCount: stocks ? stocks.length : 0, pricedCount: rows.length, unpriced, failedIds })}
          {scan.total > 0 && !scan.loading ? ` · scan: ${scanCoverage({ universe: stocks ? stocks.length : 0, scanned: scan.total, failed: scan.excluded.length, reasons: [...new Set(scan.excluded.map((e) => e.reason))] }).text}` : scan.loading ? ` · scanning ${scan.done} of ${scan.total}` : ''}
          {result?.asOf ? ` · prices as of ${stamp(result.asOf)} IST` : ''}
          {result?.fetchedAt ? ` · refreshed ${stamp(result.fetchedAt)}` : ''}
          {quotes.failed && result ? <span style={{ color: '#ffd600' }}> · last refresh failed, showing cached prices</span> : null}
        </div>
        <div className="flex items-center gap-2">
          {meta && <span className="text-[10px]" style={{ color: meta.color }} title={meta.description}>{meta.label}</span>}
          <Freshness lastSuccessAt={quotes.lastSuccessAt} failures={quotes.failed ? 1 : 0} />
          <button
            onClick={quotes.reload}
            aria-label="Reload quotes"
            className="p-1 rounded text-gray-500 hover:text-gray-200 hover:bg-white/5 cursor-pointer"
          >
            <RefreshCw size={12} className={quotes.loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* TOP ROW: 5 Benchmark Index Cards + Market Status Card */}
      <IndexOverviewCards
        levels={levels.levels}
        market={market}
        onSelectIndex={(id) => selection.toggle(id)}
      />

      {/* MIDDLE ROW (3 Panels: Heatmap | Top Movers | Market Breadth) */}
      {(activeSubTab === 'Overview' || activeSubTab === 'Market Heatmap' || activeSubTab === 'Top Movers' || activeSubTab === 'Breadth') && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 px-4 py-2">
          {/* 1. Market Heatmap */}
          <div className="h-full">
            <MarketHeatmap rows={rows} onOpen={open} />
          </div>

          {/* 2. Top Movers Table */}
          <div className="h-full">
            <TopMoversPanel rows={rows} onOpen={open} />
          </div>

          {/* 3. Market Breadth Gauge & Institutional Context */}
          <div className="h-full">
            <MarketBreadthPanel breadth={stats.breadth} />
          </div>
        </div>
      )}

      {/* LOWER ROW (3 Panels: Nifty 50 Chart | Sector Performance | Options Chain) */}
      {(activeSubTab === 'Overview' || activeSubTab === 'Sectors' || activeSubTab === 'Sector Strength' || activeSubTab === 'F&O' || activeSubTab === 'Indices') && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 px-4 py-2">
          {/* 1. Interactive Index Chart */}
          <div className="h-full">
            <DashboardChartPanel symbol="^NSEI" displayName="NIFTY 50" demoMode={demoMode} />
          </div>

          {/* 2. Sector Performance Divergent Bar Chart */}
          <div className="h-full">
            <SectorPerformancePanel
              sectors={stats.sectors.sectors}
              onSelectSector={(sec) => set({ sector: sec })}
              activeSector={filters.sector}
            />
          </div>

          {/* 3. Options Chain ATM Matrix */}
          <div className="h-full">
            <OptionsChainSummary optionsData={null} />
          </div>
        </div>
      )}

      {/* BOTTOM ROW: 4 Quadrants (Watchlist | News Feed | Economic Calendar | Portfolio Summary) */}
      {(activeSubTab === 'Overview' || activeSubTab === 'News') && (
        <DashboardBottomGrid onOpen={open} levels={levels.levels} sectors={sectors} />
      )}

      {/* DEEP RESEARCH SECTION (Collapsible: Bullish/Bearish Ranking Boards & Scatter Dot Plot) */}
      <div className="mx-4 my-3 rounded-lg overflow-hidden" style={{ backgroundColor: '#0d1117', border: '1px solid rgba(30, 45, 61, 0.5)' }}>
        <button
          onClick={() => setShowDeepScan(!showDeepScan)}
          className="w-full flex items-center justify-between px-4 py-2.5 bg-white/[0.02] hover:bg-white/[0.05] transition-colors cursor-pointer text-left"
        >
          <div className="flex items-center gap-2">
            <Layers size={14} className="text-emerald-400" />
            <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">
              Deep Market Analysis · Ranking Boards, Filters & Scatter Plot
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-gray-400 font-mono">
              {rows.length} stocks
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>{showDeepScan ? 'Hide details' : 'Show details'}</span>
            {showDeepScan ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </button>

        {showDeepScan && (
          <div className="p-3 space-y-4" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.4)' }}>
            {/* Bullish & Bearish Ranking Boards */}
            <MarketBoards
              boards={boards}
              config={boardConfig}
              onConfig={changeBoardConfig}
              fresh={fresh}
              scan={scan}
              onOpen={open}
              asOf={stamp(result?.asOf)}
              sector={filters.sector}
            />

            {/* Filter Bar */}
            <div className="flex flex-wrap items-end gap-3 p-3 rounded" style={{ backgroundColor: 'rgba(17, 24, 39, 0.6)', border: '1px solid rgba(30, 45, 61, 0.4)' }}>
              <label className="flex flex-col gap-1 text-[10px] text-gray-400 uppercase tracking-wider">
                Sector
                <select
                  value={filters.sector}
                  onChange={(e) => set({ sector: e.target.value })}
                  className={inputClass}
                  style={{ backgroundColor: '#0d1117' }}
                  aria-label="Sector filter"
                >
                  <option value="">All sectors ({rows.length})</option>
                  {sectors.map((s) => (
                    <option key={s.sector} value={s.sector}>
                      {s.sector} ({s.count})
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-[10px] text-gray-400 uppercase tracking-wider">
                Change from %
                <input
                  type="number"
                  step="any"
                  value={filters.minPct}
                  onChange={(e) => set({ minPct: e.target.value })}
                  placeholder="-5"
                  className={`${inputClass} w-20`}
                />
              </label>

              <label className="flex flex-col gap-1 text-[10px] text-gray-400 uppercase tracking-wider">
                to %
                <input
                  type="number"
                  step="any"
                  value={filters.maxPct}
                  onChange={(e) => set({ maxPct: e.target.value })}
                  placeholder="5"
                  className={`${inputClass} w-20`}
                />
              </label>

              <label className="flex flex-col gap-1 text-[10px] text-gray-400 uppercase tracking-wider">
                Relative volume
                <select
                  value={filters.minRelVol}
                  onChange={(e) => set({ minRelVol: e.target.value })}
                  className={inputClass}
                  style={{ backgroundColor: '#0d1117' }}
                >
                  <option value="">Any</option>
                  {REL_VOL_OPTIONS.map((v) => (
                    <option key={v} value={v}>at least {v}x</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-[10px] text-gray-400 uppercase tracking-wider">
                Signal status
                <select
                  value={filters.signal}
                  onChange={(e) => setSignal(e.target.value)}
                  className={inputClass}
                  style={{ backgroundColor: '#0d1117' }}
                >
                  {SIGNAL_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </label>

              {active && (
                <button
                  onClick={() => updateView({ filters: DEFAULT_FILTERS })}
                  className="px-2.5 py-1 text-xs rounded cursor-pointer bg-white/10 text-gray-200 hover:bg-white/20"
                >
                  Reset filters
                </button>
              )}
            </div>

            {/* Scatter Dot Plot */}
            <section className="py-2">
              <h3 className="pb-1 text-[11px] text-gray-400 uppercase tracking-wider">
                Move Distribution Scatter ({filtered.rows.length}{active ? ` of ${rows.length}` : ''})
              </h3>
              <p className="pb-2 text-[11px] text-gray-400" aria-live="polite">
                {hoveredRow ? (
                  <>
                    <span className="text-gray-200 font-medium">{hoveredRow.symbol}</span> {px(hoveredRow.price)}{' '}
                    <span style={{ color: tone(hoveredRow.changePct) }}>{pct(hoveredRow.changePct)}</span>
                    {' · '}rel vol {Number.isFinite(hoveredRow.relVolume) ? `${hoveredRow.relVolume.toFixed(1)}x` : '—'}
                    {' · '}{hoveredRow.sector}
                    {' · '}{signals.has(hoveredRow.symbol) ? SIGNAL_TEXT[signals.get(hoveredRow.symbol)] : 'signal not scanned yet'}
                  </>
                ) : 'Hover a dot for details; click it to open the chart.'}
              </p>
              {filtered.rows.length === 0 ? (
                <p className="py-4 text-xs text-gray-500">No stock matches these filters.</p>
              ) : (
                <DotPlot
                  dots={dots}
                  size={layout.size}
                  step={layout.step}
                  onSelect={open}
                  onHover={setHovered}
                  hovered={hovered}
                />
              )}
            </section>

            {/* Discovery Tabs */}
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
          </div>
        )}
      </div>

      {/* Stock Quick-View Drawer / Modal */}
      {quick && (
        <StockQuickView
          key={quick.stock.symbol}
          stock={quick.stock}
          row={bySymbol.get(quick.stock.symbol)}
          market={market}
          onClose={() => setQuick(null)}
          onOpen={goToChart}
        />
      )}
    </div>
  );
}
