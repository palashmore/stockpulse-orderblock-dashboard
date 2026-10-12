import { useCallback, useEffect, useState } from 'react';
import { fetchPortfolio } from '../services/api';
import { loadSettings } from '../data/settings';

const GREEN = '#00e676';
const RED = '#ff1744';
const inr = (n) => (Number.isFinite(n) ? `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—');
const signed = (n) => (Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—');
const colorOf = (n) => (!Number.isFinite(n) || n === 0 ? '#9ca3af' : n > 0 ? GREEN : RED);

function Stat({ label, value, color, sub }) {
  return (
    <div className="flex flex-col px-4 py-2">
      <span className="text-[10px] text-gray-600 uppercase tracking-wider">{label}</span>
      <span className="text-sm font-mono font-medium" style={{ color: color || '#d1d5db' }}>{value}</span>
      {sub && <span className="text-[10px] font-mono" style={{ color }}>{sub}</span>}
    </div>
  );
}

// Read-only view of the ICICI Direct demat holdings. Personal data: it is fetched on demand from the
// local server, kept only in this component's state, and hidden behind a button until you ask.
export default function PortfolioPanel({ onSelectStock }) {
  const [state, setState] = useState({ status: 'idle', data: null, error: '' });
  const [hidden, setHidden] = useState(() => loadSettings(window.localStorage).hideAmounts);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading', error: '' }));
    const result = await fetchPortfolio();
    if (result.error) setState({ status: 'error', data: null, error: result.error });
    else setState({ status: 'ready', data: result, error: '' });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchPortfolio().then((result) => {
      if (cancelled) return;
      if (result.error) setState({ status: 'error', data: null, error: result.error });
      else setState({ status: 'ready', data: result, error: '' });
    });
    return () => { cancelled = true; };
  }, []);

  const { status, data, error } = state;
  const mask = (text) => (hidden ? '••••••' : text);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto" style={{ backgroundColor: '#0a0e17' }}>
      <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Portfolio · ICICI Direct (read-only)</h2>
        <div className="flex gap-2">
          <button onClick={() => setHidden((h) => !h)} className="px-2 py-1 text-xs rounded bg-white/5 text-gray-300 hover:bg-white/10 cursor-pointer">
            {hidden ? 'Show amounts' : 'Hide amounts'}
          </button>
          <button onClick={load} disabled={status === 'loading'} className="px-2 py-1 text-xs rounded bg-green-500/15 text-green-400 enabled:hover:bg-green-500/25 enabled:cursor-pointer disabled:opacity-50">
            {status === 'loading' ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {status === 'loading' && !data && <p className="px-4 py-6 text-xs text-gray-500">Loading your holdings…</p>}

      {status === 'error' && (
        <div className="px-4 py-6 text-xs text-gray-400 space-y-2">
          <p style={{ color: '#ff1744' }}>{error}</p>
          <p>
            This page needs the ICICI Direct sign-in and works only on the machine running the server.{' '}
            <a href="?tab=settings" className="underline" style={{ color: '#00e5ff' }}>Open Settings</a>.
          </p>
        </div>
      )}

      {data && (
        <>
          <div className="flex flex-wrap" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
            <Stat label="Holdings value" value={mask(inr(data.totals.value))} />
            <Stat
              label="Day change"
              value={mask(signed(data.totals.dayChange))}
              color={colorOf(data.totals.dayChange)}
              sub={Number.isFinite(data.totals.dayChangePct) ? `${signed(data.totals.dayChangePct)}%` : null}
            />
            <Stat label="Stocks" value={data.totals.count} />
            {data.funds && <Stat label="Unallocated cash" value={mask(inr(data.funds.unallocatedBalance))} />}
            {data.funds?.bankAccountLast4 && <Stat label="Bank a/c" value={`••${data.funds.bankAccountLast4}`} />}
          </div>

          {data.totals.unpriced > 0 && (
            <p className="px-4 py-2 text-[11px]" style={{ color: '#ffd600' }}>
              {data.totals.unpriced} holding{data.totals.unpriced > 1 ? 's' : ''} could not be priced (shown as —) and are not in the totals.
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-gray-600 uppercase tracking-wider">
                  {['Stock', 'Qty', 'Price', 'Day %', 'Value', 'Day change', 'Weight'].map((h, i) => (
                    <th key={h} className={`px-4 py-1.5 font-normal ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.holdings.map((h) => (
                  <tr
                    key={h.code}
                    onClick={h.symbol ? () => onSelectStock({ symbol: h.symbol, name: h.name, sector: '' }) : undefined}
                    className={h.symbol ? 'cursor-pointer hover:bg-white/5' : ''}
                    style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}
                    title={h.symbol ? 'Open chart' : 'Not an NSE symbol the chart can load'}
                  >
                    <td className="px-4 py-1.5">
                      <div className="font-medium text-gray-200">{h.symbol || h.code}</div>
                      <div className="text-[10px] text-gray-600 truncate max-w-[16rem]">{h.name}</div>
                    </td>
                    <td className="px-4 py-1.5 text-right font-mono text-gray-300">{mask(String(h.quantity))}</td>
                    <td className="px-4 py-1.5 text-right font-mono text-gray-300">{Number.isFinite(h.price) ? `₹${h.price.toFixed(2)}` : '—'}</td>
                    <td className="px-4 py-1.5 text-right font-mono" style={{ color: colorOf(h.dayChangePct) }}>
                      {Number.isFinite(h.dayChangePct) ? `${signed(h.dayChangePct)}%` : '—'}
                    </td>
                    <td className="px-4 py-1.5 text-right font-mono text-gray-300">{mask(Number.isFinite(h.value) ? inr(h.value) : '—')}</td>
                    <td className="px-4 py-1.5 text-right font-mono" style={{ color: colorOf(h.dayChange) }}>{mask(signed(h.dayChange))}</td>
                    <td className="px-4 py-1.5 text-right font-mono text-gray-400">{Number.isFinite(h.weightPct) ? `${h.weightPct.toFixed(1)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="px-4 py-3 text-[10px] text-gray-600">
            Prices: {data.priceBasis}. Source: {data.provider}, fetched {new Date(data.fetchedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.{' '}
            {(data.notes || []).join(' ')} Weights are by current value of priced holdings. This is a read-only view; StockPulse cannot place or change orders.
          </p>
        </>
      )}
    </div>
  );
}
