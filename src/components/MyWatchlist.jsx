import { useEffect, useMemo, useState } from 'react';
import { X, RefreshCw, Search, TrendingUp, TrendingDown, ArrowUpDown, Clock, Layers } from 'lucide-react';
import { useWatchlist } from '../hooks/useWatchlist';
import { useQuotesBatch } from '../hooks/useQuotesBatch';
import { searchStocks } from '../services/api';
import { sinceAddedPct, WATCH_KINDS, WATCH_LABELS } from '../data/watchStore';
import { STATUS_META } from '../data/dataStatus';

const GREEN = '#00e676';
const RED = '#ff1744';
const tone = (n) => (!Number.isFinite(n) || n === 0 ? '#9ca3af' : n > 0 ? GREEN : RED);
const signed = (n) => (Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(2)}%` : '—');
const vol = (v) => (!Number.isFinite(v) ? '—' : v >= 1e7 ? `${(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(1)} L` : v.toLocaleString('en-IN'));

export default function MyWatchlist({ onOpen }) {
  const [kind, setKind] = useState('daily');
  const watch = useWatchlist(kind);
  const other = kind === 'daily' ? 'swing' : 'daily';
  const symbols = useMemo(() => watch.list.map((e) => e.symbol), [watch.list]);
  const { result, failed, loading, reload } = useQuotesBatch(symbols, true);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState([]);
  const [sort, setSort] = useState('added');

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const r = await searchStocks(q);
      if (!cancelled) setHits(r.slice(0, 8));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);
  const shownHits = query.trim().length >= 2 ? hits : [];

  const quoteOf = useMemo(() => Object.fromEntries((result?.quotes ?? []).map((q) => [q.symbol, q])), [result]);
  const rows = useMemo(() => {
    const list = watch.list.map((e) => {
      const q = quoteOf[e.symbol];
      return { ...e, quote: q ?? null, since: sinceAddedPct(e, q?.price) };
    });
    if (sort === 'change') return [...list].sort((a, b) => (b.quote?.changePct ?? -Infinity) - (a.quote?.changePct ?? -Infinity));
    if (sort === 'since') return [...list].sort((a, b) => (b.since ?? -Infinity) - (a.since ?? -Infinity));
    return list;
  }, [watch.list, quoteOf, sort]);

  const status = STATUS_META[failed && !result ? 'UNAVAILABLE' : failed ? 'STALE' : result?.dataStatus];
  const add = async (s) => {
    const priceKnown = quoteOf[s.symbol]?.price ?? null;
    watch.add(s.symbol, priceKnown);
    setQuery('');
    setHits([]);
  };

  // Watchlist summary stats
  const summary = useMemo(() => {
    const valid = rows.filter((r) => r.quote && Number.isFinite(r.quote.changePct));
    if (valid.length === 0) return { avgChange: 0, best: null, worst: null };
    const avgChange = valid.reduce((acc, r) => acc + r.quote.changePct, 0) / valid.length;
    const sorted = [...valid].sort((a, b) => b.quote.changePct - a.quote.changePct);
    return {
      avgChange,
      best: sorted[0],
      worst: sorted[sorted.length - 1],
    };
  }, [rows]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col" style={{ backgroundColor: '#0a0e17' }}>
      {/* Top Header & Search Bar */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.4)', backgroundColor: '#0d1117' }}
      >
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-emerald-400" />
          <h2 className="text-xs font-bold text-gray-200 uppercase tracking-wider mr-2">Institutional Watchlist</h2>
          <div className="flex items-center gap-1 rounded p-0.5" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
            {WATCH_KINDS.map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`px-3 py-1 text-xs rounded font-medium cursor-pointer transition-all ${
                  kind === k
                    ? 'bg-emerald-500/20 text-emerald-400 font-semibold'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {WATCH_LABELS[k]} ({watch.lists[k].length})
              </button>
            ))}
          </div>
        </div>

        {/* Search input with live autocomplete */}
        <div className="relative">
          <div
            className="flex items-center gap-2 px-2.5 py-1.5 rounded"
            style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}
          >
            <Search size={13} className="text-gray-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Add stock to ${WATCH_LABELS[kind]}…`}
              aria-label={`Add a stock to the ${WATCH_LABELS[kind]} watchlist`}
              className="w-56 text-xs text-gray-200 bg-transparent placeholder-gray-500 outline-none font-medium"
            />
          </div>
          {shownHits.length > 0 && (
            <div
              className="absolute z-30 mt-1 w-72 rounded-lg overflow-hidden shadow-2xl"
              style={{ backgroundColor: '#151d2b', border: '1px solid #1e2d3d' }}
            >
              {shownHits.map((s) => (
                <button
                  key={s.symbol}
                  onClick={() => add(s)}
                  disabled={watch.symbols.has(s.symbol)}
                  className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/5 disabled:opacity-40 cursor-pointer flex items-center justify-between"
                >
                  <div>
                    <span className="font-bold text-gray-200">{s.symbol}</span>
                    <span className="text-gray-500 ml-1.5">{s.name}</span>
                  </div>
                  {watch.symbols.has(s.symbol) && <span className="text-[10px] text-gray-500">Added</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sort Pills and Refresh */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 uppercase">Sort:</span>
          {[
            ['added', 'Added'],
            ['change', 'Day %'],
            ['since', 'Since Added'],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSort(id)}
              className={`px-2 py-0.5 text-xs rounded font-medium cursor-pointer transition-all ${
                sort === id ? 'bg-white/10 text-white font-semibold' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
          {status && (
            <span className="text-[10px] font-medium ml-2" style={{ color: status.color }}>
              {status.label}
            </span>
          )}
          <button
            onClick={reload}
            aria-label="Refresh quotes"
            className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/5 cursor-pointer ml-1"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Summary Metrics Strip */}
      {rows.length > 0 && (
        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 py-2 flex-shrink-0"
          style={{ backgroundColor: '#0a0e17', borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}
        >
          <div className="flex items-center justify-between px-3 py-1.5 rounded" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
            <span className="text-[10px] text-gray-500 uppercase">Tracking</span>
            <span className="text-xs font-mono font-bold text-gray-200">{rows.length} stocks</span>
          </div>
          <div className="flex items-center justify-between px-3 py-1.5 rounded" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
            <span className="text-[10px] text-gray-500 uppercase">Avg Day Move</span>
            <span className="text-xs font-mono font-bold" style={{ color: tone(summary.avgChange) }}>
              {signed(summary.avgChange)}
            </span>
          </div>
          <div className="flex items-center justify-between px-3 py-1.5 rounded" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
            <span className="text-[10px] text-gray-500 uppercase">Top Performer</span>
            <span className="text-xs font-mono font-bold text-emerald-400 truncate ml-2">
              {summary.best?.symbol ? `${summary.best.symbol} (${signed(summary.best.quote?.changePct)})` : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between px-3 py-1.5 rounded" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
            <span className="text-[10px] text-gray-500 uppercase">Bottom Performer</span>
            <span className="text-xs font-mono font-bold text-rose-400 truncate ml-2">
              {summary.worst?.symbol ? `${summary.worst.symbol} (${signed(summary.worst.quote?.changePct)})` : '—'}
            </span>
          </div>
        </div>
      )}

      {!watch.storageOk && (
        <p className="px-4 py-2 text-[11px]" style={{ color: RED }}>
          Browser storage is blocked, so this watchlist will be lost when you close the page.
        </p>
      )}

      {/* Table Content or Empty State */}
      {watch.list.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-xs text-gray-500">
          <Layers size={32} className="text-gray-600 mb-2 opacity-50" />
          <p className="font-medium text-gray-400 mb-1">Your {WATCH_LABELS[kind]} is empty</p>
          <p className="text-gray-600 max-w-sm">
            Search above to add symbols, or click the star beside any stock in Discovery, Ranked Board, or Daily Screener.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto min-h-0">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10" style={{ backgroundColor: '#0d1117' }}>
              <tr className="text-[10px] text-gray-500 uppercase tracking-wider" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.5)' }}>
                <th className="px-4 py-2 font-medium text-left">Stock</th>
                <th className="px-3 py-2 font-medium text-right">LTP (₹)</th>
                <th className="px-3 py-2 font-medium text-right">Day %</th>
                <th className="px-3 py-2 font-medium text-right">Since Added</th>
                <th className="px-3 py-2 font-medium text-right">Volume</th>
                <th className="px-3 py-2 font-medium text-right">Rel Vol</th>
                <th className="px-3 py-2 font-medium text-center">Day Range</th>
                <th className="px-3 py-2 font-medium text-right w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const q = r.quote;
                const rel = q && q.avgVolume > 0 ? q.volume / q.avgVolume : null;
                const hasRange = q && Number.isFinite(q.low) && Number.isFinite(q.high) && q.high > q.low;
                const rangePct = hasRange ? Math.min(100, Math.max(0, ((q.price - q.low) / (q.high - q.low)) * 100)) : 50;

                return (
                  <tr
                    key={r.symbol}
                    onClick={() => onOpen({ symbol: r.symbol, name: q?.name ?? r.symbol, sector: '' }, 'orderblock')}
                    className="cursor-pointer hover:bg-white/5 transition-colors"
                    style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}
                  >
                    <td className="px-4 py-2.5">
                      <div className="font-bold text-gray-200 hover:text-emerald-400 transition-colors">{r.symbol}</div>
                      <div className="text-[10px] text-gray-500">
                        {r.addedAt
                          ? `added ${new Date(r.addedAt).toLocaleString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}`
                          : 'added earlier'}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-200 font-semibold">
                      {q ? `₹${q.price.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold" style={{ color: tone(q?.changePct) }}>
                      {signed(q?.changePct)}
                    </td>
                    <td
                      className="px-3 py-2.5 text-right font-mono font-semibold"
                      style={{ color: tone(r.since) }}
                      title={
                        r.addedPrice
                          ? `Added at ₹${r.addedPrice.toFixed(2)}`
                          : 'No recorded price at addition time'
                      }
                    >
                      {signed(r.since)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-300">{vol(q?.volume)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {Number.isFinite(rel) ? (
                        <span className={rel >= 2 ? 'font-bold text-amber-400' : 'text-gray-300'}>
                          {rel.toFixed(1)}x
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>

                    {/* Day Range Visual Progress Bar */}
                    <td className="px-3 py-2.5 text-center min-w-[130px]">
                      {hasRange ? (
                        <div className="flex flex-col gap-0.5">
                          <div className="flex justify-between text-[8px] font-mono text-gray-500">
                            <span>₹{q.low.toFixed(1)}</span>
                            <span>₹{q.high.toFixed(1)}</span>
                          </div>
                          <div className="relative h-1 w-full bg-gray-800 rounded-full overflow-hidden">
                            <div
                              className="absolute top-0 bottom-0 left-0 rounded-full"
                              style={{
                                width: `${rangePct}%`,
                                backgroundColor: rangePct > 50 ? '#00e676' : '#ff1744',
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px] font-mono text-gray-600">—</span>
                      )}
                    </td>

                    {/* Action Controls */}
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          watch.move(r.symbol, other);
                        }}
                        className="px-2 py-0.5 mr-1 text-[10px] rounded font-medium bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 cursor-pointer"
                        title={`Move to ${WATCH_LABELS[other]}`}
                      >
                        → {WATCH_LABELS[other]}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          watch.remove(r.symbol);
                        }}
                        aria-label={`Remove ${r.symbol}`}
                        className="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 cursor-pointer inline-flex items-center"
                      >
                        <X size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer Info */}
      <div className="px-4 py-2.5 text-[10px] text-gray-600 flex-shrink-0" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.3)' }}>
        Prices from {result?.provider ?? 'Yahoo Finance'}
        {result?.asOf
          ? `, as of ${new Date(result.asOf).toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'Asia/Kolkata',
            })} IST`
          : ''}
        . &quot;Since Added&quot; tracks return from your recorded addition price. Saved locally in this browser.
      </div>
    </div>
  );
}
