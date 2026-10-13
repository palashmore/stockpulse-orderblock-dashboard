import { useState, useEffect, useMemo, useCallback } from 'react';
import { RefreshCw, Search, Sparkles, TrendingUp, Calendar, Star, Clock } from 'lucide-react';
import IpoCard from './IpoCard';
import { fetchIpos, fetchQuotes } from '../services/api';
import { STATUS_META } from '../data/dataStatus';
import {
  IPO_VIEWS,
  countByView,
  filterIpos,
  yearsOf,
  recentlyListed,
  loadTracked,
  saveTracked,
  toggleTracked,
} from '../data/ipoView';

const REFRESH_MS = 10 * 60_000;
const rule = { borderBottom: '1px solid rgba(30, 45, 61, 0.4)' };
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '');

export default function IpoPanel() {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [view, setView] = useState('open');
  const [query, setQuery] = useState('');
  const [year, setYear] = useState('');
  const [tracked, setTracked] = useState(() => loadTracked(window.localStorage));
  const [quotes, setQuotes] = useState({});
  const [saveFailed, setSaveFailed] = useState(false);

  const load = useCallback(async () => {
    const result = await fetchIpos();
    setState((prev) =>
      result.ok
        ? { loading: false, data: result, error: null }
        : { loading: false, data: prev.data, error: result.error }
    );
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  const pending = state.data?.detailsPending ?? 0;
  useEffect(() => {
    if (!pending) return undefined;
    const timer = setTimeout(load, 20_000);
    return () => clearTimeout(timer);
  }, [pending, state.data, load]);

  const ipos = useMemo(() => state.data?.ipos ?? [], [state.data]);
  const todayKey = state.data?.todayKey ?? '';
  const counts = useMemo(() => countByView(ipos, tracked), [ipos, tracked]);

  const recentSymbols = useMemo(
    () => recentlyListed(ipos, todayKey).map((i) => i.symbol).slice(0, 40),
    [ipos, todayKey]
  );
  useEffect(() => {
    if (recentSymbols.length === 0) return undefined;
    let cancelled = false;
    fetchQuotes(recentSymbols).then((result) => {
      if (cancelled || !result) return;
      setQuotes(Object.fromEntries(result.quotes.map((q) => [q.symbol, { price: q.price, status: result.dataStatus }])));
    });
    return () => {
      cancelled = true;
    };
  }, [recentSymbols]);

  const toggle = useCallback(
    (id) => {
      const next = toggleTracked(tracked, id);
      setTracked(next);
      setSaveFailed(!saveTracked(next, window.localStorage));
    },
    [tracked]
  );

  const visible = useMemo(
    () => filterIpos(ipos, { view, query, year, tracked }),
    [ipos, view, query, year, tracked]
  );
  const years = useMemo(() => yearsOf(ipos), [ipos]);
  const data = state.data;
  const meta = data ? STATUS_META[data.dataStatus] : null;
  const showYear = view === 'listed' || view === 'all';

  return (
    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col" style={{ backgroundColor: '#0a0e17' }}>
      {/* Top Header Strip */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 flex-shrink-0"
        style={{ backgroundColor: '#0d1117', ...rule }}
      >
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-emerald-400" />
          <h2 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
            NSE Mainboard IPO Intelligence & GMP Tracker
          </h2>
        </div>

        <button
          onClick={() => {
            setState((s) => ({ ...s, loading: true }));
            load();
          }}
          disabled={state.loading}
          className="flex items-center gap-1.5 px-3 py-1 text-xs rounded font-medium cursor-pointer bg-white/5 text-gray-300 hover:text-white hover:bg-white/10 disabled:opacity-50"
        >
          <RefreshCw size={12} className={state.loading ? 'animate-spin' : ''} />
          {state.loading ? 'Refreshing…' : 'Refresh Feed'}
        </button>
      </div>

      {/* Top Overview Cards Strip */}
      {data && (
        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 py-2.5 flex-shrink-0"
          style={{ backgroundColor: '#0a0e17', borderBottom: '1px solid rgba(30, 45, 61, 0.4)' }}
        >
          <div className="p-2.5 rounded" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
            <span className="text-[10px] text-gray-500 uppercase block mb-0.5 font-medium">Open For Bidding</span>
            <span className="text-sm font-mono font-bold text-emerald-400">{counts.open ?? 0} Issues</span>
          </div>
          <div className="p-2.5 rounded" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
            <span className="text-[10px] text-gray-500 uppercase block mb-0.5 font-medium">Upcoming Issues</span>
            <span className="text-sm font-mono font-bold text-cyan-400">{counts.upcoming ?? 0} Issues</span>
          </div>
          <div className="p-2.5 rounded" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
            <span className="text-[10px] text-gray-500 uppercase block mb-0.5 font-medium">Recently Listed</span>
            <span className="text-sm font-mono font-bold text-gray-200">{counts.listed ?? 0} Issues</span>
          </div>
          <div className="p-2.5 rounded" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
            <span className="text-[10px] text-gray-500 uppercase block mb-0.5 font-medium">Tracked Issues</span>
            <span className="text-sm font-mono font-bold text-amber-400">{counts.tracked ?? 0} Starred</span>
          </div>
        </div>
      )}

      {/* View Switcher and Search Bar */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 flex-shrink-0"
        style={{ backgroundColor: '#0d1117', ...rule }}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {IPO_VIEWS.map((v) => {
            const active = view === v.id;
            return (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                aria-pressed={active}
                className={`px-3 py-1 text-xs rounded font-medium cursor-pointer transition-all ${
                  active
                    ? 'bg-emerald-500/20 text-emerald-400 font-semibold'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
              >
                {v.label} {data ? <span className="text-[10px] ml-1 font-mono">({counts[v.id]})</span> : ''}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-2 text-gray-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search company or symbol…"
              aria-label="Search IPOs"
              className="w-48 pl-7 pr-2.5 py-1 text-xs rounded font-medium text-gray-200 border border-gray-700 focus:border-green-500 outline-none"
              style={{ backgroundColor: '#111827' }}
            />
          </div>

          {showYear && years.length > 1 && (
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              aria-label="Year"
              className="px-2 py-1 text-xs rounded text-gray-200 border border-gray-700 outline-none cursor-pointer"
              style={{ backgroundColor: '#111827' }}
            >
              <option value="">All Years</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Intelligence & Data Status Banner */}
      <div className="px-4 py-2 text-[10px] text-gray-500 flex-shrink-0" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.2)' }}>
        Mainboard public offerings only (SME omitted). Dates marked <span className="text-gray-300 font-medium">exp.</span> are estimated from SEBI&apos;s T+3 settlement cycle.
        Grey-market premium (GMP) quotes are unofficial dealer estimates.
        {data && (
          <span className="ml-1 text-gray-400">
            · Feed: {data.provider}
            {data.fetchedAt ? ` (${fmtTime(data.fetchedAt)} IST)` : ''}
            {meta && <span style={{ color: meta.color }}> · {meta.label}</span>}
          </span>
        )}
        {state.error && <span style={{ color: '#ff1744' }}> · Feed Error: {state.error}</span>}
        {saveFailed && <span style={{ color: '#ff1744' }}> · Browser local storage blocked</span>}
      </div>

      {/* Main List Viewport */}
      {state.loading && !data && (
        <div className="flex-1 flex items-center justify-center p-8 text-xs text-gray-500">
          Loading IPO listings from NSE exchange feed…
        </div>
      )}

      {data && visible.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-8 text-center text-xs text-gray-500">
          {view === 'tracked'
            ? 'No tracked IPOs yet. Star any issue above to monitor its timeline and GMP.'
            : query
            ? 'No IPO matches your search query in this tab.'
            : `No ${IPO_VIEWS.find((v) => v.id === view)?.label.toLowerCase()} mainboard issues currently listed.`}
        </div>
      )}

      <div className="flex-1 divide-y divide-gray-800/40">
        {visible.map((ipo) => (
          <IpoCard
            key={ipo.id}
            ipo={ipo}
            todayKey={todayKey}
            tracked={tracked.has(ipo.id)}
            onToggle={toggle}
            quote={quotes[ipo.symbol]}
          />
        ))}
      </div>
    </div>
  );
}
