import { useState, useEffect, useMemo, useCallback } from 'react';
import { Star, ExternalLink, RefreshCw } from 'lucide-react';
import { fetchIpos, fetchQuotes } from '../services/api';
import { STATUS_META } from '../data/dataStatus';
import {
  IPO_VIEWS, STAGE_META, countByView, filterIpos, yearsOf, countdown, stepState, formatDay, againstIssuePrice,
  recentlyListed, nseIssueUrl, loadTracked, saveTracked, toggleTracked,
} from '../data/ipoView';

const REFRESH_MS = 10 * 60_000;
const rule = { borderBottom: '1px solid rgba(30, 45, 61, 0.3)' };
const STEP_COLOR = { done: '#00e676', today: '#ffd600', upcoming: '#475569', unknown: '#334155' };

const inr = (n) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '');

function Timeline({ ipo, todayKey }) {
  return (
    <ol className="grid gap-1 mt-2" style={{ gridTemplateColumns: `repeat(${ipo.timeline.length}, minmax(0, 1fr))` }}>
      {ipo.timeline.map((step) => {
        const state = stepState(step, todayKey);
        return (
          <li key={step.key} className="min-w-0">
            <div className="h-1 rounded-full" style={{ backgroundColor: STEP_COLOR[state] }} />
            <div className="mt-1 text-[10px] leading-tight text-gray-500">{step.label}</div>
            <div className="text-[11px] font-medium leading-tight" style={{ color: state === 'unknown' ? '#64748b' : '#e2e8f0' }}>
              {formatDay(step.date, todayKey)}
              {step.kind === 'expected' && step.date && <span className="ml-1 text-[9px] font-normal text-gray-500" title="Expected from SEBI's T+3 timeline, not announced by the exchange">exp.</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function IpoCard({ ipo, todayKey, tracked, onToggle, quote }) {
  const stage = STAGE_META[ipo.stage];
  const move = againstIssuePrice(ipo, quote?.price);
  const facts = [
    ipo.priceHigh ? `Price band ${ipo.priceLow === ipo.priceHigh ? inr(ipo.priceHigh) : `${inr(ipo.priceLow)} to ${inr(ipo.priceHigh)}`}` : null,
    ipo.lotSize ? `Lot ${ipo.lotSize} shares` : null,
    ipo.minInvestment ? `Minimum ≈ ${inr(ipo.minInvestment)}` : null,
    ipo.issueSizeCr ? `Size ≈ ₹${ipo.issueSizeCr.toLocaleString('en-IN')} Cr at upper band` : null,
    ipo.issueType,
  ].filter(Boolean);

  return (
    <article className="px-4 py-3" style={rule}>
      <div className="flex items-start gap-2">
        <button
          onClick={() => onToggle(ipo.id)}
          aria-label={tracked ? `Stop tracking ${ipo.name}` : `Track ${ipo.name}`}
          aria-pressed={tracked}
          title={tracked ? 'Tracked' : 'Track this IPO'}
          className="p-1 -ml-1 cursor-pointer text-gray-500 hover:text-yellow-400"
        >
          <Star size={15} fill={tracked ? '#ffd600' : 'none'} color={tracked ? '#ffd600' : 'currentColor'} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-sm font-medium text-gray-100">{ipo.name}</h3>
            <span className="text-[10px] text-gray-500 font-mono">{ipo.symbol}</span>
            {ipo.exchange === 'BSE' && <span className="text-[9px] px-1 rounded bg-white/10 text-gray-400">BSE</span>}
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: stage.color, backgroundColor: `${stage.color}1f` }}>{stage.label}</span>
            <span className="text-[11px] text-gray-400">{countdown(ipo, todayKey)}</span>
          </div>
          {facts.length > 0 && <p className="mt-1 text-[11px] text-gray-400">{facts.join(' · ')}</p>}
          {ipo.stage === 'LISTED' && ipo.issuePrice && (
            <p className="mt-1 text-[11px] text-gray-400">
              Issue price {inr(ipo.issuePrice)}
              {move && (
                <>
                  {' · '}Latest {inr(move.price)}{' '}
                  <span style={{ color: move.pct >= 0 ? '#00e676' : '#ff1744' }}>({move.pct >= 0 ? '+' : ''}{move.pct.toFixed(1)}% vs issue price)</span>
                  <span className="text-gray-600"> · {STATUS_META[quote.status]?.label ?? 'price'}, not the listing-day gain</span>
                </>
              )}
            </p>
          )}
          {ipo.subscription.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-gray-400">
              <span className="text-gray-500">Subscribed:</span>
              {ipo.subscription.map((s) => <span key={s.category}>{s.category} <span className="text-gray-200">{s.times.toFixed(2)}x</span></span>)}
            </p>
          )}
          <Timeline ipo={ipo} todayKey={todayKey} />
        </div>
        <a
          href={nseIssueUrl(ipo)}
          target="_blank"
          rel="noreferrer"
          title="Official issue page on NSE"
          aria-label={`Open ${ipo.name} on NSE`}
          className="p-1 text-gray-500 hover:text-gray-200"
        >
          <ExternalLink size={14} />
        </a>
      </div>
    </article>
  );
}

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
          Mainboard issues only; SME issues are not shown. Opening, closing and listing dates are as published by NSE. Dates marked
          <span className="mx-1 text-gray-400">exp.</span>
          (allotment, refund/credit and a listing date not yet announced) are worked out from SEBI&apos;s T+3 timeline on the exchange trading calendar and can change.
        </p>
        <p>Information only, not a recommendation to apply. Read the offer document before bidding. Grey-market premium is not shown because it is not an official or reliable figure.</p>
        {data && (
          <p>
            Source: {data.provider} (unofficial website feed)
            {data.fetchedAt ? `, fetched ${fmtTime(data.fetchedAt)}` : ''}
            {meta && <> · <span style={{ color: meta.color }}>{meta.label}</span></>}
            {data.staleAgeSec ? ` · cached copy, ${Math.round(data.staleAgeSec / 60)} min old` : ''}
          </p>
        )}
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
