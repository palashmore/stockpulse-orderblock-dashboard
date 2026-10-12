import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { fetchBroker } from '../services/api';
import { loadSettings } from '../data/settings';

const GREEN = '#00e676';
const RED = '#ff1744';
const inr = (n) => (Number.isFinite(n) ? `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—');
const px = (n) => (Number.isFinite(n) ? n.toFixed(2) : '—');
const tone = (n) => (!Number.isFinite(n) || n === 0 ? '#9ca3af' : n > 0 ? GREEN : RED);
const today = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() + 5.5 * 3600 * 1000 - n * 86400000).toISOString().slice(0, 10);

const STATUS_TONE = {
  Executed: GREEN, Ordered: '#00e5ff', Queued: '#00e5ff', Requested: '#00e5ff', 'Partially Executed': '#ffd600',
  Rejected: RED, Cancelled: '#9ca3af', Expired: '#9ca3af', Freezed: '#ff9100',
};

function Table({ head, children, empty }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] text-gray-600 uppercase tracking-wider">
            {head.map(([label, align], i) => <th key={i} className={`px-3 py-1.5 font-normal text-${align ?? 'left'}`}>{label}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

const td = 'px-3 py-1.5';

function Positions({ data }) {
  const rows = data.positions;
  const open = rows.filter((p) => p.quantity > 0);
  return (
    <>
      <Table
        head={[['Instrument'], ['Product'], ['Side'], ['Qty', 'right'], ['Avg price', 'right'], ['LTP', 'right'], ['Unrealised P&L (calculated)', 'right'], ['Value (calculated)', 'right']]}
        empty={open.length === 0 && <p className="px-4 py-6 text-xs text-gray-500">No open positions. ICICI reported none for your account.</p>}
      >
        {open.map((p, i) => (
          <tr key={i} style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}>
            <td className={td}><div className="font-medium text-gray-200">{p.instrument}</div><div className="text-[10px] text-gray-600">{p.exchange} · {p.segment ?? '—'}</div></td>
            <td className={td}>{p.product ?? '—'}</td>
            <td className={td} style={{ color: p.action === 'BUY' ? GREEN : p.action === 'SELL' ? RED : '#9ca3af' }}>{p.action ?? '—'}</td>
            <td className={`${td} text-right font-mono`}>{p.quantity}</td>
            <td className={`${td} text-right font-mono`}>{px(p.averagePrice)}</td>
            <td className={`${td} text-right font-mono`}>{px(p.ltp)}</td>
            <td className={`${td} text-right font-mono`} style={{ color: tone(p.derived.unrealisedPnl) }}>{p.derived.unrealisedPnl === null ? 'not calculable' : inr(p.derived.unrealisedPnl)}</td>
            <td className={`${td} text-right font-mono text-gray-300`}>{inr(p.derived.marketValue)}</td>
          </tr>
        ))}
      </Table>
      <p className="px-4 py-3 text-[10px] text-gray-600">
        Quantity, average price and last price are reported by ICICI Direct. Unrealised P&amp;L and value are calculated here from those figures and only when the side is clearly Buy or Sell; they are not broker figures.
        Delivery holdings are on the Portfolio screen.
      </p>
    </>
  );
}

function Orders({ data }) {
  return (
    <>
      <div className="flex flex-wrap gap-3 px-4 py-2 text-[11px] text-gray-500">
        <span>{data.summary.total} orders</span>
        {Object.entries(data.summary.byStatus).map(([s, n]) => <span key={s} style={{ color: STATUS_TONE[s] ?? '#9ca3af' }}>{s}: {n}</span>)}
      </div>
      <Table
        head={[['Time'], ['Instrument'], ['Side'], ['Type'], ['Qty', 'right'], ['Filled*', 'right'], ['Pending', 'right'], ['Price', 'right'], ['Avg price', 'right'], ['Status'], ['Order ID']]}
        empty={data.orders.length === 0 && <p className="px-4 py-6 text-xs text-gray-500">No orders in this period.</p>}
      >
        {data.orders.map((o, i) => (
          <tr key={`${o.orderId}-${i}`} style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }} title={o.remark ?? undefined}>
            <td className={`${td} font-mono text-gray-400`}>{o.timestamp ?? '—'}</td>
            <td className={td}><div className="font-medium text-gray-200">{o.instrument}</div><div className="text-[10px] text-gray-600">{o.exchange} · {o.product ?? '—'}</div></td>
            <td className={td} style={{ color: o.action === 'BUY' ? GREEN : o.action === 'SELL' ? RED : '#9ca3af' }}>{o.action ?? '—'}</td>
            <td className={td}>{o.orderType ?? '—'}</td>
            <td className={`${td} text-right font-mono`}>{o.quantity ?? '—'}</td>
            <td className={`${td} text-right font-mono`}>{o.derived.filledQuantity ?? '—'}</td>
            <td className={`${td} text-right font-mono`}>{o.pendingQuantity ?? '—'}</td>
            <td className={`${td} text-right font-mono`}>{px(o.price)}</td>
            <td className={`${td} text-right font-mono`}>{px(o.averagePrice)}</td>
            <td className={td} style={{ color: STATUS_TONE[o.status] ?? '#d1d5db' }}>{o.status ?? '—'}{o.remark ? ` · ${o.remark}` : ''}</td>
            <td className={`${td} font-mono text-[10px] text-gray-500`}>{o.orderId ?? '—'}</td>
          </tr>
        ))}
      </Table>
      <p className="px-4 py-3 text-[10px] text-gray-600">
        These are YOUR orders as reported by ICICI Direct, not exchange market depth. *Filled quantity is not sent by ICICI; it is worked out as quantity minus pending minus cancelled.
        Placing, changing and cancelling orders is not available in StockPulse.
      </p>
    </>
  );
}

function Trades({ data }) {
  const [open, setOpen] = useState(null);
  const [detail, setDetail] = useState(null);

  const toggle = async (t) => {
    if (open === t.orderId) { setOpen(null); return; }
    setOpen(t.orderId);
    setDetail('loading');
    const r = await fetchBroker(`/trades/detail?orderId=${encodeURIComponent(t.orderId)}&exchange=${t.exchange === 'NFO' ? 'NFO' : 'NSE'}`);
    setDetail(r.error ? { error: r.error } : r);
  };

  return (
    <>
      <Table
        head={[['Date'], ['Instrument'], ['Side'], ['Qty', 'right'], ['Avg price', 'right'], ['Brokerage', 'right'], ['Taxes', 'right'], ['Order ID']]}
        empty={data.trades.length === 0 && <p className="px-4 py-6 text-xs text-gray-500">No trades in this period.</p>}
      >
        {data.trades.flatMap((t, i) => [
          <tr key={`${t.orderId}-${i}`} onClick={() => t.orderId && toggle(t)} className="cursor-pointer hover:bg-white/5" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}>
            <td className={`${td} font-mono text-gray-400`}>{t.tradeDate ?? '—'}</td>
            <td className={td}><div className="font-medium text-gray-200">{t.instrument}</div><div className="text-[10px] text-gray-600">{t.exchange} · {t.product ?? '—'}</div></td>
            <td className={td} style={{ color: t.action === 'BUY' ? GREEN : t.action === 'SELL' ? RED : '#9ca3af' }}>{t.action ?? '—'}</td>
            <td className={`${td} text-right font-mono`}>{t.quantity ?? '—'}</td>
            <td className={`${td} text-right font-mono`}>{px(t.averageCost)}</td>
            <td className={`${td} text-right font-mono`}>{px(t.brokerage)}</td>
            <td className={`${td} text-right font-mono`}>{px(t.taxes)}</td>
            <td className={`${td} font-mono text-[10px] text-gray-500`}>{t.orderId ?? '—'}</td>
          </tr>,
          open === t.orderId && (
            <tr key={`${t.orderId}-d`}><td colSpan={8} className="px-6 py-2 text-[11px] text-gray-400" style={{ backgroundColor: 'rgba(17, 24, 39, 0.6)' }}>
              {detail === 'loading' && 'Loading fills…'}
              {detail?.error && <span style={{ color: RED }}>{detail.error}</span>}
              {detail?.fills && (detail.fills.length === 0 ? 'No fill detail returned.' : detail.fills.map((f, k) => (
                <div key={k} className="font-mono">Trade {f.tradeId ?? '—'} · exchange trade {f.exchangeTradeId ?? '—'} · {f.executedQuantity ?? '—'} @ {px(f.executionPrice)} · {f.exchangeTradeTime ?? '—'} · cost {inr(f.totalTransactionCost)}</div>
              )))}
            </td></tr>
          ),
        ])}
      </Table>

      <h3 className="px-4 pt-3 pb-1 text-[11px] text-gray-400 uppercase tracking-wider">Realised profit on same-day round trips (calculated here)</h3>
      <Table
        head={[['Day'], ['Instrument'], ['Matched qty', 'right'], ['Avg buy', 'right'], ['Avg sell', 'right'], ['Gross', 'right'], ['Charges', 'right'], ['Net', 'right'], ['Left over']]}
        empty={data.realised.rows.length === 0 && <p className="px-4 py-3 text-xs text-gray-500">No instrument was both bought and sold on the same day in this period.</p>}
      >
        {data.realised.rows.map((r, i) => (
          <tr key={i} style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}>
            <td className={`${td} font-mono text-gray-400`}>{r.day}</td>
            <td className={`${td} font-medium text-gray-200`}>{r.instrument}</td>
            <td className={`${td} text-right font-mono`}>{r.matchedQuantity}</td>
            <td className={`${td} text-right font-mono`}>{px(r.averageBuy)}</td>
            <td className={`${td} text-right font-mono`}>{px(r.averageSell)}</td>
            <td className={`${td} text-right font-mono`} style={{ color: tone(r.gross) }}>{inr(r.gross)}</td>
            <td className={`${td} text-right font-mono`}>{inr(r.charges)}</td>
            <td className={`${td} text-right font-mono`} style={{ color: tone(r.net) }}>{inr(r.net)}</td>
            <td className={`${td} text-[10px] text-gray-500`}>{r.unmatchedBuy ? `${r.unmatchedBuy} bought` : ''}{r.unmatchedSell ? `${r.unmatchedSell} sold` : ''}</td>
          </tr>
        ))}
      </Table>
      {data.realised.rows.length > 0 && <p className="px-4 pt-1 text-xs font-mono" style={{ color: tone(data.realised.totals.net) }}>Total net after charges: {inr(data.realised.totals.net)}</p>}
      <p className="px-4 py-3 text-[10px] text-gray-600">
        Trades, prices, brokerage and taxes are from ICICI Direct&apos;s trade book. The round-trip profit is calculated here by matching same-day buys and sells at their average prices and sharing the charges.
        A quantity bought or sold without an opposite trade that day is not valued, because its other leg is outside this view. Click a trade for its exchange fills.
      </p>
    </>
  );
}

function Line({ label, value, color }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}>
      <span className="text-[11px] text-gray-500">{label}</span>
      <span className="text-xs font-mono text-right" style={{ color: color || '#d1d5db' }}>{value}</span>
    </div>
  );
}

function FundsMargin({ data }) {
  const [hidden, setHidden] = useState(() => loadSettings(window.localStorage).hideAmounts);
  const m = (v) => (hidden ? '••••••' : inr(v));
  const f = data.funds;
  const card = { border: '1px solid rgba(30, 45, 61, 0.5)', backgroundColor: 'rgba(17, 24, 39, 0.5)' };

  return (
    <div className="px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-gray-500">All figures below are as reported by ICICI Direct unless marked calculated.</p>
        <button onClick={() => setHidden((h) => !h)} className="px-2 py-1 text-xs rounded bg-white/5 text-gray-300 hover:bg-white/10 cursor-pointer">{hidden ? 'Show amounts' : 'Hide amounts'}</button>
      </div>

      {data.fundsError && <p className="text-xs" style={{ color: RED }}>Funds could not be read: {data.fundsError}</p>}
      {f && (
        <section className="rounded-md px-4 py-3" style={card}>
          <h3 className="text-xs font-semibold text-gray-300 mb-1">Funds{f.bankAccountLast4 ? ` · bank a/c ••${f.bankAccountLast4}` : ''}</h3>
          <Line label="Total bank balance" value={m(f.totalBankBalance)} />
          <Line label="Unallocated balance" value={m(f.unallocatedBalance)} color={GREEN} />
          <Line label="Blocked by trades (all segments)" value={m(f.blockedByTrade.total)} />
          <Table head={[['Segment'], ['Allocated', 'right'], ['Blocked by trades', 'right']]}>
            {[['Equity', 'equity'], ['Futures & options', 'fno'], ['Commodity', 'commodity'], ['Currency', 'currency']].map(([label, k]) => (
              <tr key={k} style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}>
                <td className={td}>{label}</td>
                <td className={`${td} text-right font-mono`}>{m(f.allocated[k])}</td>
                <td className={`${td} text-right font-mono`}>{m(f.blockedByTrade[k])}</td>
              </tr>
            ))}
          </Table>
          <Line label="Sum of the four allocations (calculated here)" value={f.derived.totalAllocated === null ? 'not calculable' : m(f.derived.totalAllocated)} />
        </section>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {data.margins.map((mg, i) => (
          <section key={i} className="rounded-md px-4 py-3" style={card}>
            <h3 className="text-xs font-semibold text-gray-300 mb-1">Margin · {i === 0 ? 'NSE (cash)' : 'NFO (futures & options)'}</h3>
            {mg ? (
              <>
                <Line label="Cash limit" value={m(mg.cashLimit)} />
                <Line label="Amount allocated" value={m(mg.amountAllocated)} />
                <Line label="Blocked by trades" value={m(mg.blockByTrade)} />
                <Line label="ICICI Securities margin" value={m(mg.isecMargin)} />
                {mg.limitListCount !== null && <Line label="Limit entries returned" value={mg.limitListCount} />}
              </>
            ) : <p className="text-xs text-gray-500">Not available{data.marginErrors[i] ? `: ${data.marginErrors[i]}` : '.'}</p>}
          </section>
        ))}
      </div>

      <p className="text-[10px] text-gray-600">
        &quot;Available to trade&quot; is deliberately not shown as one number: ICICI does not document how these fields combine into a single buying power, and guessing could mislead you.
        Check the margin screen in your ICICI Direct app for the figure it will use on an order.
      </p>
    </div>
  );
}

function Depth({ symbol }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch(`http://localhost:3001/api/depth/${encodeURIComponent(symbol)}`, { cache: 'no-store' });
        const j = await r.json();
        if (!cancelled) setD(j);
      } catch {
        if (!cancelled) setD({ available: false, reason: 'Could not reach the server' });
      }
    };
    poll();
    const timer = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [symbol]);

  return (
    <div className="px-4 py-3">
      <h3 className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">Market depth · {symbol} (exchange feed, not your orders)</h3>
      {!d && <p className="text-xs text-gray-600">Checking…</p>}
      {d && !d.available && <p className="text-xs text-gray-500">Depth is not available: {d.reason}.</p>}
      {d?.available && (
        <>
          {d.summary ? <p className="text-xs text-gray-300 mb-1 font-mono">Best bid {px(d.summary.bestBid)} · best ask {px(d.summary.bestAsk)} · spread {px(d.summary.spread)} ({d.summary.spreadPct.toFixed(3)}%)</p> : <p className="text-xs text-gray-500">The feed sent depth without a usable best bid and ask.</p>}
          <Table head={[['Bid qty', 'right'], ['Orders', 'right'], ['Bid', 'right'], ['Ask', 'right'], ['Orders', 'right'], ['Ask qty', 'right']]}>
            {d.levels.map((l, i) => (
              <tr key={i} style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}>
                <td className={`${td} text-right font-mono`}>{l.bidQty ?? '—'}</td><td className={`${td} text-right font-mono text-gray-500`}>{l.bidOrders ?? '—'}</td>
                <td className={`${td} text-right font-mono`} style={{ color: GREEN }}>{px(l.bidPrice)}</td><td className={`${td} text-right font-mono`} style={{ color: RED }}>{px(l.askPrice)}</td>
                <td className={`${td} text-right font-mono text-gray-500`}>{l.askOrders ?? '—'}</td><td className={`${td} text-right font-mono`}>{l.askQty ?? '—'}</td>
              </tr>
            ))}
          </Table>
          <p className="text-[10px] text-gray-600 mt-1">Received {new Date(d.receivedAt).toLocaleTimeString('en-IN')} · {d.source}</p>
        </>
      )}
    </div>
  );
}

const TABS = [['positions', 'Positions'], ['orders', 'Order Book'], ['trades', 'Trade Book'], ['funds', 'Funds & Margin']];
const UNDATED = new Set(['positions', 'funds']);

// Read-only views of your ICICI Direct account. Nothing here can place, change or cancel an order.
export default function BrokerBooks({ initialTab = 'positions', selectedStock }) {
  const [tab, setTab] = useState(initialTab);
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  // Each result remembers which tab and dates it belongs to, so a tab never renders another tab's data
  const [state, setState] = useState({ key: '', status: 'idle', data: null, error: '' });
  const key = UNDATED.has(tab) ? tab : `${tab}|${from}|${to}`;
  const pathFor = () => (UNDATED.has(tab) ? `/${tab}` : `/${tab}?from=${from}&to=${to}`);

  const load = useCallback(async () => {
    setState({ key, status: 'loading', data: null, error: '' });
    const r = await fetchBroker(pathFor());
    setState(r.error ? { key, status: 'error', data: null, error: r.error } : { key, status: 'ready', data: r, error: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    let cancelled = false;
    fetchBroker(pathFor()).then((r) => {
      if (cancelled) return;
      setState(r.error ? { key, status: 'error', data: null, error: r.error } : { key, status: 'ready', data: r, error: '' });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = state.key === key;
  const status = current ? state.status : 'loading';
  const data = current ? state.data : null;
  const error = current ? state.error : '';
  const range = (a, b) => { setFrom(a); setTo(b); };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto" style={{ backgroundColor: '#0a0e17' }}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-2" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mr-2">ICICI Direct · read-only</h2>
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`px-3 py-1 text-xs rounded cursor-pointer ${tab === id ? 'bg-green-500/15 text-green-400' : 'text-gray-500 hover:text-gray-300'}`}>{label}</button>
        ))}
        <div className="flex-1" />
        {!UNDATED.has(tab) && (
          <>
            <button onClick={() => range(today(), today())} className="px-2 py-1 text-[11px] rounded bg-white/5 text-gray-400 hover:text-gray-200 cursor-pointer">Today</button>
            <button onClick={() => range(daysAgo(4), today())} className="px-2 py-1 text-[11px] rounded bg-white/5 text-gray-400 hover:text-gray-200 cursor-pointer">5 days</button>
            <button onClick={() => range(daysAgo(9), today())} className="px-2 py-1 text-[11px] rounded bg-white/5 text-gray-400 hover:text-gray-200 cursor-pointer">10 days</button>
            <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="From date" className="px-2 py-1 text-xs rounded bg-transparent text-gray-300 border border-gray-700 outline-none" />
            <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} aria-label="To date" className="px-2 py-1 text-xs rounded bg-transparent text-gray-300 border border-gray-700 outline-none" />
          </>
        )}
        <button onClick={load} disabled={status === 'loading'} aria-label="Refresh" className="p-1.5 rounded text-gray-500 hover:text-gray-200 hover:bg-white/5 cursor-pointer"><RefreshCw size={13} className={status === 'loading' ? 'animate-spin' : ''} /></button>
      </div>

      {status === 'loading' && !data && <p className="px-4 py-6 text-xs text-gray-500">Loading from ICICI Direct…</p>}
      {status === 'error' && (
        <div className="px-4 py-6 text-xs text-gray-400 space-y-2">
          <p style={{ color: RED }}>{error}</p>
          <p>This needs the ICICI Direct sign-in and works only on the machine running the server. <a href="?tab=settings" className="underline" style={{ color: '#00e5ff' }}>Open Settings</a>. ICICI allows a window of at most 10 days.</p>
        </div>
      )}

      {data && tab === 'positions' && <Positions data={data} />}
      {data && tab === 'orders' && <Orders data={data} />}
      {data && tab === 'trades' && <Trades data={data} />}
      {data && tab === 'funds' && <FundsMargin data={data} />}
      {data && <p className="px-4 pb-2 text-[10px] text-gray-600">{data.provider} · fetched {new Date(data.fetchedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · refreshed on demand</p>}

      {tab === 'orders' && <div style={{ borderTop: '1px solid rgba(30, 45, 61, 0.3)' }}><Depth symbol={selectedStock.symbol} /></div>}
    </div>
  );
}
