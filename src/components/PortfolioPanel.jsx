import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, RefreshCw, Briefcase, TrendingUp, PieChart, ShieldAlert, Gauge } from 'lucide-react';
import { fetchPortfolio } from '../services/api';
import { loadSettings } from '../data/settings';
import { loadCosts, saveCosts, setCost } from '../data/costBasis';
import { usePortfolioAnalysis } from '../hooks/usePortfolioAnalysis';
import { ReviewView, AllocationView, CorrelationView } from './PortfolioReview';
import PortfolioAdvanced from './PortfolioAdvanced';
import Freshness from './Freshness';

const GREEN = '#00e676';
const RED = '#ff1744';
const inr = (n) => (Number.isFinite(n) ? `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—');
const signed = (n) => (Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—');
const colorOf = (n) => (!Number.isFinite(n) || n === 0 ? '#9ca3af' : n > 0 ? GREEN : RED);

const VIEWS = [
  { id: 'holdings', label: 'Holdings', icon: Briefcase },
  { id: 'review', label: 'Review: Buy, Hold, Sell', icon: ShieldAlert },
  { id: 'allocation', label: 'Allocation', icon: PieChart },
  { id: 'correlation', label: 'Correlation & Risk', icon: TrendingUp },
  { id: 'advanced', label: 'Advanced', icon: Gauge },
];

export default function PortfolioPanel({ onSelectStock }) {
  const [state, setState] = useState({ status: 'idle', data: null, error: '' });
  const [hidden, setHidden] = useState(() => loadSettings(window.localStorage).hideAmounts);
  const [view, setView] = useState('holdings');
  const [costs, setCosts] = useState(() => loadCosts(window.localStorage));
  const [costSaveFailed, setCostSaveFailed] = useState(false);

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
    return () => {
      cancelled = true;
    };
  }, []);

  const { status, data, error } = state;
  const mask = (text) => (hidden ? '••••••' : text);

  const onCost = useCallback(
    (symbol, text) => {
      const next = setCost(costs, symbol, text);
      if (next[symbol] === costs[symbol]) return;
      setCosts(next);
      setCostSaveFailed(!saveCosts(next, window.localStorage));
    },
    [costs]
  );

  const holdings = data?.holdings ?? null;
  const analysisInput = useMemo(
    () => ({ funds: data?.funds ?? null, totalValue: data?.totals?.value ?? null, costs }),
    [data, costs]
  );
  const [analysisWanted, setAnalysisWanted] = useState(false);
  const portfolio = usePortfolioAnalysis(analysisWanted ? holdings : null, analysisInput);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col" style={{ backgroundColor: '#0a0e17', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
      {/* Top Header Bar */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.4)', backgroundColor: '#0d1117' }}
      >
        <div className="flex items-center gap-2">
          <Briefcase size={16} className="text-emerald-400" />
          <h2 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
            Demat Portfolio · ICICI Direct (Read-Only)
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setHidden((h) => !h)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded bg-white/5 text-gray-300 hover:text-white hover:bg-white/10 cursor-pointer font-medium"
          >
            {hidden ? <Eye size={13} /> : <EyeOff size={13} />}
            {hidden ? 'Show Amounts' : 'Hide Amounts'}
          </button>
          <button
            onClick={load}
            disabled={status === 'loading'}
            className="flex items-center gap-1.5 px-3 py-1 text-xs rounded font-semibold cursor-pointer disabled:opacity-50"
            style={{ backgroundColor: 'rgba(0, 230, 118, 0.15)', color: '#00e676' }}
          >
            <RefreshCw size={12} className={status === 'loading' ? 'animate-spin' : ''} />
            {status === 'loading' ? 'Syncing…' : 'Sync Portfolio'}
          </button>
          {data?.fetchedAt && <Freshness lastSuccessAt={new Date(data.fetchedAt).getTime()} failures={status === 'error' ? 1 : 0} intervalMs={5 * 60000} />}
        </div>
      </div>

      {/* Hero Overview Metrics Bar */}
      {data && (
        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 py-3 flex-shrink-0"
          style={{ backgroundColor: '#0a0e17', borderBottom: '1px solid rgba(30, 45, 61, 0.4)' }}
        >
          <div className="p-3 rounded-lg" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
            <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium block mb-1">
              Total Holdings Value
            </span>
            <span className="text-base font-mono font-bold text-gray-100">{mask(inr(data.totals.value))}</span>
          </div>

          <div className="p-3 rounded-lg" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
            <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium block mb-1">
              Today&apos;s Change
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-mono font-bold" style={{ color: colorOf(data.totals.dayChange) }}>
                {mask(signed(data.totals.dayChange))}
              </span>
              {Number.isFinite(data.totals.dayChangePct) && (
                <span className="text-xs font-mono font-semibold" style={{ color: colorOf(data.totals.dayChange) }}>
                  ({signed(data.totals.dayChangePct)}%)
                </span>
              )}
            </div>
          </div>

          <div className="p-3 rounded-lg" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
            <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium block mb-1">
              Active Holdings
            </span>
            <span className="text-base font-mono font-bold text-gray-100">{data.totals.count} Stocks</span>
          </div>

          <div className="p-3 rounded-lg" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
            <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium block mb-1">
              Unallocated Cash
            </span>
            <span className="text-base font-mono font-bold text-emerald-400">
              {data.funds ? mask(inr(data.funds.unallocatedBalance)) : '—'}
            </span>
          </div>
        </div>
      )}

      {/* Sub-Views Navigation Tab Bar */}
      {data && (
        <div
          className="flex items-center gap-2 px-3 sm:px-4 py-2 flex-shrink-0 overflow-x-auto whitespace-nowrap"
          style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)', backgroundColor: '#0d1117' }}
        >
          {VIEWS.map((v) => {
            const Icon = v.icon;
            const active = view === v.id;
            return (
              <button
                key={v.id}
                onClick={() => {
                  setView(v.id);
                  if (v.id !== 'holdings') setAnalysisWanted(true);
                }}
                aria-pressed={active}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-medium cursor-pointer transition-all flex-shrink-0 ${
                  active
                    ? 'bg-emerald-500/20 text-emerald-400 font-semibold'
                    : 'bg-white/5 text-gray-400 hover:text-gray-200'
                }`}
              >
                <Icon size={13} />
                {v.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Loading & Error States */}
      {status === 'loading' && !data && (
        <div className="flex-1 flex items-center justify-center p-8 text-xs text-gray-500">
          Syncing Demat holdings from ICICI Direct API…
        </div>
      )}

      {status === 'error' && (
        <div className="p-6 text-xs text-gray-400 space-y-2">
          <p style={{ color: '#ff1744' }}>{error}</p>
          <p>
            Portfolio inspection requires local broker credentials.{' '}
            <a href="?tab=settings" className="underline" style={{ color: '#00e5ff' }}>
              Open Settings to configure Breeze API
            </a>
            .
          </p>
        </div>
      )}

      {/* Sub-Views Content */}
      {data && view === 'review' && (
        <ReviewView {...portfolio} onCost={onCost} onSelectStock={onSelectStock} />
      )}
      {data && view === 'allocation' && (
        <AllocationView {...portfolio} holdings={data.holdings} hidden={hidden} />
      )}
      {data && view === 'correlation' && <CorrelationView {...portfolio} />}
      {data && view === 'advanced' && (
        <PortfolioAdvanced analysis={portfolio.analysis} candles={portfolio.candles} holdings={data.holdings} loading={portfolio.loading} progress={portfolio.progress} hidden={hidden} />
      )}
      {costSaveFailed && view === 'review' && (
        <p className="px-4 py-2 text-[11px]" style={{ color: '#ff1744' }}>
          Could not persist your average buy prices in browser local storage.
        </p>
      )}

      {/* Holdings Table View */}
      {data && view === 'holdings' && (
        <>
          {data.totals.unpriced > 0 && (
            <div className="px-4 py-2 text-[11px] flex items-center gap-1.5" style={{ color: '#ffd600', backgroundColor: 'rgba(255, 214, 0, 0.05)' }}>
              <span>⚠</span>
              <span>
                {data.totals.unpriced} holding{data.totals.unpriced > 1 ? 's' : ''} currently unpriced on the feed.
              </span>
            </div>
          )}

          <div className="overflow-x-auto flex-shrink-0" style={{ touchAction: 'pan-x pan-y' }}>
            <table className="w-full text-xs" style={{ minWidth: '34rem' }}>
              <thead className="sticky top-0 z-10" style={{ backgroundColor: '#0d1117' }}>
                <tr className="text-[10px] text-gray-500 uppercase tracking-wider" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.5)' }}>
                  <th className="px-4 py-2 font-medium text-left">Stock</th>
                  <th className="px-3 py-2 font-medium text-right">Qty</th>
                  <th className="px-3 py-2 font-medium text-right">LTP (₹)</th>
                  <th className="px-3 py-2 font-medium text-right">Day %</th>
                  <th className="px-3 py-2 font-medium text-right">Market Value</th>
                  <th className="px-3 py-2 font-medium text-right">Day Change</th>
                  <th className="px-4 py-2 font-medium text-right">Weight %</th>
                </tr>
              </thead>
              <tbody>
                {data.holdings.map((h) => (
                  <tr
                    key={h.code}
                    onClick={h.symbol ? () => onSelectStock({ symbol: h.symbol, name: h.name, sector: '' }) : undefined}
                    className={`transition-colors ${h.symbol ? 'cursor-pointer hover:bg-white/5' : ''}`}
                    style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}
                    title={h.symbol ? 'Open technical chart' : 'Unmapped symbol'}
                  >
                    <td className="px-4 py-2.5">
                      <div className="font-bold text-gray-200 hover:text-emerald-400 transition-colors">
                        {h.symbol || h.code}
                      </div>
                      <div className="text-[10px] text-gray-500 truncate max-w-[16rem]">{h.name}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-300">{mask(String(h.quantity))}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-200 font-semibold">
                      {Number.isFinite(h.price) ? `₹${h.price.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold" style={{ color: colorOf(h.dayChangePct) }}>
                      {Number.isFinite(h.dayChangePct) ? `${signed(h.dayChangePct)}%` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-200 font-medium">
                      {mask(Number.isFinite(h.value) ? inr(h.value) : '—')}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold" style={{ color: colorOf(h.dayChange) }}>
                      {mask(signed(h.dayChange))}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1 rounded-full bg-gray-800" style={{ width: '35px' }}>
                          <div
                            className="h-full rounded-full bg-cyan-400"
                            style={{ width: `${Math.min(100, Math.max(5, h.weightPct ?? 0))}%` }}
                          />
                        </div>
                        <span className="text-gray-300 font-medium w-10 text-right">
                          {Number.isFinite(h.weightPct) ? `${h.weightPct.toFixed(1)}%` : '—'}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer Info */}
          <div className="px-4 py-2.5 text-[10px] text-gray-600 flex-shrink-0" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.3)' }}>
            Prices: {data.priceBasis}. Source: {data.provider}, fetched{' '}
            {new Date(data.fetchedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} IST.{' '}
            {(data.notes || []).join(' ')} Read-only view; StockPulse cannot place, modify, or cancel trades.
          </div>
        </>
      )}
    </div>
  );
}
