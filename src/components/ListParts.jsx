import { Star, RefreshCw } from 'lucide-react';

// Table building blocks shared by Stock Lists and the Dashboard's discovery tabs.

export function Panel({ title, hint, count, children }) {
  return (
    <section className="rounded-md overflow-hidden" style={{ border: '1px solid rgba(30, 45, 61, 0.5)', backgroundColor: 'rgba(17, 24, 39, 0.4)' }}>
      <div className="flex items-baseline justify-between px-3 py-2" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <h3 className="text-xs font-semibold text-gray-300">{title} {count !== undefined && <span className="text-gray-600 font-normal">({count})</span>}</h3>
        {hint && <span className="text-[10px] text-gray-600">{hint}</span>}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

export function Empty({ children }) {
  return <p className="px-3 py-4 text-xs text-gray-600">{children}</p>;
}

export function Star2({ symbol, price, watch }) {
  const on = watch.symbols.has(symbol);
  return (
    <button onClick={(e) => { e.stopPropagation(); watch.toggle(symbol, price); }} aria-label={on ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`} className="cursor-pointer p-1">
      <Star size={13} fill={on ? '#ffd600' : 'none'} color={on ? '#ffd600' : '#64748b'} />
    </button>
  );
}

export function Row({ r, watch, onOpen, target, cols }) {
  return (
    <tr onClick={() => onOpen({ symbol: r.symbol, name: r.name, sector: r.sector ?? '' }, target)} className="cursor-pointer hover:bg-white/5" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}>
      <td className="pl-2 w-8"><Star2 symbol={r.symbol} price={r.price} watch={watch} /></td>
      <td className="px-2 py-1.5" title={r.indices ? r.indices.join(', ') : undefined}><div className="font-medium text-gray-200 text-xs">{r.symbol}</div><div className="text-[10px] text-gray-600 truncate max-w-[10rem]">{r.name}</div>{r.indices && r.indices.length > 0 && <div className="text-[9px] text-gray-700 truncate max-w-[10rem]">{r.indices.slice(0, 2).join(' · ')}{r.indices.length > 2 ? ` +${r.indices.length - 2}` : ''}</div>}</td>
      {cols.map((c, i) => <td key={i} className="px-2 py-1.5 text-right font-mono text-xs" style={{ color: c.color }}>{c.text}</td>)}
    </tr>
  );
}

export function Table({ head, children }) {
  return (
    <table className="w-full">
      <thead>
        <tr className="text-[10px] text-gray-600 uppercase tracking-wider">
          <th className="w-8" /><th className="px-2 py-1 font-normal text-left">Stock</th>
          {head.map((h) => <th key={h} className="px-2 py-1 font-normal text-right">{h}</th>)}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

export function Progress({ loading, done, total, excluded, loadedAt, reload, truncated, limit, universe }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2 text-[11px] text-gray-500" aria-live="polite">
      <span>
        {loading ? `Loading candles… ${done} of ${total}` : `${total - excluded.length} of ${total} stocks scanned`}
        {!loading && excluded.length > 0 && ` · ${excluded.length} not covered (${[...new Set(excluded.map((e) => e.reason))].join(', ')})`}
        {truncated && ` · this index has ${universe} stocks; only the first ${limit} are scanned`}
      </span>
      <span className="flex items-center gap-2">
        {loadedAt && <span>Loaded {new Date(loadedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
        <button onClick={reload} disabled={loading} aria-label="Reload scan" className="p-1 rounded text-gray-500 hover:text-gray-200 cursor-pointer"><RefreshCw size={12} className={loading ? 'animate-spin' : ''} /></button>
      </span>
    </div>
  );
}
