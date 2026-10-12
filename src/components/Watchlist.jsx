import { useState, useMemo, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, ArrowUpDown } from 'lucide-react';
import { NIFTY_STOCKS, generateCandlestickData, getMarketMetrics } from '../data/stockData';
import { fetchNifty50 } from '../services/api';
import { STATUS_META } from '../data/dataStatus';
import { UnavailableState } from './DataStatusBadge';

const REFRESH_MS = 60000;
const SECTORS = Object.fromEntries(NIFTY_STOCKS.map((s) => [s.symbol, s.sector]));

function quoteToMetrics(q) {
  return {
    price: q.price.toFixed(2),
    changePct: (q.changePct ?? 0).toFixed(2),
    isPositive: (q.change ?? 0) >= 0,
    volume: q.volume ?? 0,
  };
}

// Real Nifty 50 quotes from the backend, or generated data only when demo mode is explicitly on.
function useWatchlistData(demoMode) {
  const [state, setState] = useState({ stocks: [], status: null, failed: false, loaded: false });

  const load = useCallback(async () => {
    const result = await fetchNifty50();
    setState((prev) => {
      if (!result) return { ...prev, failed: true, loaded: true };
      const stocks = result.quotes.map((q) => ({
        symbol: q.symbol,
        name: q.name,
        sector: SECTORS[q.symbol] || '',
        metrics: quoteToMetrics(q),
      }));
      return { stocks, status: result.dataStatus, failed: false, loaded: true };
    });
  }, []);

  useEffect(() => {
    if (demoMode) return;
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => clearInterval(interval);
  }, [demoMode, load]);

  const demoStocks = useMemo(() => {
    if (!demoMode) return [];
    return NIFTY_STOCKS.map((stock) => ({
      ...stock,
      metrics: getMarketMetrics(generateCandlestickData(stock.symbol, 30)),
    }));
  }, [demoMode]);

  if (demoMode) return { stocks: demoStocks, status: 'SIMULATED', failed: false, loaded: true, retry: load };
  return { ...state, retry: load };
}

export default function Watchlist({ onSelectStock, selectedStock, demoMode = false }) {
  const [sortBy, setSortBy] = useState('symbol');
  const [sortDir, setSortDir] = useState('asc');
  const [filter, setFilter] = useState('all');

  const { stocks: stocksWithMetrics, status, failed, loaded, retry } = useWatchlistData(demoMode);

  const filtered = useMemo(() => {
    let list = [...stocksWithMetrics];
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
  }, [stocksWithMetrics, sortBy, sortDir, filter]);

  const toggleSort = (field) => {
    if (sortBy === field) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortDir('asc'); }
  };

  const filters = ['all', 'gainers', 'losers'];

  if (stocksWithMetrics.length === 0) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: '#0d1117' }}>
        <UnavailableState status={failed ? 'UNAVAILABLE' : null} loading={!loaded} onRetry={retry} />
      </div>
    );
  }

  const statusMeta = failed ? STATUS_META.STALE : STATUS_META[status];

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: '#0d1117' }}>
      {/* Filters */}
      <div className="flex items-center gap-1 px-3 py-2" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2 py-1 text-xs rounded capitalize cursor-pointer transition-all ${
              filter === f ? 'bg-green-500/15 text-green-400' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {f}
          </button>
        ))}
        {statusMeta && (
          <span className="ml-auto text-[10px]" style={{ color: statusMeta.color }} title={statusMeta.description}>
            {statusMeta.label}
          </span>
        )}
      </div>

      {/* Header */}
      <div className="grid grid-cols-4 px-3 py-1.5 text-[10px] text-gray-600 uppercase tracking-wider"
        style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.2)' }}>
        <button onClick={() => toggleSort('symbol')} className="text-left flex items-center gap-1 cursor-pointer">
          Stock <ArrowUpDown size={8} />
        </button>
        <button onClick={() => toggleSort('price')} className="text-right flex items-center justify-end gap-1 cursor-pointer">
          Price <ArrowUpDown size={8} />
        </button>
        <button onClick={() => toggleSort('change')} className="text-right flex items-center justify-end gap-1 cursor-pointer">
          Change <ArrowUpDown size={8} />
        </button>
        <div className="text-right">Volume</div>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map((stock) => {
          const m = stock.metrics;
          const isSelected = selectedStock?.symbol === stock.symbol;
          return (
            <button
              key={stock.symbol}
              onClick={() => onSelectStock(stock)}
              className={`w-full grid grid-cols-4 px-3 py-2 text-left transition-all cursor-pointer ${
                isSelected ? 'bg-green-500/8' : 'hover:bg-white/3'
              }`}
              style={{
                borderBottom: '1px solid rgba(30, 45, 61, 0.15)',
                borderLeft: isSelected ? '2px solid #00e676' : '2px solid transparent',
              }}
            >
              <div>
                <div className="text-xs font-medium text-gray-200">{stock.symbol}</div>
                <div className="text-[10px] text-gray-600">{stock.sector}</div>
              </div>
              <div className="text-right text-xs font-mono text-gray-300">₹{m.price}</div>
              <div className="text-right flex items-center justify-end gap-1">
                {m.isPositive ? (
                  <TrendingUp size={10} className="text-green-400" />
                ) : (
                  <TrendingDown size={10} className="text-red-400" />
                )}
                <span
                  className="text-xs font-mono"
                  style={{ color: m.isPositive ? '#00e676' : '#ff1744' }}
                >
                  {m.isPositive ? '+' : ''}{m.changePct}%
                </span>
              </div>
              <div className="text-right text-[10px] text-gray-500 font-mono">
                {m.volume >= 100000 ? `${(m.volume / 100000).toFixed(1)}L` : `${(m.volume / 1000).toFixed(0)}K`}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
