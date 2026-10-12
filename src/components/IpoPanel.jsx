import { useState, useEffect, useMemo, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import IpoCard from './IpoCard';
import { fetchIpos, fetchQuotes } from '../services/api';
import { STATUS_META } from '../data/dataStatus';
import {
  IPO_VIEWS, countByView, filterIpos, yearsOf, recentlyListed, loadTracked, saveTracked, toggleTracked,
} from '../data/ipoView';

const REFRESH_MS = 10 * 60_000;
const rule = { borderBottom: '1px solid rgba(30, 45, 61, 0.3)' };
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
    setState((prev) => (result.ok
      ? { loading: false, data: result, error: null }
      : { loading: false, data: prev.data, error: result.error })); // keep showing the last list when a refresh fails
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [load]);

  // Some issue details were still loading on the server: look again shortly instead of waiting for the 10-minute refresh
  const pending = state.data?.detailsPending ?? 0;
  useEffect(() => {
    if (!pending) return undefined;
    const timer = setTimeout(load, 20_000);
    return () => clearTimeout(timer);
  }, [pending, state.data, load]);

  const ipos = useMemo(() => state.data?.ipos ?? [], [state.data]);
  const todayKey = state.data?.todayKey ?? '';
  const counts = useMemo(() => countByView(ipos, tracked), [ipos, tracked]);

  // Latest prices for recently listed issues, to show them against the issue price
  const recentSymbols = useMemo(() => recentlyListed(ipos, todayKey).map((i) => i.symbol).slice(0, 40), [ipos, todayKey]);
  useEffect(() => {
    if (recentSymbols.length === 0) return undefined;
    let cancelled = false;
    fetchQuotes(recentSymbols).then((result) => {
      if (cancelled || !result) return;
      setQuotes(Object.fromEntries(result.quotes.map((q) => [q.symbol, { price: q.price, status: result.dataStatus }])));
    });
    return () => { cancelled = true; };
  }, [recentSymbols]);

  const toggle = useCallback((id) => {
    const next = toggleTracked(tracked, id);
    setTracked(next);
    setSaveFailed(!saveTracked(next, window.localStorage));
  }, [tracked]);

  const visible = useMemo(() => filterIpos(ipos, { view, query, year, tracked }), [ipos, view, query, year, tracked]);
  const years = useMemo(() => yearsOf(ipos), [ipos]);
  const data = state.data;
  const meta = data ? STATUS_META[data.dataStatus] : null;
  const showYear = view === 'listed' || view === 'all';

  return (
    <div className="flex-1 min-h-0 overflow-y-auto" style={{ backgroundColor: '#0a0e17' }}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2" style={rule}>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Mainboard IPOs · open to listing</h2>
        <button onClick={() => { setState((s) => ({ ...s, loading: true })); load(); }} disabled={state.loading} className="flex items-center gap-1 px-2 py-1 text-[11px] rounded cursor-pointer bg-white/5 text-gray-300 hover:bg-white/10 disabled:opacity-50">
          <RefreshCw size={12} className={state.loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="px-4 py-2 text-[11px] text-gray-500 space-y-1" style={rule}>
        <p>
          Mainboard issues only; SME issues are not shown. Opening, closing and listing dates are as published by NSE, or announced by InvestorGain for issues NSE does not list yet. Dates marked
          <span className="mx-1 text-gray-400">exp.</span>
          are worked out from SEBI&apos;s T+3 timeline on the exchange trading calendar and can change.
        </p>
        <p>
          Grey-market premium (GMP) is an unofficial figure quoted by dealers: it can be wrong or manipulated and does not guarantee a listing gain.
          The analysis on each issue is a rule-based checklist, not a recommendation to apply. Read the offer document before bidding.
        </p>
        {data && (
          <p>
            Source: {data.provider} (unofficial website feed)
            {data.fetchedAt ? `, fetched ${fmtTime(data.fetchedAt)}` : ''}
            {meta && <> · <span style={{ color: meta.color }}>{meta.label}</span></>}
            {data.staleAgeSec ? ` · cached copy, ${Math.round(data.staleAgeSec / 60)} min old` : ''}
          </p>
        )}
        {data?.gmp && (
          <p>
            Grey-market premium and announced dates: {data.gmp.provider}
            {data.gmp.status === 'OK' && data.gmp.fetchedAt ? `, fetched ${fmtTime(data.gmp.fetchedAt)}` : ''}
            {data.gmp.status === 'STALE' && <span style={{ color: '#ffd600' }}> · STALE: the latest fetch failed, showing an older copy</span>}
            {data.gmp.status === 'UNAVAILABLE' && <span style={{ color: '#ff1744' }}> · unavailable right now ({data.gmp.error || 'no reason given'}); no premium is shown rather than a guess</span>}
          </p>
        )}
        {pending > 0 && <p>Some issue details (lot size, subscription, registrar) are still loading from NSE; this list refreshes by itself.</p>}
        {data?.calendar === 'weekends-only' && <p style={{ color: '#ffd600' }}>The exchange holiday list could not be loaded, so expected dates may be a day early.</p>}
        {state.error && <p role="alert" style={{ color: '#ff1744' }}>{data ? `Could not refresh (${state.error}); showing the last list.` : `Could not load IPOs: ${state.error}`}</p>}
        {saveFailed && <p style={{ color: '#ff1744' }}>Could not save tracked IPOs in this browser.</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 py-2" style={rule}>
        {IPO_VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            aria-pressed={view === v.id}
            className="px-2.5 py-1 text-[11px] rounded cursor-pointer"
            style={{ backgroundColor: view === v.id ? 'rgba(0, 230, 118, 0.15)' : 'rgba(255,255,255,0.04)', color: view === v.id ? '#00e676' : '#94a3b8' }}
          >
            {v.label} <span className="text-gray-500">{data ? counts[v.id] : ''}</span>
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or symbol"
          aria-label="Search IPOs"
          className="ml-auto w-full sm:w-52 px-2 py-1 text-xs rounded bg-transparent text-gray-200 border border-gray-700 focus:border-green-500 outline-none"
        />
        {showYear && years.length > 1 && (
          <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year" className="px-2 py-1 text-xs rounded text-gray-200 border border-gray-700 outline-none" style={{ backgroundColor: '#0d1117' }}>
            <option value="">All years</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
      </div>

      {state.loading && !data && <p className="px-4 py-6 text-xs text-gray-500">Loading IPOs from NSE…</p>}
      {!state.loading && !data && (
        <p className="px-4 py-6 text-xs text-gray-500">Nothing is shown rather than an unreliable list. Check that the server is running and try Refresh.</p>
      )}
      {data && visible.length === 0 && (
        <p className="px-4 py-6 text-xs text-gray-500">
          {view === 'tracked' ? 'No tracked IPOs yet. Use the star on any issue.' : query ? 'No IPO matches your search in this tab.' : `No ${IPO_VIEWS.find((v) => v.id === view)?.label.toLowerCase()} mainboard IPOs right now.`}
        </p>
      )}
      {visible.map((ipo) => (
        <IpoCard key={ipo.id} ipo={ipo} todayKey={todayKey} tracked={tracked.has(ipo.id)} onToggle={toggle} quote={quotes[ipo.symbol]} />
      ))}
    </div>
  );
}
