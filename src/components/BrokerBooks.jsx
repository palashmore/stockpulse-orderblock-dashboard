import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, BookOpen, Clock, Activity, DollarSign, ChevronDown, ChevronRight, Layers } from 'lucide-react';
import { fetchBroker, API_BASE } from '../services/api';
import { loadSettings } from '../data/settings';

const GREEN = '#00e676';
const RED = '#ff1744';
const inr = (n) => (Number.isFinite(n) ? `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—');
const px = (n) => (Number.isFinite(n) ? n.toFixed(2) : '—');
const tone = (n) => (!Number.isFinite(n) || n === 0 ? '#9ca3af' : n > 0 ? GREEN : RED);
const today = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() + 5.5 * 3600 * 1000 - n * 86400000).toISOString().slice(0, 10);

const STATUS_TONE = {
  Executed: GREEN,
  Ordered: '#00e5ff',
  Queued: '#00e5ff',
  Requested: '#00e5ff',
  'Partially Executed': '#ffd600',
  Rejected: RED,
  Cancelled: '#9ca3af',
  Expired: '#9ca3af',
  Freezed: '#ff9100',
};

function Table({ head, children, empty }) {
  return (
    <div className="overflow-x-auto min-h-0 flex-1">
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10" style={{ backgroundColor: '#0d1117' }}>
          <tr className="text-[10px] text-gray-500 uppercase tracking-wider" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.5)' }}>
            {head.map(([label, align], i) => (
              <th key={i} className={`px-3 py-2 font-medium text-${align ?? 'left'}`}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

const td = 'px-3 py-2';

function Positions({ data }) {
  const rows = data.positions;
  const open = rows.filter((p) => p.quantity > 0);
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Table
        head={[
          ['Instrument'],
          ['Product'],
          ['Side'],
          ['Qty', 'right'],
          ['Avg Price', 'right'],
          ['LTP (₹)', 'right'],
          ['Unrealised P&L', 'right'],
          ['Market Value', 'right'],
        ]}
        empty={
          open.length === 0 && (
            <div className="p-8 text-center text-xs text-gray-500">
              No open positions reported by ICICI Direct for your account.
            </div>
          )
        }
      >
        {open.map((p, i) => (
          <tr
            key={i}
            className="hover:bg-white/5 transition-colors"
            style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}
          >
            <td className={td}>
              <div className="font-bold text-gray-200">{p.instrument}</div>
              <div className="text-[10px] text-gray-500">
                {p.exchange} · {p.segment ?? '—'}
              </div>
            </td>
            <td className={td}>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/5 text-gray-300">
                {p.product ?? '—'}
              </span>
            </td>
            <td className={td}>
              <span
                className="font-bold text-[11px]"
                style={{ color: p.action === 'BUY' ? GREEN : p.action === 'SELL' ? RED : '#9ca3af' }}
              >
                {p.action ?? '—'}
              </span>
            </td>
            <td className={`${td} text-right font-mono font-medium text-gray-200`}>{p.quantity}</td>
            <td className={`${td} text-right font-mono text-gray-300`}>{px(p.averagePrice)}</td>
            <td className={`${td} text-right font-mono font-semibold text-gray-200`}>{px(p.ltp)}</td>
            <td
              className={`${td} text-right font-mono font-bold`}
              style={{ color: tone(p.derived.unrealisedPnl) }}
            >
              {p.derived.unrealisedPnl === null ? '—' : inr(p.derived.unrealisedPnl)}
            </td>
            <td className={`${td} text-right font-mono font-medium text-gray-300`}>
              {inr(p.derived.marketValue)}
            </td>
          </tr>
        ))}
      </Table>
      <div className="px-4 py-2 text-[10px] text-gray-600 flex-shrink-0" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.3)' }}>
        Position quantities and prices reported live by ICICI Direct. Delivery holdings are shown on the Portfolio tab.
      </div>
    </div>
  );
}

function Orders({ data }) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div
        className="flex flex-wrap items-center gap-2.5 px-4 py-2 flex-shrink-0"
        style={{ backgroundColor: '#111827', borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}
      >
        <span className="text-xs font-bold text-gray-200 mr-1">{data.summary.total} Orders</span>
        {Object.entries(data.summary.byStatus).map(([s, n]) => (
          <span
            key={s}
            className="text-[10px] px-2 py-0.5 rounded font-semibold uppercase"
            style={{
              color: STATUS_TONE[s] ?? '#9ca3af',
              backgroundColor: `${STATUS_TONE[s] ?? '#9ca3af'}1f`,
            }}
          >
            {s}: {n}
          </span>
        ))}
      </div>
      <Table
        head={[
          ['Timestamp'],
          ['Instrument'],
          ['Side'],
          ['Type'],
          ['Qty', 'right'],
          ['Filled*', 'right'],
          ['Pending', 'right'],
          ['Limit Price', 'right'],
          ['Avg Price', 'right'],
          ['Order Status'],
          ['Order ID', 'right'],
        ]}
        empty={
          data.orders.length === 0 && (
            <div className="p-8 text-center text-xs text-gray-500">No orders recorded in this date window.</div>
          )
        }
      >
        {data.orders.map((o, i) => (
          <tr
            key={`${o.orderId}-${i}`}
            className="hover:bg-white/5 transition-colors"
            style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}
            title={o.remark ?? undefined}
          >
            <td className={`${td} font-mono text-[11px] text-gray-400`}>{o.timestamp ?? '—'}</td>
            <td className={td}>
              <div className="font-bold text-gray-200">{o.instrument}</div>
              <div className="text-[10px] text-gray-500">
                {o.exchange} · {o.product ?? '—'}
              </div>
            </td>
            <td className={td}>
              <span
                className="font-bold text-[11px]"
                style={{ color: o.action === 'BUY' ? GREEN : o.action === 'SELL' ? RED : '#9ca3af' }}
              >
                {o.action ?? '—'}
              </span>
            </td>
            <td className={`${td} text-gray-300 font-mono text-[11px]`}>{o.orderType ?? '—'}</td>
            <td className={`${td} text-right font-mono font-medium text-gray-200`}>{o.quantity ?? '—'}</td>
            <td className={`${td} text-right font-mono text-emerald-400 font-medium`}>{o.derived.filledQuantity ?? '—'}</td>
            <td className={`${td} text-right font-mono text-amber-400 font-medium`}>{o.pendingQuantity ?? '—'}</td>
            <td className={`${td} text-right font-mono text-gray-300`}>{px(o.price)}</td>
            <td className={`${td} text-right font-mono text-gray-300`}>{px(o.averagePrice)}</td>
            <td className={td}>
              <span
                className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase"
                style={{
                  color: STATUS_TONE[o.status] ?? '#d1d5db',
                  backgroundColor: `${STATUS_TONE[o.status] ?? '#d1d5db'}1f`,
                }}
              >
                {o.status ?? '—'}
              </span>
              {o.remark && <span className="text-[10px] text-gray-500 ml-1">· {o.remark}</span>}
            </td>
            <td className={`${td} text-right font-mono text-[10px] text-gray-500`}>{o.orderId ?? '—'}</td>
          </tr>
        ))}
      </Table>
      <div className="px-4 py-2 text-[10px] text-gray-600 flex-shrink-0" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.3)' }}>
        *Filled quantity calculated from gross order minus pending/cancelled. Order book is purely read-only.
      </div>
    </div>
  );
}

function Trades({ data }) {
  const [open, setOpen] = useState(null);
  const [detail, setDetail] = useState(null);

  const toggle = async (t) => {
    if (open === t.orderId) {
      setOpen(null);
      return;
    }
    setOpen(t.orderId);
    setDetail('loading');
    const r = await fetchBroker(
      `/trades/detail?orderId=${encodeURIComponent(t.orderId)}&exchange=${t.exchange === 'NFO' ? 'NFO' : 'NSE'}`
    );
    setDetail(r.error ? { error: r.error } : r);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Table
        head={[
          ['Trade Date'],
          ['Instrument'],
          ['Side'],
          ['Qty', 'right'],
          ['Avg Cost', 'right'],
          ['Brokerage', 'right'],
          ['Taxes', 'right'],
          ['Order ID', 'right'],
        ]}
        empty={
          data.trades.length === 0 && (
            <div className="p-8 text-center text-xs text-gray-500">No executed trades in this date range.</div>
          )
        }
      >
        {data.trades.flatMap((t, i) => [
          <tr
            key={`${t.orderId}-${i}`}
            onClick={() => t.orderId && toggle(t)}
            className="cursor-pointer hover:bg-white/5 transition-colors"
            style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}
          >
            <td className={`${td} font-mono text-gray-400`}>{t.tradeDate ?? '—'}</td>
            <td className={td}>
              <div className="font-bold text-gray-200">{t.instrument}</div>
              <div className="text-[10px] text-gray-500">
                {t.exchange} · {t.product ?? '—'}
              </div>
            </td>
            <td className={td}>
              <span
                className="font-bold text-[11px]"
                style={{ color: t.action === 'BUY' ? GREEN : t.action === 'SELL' ? RED : '#9ca3af' }}
              >
                {t.action ?? '—'}
              </span>
            </td>
            <td className={`${td} text-right font-mono font-medium text-gray-200`}>{t.quantity ?? '—'}</td>
            <td className={`${td} text-right font-mono text-gray-300`}>{px(t.averageCost)}</td>
            <td className={`${td} text-right font-mono text-gray-400`}>{px(t.brokerage)}</td>
            <td className={`${td} text-right font-mono text-gray-400`}>{px(t.taxes)}</td>
            <td className={`${td} text-right font-mono text-[10px] text-gray-500`}>{t.orderId ?? '—'}</td>
          </tr>,
          open === t.orderId && (
            <tr key={`${t.orderId}-d`}>
              <td colSpan={8} className="px-6 py-2.5 text-xs text-gray-300" style={{ backgroundColor: '#111827' }}>
                {detail === 'loading' && <div className="text-gray-500">Loading exchange trade fills…</div>}
                {detail?.error && <span style={{ color: RED }}>{detail.error}</span>}
                {detail?.fills &&
                  (detail.fills.length === 0 ? (
                    <div className="text-gray-500">No fill details returned by broker.</div>
                  ) : (
                    detail.fills.map((f, k) => (
                      <div key={k} className="font-mono text-[11px] py-0.5 text-gray-400">
                        Fill {f.tradeId ?? '—'} · Exchange ID {f.exchangeTradeId ?? '—'} · {f.executedQuantity} @ ₹
                        {px(f.executionPrice)} · {f.exchangeTradeTime} · Net: {inr(f.totalTransactionCost)}
                      </div>
                    ))
                  ))}
              </td>
            </tr>
          ),
        ])}
      </Table>

      {/* Realised Same-Day Round Trip P&L Section */}
      <div className="px-4 py-2 flex items-center justify-between flex-shrink-0" style={{ backgroundColor: '#111827', borderTop: '1px solid rgba(30, 45, 61, 0.4)' }}>
        <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
          Realised Same-Day Round-Trip P&L
        </h3>
        {data.realised.rows.length > 0 && (
          <span className="font-mono font-bold text-xs" style={{ color: tone(data.realised.totals.net) }}>
            Net Realised: {inr(data.realised.totals.net)}
          </span>
        )}
      </div>

      <Table
        head={[
          ['Date'],
          ['Instrument'],
          ['Matched Qty', 'right'],
          ['Avg Buy', 'right'],
          ['Avg Sell', 'right'],
          ['Gross P&L', 'right'],
          ['Charges', 'right'],
          ['Net Realised', 'right'],
          ['Open Legs'],
        ]}
        empty={
          data.realised.rows.length === 0 && (
            <div className="p-4 text-center text-xs text-gray-500">
              No instrument had both Buy and Sell legs executed on the same trading day.
            </div>
          )
        }
      >
        {data.realised.rows.map((r, i) => (
          <tr key={i} style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}>
            <td className={`${td} font-mono text-gray-400`}>{r.day}</td>
            <td className={`${td} font-bold text-gray-200`}>{r.instrument}</td>
            <td className={`${td} text-right font-mono font-medium text-gray-200`}>{r.matchedQuantity}</td>
            <td className={`${td} text-right font-mono text-gray-300`}>{px(r.averageBuy)}</td>
            <td className={`${td} text-right font-mono text-gray-300`}>{px(r.averageSell)}</td>
            <td className={`${td} text-right font-mono font-semibold`} style={{ color: tone(r.gross) }}>
              {inr(r.gross)}
            </td>
            <td className={`${td} text-right font-mono text-gray-400`}>{inr(r.charges)}</td>
            <td className={`${td} text-right font-mono font-bold`} style={{ color: tone(r.net) }}>
              {inr(r.net)}
            </td>
            <td className={`${td} text-[10px] text-gray-500`}>
              {r.unmatchedBuy ? `${r.unmatchedBuy} buy leg` : ''}
              {r.unmatchedSell ? `${r.unmatchedSell} sell leg` : ''}
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function Line({ label, value, color }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}>
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs font-mono font-semibold text-right" style={{ color: color || '#e2e8f0' }}>
        {value}
      </span>
    </div>
  );
}

function FundsMargin({ data }) {
  const [hidden, setHidden] = useState(() => loadSettings(window.localStorage).hideAmounts);
  const m = (v) => (hidden ? '••••••' : inr(v));
  const f = data.funds;

  return (
    <div className="px-4 py-3 space-y-3 flex-1 overflow-y-auto">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400 font-medium">Account Funds & Capital Margin Allocations</p>
        <button
          onClick={() => setHidden((h) => !h)}
          className="px-2.5 py-1 text-xs rounded bg-white/5 text-gray-300 hover:bg-white/10 cursor-pointer font-medium"
        >
          {hidden ? 'Show Amounts' : 'Hide Amounts'}
        </button>
      </div>

      {data.fundsError && <p className="text-xs" style={{ color: RED }}>Funds error: {data.fundsError}</p>}

      {f && (
        <section className="rounded-lg p-3.5" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
          <h3 className="text-xs font-bold text-gray-200 uppercase tracking-wider mb-2">
            Bank Balance & Clearing Funds {f.bankAccountLast4 ? `(••${f.bankAccountLast4})` : ''}
          </h3>
          <Line label="Total Bank Balance" value={m(f.totalBankBalance)} />
          <Line label="Unallocated Available Cash" value={m(f.unallocatedBalance)} color={GREEN} />
          <Line label="Total Blocked by Open Trades" value={m(f.blockedByTrade.total)} color="#ff9100" />

          <div className="mt-3">
            <h4 className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 font-semibold">
              Segment Allocations
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                ['Equity', 'equity'],
                ['Futures & Options', 'fno'],
                ['Commodity', 'commodity'],
                ['Currency', 'currency'],
              ].map(([label, k]) => (
                <div key={k} className="p-2 rounded" style={{ backgroundColor: '#0d1117', border: '1px solid #1e2d3d' }}>
                  <span className="text-[10px] text-gray-500 uppercase block">{label}</span>
                  <span className="text-xs font-mono font-bold text-gray-200 block">{m(f.allocated[k])}</span>
                  <span className="text-[9px] text-gray-500 block mt-0.5">
                    Blocked: {m(f.blockedByTrade[k])}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {data.margins.map((mg, i) => (
          <section key={i} className="rounded-lg p-3.5" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
            <h3 className="text-xs font-bold text-gray-200 uppercase tracking-wider mb-2">
              Margin · {i === 0 ? 'NSE (Cash Equity)' : 'NFO (Derivatives F&O)'}
            </h3>
            {mg ? (
              <>
                <Line label="Cash Limit" value={m(mg.cashLimit)} />
                <Line label="Amount Allocated" value={m(mg.amountAllocated)} />
                <Line label="Blocked by Trades" value={m(mg.blockByTrade)} />
                <Line label="ICICI Securities Margin" value={m(mg.isecMargin)} />
                {mg.limitListCount !== null && <Line label="Active Limit Entries" value={mg.limitListCount} />}
              </>
            ) : (
              <p className="text-xs text-gray-500">Not available{data.marginErrors[i] ? `: ${data.marginErrors[i]}` : '.'}</p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function Depth({ symbol }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch(`${API_BASE}/depth/${encodeURIComponent(symbol)}`, { cache: 'no-store' });
        const j = await r.json();
        if (!cancelled) setD(j);
      } catch {
        if (!cancelled) setD({ available: false, reason: 'Could not reach server depth endpoint' });
      }
    };
    poll();
    const timer = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [symbol]);

  return (
    <div className="px-4 py-3" style={{ backgroundColor: '#0d1117' }}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
          Market Depth L2 · {symbol} (5 Bids / 5 Asks)
        </h3>
        {d?.summary && (
          <span className="text-xs font-mono text-gray-300">
            Spread: ₹{px(d.summary.spread)} ({d.summary.spreadPct.toFixed(3)}%)
          </span>
        )}
      </div>

      {!d && <p className="text-xs text-gray-600">Connecting to exchange depth feed…</p>}
      {d && !d.available && <p className="text-xs text-gray-500">Market depth unavailable: {d.reason}.</p>}

      {d?.available && (
        <Table head={[['Bid Qty', 'right'], ['Orders', 'right'], ['Bid (₹)', 'right'], ['Ask (₹)', 'right'], ['Orders', 'right'], ['Ask Qty', 'right']]}>
          {d.levels.map((l, i) => (
            <tr key={i} style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}>
              <td className={`${td} text-right font-mono font-medium text-gray-200`}>{l.bidQty ?? '—'}</td>
              <td className={`${td} text-right font-mono text-gray-500 text-[11px]`}>{l.bidOrders ?? '—'}</td>
              <td className={`${td} text-right font-mono font-bold`} style={{ color: GREEN }}>
                {px(l.bidPrice)}
              </td>
              <td className={`${td} text-right font-mono font-bold`} style={{ color: RED }}>
                {px(l.askPrice)}
              </td>
              <td className={`${td} text-right font-mono text-gray-500 text-[11px]`}>{l.askOrders ?? '—'}</td>
              <td className={`${td} text-right font-mono font-medium text-gray-200`}>{l.askQty ?? '—'}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

const TABS = [
  ['positions', 'Positions', Activity],
  ['orders', 'Order Book', Clock],
  ['trades', 'Trade Book', BookOpen],
  ['funds', 'Funds & Margin', DollarSign],
];
const UNDATED = new Set(['positions', 'funds']);

export default function BrokerBooks({ initialTab = 'positions', selectedStock }) {
  const [tab, setTab] = useState(initialTab);
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [state, setState] = useState({ key: '', status: 'idle', data: null, error: '' });
  const key = UNDATED.has(tab) ? tab : `${tab}|${from}|${to}`;
  const pathFor = () => (UNDATED.has(tab) ? `/${tab}` : `/${tab}?from=${from}&to=${to}`);

  const load = useCallback(async () => {
    setState({ key, status: 'loading', data: null, error: '' });
    const r = await fetchBroker(pathFor());
    setState(r.error ? { key, status: 'error', data: null, error: r.error } : { key, status: 'ready', data: r, error: '' });
  }, [key]);

  useEffect(() => {
    let cancelled = false;
    fetchBroker(pathFor()).then((r) => {
      if (cancelled) return;
      setState(r.error ? { key, status: 'error', data: null, error: r.error } : { key, status: 'ready', data: r, error: '' });
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const current = state.key === key;
  const status = current ? state.status : 'loading';
  const data = current ? state.data : null;
  const error = current ? state.error : '';
  const range = (a, b) => {
    setFrom(a);
    setTo(b);
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col" style={{ backgroundColor: '#0a0e17' }}>
      {/* Top Header & Tab Selector Bar */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.4)', backgroundColor: '#0d1117' }}
      >
        <div className="flex items-center gap-2">
          <BookOpen size={16} className="text-emerald-400" />
          <h2 className="text-xs font-bold text-gray-200 uppercase tracking-wider mr-2">
            Broker Books · ICICI Direct (Read-Only)
          </h2>
          <div className="flex items-center gap-1 rounded p-0.5" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
            {TABS.map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded font-medium cursor-pointer transition-all ${
                  tab === id ? 'bg-emerald-500/20 text-emerald-400 font-semibold' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Date Filter Controls */}
        <div className="flex items-center gap-2">
          {!UNDATED.has(tab) && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => range(today(), today())}
                className="px-2 py-0.5 text-xs rounded bg-white/5 text-gray-300 hover:text-white cursor-pointer font-medium"
              >
                Today
              </button>
              <button
                onClick={() => range(daysAgo(4), today())}
                className="px-2 py-0.5 text-xs rounded bg-white/5 text-gray-300 hover:text-white cursor-pointer font-medium"
              >
                5 Days
              </button>
              <button
                onClick={() => range(daysAgo(9), today())}
                className="px-2 py-0.5 text-xs rounded bg-white/5 text-gray-300 hover:text-white cursor-pointer font-medium"
              >
                10 Days
              </button>
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => e.target.value && setFrom(e.target.value)}
                aria-label="From date"
                className="px-2 py-0.5 text-xs rounded text-gray-200 border border-gray-700 outline-none"
                style={{ backgroundColor: '#111827' }}
              />
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => e.target.value && setTo(e.target.value)}
                aria-label="To date"
                className="px-2 py-0.5 text-xs rounded text-gray-200 border border-gray-700 outline-none"
                style={{ backgroundColor: '#111827' }}
              />
            </div>
          )}
          <button
            onClick={load}
            disabled={status === 'loading'}
            aria-label="Refresh"
            className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/5 cursor-pointer ml-1"
          >
            <RefreshCw size={13} className={status === 'loading' ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {status === 'loading' && !data && (
        <div className="flex-1 flex items-center justify-center p-8 text-xs text-gray-500">
          Syncing books from ICICI Direct API…
        </div>
      )}

      {status === 'error' && (
        <div className="p-6 text-xs text-gray-400 space-y-2">
          <p style={{ color: RED }}>{error}</p>
          <p>
            Broker books require active Breeze API authentication.{' '}
            <a href="?tab=settings" className="underline" style={{ color: '#00e5ff' }}>
              Open Settings
            </a>
            .
          </p>
        </div>
      )}

      {data && tab === 'positions' && <Positions data={data} />}
      {data && tab === 'orders' && <Orders data={data} />}
      {data && tab === 'trades' && <Trades data={data} />}
      {data && tab === 'funds' && <FundsMargin data={data} />}

      {tab === 'orders' && selectedStock?.symbol && (
        <div style={{ borderTop: '1px solid rgba(30, 45, 61, 0.4)' }}>
          <Depth symbol={selectedStock.symbol} />
        </div>
      )}
    </div>
  );
}
