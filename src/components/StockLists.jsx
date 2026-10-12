import { useMemo, useState } from 'react';
import { Star, RefreshCw } from 'lucide-react';
import IndexSelect from './IndexSelect';
import { useUniverseSelection, useUniverseStocks } from '../hooks/useUniverse';
import { useQuotesBatch } from '../hooks/useQuotesBatch';
import { useScreenerData, MAX_SCAN } from '../hooks/useScreenerData';
import { useIntradayScan, MAX_INTRADAY_SCAN } from '../hooks/useIntradayScan';
import { useWatchlist } from '../hooks/useWatchlist';
import { WATCH_KINDS, WATCH_LABELS } from '../data/watchStore';
import { moversFromQuotes, orderBlockList, swingSetupList, trendingList, intradayList } from '../data/stockLists';
import { STATUS_META } from '../data/dataStatus';
import { Opportunities, OrderFlow } from './OpportunityViews';

const GREEN = '#00e676';
const RED = '#ff1744';
const px = (n) => (Number.isFinite(n) ? n.toFixed(2) : '—');
const signed = (n, d = 2) => (Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(d)}%` : '—');
const tone = (n) => (!Number.isFinite(n) || n === 0 ? '#9ca3af' : n > 0 ? GREEN : RED);
const vol = (v) => (!Number.isFinite(v) ? '—' : v >= 1e7 ? `${(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(1)} L` : v.toLocaleString('en-IN'));
const istClock = (t) => new Date(t * 1000).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

const VIEWS = [['opps', 'My Opportunities'], ['movers', 'Gainers · Losers · Volume'], ['blocks', 'Order blocks'], ['swing', 'Swing'], ['intraday', 'Intraday'], ['flow', 'Order flow & liquidity']];

function Panel({ title, hint, count, children }) {
  return (
    <section className="rounded-md overflow-hidden" style={{ border: '1px solid rgba(30, 45, 61, 0.5)', backgroundColor: 'rgba(17, 24, 39, 0.4)' }}>
      <div className="flex items-baseline justify-between px-3 py-2" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <h3 className="text-xs font-semibold text-gray-300">{title} {count !== undefined && <span className="text-gray-600 font-normal">({count})</span>}</h3>
        {hint && <span className="text-[10px] text-gray-600">{hint}</span>}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function Empty({ children }) {
  return <p className="px-3 py-4 text-xs text-gray-600">{children}</p>;
}

function Star2({ symbol, price, watch }) {
  const on = watch.symbols.has(symbol);
  return (
    <button onClick={(e) => { e.stopPropagation(); watch.toggle(symbol, price); }} aria-label={on ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`} className="cursor-pointer p-1">
      <Star size={13} fill={on ? '#ffd600' : 'none'} color={on ? '#ffd600' : '#64748b'} />
    </button>
  );
}

function Row({ r, watch, onOpen, target, cols }) {
  return (
    <tr onClick={() => onOpen({ symbol: r.symbol, name: r.name, sector: r.sector ?? '' }, target)} className="cursor-pointer hover:bg-white/5" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}>
      <td className="pl-2 w-8"><Star2 symbol={r.symbol} price={r.price} watch={watch} /></td>
      <td className="px-2 py-1.5" title={r.indices ? r.indices.join(', ') : undefined}><div className="font-medium text-gray-200 text-xs">{r.symbol}</div><div className="text-[10px] text-gray-600 truncate max-w-[10rem]">{r.name}</div>{r.indices && r.indices.length > 0 && <div className="text-[9px] text-gray-700 truncate max-w-[10rem]">{r.indices.slice(0, 2).join(' · ')}{r.indices.length > 2 ? ` +${r.indices.length - 2}` : ''}</div>}</td>
      {cols.map((c, i) => <td key={i} className="px-2 py-1.5 text-right font-mono text-xs" style={{ color: c.color }}>{c.text}</td>)}
    </tr>
  );
}

function Table({ head, children }) {
  return (
    <table className="w-full">
      <thead>
        <tr className="text-[10px] text-gray-600 uppercase tracking-wider">
          <th className="w-8" /><th className="px-2 py-1 font-normal text-left">Stock</th>
          {head.map((h) => <th key={h} className="px-2 py-1 font-normal text-right">{h}</th>)}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function Movers({ stocks, watch, onOpen, active }) {
  const symbols = useMemo(() => stocks.map((s) => s.symbol), [stocks]);
  const { result, failed, loading, reload } = useQuotesBatch(symbols, active);
  const nameOf = useMemo(() => Object.fromEntries(stocks.map((s) => [s.symbol, s])), [stocks]);
  const m = useMemo(() => (result ? moversFromQuotes(result.quotes) : null), [result]);
  const status = STATUS_META[failed && !result ? 'UNAVAILABLE' : failed ? 'STALE' : result?.dataStatus] ?? STATUS_META.UNAVAILABLE;
  const full = (q) => ({ ...q, name: nameOf[q.symbol]?.name ?? q.name, sector: nameOf[q.symbol]?.sector, indices: nameOf[q.symbol]?.indices });

  if (!result && loading) return <Empty>Loading quotes for {symbols.length} stocks…</Empty>;
  if (!result) return <Empty>Quotes could not be loaded. Yahoo Finance may be blocked on this network. <button onClick={reload} className="underline cursor-pointer" style={{ color: '#00e5ff' }}>Retry</button></Empty>;

  const dayCols = (q) => [{ text: px(q.price), color: '#d1d5db' }, { text: signed(q.changePct), color: tone(q.changePct) }];
  return (
    <>
      <div className="flex items-center justify-between px-1 pb-2 text-[11px] text-gray-500">
        <span>{m.counts.ranked} of {m.counts.total} stocks priced · {m.counts.up} up · {m.counts.down} down{result.missing.length ? ` · ${result.missing.length} not found` : ''}</span>
        <span className="flex items-center gap-2"><span style={{ color: status.color }}>{status.label}</span>{result.asOf && <span>as of {new Date(result.asOf).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST</span>}
          <button onClick={reload} aria-label="Reload quotes" className="p-1 rounded text-gray-500 hover:text-gray-200 cursor-pointer"><RefreshCw size={12} className={loading ? 'animate-spin' : ''} /></button></span>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Top gainers" count={m.gainers.length}>
          {m.gainers.length === 0 ? <Empty>No stock is up.</Empty> : <Table head={['Price', 'Day']}>{m.gainers.map((q) => <Row key={q.symbol} r={full(q)} watch={watch} onOpen={onOpen} target="orderblock" cols={dayCols(q)} />)}</Table>}
        </Panel>
        <Panel title="Top losers" count={m.losers.length}>
          {m.losers.length === 0 ? <Empty>No stock is down.</Empty> : <Table head={['Price', 'Day']}>{m.losers.map((q) => <Row key={q.symbol} r={full(q)} watch={watch} onOpen={onOpen} target="orderblock" cols={dayCols(q)} />)}</Table>}
        </Panel>
        <Panel title="Volume leaders" hint="by traded value" count={m.volume.length}>
          {m.volume.length === 0 ? <Empty>No volume data.</Empty> : (
            <Table head={['Volume', 'Rel vol', 'Day']}>
              {m.volume.map((q) => <Row key={q.symbol} r={full(q)} watch={watch} onOpen={onOpen} target="orderblock" cols={[{ text: vol(q.volume), color: '#d1d5db' }, { text: Number.isFinite(q.relVolume) ? `${q.relVolume.toFixed(1)}x` : '—', color: '#d1d5db' }, { text: signed(q.changePct), color: tone(q.changePct) }]} />)}
            </Table>
          )}
        </Panel>
      </div>
      <Panel title="Unusual volume" hint="today's volume vs 3-month average (reads low early in the session)" count={m.relVolume.length}>
        {m.relVolume.length === 0 ? <Empty>No relative volume data.</Empty> : (
          <Table head={['Price', 'Rel vol', 'Day']}>
            {m.relVolume.map((q) => <Row key={q.symbol} r={full(q)} watch={watch} onOpen={onOpen} target="orderblock" cols={[{ text: px(q.price), color: '#d1d5db' }, { text: `${q.relVolume.toFixed(1)}x`, color: '#d1d5db' }, { text: signed(q.changePct), color: tone(q.changePct) }]} />)}
          </Table>
        )}
      </Panel>
    </>
  );
}

function Progress({ loading, done, total, excluded, loadedAt, reload, truncated, limit, universe }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2 text-[11px] text-gray-500" aria-live="polite">
      <span>
        {loading ? `Loading candles… ${done} of ${total}` : `${total - excluded.length} of ${total} stocks scanned`}
        {!loading && excluded.length > 0 && ` · ${excluded.length} not covered (${[...new Set(excluded.map((e) => e.reason))].join(', ')})`}
        {truncated && ` · this index has ${universe} stocks; only the first ${limit} are scanned`}
      </span>
      <span className="flex items-center gap-2">
        {loadedAt && <span>Loaded {new Date(loadedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
        <button onClick={reload} disabled={loading} aria-label="Reload scan" className="p-1 rounded text-gray-500 hover:text-gray-200 cursor-pointer"><RefreshCw size={12} className={loading ? 'animate-spin' : ''} /></button>
      </span>
    </div>
  );
}

function ZoneRow({ r, watch, onOpen }) {
  const z = r.zone;
  return (
    <Row r={r} watch={watch} onOpen={onOpen} target="orderblock" cols={[
      { text: px(r.price), color: '#d1d5db' },
      { text: `${px(z.low)}–${px(z.high)}`, color: '#d1d5db' },
      { text: z.inside ? 'inside' : `${z.distancePct.toFixed(2)}%`, color: z.inside ? '#ffd600' : '#d1d5db' },
      { text: `${z.strength}%${z.tested ? ' · tested' : ''}`, color: '#d1d5db' },
      { text: Number.isFinite(z.ageBars) ? `${z.ageBars}d` : '—', color: '#9ca3af' },
    ]} />
  );
}

function Blocks({ scan, watch, onOpen }) {
  const [distance, setDistance] = useState(2);
  const demand = useMemo(() => orderBlockList(scan.rows, 'demand', distance), [scan.rows, distance]);
  const supply = useMemo(() => orderBlockList(scan.rows, 'supply', distance), [scan.rows, distance]);
  return (
    <>
      <div className="flex items-center gap-3 pb-2 text-[11px] text-gray-500">
        <label className="flex items-center gap-2">Within <select value={distance} onChange={(e) => setDistance(Number(e.target.value))} className="px-2 py-1 rounded text-gray-200 border border-gray-700 outline-none" style={{ backgroundColor: '#0d1117' }}>{[0.5, 1, 2, 3, 5].map((d) => <option key={d} value={d}>{d}%</option>)}</select> of the zone</label>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="Demand zone nearby" hint="price at or just above an unmitigated bullish block" count={demand.length}>
          {demand.length === 0 ? <Empty>No stock is near a valid demand zone.</Empty> : <Table head={['Price', 'Zone', 'Away', 'Strength', 'Age']}>{demand.map((r) => <ZoneRow key={r.symbol} r={r} watch={watch} onOpen={onOpen} />)}</Table>}
        </Panel>
        <Panel title="Supply zone nearby" hint="price at or just below an unmitigated bearish block" count={supply.length}>
          {supply.length === 0 ? <Empty>No stock is near a valid supply zone.</Empty> : <Table head={['Price', 'Zone', 'Away', 'Strength', 'Age']}>{supply.map((r) => <ZoneRow key={r.symbol} r={r} watch={watch} onOpen={onOpen} />)}</Table>}
        </Panel>
      </div>
      <p className="pt-2 text-[10px] text-gray-600">
        Order blocks are the last opposite candle before a strong move, from daily candles, kept only while price has not closed through them. A zone is a level where price reacted before,
        not a prediction. &quot;Tested&quot; means price has returned to it. Strength is this app&apos;s own score (move size relative to ATR). Open a stock to see the zone on its chart.
      </p>
    </>
  );
}

function SwingRow({ r, watch, onOpen }) {
  const s = r.signal;
  const long = s.side === 'BUY';
  return (
    <Row r={r} watch={watch} onOpen={onOpen} target="swing" cols={[
      { text: px(r.price), color: '#d1d5db' },
      { text: `${long ? 'BUY' : 'SHORT'} ${s.strategy}`, color: long ? GREEN : RED },
      { text: px(s.entry), color: '#d1d5db' },
      { text: px(s.stop), color: RED },
      { text: `${px(s.target1)} / ${px(s.target2)}`, color: GREEN },
      { text: s.actionable ? (s.ageBars === 0 ? 'last bar' : `${s.ageBars}d ago`) : (s.label ?? 'not valid'), color: s.actionable ? '#9ca3af' : '#ffd600' },
    ]} />
  );
}

function Swing({ scan, watch, onOpen }) {
  const setups = useMemo(() => swingSetupList(scan.rows), [scan.rows]);
  const past = useMemo(() => swingSetupList(scan.rows, { actionable: false }), [scan.rows]);
  const up = useMemo(() => trendingList(scan.rows, 'up'), [scan.rows]);
  const down = useMemo(() => trendingList(scan.rows, 'down'), [scan.rows]);
  const trendCols = (r) => [{ text: px(r.price), color: '#d1d5db' }, { text: r.adx.toFixed(0), color: '#d1d5db' }, { text: Number.isFinite(r.rsi) ? r.rsi.toFixed(0) : '—', color: '#d1d5db' }, { text: signed(r.vsEma20Pct), color: tone(r.vsEma20Pct) }];
  return (
    <>
      <Panel title="Swing setups" hint="valid setups from the last 3 completed daily bars" count={setups.length}>
        {setups.length === 0 ? <Empty>No stock has a fresh swing setup. That is common: the rules are strict and a long-only setup is rare in a falling market.</Empty> : (
          <Table head={['Price', 'Setup', 'Entry', 'Stop', 'Targets 1 / 2', 'Age']}>{setups.map((r) => <SwingRow key={r.symbol} r={r} watch={watch} onOpen={onOpen} />)}</Table>
        )}
      </Panel>
      {past.length > 0 && (
        <div className="mt-3">
          <Panel title="Recent setups no longer valid" hint="stopped out, past a target, stretched or expired" count={past.length}>
            <Table head={['Price', 'Setup', 'Entry', 'Stop', 'Targets 1 / 2', 'Age']}>{past.map((r) => <SwingRow key={r.symbol} r={r} watch={watch} onOpen={onOpen} />)}</Table>
          </Panel>
        </div>
      )}
      <div className="grid gap-3 xl:grid-cols-2 mt-3">
        <Panel title="Strong uptrends" hint="ADX ≥ 25, price above rising 20/50-day averages" count={up.length}>
          {up.length === 0 ? <Empty>No stock is in a strong, aligned uptrend.</Empty> : <Table head={['Price', 'ADX', 'RSI', 'vs EMA20']}>{up.map((r) => <Row key={r.symbol} r={r} watch={watch} onOpen={onOpen} target="swing" cols={trendCols(r)} />)}</Table>}
        </Panel>
        <Panel title="Strong downtrends" hint="ADX ≥ 25, price below falling 20/50-day averages" count={down.length}>
          {down.length === 0 ? <Empty>No stock is in a strong, aligned downtrend.</Empty> : <Table head={['Price', 'ADX', 'RSI', 'vs EMA20']}>{down.map((r) => <Row key={r.symbol} r={r} watch={watch} onOpen={onOpen} target="swing" cols={trendCols(r)} />)}</Table>}
        </Panel>
      </div>
      <p className="pt-2 text-[10px] text-gray-600">
        Setups use the same rules as the Swing tab (trend pullback or breakout, weekly confirmation, ADX and volume filters, default settings). The stop and targets are ATR-based levels from those rules.
        A rule match is not a forecast: open the stock and read its Performance tab, which shows how the rules would have done after costs.
      </p>
    </>
  );
}

function IntradayRow({ r, watch, onOpen }) {
  const s = r.latest;
  const long = s.side === 'BUY';
  return (
    <Row r={r} watch={watch} onOpen={onOpen} target="intraday" cols={[
      { text: px(r.price), color: '#d1d5db' },
      { text: `${long ? 'BUY' : 'SHORT'} ${s.strategy}`, color: long ? GREEN : RED },
      { text: px(s.entry), color: '#d1d5db' },
      { text: px(s.stop), color: RED },
      { text: `${px(s.target1)} / ${px(s.target2)}`, color: GREEN },
      { text: istClock(s.time), color: '#9ca3af' },
      { text: s.lifecycle?.actionable ? (s.ageBars === 0 ? 'last bar' : `${s.ageBars} bars`) : (s.lifecycle?.label ?? 'not valid'), color: s.lifecycle?.actionable ? '#9ca3af' : '#ffd600' },
    ]} />
  );
}

function Intraday({ scan, watch, onOpen, market }) {
  const marketOpen = market ? market.isOpen : null;
  const stale = scan.scans.some((r) => r.dataStatus === 'STALE');
  // A signal is shown as actionable only while the market is open, its data is not stale and the signal
  // itself is still valid (not stopped, past a target, stretched, expired or from an earlier session).
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
      <Panel title="Actionable now" hint="valid, un-stopped signals on live-session data" count={actionable.length}>
        {actionable.length === 0 ? <Empty>{canAct ? 'No stock has a valid intraday signal right now. Signals need a trend, VWAP, ADX, MACD and volume to agree, so most scans find few or none.' : 'None while the market is closed.'}</Empty> : (
          <Table head={head}>{actionable.map((r) => <IntradayRow key={r.symbol} r={r} watch={watch} onOpen={onOpen} />)}</Table>
        )}
      </Panel>
      <div className="mt-3">
        <Panel title={canAct ? 'Recent signals no longer valid' : 'Last session (review)'} hint={canAct ? 'stopped out, past a target, stretched, expired or from an earlier session' : 'newest 5-minute signal per stock'} count={review.length}>
          {review.length === 0 ? <Empty>None.</Empty> : <Table head={head}>{review.map((r) => <IntradayRow key={r.symbol} r={r} watch={watch} onOpen={onOpen} />)}</Table>}
        </Panel>
      </div>
      <p className="pt-2 text-[10px] text-gray-600">
        Uses the Intraday tab&apos;s rules and saved settings on 5-minute candles. A signal stays valid for the number of bars set in that tab (default 12 = one hour) unless price hits its stop or a target, or runs more than half the risk away from the entry.
        Minute data comes from Yahoo Finance and can be delayed by about 15 minutes, so check the live price before acting. A match is a rule match, not a forecast.
      </p>
    </>
  );
}

// Which stocks to look at next, from any NSE index: movers, order-block zones, swing setups and
// intraday signals. Each list is a rule-based filter; none is advice to trade.
export default function StockLists({ onOpen, market }) {
  const selection = useUniverseSelection();
  const { stocks, labels, failedIds, loading } = useUniverseStocks(selection.universe);
  const failed = !loading && (!stocks || stocks.length === 0);
  const [view, setView] = useState('opps');
  const [starKind, setStarKind] = useState('daily');
  const watch = useWatchlist(starKind);
  const watchDaily = useWatchlist('daily'); // order flow always follows the Daily trading list

  const dailyStocks = useMemo(() => (stocks ? stocks.slice(0, MAX_SCAN) : []), [stocks]);
  const intradayStocks = useMemo(() => (stocks ? stocks.slice(0, MAX_INTRADAY_SCAN) : []), [stocks]);
  const daily = useScreenerData(dailyStocks, ['blocks', 'swing', 'opps', 'flow'].includes(view));
  const intraday = useIntradayScan(intradayStocks, view === 'intraday');

  return (
    <div className="flex-1 min-h-0 overflow-y-auto" style={{ backgroundColor: '#0a0e17' }}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-2" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <IndexSelect selection={selection} labels={labels} count={stocks ? stocks.length : null} />
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase tracking-wider">Star adds to
          <select value={starKind} onChange={(e) => setStarKind(e.target.value)} aria-label="Watchlist for stars" className="px-2 py-1 text-xs rounded text-gray-200 border border-gray-700 outline-none normal-case tracking-normal" style={{ backgroundColor: '#0d1117' }}>
            {WATCH_KINDS.map((k) => <option key={k} value={k}>{WATCH_LABELS[k]}</option>)}
          </select>
        </label>
        {VIEWS.map(([id, text]) => (
          <button key={id} onClick={() => setView(id)} className={`px-3 py-1 text-xs rounded cursor-pointer ${view === id ? 'bg-green-500/15 text-green-400' : 'text-gray-500 hover:text-gray-300'}`}>{text}</button>
        ))}
      </div>

      <div className="px-4 py-3">
        {loading && <Empty>Loading the selected index lists…</Empty>}
        {failedIds.length > 0 && <p className="mb-2 text-[11px]" style={{ color: '#ffd600' }}>These indices could not be loaded and are left out: {failedIds.join(', ')}. NSE&apos;s file may be unreachable from this network.</p>}
        {failed && <Empty>No stocks to show. Pick an index or add custom symbols.</Empty>}
        {stocks && stocks.length > 0 && (
          <>
            {view === 'movers' && <Movers stocks={stocks} watch={watch} onOpen={onOpen} active />}
            {view === 'blocks' && (
              <>
                <Progress {...daily} excluded={daily.excluded} truncated={stocks.length > MAX_SCAN} limit={MAX_SCAN} universe={stocks.length} reload={daily.reload} />
                <Blocks scan={daily} watch={watch} onOpen={onOpen} />
              </>
            )}
            {view === 'swing' && (
              <>
                <Progress {...daily} excluded={daily.excluded} truncated={stocks.length > MAX_SCAN} limit={MAX_SCAN} universe={stocks.length} reload={daily.reload} />
                <Swing scan={daily} watch={watch} onOpen={onOpen} />
              </>
            )}
            {view === 'opps' && (
              <>
                <Progress {...daily} excluded={daily.excluded} truncated={stocks.length > MAX_SCAN} limit={MAX_SCAN} universe={stocks.length} reload={daily.reload} />
                <Opportunities scan={daily} watch={watch} onOpen={onOpen} lastSession={market?.lastSession ?? null} />
              </>
            )}
            {view === 'flow' && (
              <>
                <Progress {...daily} excluded={daily.excluded} truncated={stocks.length > MAX_SCAN} limit={MAX_SCAN} universe={stocks.length} reload={daily.reload} />
                <OrderFlow scan={daily} watch={watchDaily} onOpen={onOpen} marketOpen={market ? market.isOpen : null} />
              </>
            )}
            {view === 'intraday' && (
              <>
                <Progress {...intraday} excluded={intraday.excluded} truncated={stocks.length > MAX_INTRADAY_SCAN} limit={MAX_INTRADAY_SCAN} universe={stocks.length} reload={intraday.reload} />
                <Intraday scan={intraday} watch={watch} onOpen={onOpen} market={market} />
              </>
            )}
          </>
        )}
        <p className="pt-4 text-[10px] text-gray-600">
          Index membership is NSE Indices&apos; official list (refreshed daily); a stock in several selected indices appears once. Sensex and other BSE indices are not available because BSE blocks automated access.
          Star a stock to add it to your Daily trading or Swing watchlist (chosen at the top). These lists describe rule matches on past data and are not buy or sell recommendations.
        </p>
      </div>
    </div>
  );
}
