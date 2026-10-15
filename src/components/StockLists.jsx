import { useMemo, useState } from 'react';
import { RefreshCw, Search, X, SlidersHorizontal, Activity, Star, TrendingUp, TrendingDown } from 'lucide-react';
import { Panel, Empty, Row, Table, Progress, Star2 } from './ListParts';
import IndexSelect from './IndexSelect';
import { useUniverseSelection, useUniverseStocks } from '../hooks/useUniverse';
import { useQuotesBatch } from '../hooks/useQuotesBatch';
import Freshness from './Freshness';
import { useScreenerData, MAX_SCAN } from '../hooks/useScreenerData';
import { useIntradayScan, MAX_INTRADAY_SCAN } from '../hooks/useIntradayScan';
import { useWatchlist } from '../hooks/useWatchlist';
import { WATCH_KINDS, WATCH_LABELS } from '../data/watchStore';
import { moversFromQuotes, orderBlockList, swingSetupList, trendingList, intradayList } from '../data/stockLists';
import { STATUS_META } from '../data/dataStatus';
import { Opportunities, OrderFlow } from './OpportunityViews';
import { binDots, DOT_AXIS_LIMIT } from '../data/marketOverview';

const GREEN = '#00e676';
const RED = '#ff1744';
const px = (n) => (Number.isFinite(n) ? n.toFixed(2) : '—');
const signed = (n, d = 2) => (Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(d)}%` : '—');
const tone = (n) => (!Number.isFinite(n) || n === 0 ? '#9ca3af' : n > 0 ? GREEN : RED);
const vol = (v) => (!Number.isFinite(v) ? '—' : v >= 1e7 ? `${(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(1)} L` : v.toLocaleString('en-IN'));
const istClock = (t) => new Date(t * 1000).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

// 9 Comprehensive Stock Discovery Modes matching Section 3.2
export const VIEWS = [
  ['opps', 'My Opportunities'],
  ['gainers', 'Gainers'],
  ['losers', 'Losers'],
  ['volume', 'High Volume'],
  ['intraday', 'Intraday Signals'],
  ['swing', 'Swing Trending'],
  ['blocks', 'Order Blocks'],
  ['flow', 'Volume & Liquidity'],
  ['watchlist', 'Watchlist'],
];

// Interactive Stock Distribution Scatter Plot (Section 3.6)
function StockDistributionScatter({ quotes, onSelectStock }) {
  const [hovered, setHovered] = useState(null);
  const dots = useMemo(() => binDots(quotes), [quotes]);
  const maxLevel = dots.reduce((m, d) => Math.max(m, d.level), 0);
  const height = Math.max(70, Math.min(140, (maxLevel + 2) * 11));

  if (!quotes || quotes.length === 0) return null;

  return (
    <div className="mb-3 p-3 rounded-lg border border-white/5 bg-[#111827]/60">
      <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
        <span className="font-semibold text-gray-300">Move Distribution (% Change Scatter)</span>
        <span className="text-[10px] text-gray-500 font-mono">
          {hovered ? `${hovered.symbol}: ${hovered.changePct >= 0 ? '+' : ''}${hovered.changePct?.toFixed(2)}%` : 'Hover a stock to inspect'}
        </span>
      </div>

      <div className="relative w-full h-[85px] bg-[#0d1117]/80 rounded border border-white/5 overflow-hidden flex items-center justify-center">
        {/* Zero Axis Reference Line */}
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-gray-700/60 z-0" />
        
        {/* Axis Labels */}
        <span className="absolute left-2 text-[9px] font-mono text-red-400/80">-{DOT_AXIS_LIMIT}%</span>
        <span className="absolute left-1/2 -translate-x-1/2 text-[9px] font-mono text-gray-500">0%</span>
        <span className="absolute right-2 text-[9px] font-mono text-green-400/80">+{DOT_AXIS_LIMIT}%</span>

        <svg className="w-full h-full px-8 py-2 overflow-visible">
          {dots.map((d) => {
            const isUp = (d.changePct ?? 0) >= 0;
            const isHovered = hovered?.symbol === d.symbol;
            return (
              <circle
                key={d.symbol}
                cx={`${d.x}%`}
                cy={`${Math.min(75, 12 + d.level * 9)}px`}
                r={isHovered ? 5.5 : 3}
                fill={isUp ? GREEN : RED}
                opacity={isHovered ? 1 : 0.75}
                className="cursor-pointer transition-all hover:scale-125"
                onMouseEnter={() => setHovered(d)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onSelectStock && onSelectStock({ symbol: d.symbol, name: d.name })}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// Focused Table for Gainers, Losers, and Volume Modes
function FocusedMoversTable({ mode, stocks, watch, onOpen, searchQuery, selectedSector }) {
  const symbols = useMemo(() => stocks.map((s) => s.symbol), [stocks]);
  const { result, failed, loading, reload, lastSuccessAt } = useQuotesBatch(symbols, true);
  const nameOf = useMemo(() => Object.fromEntries(stocks.map((s) => [s.symbol, s])), [stocks]);
  const m = useMemo(() => (result ? moversFromQuotes(result.quotes) : null), [result]);
  const status = STATUS_META[failed && !result ? 'UNAVAILABLE' : failed ? 'STALE' : result?.dataStatus] ?? STATUS_META.UNAVAILABLE;
  const full = (q) => ({ ...q, name: nameOf[q.symbol]?.name ?? q.name, sector: nameOf[q.symbol]?.sector, indices: nameOf[q.symbol]?.indices });

  const filteredQuotes = useMemo(() => {
    if (!m) return [];
    let list = [];
    if (mode === 'gainers') list = m.gainers;
    else if (mode === 'losers') list = m.losers;
    else if (mode === 'volume') list = m.volume;
    else list = [...m.gainers, ...m.losers];

    return list.map(full).filter((q) => {
      const qText = `${q.symbol} ${q.name || ''}`.toLowerCase();
      const matchSearch = !searchQuery || qText.includes(searchQuery.toLowerCase());
      const matchSector = !selectedSector || selectedSector === 'all' || q.sector === selectedSector;
      return matchSearch && matchSector;
    });
  }, [m, mode, searchQuery, selectedSector]);

  if (!result && loading) return <Empty>Loading quotes for {symbols.length} stocks…</Empty>;
  if (!result) {
    return (
      <Empty>
        Quotes could not be loaded. Provider may be temporarily unreachable.{' '}
        <button onClick={reload} className="underline cursor-pointer" style={{ color: '#00e5ff' }}>
          Retry
        </button>
      </Empty>
    );
  }

  const title = mode === 'gainers' ? 'Top Gainers' : mode === 'losers' ? 'Top Losers' : 'Volume Leaders';
  const hint = mode === 'volume' ? 'By total traded value & relative volume' : 'Ranked by day percentage change';

  return (
    <div>
      <div className="flex items-center justify-between px-1 pb-2 text-[11px] text-gray-500">
        <span>
          {m.counts.ranked} of {m.counts.total} stocks priced · {m.counts.up} up · {m.counts.down} down
          {filteredQuotes.length !== (m[mode]?.length ?? 0) ? ` · ${filteredQuotes.length} match filters` : ''}
        </span>
        <span className="flex items-center gap-2">
          <span style={{ color: status.color }}>{status.label}</span>
          {result.asOf && (
            <span>
              as of{' '}
              {new Date(result.asOf).toLocaleString('en-IN', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Kolkata',
              })}{' '}
              IST
            </span>
          )}
          <Freshness lastSuccessAt={lastSuccessAt} failures={failed ? 1 : 0} />
          <button onClick={reload} aria-label="Reload quotes" className="p-1 rounded text-gray-500 hover:text-gray-200 cursor-pointer">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </span>
      </div>

      <Panel title={title} hint={hint} count={filteredQuotes.length}>
        {filteredQuotes.length === 0 ? (
          <Empty>No matching stocks found.</Empty>
        ) : (
          <Table head={['Price', 'Day Change', 'Relative Volume', 'Volume', 'Sector']}>
            {filteredQuotes.map((q) => (
              <Row
                key={q.symbol}
                r={q}
                watch={watch}
                onOpen={onOpen}
                target="orderblock"
                cols={[
                  { text: px(q.price), color: '#d1d5db' },
                  { text: signed(q.changePct), color: tone(q.changePct) },
                  { text: Number.isFinite(q.relVolume) ? `${q.relVolume.toFixed(1)}x` : '—', color: '#d1d5db' },
                  { text: vol(q.volume), color: '#9ca3af' },
                  { text: q.sector || '—', color: '#9ca3af' },
                ]}
              />
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}

function ZoneRow({ r, watch, onOpen }) {
  const z = r.zone;
  return (
    <Row
      r={r}
      watch={watch}
      onOpen={onOpen}
      target="orderblock"
      cols={[
        { text: px(r.price), color: '#d1d5db' },
        { text: `${px(z.low)}–${px(z.high)}`, color: '#d1d5db' },
        { text: z.inside ? 'inside' : `${z.distancePct.toFixed(2)}%`, color: z.inside ? '#ffd600' : '#d1d5db' },
        { text: `${z.strength}%${z.tested ? ' · tested' : ''}`, color: '#d1d5db' },
        { text: Number.isFinite(z.ageBars) ? `${z.ageBars}d` : '—', color: '#9ca3af' },
      ]}
    />
  );
}

function Blocks({ scan, watch, onOpen }) {
  const [distance, setDistance] = useState(2);
  const demand = useMemo(() => orderBlockList(scan.rows, 'demand', distance), [scan.rows, distance]);
  const supply = useMemo(() => orderBlockList(scan.rows, 'supply', distance), [scan.rows, distance]);
  return (
    <>
      <div className="flex items-center gap-3 pb-2 text-[11px] text-gray-500">
        <label className="flex items-center gap-2">
          Within{' '}
          <select
            value={distance}
            onChange={(e) => setDistance(Number(e.target.value))}
            className="px-2 py-1 rounded text-gray-200 border border-gray-700 outline-none"
            style={{ backgroundColor: '#0d1117' }}
          >
            {[0.5, 1, 2, 3, 5].map((d) => (
              <option key={d} value={d}>
                {d}%
              </option>
            ))}
          </select>{' '}
          of the zone
        </label>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="Demand zone nearby" hint="Price at or just above an unmitigated bullish block" count={demand.length}>
          {demand.length === 0 ? (
            <Empty>No stock is near a valid demand zone.</Empty>
          ) : (
            <Table head={['Price', 'Zone', 'Away', 'Strength', 'Age']}>
              {demand.map((r) => (
                <ZoneRow key={r.symbol} r={r} watch={watch} onOpen={onOpen} />
              ))}
            </Table>
          )}
        </Panel>
        <Panel title="Supply zone nearby" hint="Price at or just below an unmitigated bearish block" count={supply.length}>
          {supply.length === 0 ? (
            <Empty>No stock is near a valid supply zone.</Empty>
          ) : (
            <Table head={['Price', 'Zone', 'Away', 'Strength', 'Age']}>
              {supply.map((r) => (
                <ZoneRow key={r.symbol} r={r} watch={watch} onOpen={onOpen} />
              ))}
            </Table>
          )}
        </Panel>
      </div>
      <p className="pt-2 text-[10px] text-gray-600">
        Order blocks are the last opposite candle before a strong impulsive move, calculated from daily candles. A zone is an institutional footprint where price previously reacted.
      </p>
    </>
  );
}

function SwingRow({ r, watch, onOpen }) {
  const s = r.signal;
  const long = s.side === 'BUY';
  return (
    <Row
      r={r}
      watch={watch}
      onOpen={onOpen}
      target="swing"
      cols={[
        { text: px(r.price), color: '#d1d5db' },
        { text: `${long ? 'BUY' : 'SHORT'} ${s.strategy}`, color: long ? GREEN : RED },
        { text: px(s.entry), color: '#d1d5db' },
        { text: px(s.stop), color: RED },
        { text: `${px(s.target1)} / ${px(s.target2)}`, color: GREEN },
        { text: s.actionable ? (s.ageBars === 0 ? 'last bar' : `${s.ageBars}d ago`) : (s.label ?? 'not valid'), color: s.actionable ? '#9ca3af' : '#ffd600' },
      ]}
    />
  );
}

export function Swing({ scan, watch, onOpen }) {
  const setups = useMemo(() => swingSetupList(scan.rows), [scan.rows]);
  const past = useMemo(() => swingSetupList(scan.rows, { actionable: false }), [scan.rows]);
  const up = useMemo(() => trendingList(scan.rows, 'up'), [scan.rows]);
  const down = useMemo(() => trendingList(scan.rows, 'down'), [scan.rows]);
  const trendCols = (r) => [
    { text: px(r.price), color: '#d1d5db' },
    { text: r.adx.toFixed(0), color: '#d1d5db' },
    { text: Number.isFinite(r.rsi) ? r.rsi.toFixed(0) : '—', color: '#d1d5db' },
    { text: signed(r.vsEma20Pct), color: tone(r.vsEma20Pct) },
  ];
  return (
    <>
      <Panel title="Swing setups" hint="Valid setups from the last 3 completed daily bars" count={setups.length}>
        {setups.length === 0 ? (
          <Empty>No stock has a fresh swing setup. The multi-indicator rules are strict and require trend, ADX, and volume confluence.</Empty>
        ) : (
          <Table head={['Price', 'Setup', 'Entry', 'Stop', 'Targets 1 / 2', 'Age']}>
            {setups.map((r) => (
              <SwingRow key={r.symbol} r={r} watch={watch} onOpen={onOpen} />
            ))}
          </Table>
        )}
      </Panel>
      {past.length > 0 && (
        <div className="mt-3">
          <Panel title="Recent setups no longer valid" hint="Stopped out, past target, or expired" count={past.length}>
            <Table head={['Price', 'Setup', 'Entry', 'Stop', 'Targets 1 / 2', 'Age']}>
              {past.map((r) => (
                <SwingRow key={r.symbol} r={r} watch={watch} onOpen={onOpen} />
              ))}
            </Table>
          </Panel>
        </div>
      )}
      <div className="grid gap-3 xl:grid-cols-2 mt-3">
        <Panel title="Strong uptrends" hint="ADX ≥ 25, price above rising 20/50-day EMAs" count={up.length}>
          {up.length === 0 ? (
            <Empty>No stock is in a strong, aligned uptrend.</Empty>
          ) : (
            <Table head={['Price', 'ADX', 'RSI', 'vs EMA20']}>
              {up.map((r) => (
                <Row key={r.symbol} r={r} watch={watch} onOpen={onOpen} target="swing" cols={trendCols(r)} />
              ))}
            </Table>
          )}
        </Panel>
        <Panel title="Strong downtrends" hint="ADX ≥ 25, price below falling 20/50-day EMAs" count={down.length}>
          {down.length === 0 ? (
            <Empty>No stock is in a strong, aligned downtrend.</Empty>
          ) : (
            <Table head={['Price', 'ADX', 'RSI', 'vs EMA20']}>
              {down.map((r) => (
                <Row key={r.symbol} r={r} watch={watch} onOpen={onOpen} target="swing" cols={trendCols(r)} />
              ))}
            </Table>
          )}
        </Panel>
      </div>
    </>
  );
}

function IntradayRow({ r, watch, onOpen }) {
  const s = r.latest;
  const long = s.side === 'BUY';
  return (
    <Row
      r={r}
      watch={watch}
      onOpen={onOpen}
      target="intraday"
      cols={[
        { text: px(r.price), color: '#d1d5db' },
        { text: `${long ? 'BUY' : 'SHORT'} ${s.strategy}`, color: long ? GREEN : RED },
        { text: px(s.entry), color: '#d1d5db' },
        { text: px(s.stop), color: RED },
        { text: `${px(s.target1)} / ${px(s.target2)}`, color: GREEN },
        { text: istClock(s.time), color: '#9ca3af' },
        { text: s.lifecycle?.actionable ? (s.ageBars === 0 ? 'last bar' : `${s.ageBars} bars`) : (s.lifecycle?.label ?? 'not valid'), color: s.lifecycle?.actionable ? '#9ca3af' : '#ffd600' },
      ]}
    />
  );
}

export function Intraday({ scan, watch, onOpen, market }) {
  const marketOpen = market ? market.isOpen : null;
  const stale = scan.scans.some((r) => r.dataStatus === 'STALE');
  const canAct = marketOpen === true;
  const valid = useMemo(() => intradayList(scan.scans, { actionable: true }).filter((r) => r.dataStatus !== 'STALE'), [scan.scans]);
  const rest = useMemo(() => intradayList(scan.scans, { actionable: false }), [scan.scans]);
  const head = ['Price', 'Setup', 'Entry', 'Stop', 'Targets 1 / 2', 'Bar time (IST)', 'Status'];
  const actionable = canAct ? valid : [];
  const review = canAct ? rest : [...valid, ...rest];
  return (
    <>
      {!canAct && (
        <div className="mb-2 px-3 py-1.5 rounded text-[11px]" role="status" style={{ backgroundColor: 'rgba(255, 214, 0, 0.08)', color: '#ffd600', border: '1px solid rgba(255, 214, 0, 0.25)' }}>
          {marketOpen === null ? 'Market state unknown, so every signal is shown for review only.' : 'The market is closed. Nothing here is actionable now; these are the last session’s signals, kept for review.'}
        </div>
      )}
      {canAct && stale && <p className="mb-2 text-[11px]" style={{ color: '#ffd600' }}>Some stocks have stale data and are left out of the actionable list.</p>}
      <Panel title="Actionable now" hint="Valid, un-stopped signals on live-session data" count={actionable.length}>
        {actionable.length === 0 ? (
          <Empty>{canAct ? 'No stock has a valid intraday signal right now.' : 'None while the market is closed.'}</Empty>
        ) : (
          <Table head={head}>
            {actionable.map((r) => (
              <IntradayRow key={r.symbol} r={r} watch={watch} onOpen={onOpen} />
            ))}
          </Table>
        )}
      </Panel>
      <div className="mt-3">
        <Panel title={canAct ? 'Recent signals no longer valid' : 'Last session (review)'} hint={canAct ? 'Stopped out, past target, or expired' : 'Newest 5-minute signal per stock'} count={review.length}>
          {review.length === 0 ? (
            <Empty>None.</Empty>
          ) : (
            <Table head={head}>
              {review.map((r) => (
                <IntradayRow key={r.symbol} r={r} watch={watch} onOpen={onOpen} />
              ))}
            </Table>
          )}
        </Panel>
      </div>
    </>
  );
}

// Watchlist Table View
function WatchlistTable({ watch, onOpen }) {
  const items = watch.list || [];
  return (
    <Panel title="My Watchlist" hint="Starred stocks for quick monitoring" count={items.length}>
      {items.length === 0 ? (
        <Empty>No stocks in this watchlist yet. Star any stock from the lists to add it here.</Empty>
      ) : (
        <Table head={['Price at add', 'Added', 'Sector']}>
          {items.map((item) => (
            <Row
              key={item.symbol}
              r={{ symbol: item.symbol, name: item.name || item.symbol, price: item.price, sector: item.sector }}
              watch={watch}
              onOpen={onOpen}
              target="orderblock"
              cols={[
                { text: px(item.price), color: '#d1d5db' },
                { text: new Date(item.addedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), color: '#9ca3af' },
                { text: item.sector || '—', color: '#9ca3af' },
              ]}
            />
          ))}
        </Table>
      )}
    </Panel>
  );
}

// SCREEN 1 ROOT: Comprehensive Stock List & Discovery Terminal
export default function StockLists({ onOpen, market }) {
  const selection = useUniverseSelection();
  const { stocks, labels, failedIds, loading } = useUniverseStocks(selection.universe);
  const failed = !loading && (!stocks || stocks.length === 0);
  const [view, setView] = useState('opps');
  const [starKind, setStarKind] = useState('daily');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSector, setSelectedSector] = useState('all');
  const [showScatter, setShowScatter] = useState(false);

  const watch = useWatchlist(starKind);
  const watchDaily = useWatchlist('daily');

  const dailyStocks = useMemo(() => (stocks ? stocks.slice(0, MAX_SCAN) : []), [stocks]);
  const intradayStocks = useMemo(() => (stocks ? stocks.slice(0, MAX_INTRADAY_SCAN) : []), [stocks]);
  const daily = useScreenerData(dailyStocks, ['blocks', 'swing', 'opps', 'flow'].includes(view));
  const intraday = useIntradayScan(intradayStocks, view === 'intraday');

  // Extract unique sectors from available stocks
  const availableSectors = useMemo(() => {
    if (!stocks) return [];
    const set = new Set(stocks.map((s) => s.sector).filter(Boolean));
    return Array.from(set).sort();
  }, [stocks]);

  // Quotes for the scatter plot
  const scatterQuotes = useMemo(() => {
    return (daily.rows || []).map((r) => ({
      symbol: r.symbol,
      name: r.name,
      changePct: r.metrics?.changePct ?? 0,
      price: r.metrics?.price,
    }));
  }, [daily.rows]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto" style={{ backgroundColor: '#0a0e17' }}>
      {/* Top Filter & Navigation Toolbar */}
      <div className="flex flex-col gap-2.5 px-4 py-2.5 border-b border-white/5 bg-[#0d1117]">
        {/* Row 1: Universe + Search + Sector + Star destination + Scatter Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <IndexSelect selection={selection} labels={labels} count={stocks ? stocks.length : null} />

            {/* Instant Symbol/Name Search */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#111827] border border-gray-700/60 text-xs">
              <Search size={13} className="text-gray-400" />
              <input
                type="text"
                placeholder="Filter stocks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent text-gray-200 outline-none w-28 sm:w-36 text-xs placeholder-gray-500"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-gray-400 hover:text-white cursor-pointer">
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Sector Selector */}
            {availableSectors.length > 0 && (
              <select
                value={selectedSector}
                onChange={(e) => setSelectedSector(e.target.value)}
                className="px-2.5 py-1 text-xs rounded bg-[#111827] text-gray-200 border border-gray-700/60 outline-none cursor-pointer"
              >
                <option value="all">All Sectors</option>
                {availableSectors.map((sec) => (
                  <option key={sec} value={sec}>
                    {sec}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Scatter Distribution Toggle */}
            <button
              onClick={() => setShowScatter(!showScatter)}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border transition-colors cursor-pointer ${
                showScatter
                  ? 'bg-blue-600/20 text-blue-400 border-blue-500/40 font-semibold'
                  : 'bg-[#111827] text-gray-400 border-gray-700/60 hover:text-gray-200'
              }`}
            >
              <Activity size={12} />
              <span>Distribution</span>
            </button>

            {/* Star Watchlist Destination */}
            <label className="flex items-center gap-1.5 text-[10px] text-gray-400 uppercase tracking-wider">
              <span>Star:</span>
              <select
                value={starKind}
                onChange={(e) => setStarKind(e.target.value)}
                className="px-2 py-1 text-xs rounded bg-[#111827] text-gray-200 border border-gray-700/60 outline-none normal-case"
              >
                {WATCH_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {WATCH_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* Row 2: 9 Stock Discovery Tab Bar */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pt-1">
          {VIEWS.map(([id, text]) => {
            const isActive = view === id;
            return (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`px-3 py-1 rounded text-xs transition-colors cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-green-500/15 text-green-400 font-semibold border border-green-500/30'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
                }`}
              >
                {text}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="px-4 py-3">
        {/* Optional Scatter Plot Distribution */}
        {showScatter && scatterQuotes.length > 0 && (
          <StockDistributionScatter quotes={scatterQuotes} onSelectStock={onOpen} />
        )}

        {loading && <Empty>Loading selected index constituents…</Empty>}
        {failedIds.length > 0 && (
          <p className="mb-2 text-[11px]" style={{ color: '#ffd600' }}>
            These indices could not be loaded: {failedIds.join(', ')}.
          </p>
        )}
        {failed && <Empty>No stocks to show. Select an index or add custom symbols.</Empty>}

        {stocks && stocks.length > 0 && (
          <>
            {view === 'opps' && (
              <>
                <Progress
                  {...daily}
                  excluded={daily.excluded}
                  truncated={stocks.length > MAX_SCAN}
                  limit={MAX_SCAN}
                  universe={stocks.length}
                  reload={daily.reload}
                />
                <Opportunities scan={daily} watch={watch} onOpen={onOpen} lastSession={market?.lastSession ?? null} />
              </>
            )}

            {(view === 'gainers' || view === 'losers' || view === 'volume') && (
              <FocusedMoversTable
                mode={view}
                stocks={stocks}
                watch={watch}
                onOpen={onOpen}
                searchQuery={searchQuery}
                selectedSector={selectedSector}
              />
            )}

            {view === 'blocks' && (
              <>
                <Progress
                  {...daily}
                  excluded={daily.excluded}
                  truncated={stocks.length > MAX_SCAN}
                  limit={MAX_SCAN}
                  universe={stocks.length}
                  reload={daily.reload}
                />
                <Blocks scan={daily} watch={watch} onOpen={onOpen} />
              </>
            )}

            {view === 'swing' && (
              <>
                <Progress
                  {...daily}
                  excluded={daily.excluded}
                  truncated={stocks.length > MAX_SCAN}
                  limit={MAX_SCAN}
                  universe={stocks.length}
                  reload={daily.reload}
                />
                <Swing scan={daily} watch={watch} onOpen={onOpen} />
              </>
            )}

            {view === 'flow' && (
              <>
                <Progress
                  {...daily}
                  excluded={daily.excluded}
                  truncated={stocks.length > MAX_SCAN}
                  limit={MAX_SCAN}
                  universe={stocks.length}
                  reload={daily.reload}
                />
                <OrderFlow scan={daily} watch={watchDaily} onOpen={onOpen} marketOpen={market ? market.isOpen : null} />
              </>
            )}

            {view === 'intraday' && (
              <>
                <Progress
                  {...intraday}
                  excluded={intraday.excluded}
                  truncated={stocks.length > MAX_INTRADAY_SCAN}
                  limit={MAX_INTRADAY_SCAN}
                  universe={stocks.length}
                  reload={intraday.reload}
                />
                <Intraday scan={intraday} watch={watch} onOpen={onOpen} market={market} />
              </>
            )}

            {view === 'watchlist' && <WatchlistTable watch={watch} onOpen={onOpen} />}
          </>
        )}

        <p className="pt-4 text-[10px] text-gray-600">
          StockPulse discovery scans official NSE Indices with live de-duplication across overlapping baskets. Star any stock to save it to your Watchlist.
        </p>
      </div>
    </div>
  );
}
