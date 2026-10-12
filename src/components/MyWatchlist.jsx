import { useEffect, useMemo, useState } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { useWatchlist } from '../hooks/useWatchlist';
import { useQuotesBatch } from '../hooks/useQuotesBatch';
import { searchStocks } from '../services/api';
import { sinceAddedPct } from '../data/watchStore';
import { STATUS_META } from '../data/dataStatus';

const GREEN = '#00e676';
const RED = '#ff1744';
const tone = (n) => (!Number.isFinite(n) || n === 0 ? '#9ca3af' : n > 0 ? GREEN : RED);
const signed = (n) => (Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(2)}%` : '—');
const vol = (v) => (!Number.isFinite(v) ? '—' : v >= 1e7 ? `${(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(1)} L` : v.toLocaleString('en-IN'));

// Stocks you are following today. Shared with the stars on every list; saved in this browser.
export default function MyWatchlist({ onOpen }) {
  const watch = useWatchlist();
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
    return () => { cancelled = true; clearTimeout(timer); };
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

  return (
    <div className="flex-1 min-h-0 overflow-y-auto" style={{ backgroundColor: '#0a0e17' }}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-2" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mr-2">My Watchlist ({watch.list.length})</h2>
        <div className="relative">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Add any NSE stock" aria-label="Add a stock to the watchlist" className="w-56 px-2 py-1.5 text-xs rounded bg-transparent text-gray-200 border border-gray-700 focus:border-green-500 outline-none" />
          {shownHits.length > 0 && (
            <div className="absolute z-30 mt-1 w-72 rounded-md overflow-hidden" style={{ backgroundColor: '#151d2b', border: '1px solid #1e2d3d' }}>
              {shownHits.map((s) => (
                <button key={s.symbol} onClick={() => add(s)} disabled={watch.symbols.has(s.symbol)} className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-white/5 disabled:opacity-40 cursor-pointer">
                  <span className="font-medium">{s.symbol}</span> <span className="text-gray-500">{s.name}</span>{watch.symbols.has(s.symbol) && <span className="text-gray-600"> · already added</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1" />
        {[['added', 'Added order'], ['change', 'Day change'], ['since', 'Since added']].map(([id, label]) => (
          <button key={id} onClick={() => setSort(id)} className={`px-2 py-1 text-xs rounded cursor-pointer ${sort === id ? 'bg-green-500/15 text-green-400' : 'text-gray-500 hover:text-gray-300'}`}>{label}</button>
        ))}
        {status && <span className="text-[10px]" style={{ color: status.color }}>{status.label}</span>}
        <button onClick={reload} aria-label="Refresh quotes" className="p-1.5 rounded text-gray-500 hover:text-gray-200 hover:bg-white/5 cursor-pointer"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      {!watch.storageOk && <p className="px-4 py-2 text-[11px]" style={{ color: RED }}>Browser storage is blocked, so this watchlist will be lost when you close the page.</p>}

      {watch.list.length === 0 ? (
        <p className="px-4 py-8 text-xs text-gray-500">Nothing here yet. Search above, or click the star beside any stock in Stock Lists or the Scanner.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] text-gray-600 uppercase tracking-wider">
                <th className="px-4 py-1.5 font-normal text-left">Stock</th>
                {['Price', 'Day', 'Since added', 'Volume', 'Rel vol', 'Day range', ''].map((h) => <th key={h} className="px-3 py-1.5 font-normal text-right">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const q = r.quote;
                const rel = q && q.avgVolume > 0 ? q.volume / q.avgVolume : null;
                return (
                  <tr key={r.symbol} onClick={() => onOpen({ symbol: r.symbol, name: q?.name ?? r.symbol, sector: '' }, 'orderblock')} className="cursor-pointer hover:bg-white/5" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}>
                    <td className="px-4 py-2"><div className="font-medium text-gray-200">{r.symbol}</div><div className="text-[10px] text-gray-600">{r.addedAt ? `added ${new Date(r.addedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'added earlier'}</div></td>
                    <td className="px-3 py-2 text-right font-mono text-gray-300">{q ? `₹${q.price.toFixed(2)}` : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: tone(q?.changePct) }}>{signed(q?.changePct)}</td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: tone(r.since) }} title={r.addedPrice ? `Price when added: ₹${r.addedPrice.toFixed(2)}` : 'No price was recorded when this was added'}>{signed(r.since)}</td>
                    <td className="px-3 py-2 text-right font-mono text-gray-300">{vol(q?.volume)}</td>
                    <td className="px-3 py-2 text-right font-mono text-gray-300">{Number.isFinite(rel) ? `${rel.toFixed(1)}x` : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono text-gray-500">{q && Number.isFinite(q.low) && Number.isFinite(q.high) ? `${q.low.toFixed(2)} – ${q.high.toFixed(2)}` : '—'}</td>
                    <td className="px-3 py-2 text-right"><button onClick={(e) => { e.stopPropagation(); watch.remove(r.symbol); }} aria-label={`Remove ${r.symbol}`} className="p-1 text-gray-600 hover:text-red-400 cursor-pointer"><X size={13} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="px-4 py-3 text-[10px] text-gray-600">
        Prices from {result?.provider ?? 'Yahoo Finance'}{result?.asOf ? `, as of ${new Date(result.asOf).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST` : ''}, refreshed every minute while this page is open.
        &quot;Since added&quot; compares with the price recorded when you added the stock (blank if none was known). The watchlist is saved in this browser only.
      </p>
    </div>
  );
}
