import { useMemo, useState, useEffect } from 'react';
import { Plus, Calendar, Newspaper, Wallet, ListChecks, RefreshCw, ArrowUpRight } from 'lucide-react';
import { fetchNews, fetchPortfolio } from '../../services/api';
import { useQuotesBatch } from '../../hooks/useQuotesBatch';
import { useWatchlist } from '../../hooks/useWatchlist';
import { useRefresh } from '../../hooks/useRefresh';
import Freshness from '../Freshness';

const GREEN = '#00e676';
const RED = '#ff1744';
const inr = (v) => (Number.isFinite(v) ? `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—');
const signedInr = (v) => (Number.isFinite(v) ? `${v >= 0 ? '+' : '-'}₹${Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—');
const signedPct = (v) => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : '');
const INDEX_LABELS = [['nifty50', 'NIFTY 50'], ['bse_sensex', 'SENSEX'], ['bank', 'NIFTY BANK'], ['midcap100', 'NIFTY MIDCAP 100'], ['smallcap100', 'NIFTY SMALLCAP 100']];

function Empty({ children }) {
  return <div className="flex-1 flex flex-col items-center justify-center text-center text-[11px] text-gray-500 px-2 py-6">{children}</div>;
}

export default function DashboardBottomGrid({ onOpen = null, levels = null, sectors = [] }) {
  const [wlTab, setWlTab] = useState('My Stocks');
  const [newsTab, setNewsTab] = useState('All');

  // News: real feed only. No feed, no headlines.
  const [news, setNews] = useState([]);
  const [newsState, setNewsState] = useState('loading'); // loading | live | unavailable
  useEffect(() => {
    let cancelled = false;
    fetchNews(newsTab)
      .then((res) => {
        if (cancelled) return;
        const items = res?.news ?? [];
        setNews(items);
        setNewsState(items.length > 0 ? 'live' : 'unavailable');
      })
      .catch(() => { if (!cancelled) { setNews([]); setNewsState('unavailable'); } });
    return () => { cancelled = true; };
  }, [newsTab]);

  // Watchlist: the user's own saved lists, priced from the shared quote feed
  const watch = useWatchlist('daily');
  const watchSymbols = useMemo(() => [...watch.allSymbols], [watch.allSymbols]);
  const watchQuotes = useQuotesBatch(watchSymbols, watchSymbols.length > 0);
  const watchRows = useMemo(() => (watchQuotes.result?.quotes ?? []).map((q) => ({ key: q.symbol, label: q.symbol, price: q.price, change: q.change, changePct: q.changePct })), [watchQuotes.result]);
  const indexRows = useMemo(() => INDEX_LABELS
    .map(([id, label]) => ({ key: id, label, price: levels?.indices?.[id]?.last, change: levels?.indices?.[id]?.change, changePct: levels?.indices?.[id]?.changePct }))
    .filter((r) => Number.isFinite(r.price)), [levels]);
  const sectorRows = useMemo(() => (sectors || []).filter((x) => Number.isFinite(x.avgChangePct))
    .map((x) => ({ key: x.sector, label: x.sector, price: null, change: null, changePct: x.avgChangePct })), [sectors]);
  const wlRows = wlTab === 'My Stocks' ? watchRows : wlTab === 'Indices' ? indexRows : sectorRows;
  const wlEmpty = wlTab === 'My Stocks'
    ? (watchSymbols.length === 0 ? 'No stocks saved yet. Star a stock in Stock Lists to track it here.' : watchQuotes.loading ? 'Loading prices…' : 'Prices unavailable right now.')
    : wlTab === 'Indices' ? 'Index levels unavailable right now.' : 'Sector figures need the stock universe to load.';

  // Portfolio: read-only broker holdings when signed in; otherwise say so
  const [portfolio, setPortfolio] = useState({ data: null, error: '' });
  const pf = useRefresh('portfolio-summary', async () => {
    const r = await fetchPortfolio();
    if (r.error) { setPortfolio((st) => ({ ...st, error: r.error })); return null; }
    setPortfolio({ data: r, error: '' });
    return r;
  }, true, 5 * 60000);
  const totals = portfolio.data?.totals;

  const cardStyle = {
    backgroundColor: '#0d1117',
    border: '1px solid rgba(30, 45, 61, 0.5)',
  };

  const innerBoxStyle = {
    backgroundColor: 'rgba(17, 24, 39, 0.6)',
    border: '1px solid rgba(30, 45, 61, 0.4)',
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 px-4 py-2">
      {/* 1. Watchlist */}
      <div className="flex flex-col rounded-lg p-3 shadow-sm" style={cardStyle}>
        <div className="flex items-center justify-between mb-2 pb-1.5" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.4)' }}>
          <div className="flex items-center gap-1.5">
            <ListChecks size={13} className="text-amber-400" />
            <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
              Watchlist
            </h3>
          </div>
          <button className="text-gray-400 hover:text-white cursor-pointer" aria-label="Add symbol">
            <Plus size={13} />
          </button>
        </div>

        <div className="flex items-center gap-1 mb-2 rounded p-0.5 text-[9px]" style={innerBoxStyle}>
          {['My Stocks', 'Sectors', 'Indices'].map((t) => (
            <button
              key={t}
              onClick={() => setWlTab(t)}
              className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                wlTab === t ? 'bg-white/15 text-white font-semibold' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {wlRows.length === 0 ? <Empty>{wlEmpty}</Empty> : (
          <div className="flex-1 space-y-1.5 text-xs font-mono">
            {wlRows.map((item) => {
              const up = (item.changePct ?? 0) >= 0;
              return (
                <div
                  key={item.key}
                  onClick={() => wlTab === 'My Stocks' && onOpen && onOpen(item.label)}
                  className={`flex items-center justify-between p-1 rounded hover:bg-white/[0.04] transition-colors ${wlTab === 'My Stocks' ? 'cursor-pointer' : ''}`}
                >
                  <div>
                    <div className="font-bold text-gray-200 font-sans">{item.label}</div>
                    {Number.isFinite(item.price) && <div className="text-[10px] text-gray-400">₹{item.price.toFixed(2)}</div>}
                  </div>
                  <div className="text-right">
                    {Number.isFinite(item.change) && (
                      <div className="font-semibold" style={{ color: up ? GREEN : RED }}>{up ? '+' : ''}{item.change.toFixed(2)}</div>
                    )}
                    <div className="text-[10px]" style={{ color: up ? GREEN : RED }}>{signedPct(item.changePct)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Real-Time News Feed */}
      <div className="flex flex-col rounded-lg p-3 shadow-sm" style={cardStyle}>
        <div className="flex items-center justify-between mb-2 pb-1.5" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.4)' }}>
          <div className="flex items-center gap-1.5">
            <Newspaper size={13} className="text-cyan-400" />
            <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
              Recent News
            </h3>
            {newsState === 'live' && (
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" title="Live news feed" />
            )}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-gray-400">
            {newsState === 'loading' && <RefreshCw size={10} className="animate-spin text-cyan-400" />}
            <span className="text-[10px] font-mono text-gray-500">
              {newsState === 'live' ? 'LIVE' : newsState === 'loading' ? 'LOADING' : 'UNAVAILABLE'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 mb-2 rounded p-0.5 text-[9px]" style={innerBoxStyle}>
          {['All', 'Company', 'Market', 'F&O', 'Economy'].map((t) => (
            <button
              key={t}
              onClick={() => setNewsTab(t)}
              className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                newsTab === t ? 'bg-white/15 text-white font-semibold' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto no-scrollbar max-h-60">
          {news.length === 0 && <Empty>{newsState === 'loading' ? 'Loading headlines…' : 'News feed unavailable right now.'}</Empty>}
          {news.map((n, i) => (
            <div
              key={n.id || i}
              className="flex items-start gap-2 text-[11px] p-1.5 rounded transition-colors hover:bg-white/[0.04] group"
              style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.25)' }}
            >
              <span className="font-mono text-gray-500 text-[10px] whitespace-nowrap pt-0.5">{n.time}</span>
              <div className="flex-1 min-w-0">
                <a
                  href={n.link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-gray-200 leading-snug line-clamp-2 hover:text-cyan-400 transition-colors inline-block"
                >
                  {n.text}
                </a>
                {n.source && (
                  <div className="text-[9px] text-gray-500 mt-0.5 flex items-center gap-1">
                    <span>{n.source}</span>
                    {n.link && <ArrowUpRight size={8} className="opacity-0 group-hover:opacity-100 transition-opacity" />}
                  </div>
                )}
              </div>
              {n.tag && (
                <button
                  type="button"
                  onClick={() => onOpen && onOpen(n.tag)}
                  className={`text-[8px] px-1 py-0.5 rounded font-bold uppercase whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity ${n.tagColor || 'bg-cyan-500/20 text-cyan-300'}`}
                  title={`Open ${n.tag} analysis`}
                >
                  {n.tag}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 3. Economic Calendar */}
      <div className="flex flex-col rounded-lg p-3 shadow-sm" style={cardStyle}>
        <div className="flex items-center justify-between mb-2 pb-1.5" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.4)' }}>
          <div className="flex items-center gap-1.5">
            <Calendar size={13} className="text-yellow-400" />
            <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">Economic Calendar</h3>
          </div>
        </div>
        <Empty>No economic calendar feed is connected, so no events are shown.</Empty>
      </div>

      {/* 4. Portfolio Summary */}
      <div className="flex flex-col rounded-lg p-3 shadow-sm" style={cardStyle}>
        <div className="flex items-center justify-between mb-2 pb-1.5" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.4)' }}>
          <div className="flex items-center gap-1.5">
            <Wallet size={13} className="text-emerald-400" />
            <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">Portfolio Summary</h3>
          </div>
          <Freshness lastSuccessAt={pf.lastSuccessAt} failures={pf.failures} intervalMs={5 * 60000} />
        </div>

        {!totals ? (
          <Empty>
            <span>{portfolio.error ? `Portfolio not available: ${portfolio.error}` : 'Loading holdings…'}</span>
            <span className="mt-1">Sign in to ICICI Direct in Settings to see your holdings here.</span>
          </Empty>
        ) : (
          <>
            <div className="mb-2">
              <div className="text-[9px] uppercase tracking-wider text-gray-500 font-semibold">Total Value</div>
              <div className="text-xl font-bold font-mono text-white tracking-tight">{inr(totals.value)}</div>
              <div className="flex items-center justify-between text-[11px] font-mono mt-1">
                <span className="font-semibold" style={{ color: (totals.dayChange ?? 0) >= 0 ? GREEN : RED }}>
                  Day P&L: {signedInr(totals.dayChange)}{Number.isFinite(totals.dayChangePct) ? ` (${signedPct(totals.dayChangePct)})` : ''}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 text-[10px] font-mono" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.4)' }}>
              <div>
                <div className="text-gray-500">Holdings</div>
                <div className="font-semibold text-gray-200">{totals.count} stocks</div>
              </div>
              <div className="text-right">
                <div className="text-gray-500">Cash Balance</div>
                <div className="font-semibold text-gray-200">{inr(portfolio.data.funds?.unallocatedBalance)}</div>
              </div>
            </div>
            {totals.unpriced > 0 && <div className="pt-1 text-[10px] text-amber-400">{totals.unpriced} holding{totals.unpriced > 1 ? 's' : ''} currently unpriced.</div>}
          </>
        )}
      </div>
    </div>
  );
}
