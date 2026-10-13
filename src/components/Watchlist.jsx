import { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, ArrowUpDown, Search, Filter } from 'lucide-react';
import { NIFTY_STOCKS } from '../data/stockData';
import { STATUS_META } from '../data/dataStatus';
import { UnavailableState } from './DataStatusBadge';

const SECTORS = Object.fromEntries(NIFTY_STOCKS.map((s) => [s.symbol, s.sector]));

function quoteToStock(q) {
  return {
    symbol: q.symbol,
    name: q.name,
    sector: SECTORS[q.symbol] || '',
    metrics: {
      price: q.price.toFixed(2),
      changePct: (q.changePct ?? 0).toFixed(2),
      isPositive: (q.change ?? 0) >= 0,
      volume: q.volume ?? 0,
    },
  };
}

export default function Watchlist({ onSelectStock, selectedStock, nifty }) {
  const [sortBy, setSortBy] = useState('symbol');
  const [sortDir, setSortDir] = useState('asc');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const { quotes, status, failed, loaded, retry } = nifty;
  const stocksWithMetrics = useMemo(
    () => quotes.filter((q) => Number.isFinite(q.price)).map(quoteToStock),
    [quotes]
  );

  const counts = useMemo(() => {
    let gainers = 0;
    let losers = 0;
    for (const s of stocksWithMetrics) {
      if (s.metrics.isPositive) gainers++;
      else losers++;
    }
    return { all: stocksWithMetrics.length, gainers, losers };
  }, [stocksWithMetrics]);

  const filtered = useMemo(() => {
    let list = [...stocksWithMetrics];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || s.sector.toLowerCase().includes(q));
    }

    if (filter === 'gainers') list = list.filter((s) => s.metrics.isPositive);
    if (filter === 'losers') list = list.filter((s) => !s.metrics.isPositive);

    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'symbol') cmp = a.symbol.localeCompare(b.symbol);
      else if (sortBy === 'change') cmp = parseFloat(a.metrics.changePct) - parseFloat(b.metrics.changePct);
      else if (sortBy === 'price') cmp = parseFloat(a.metrics.price) - parseFloat(b.metrics.price);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [stocksWithMetrics, sortBy, sortDir, filter, search]);

  const toggleSort = (field) => {
    if (sortBy === field) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setSortBy(field);
      setSortDir('asc');
    }
  };

  if (stocksWithMetrics.length === 0) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: '#0d1117' }}>
        <UnavailableState status={failed ? 'UNAVAILABLE' : null} loading={!loaded} onRetry={retry} />
      </div>
    );
  }

  const statusMeta = failed ? STATUS_META.STALE : STATUS_META[status];

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ backgroundColor: '#0d1117' }}>
      {/* Top Filter and Status Strip */}
      <div
        className="px-3 py-2 flex flex-col gap-1.5 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.4)', backgroundColor: '#0a0e17' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {[
              ['all', `All (${counts.all})`],
              ['gainers', `Gainers (${counts.gainers})`],
              ['losers', `Losers (${counts.losers})`],
            ].map(([f, label]) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2 py-0.5 text-[10px] font-medium rounded capitalize cursor-pointer transition-all ${
                  filter === f
                    ? 'bg-emerald-500/15 text-emerald-400 font-semibold'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {statusMeta && (
            <span className="text-[10px] font-medium" style={{ color: statusMeta.color }} title={statusMeta.description}>
              {statusMeta.label}
            </span>
          )}
        </div>

        {/* Quick Search */}
        <div className="relative">
          <Search size={11} className="absolute left-2 top-2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter stocks..."
            className="w-full pl-6 pr-2 py-1 text-xs text-gray-200 bg-transparent placeholder-gray-500 rounded border border-gray-800 focus:border-green-500 outline-none"
            style={{ backgroundColor: '#111827' }}
          />
        </div>
      </div>

      {/* Table Header */}
      <div
        className="grid grid-cols-4 px-3 py-1.5 text-[10px] text-gray-500 uppercase tracking-wider flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)', backgroundColor: '#0d1117' }}
      >
        <button onClick={() => toggleSort('symbol')} className="text-left flex items-center gap-1 cursor-pointer hover:text-gray-300">
          Stock <ArrowUpDown size={8} />
        </button>
        <button onClick={() => toggleSort('price')} className="text-right flex items-center justify-end gap-1 cursor-pointer hover:text-gray-300">
          Price <ArrowUpDown size={8} />
        </button>
        <button onClick={() => toggleSort('change')} className="text-right flex items-center justify-end gap-1 cursor-pointer hover:text-gray-300">
          Change <ArrowUpDown size={8} />
        </button>
        <div className="text-right">Volume</div>
      </div>

      {/* Rows List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map((stock) => {
          const m = stock.metrics;
          const isSelected = selectedStock?.symbol === stock.symbol;
          return (
            <button
              key={stock.symbol}
              onClick={() => onSelectStock(stock)}
              className={`w-full grid grid-cols-4 px-3 py-2 text-left transition-all cursor-pointer ${
                isSelected ? 'bg-white/5' : 'hover:bg-white/3'
              }`}
              style={{
                borderBottom: '1px solid rgba(30, 45, 61, 0.15)',
                borderLeft: isSelected ? '3px solid #00e676' : '3px solid transparent',
              }}
            >
              <div>
                <div className="text-xs font-bold text-gray-200">{stock.symbol}</div>
                <div className="text-[10px] text-gray-500 truncate">{stock.sector}</div>
              </div>
              <div className="text-right text-xs font-mono text-gray-200 font-medium self-center">₹{m.price}</div>
              <div className="text-right flex items-center justify-end gap-1 self-center">
                {m.isPositive ? (
                  <TrendingUp size={10} style={{ color: '#00e676' }} />
                ) : (
                  <TrendingDown size={10} style={{ color: '#ff1744' }} />
                )}
                <span
                  className="text-xs font-mono font-semibold"
                  style={{ color: m.isPositive ? '#00e676' : '#ff1744' }}
                >
                  {m.isPositive ? '+' : ''}{m.changePct}%
                </span>
              </div>
              <div className="text-right text-[10px] text-gray-400 font-mono self-center">
                {m.volume >= 10000000
                  ? `${(m.volume / 10000000).toFixed(1)}Cr`
                  : m.volume >= 100000
                  ? `${(m.volume / 100000).toFixed(1)}L`
                  : `${(m.volume / 1000).toFixed(0)}K`}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
