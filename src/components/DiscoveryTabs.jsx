import { useMemo, useState } from 'react';
import { Panel, Empty, Row, Table } from './ListParts';
import { Swing, Intraday } from './StockLists';
import { Opportunities, OrderFlow } from './OpportunityViews';
import { useIntradayScan, MAX_INTRADAY_SCAN } from '../hooks/useIntradayScan';
import { useWatchlist } from '../hooks/useWatchlist';
import { WATCH_KINDS, WATCH_LABELS } from '../data/watchStore';
import {
  DISCOVERY_TABS, SORTS, tradedValueCr, searchRows, sortRows, highVolumeList, gainersList, losersList, watchlistRows,
  restrictScanRows, restrictIntradayScans,
} from '../data/discovery';

const GREEN = '#00e676';
const RED = '#ff1744';
const rule = { borderBottom: '1px solid rgba(30, 45, 61, 0.3)' };
const inputClass = 'px-2 py-1 text-xs rounded bg-transparent text-gray-200 border border-gray-700 focus:border-green-500 outline-none';

const px = (n) => (Number.isFinite(n) ? n.toFixed(2) : '—');
const signed = (n) => (Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(2)}%` : '—');
const tone = (n) => (!Number.isFinite(n) || n === 0 ? '#9ca3af' : n > 0 ? GREEN : RED);
const cr = (n) => (Number.isFinite(n) ? `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 1 })} Cr` : '—');

const SIMPLE = {
  volume: { build: (rows) => highVolumeList(rows), title: 'High volume', hint: 'relative volume at least 1.5× the 3-month average, highest first', empty: 'No stock is trading on unusually high volume (it reads low early in the session).' },
  gainers: { build: gainersList, title: 'Gainers', hint: 'up on the day, biggest first', empty: 'No stock is up.' },
  losers: { build: losersList, title: 'Losers', hint: 'down on the day, biggest first', empty: 'No stock is down.' },
};

function SimpleTable({ rows, watch, onOpen, emptyText }) {
  if (rows.length === 0) return <Empty>{emptyText}</Empty>;
  return (
    <Table head={['Price', 'Day', 'Rel vol', 'Traded today', 'Sector']}>
      {rows.slice(0, 100).map((r) => (
        <Row key={r.symbol} r={r} watch={watch} onOpen={onOpen} target="orderblock" cols={[
          { text: px(r.price), color: '#d1d5db' },
          { text: signed(r.changePct), color: tone(r.changePct) },
          { text: Number.isFinite(r.relVolume) ? `${r.relVolume.toFixed(1)}x` : '—', color: '#d1d5db' },
          { text: cr(tradedValueCr(r)), color: '#9ca3af' },
          { text: r.sector, color: '#9ca3af' },
        ]} />
      ))}
    </Table>
  );
}

/**
 * Tabbed discovery section for the Dashboard. Every tab works on the selected universe after the Dashboard's filters and
 * the search box, so the lists always agree with the plot above them. The deeper tabs reuse the Stock Lists views.
 */
export default function DiscoveryTabs({ rows, stocks, scan, market, view, onView, onOpen, lastSession }) {
  const [starKind, setStarKind] = useState('daily');
  const watch = useWatchlist(starKind);
  const watchDaily = useWatchlist('daily');
  const watchSwing = useWatchlist('swing');

  const searched = useMemo(() => searchRows(rows, view.search), [rows, view.search]);
  const allowed = useMemo(() => new Set(searched.map((r) => r.symbol)), [searched]);

  // The intraday scan covers a fixed set (the universe's first stocks), so typing in the search box never restarts it
  const intradayStocks = useMemo(() => stocks.slice(0, MAX_INTRADAY_SCAN), [stocks]);
  const intraday = useIntradayScan(intradayStocks, view.tab === 'intraday');
  const intradayShown = useMemo(() => ({ ...intraday, scans: restrictIntradayScans(intraday.scans, allowed) }), [intraday, allowed]);
  const scanShown = useMemo(() => ({ ...scan, rows: restrictScanRows(scan.rows, allowed) }), [scan, allowed]);

  const marketOpen = market ? market.isOpen : null;
  const simple = SIMPLE[view.tab];
  const listed = useMemo(() => (simple ? sortRows(simple.build(searched), view.sort, view.dir) : []), [simple, searched, view.sort, view.dir]);
  const watched = useMemo(() => {
    const all = new Set([...watchDaily.allSymbols]);
    const w = watchlistRows(searched, all);
    return { rows: sortRows(w.rows, view.sort === 'default' ? 'change' : view.sort, view.dir), outside: w.outside };
  }, [searched, watchDaily.allSymbols, view.sort, view.dir]);

  return (
    <div style={rule}>
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mr-2">Discovery</h2>
        {DISCOVERY_TABS.map((t) => (
          <button key={t.id} onClick={() => onView({ tab: t.id })} aria-pressed={view.tab === t.id} className={`px-2.5 py-1 text-xs rounded cursor-pointer ${view.tab === t.id ? 'bg-green-500/15 text-green-400' : 'text-gray-500 hover:text-gray-300'}`}>{t.label}</button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 px-4 py-2">
        <label className="flex flex-col gap-1 text-[10px] text-gray-500 uppercase tracking-wider">
          Search
          <input value={view.search} onChange={(e) => onView({ search: e.target.value })} placeholder="symbol, name, sector or index" aria-label="Search the lists" className={`${inputClass} w-56`} />
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-gray-500 uppercase tracking-wider">
          Sort (simple lists)
          <span className="flex gap-1">
            <select value={view.sort} onChange={(e) => onView({ sort: e.target.value })} aria-label="Sort by" className={inputClass} style={{ backgroundColor: '#0d1117' }}>
              {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <button onClick={() => onView({ dir: view.dir === 'desc' ? 'asc' : 'desc' })} aria-label={view.dir === 'desc' ? 'Sorted high to low; click for low to high' : 'Sorted low to high; click for high to low'} className="px-2 text-xs rounded bg-white/5 text-gray-300 hover:bg-white/10 cursor-pointer">{view.dir === 'desc' ? '↓' : '↑'}</button>
          </span>
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-gray-500 uppercase tracking-wider">
          Star adds to
          <select value={starKind} onChange={(e) => setStarKind(e.target.value)} aria-label="Watchlist for stars" className={inputClass} style={{ backgroundColor: '#0d1117' }}>
            {WATCH_KINDS.map((k) => <option key={k} value={k}>{WATCH_LABELS[k]}</option>)}
          </select>
        </label>
        <span className="text-[11px] text-gray-500 pb-1">{searched.length} of {rows.length} stocks match the filters and search</span>
      </div>

      <div className="px-4 pb-3">
        {simple && (
          <Panel title={simple.title} hint={simple.hint} count={listed.length}>
            <SimpleTable rows={listed} watch={watch} onOpen={onOpen} emptyText={searched.length === 0 ? 'No stock matches the filters and search.' : simple.empty} />
          </Panel>
        )}

        {view.tab === 'watchlist' && (
          <Panel title="Watchlist" hint="your Daily trading and Swing lists, within the selected universe" count={watched.rows.length}>
            <SimpleTable rows={watched.rows} watch={watch} onOpen={onOpen} emptyText="None of your watchlist stocks is in this view. Star stocks in any list to add them." />
            {watched.outside.length > 0 && <p className="px-3 py-2 text-[10px] text-gray-600">Not in the selected universe or filters: {watched.outside.join(', ')}. Manage lists, tags and order on the Watchlist screen.</p>}
          </Panel>
        )}

        {view.tab === 'swing' && <Swing scan={scanShown} watch={watchSwing} onOpen={onOpen} />}
        {view.tab === 'opps' && <Opportunities scan={scanShown} watch={watch} onOpen={onOpen} lastSession={lastSession} />}
        {view.tab === 'liquidity' && <OrderFlow scan={scanShown} watch={watchDaily} onOpen={onOpen} marketOpen={marketOpen} />}
        {view.tab === 'intraday' && (
          <>
            {intraday.loading && <p className="pb-2 text-[11px] text-gray-500">Loading 5-minute candles… {intraday.done} of {intraday.total}{stocks.length > MAX_INTRADAY_SCAN ? ` (the first ${MAX_INTRADAY_SCAN} of ${stocks.length} stocks)` : ''}</p>}
            <Intraday scan={intradayShown} watch={watch} onOpen={onOpen} market={market} />
          </>
        )}
      </div>

      <p className="px-4 pb-3 text-[10px] text-gray-600">
        Lists follow the selected indices, the filters above and the search. Swing, opportunity and liquidity lists use each stock&apos;s daily history (the first stocks of a large universe); intraday uses 5-minute candles.
        Sorting applies to the simple lists; the deeper tabs have their own ordering. Rule matches, not buy or sell advice.
      </p>
    </div>
  );
}
