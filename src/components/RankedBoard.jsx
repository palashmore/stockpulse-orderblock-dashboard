import { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Layers, Zap, ArrowUpDown, ChevronRight, BarChart2 } from 'lucide-react';
import { rankStocks, zoneLevels, MIN_SCORE } from '../data/ranking';
import { NIFTY_STOCKS } from '../data/stockData';
import { STATUS_META } from '../data/dataStatus';
import { UnavailableState } from './DataStatusBadge';

const fmt = (n) => (n === null || n === undefined ? '—' : `₹${n.toFixed(2)}`);
const SECTORS = Object.fromEntries(NIFTY_STOCKS.map((s) => [s.symbol, s.sector]));

function ZoneCard({ symbol, price, candleData, orderBlocks }) {
  const levels = useMemo(() => zoneLevels(candleData, orderBlocks, price), [candleData, orderBlocks, price]);
  if (!levels) return null;

  const zone = (z) => (z ? `${fmt(z.low)} – ${fmt(z.high)}` : '—');

  // Calculate price position percentage between support and resistance if both exist
  let pricePct = 50;
  if (levels.support && levels.resistance && levels.resistance > levels.support) {
    pricePct = Math.min(100, Math.max(0, ((price - levels.support) / (levels.resistance - levels.support)) * 100));
  }

  const rows = [
    { label: 'Resistance (20D High)', value: fmt(levels.resistance), color: '#ff1744' },
    { label: 'Supply Block', value: zone(levels.supplyZone), color: '#ff9100' },
    { label: 'Demand Block', value: zone(levels.demandZone), color: '#00b0ff' },
    { label: 'Support (20D Low)', value: fmt(levels.support), color: '#00e676' },
  ];

  return (
    <div
      className="mx-3 my-2 rounded-lg p-3"
      style={{
        border: '1px solid rgba(30, 45, 61, 0.6)',
        backgroundColor: '#111827',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Layers size={13} className="text-cyan-400" />
          <span className="text-xs font-bold text-gray-200 tracking-wide">{symbol} Price Zones</span>
        </div>
        <span className="text-xs font-mono font-semibold text-emerald-400">{fmt(price)}</span>
      </div>

      {/* Visual Range Position Gauge */}
      {levels.support && levels.resistance && levels.resistance > levels.support && (
        <div className="mb-3 px-1">
          <div className="flex justify-between text-[9px] font-mono text-gray-500 mb-1">
            <span style={{ color: '#00e676' }}>Sup {fmt(levels.support)}</span>
            <span className="text-gray-400 font-medium">LTP {fmt(price)}</span>
            <span style={{ color: '#ff1744' }}>Res {fmt(levels.resistance)}</span>
          </div>
          <div className="relative h-1.5 w-full rounded-full bg-gray-800 overflow-hidden">
            <div
              className="absolute top-0 bottom-0 left-0 rounded-full"
              style={{
                width: `${pricePct}%`,
                background: 'linear-gradient(90deg, #00e676 0%, #ffd600 50%, #ff1744 100%)',
              }}
            />
          </div>
        </div>
      )}

      {/* S/R & Block Rows */}
      <div className="space-y-1">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between py-0.5 px-1.5 rounded"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.02)' }}
          >
            <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: r.color }}>
              {r.label}
            </span>
            <span className="text-xs font-mono text-gray-300">{r.value}</span>
          </div>
        ))}
      </div>
      <p className="text-[9px] text-gray-500 mt-2 leading-relaxed">
        Resistance/Support = 20-day high/low extremes. Demand/Supply = nearest unmitigated institutional order blocks.
      </p>
    </div>
  );
}

function StockRow({ stock, index, isBull, selectedSymbol, onSelect }) {
  const selected = stock.symbol === selectedSymbol;
  const color = isBull ? '#00e676' : '#ff1744';

  return (
    <button
      onClick={() => onSelect({ symbol: stock.symbol, name: stock.name, sector: SECTORS[stock.symbol] || '' })}
      className={`w-full flex items-center justify-between px-3 py-2 text-left cursor-pointer transition-all ${
        selected ? 'bg-white/5' : 'hover:bg-white/3'
      }`}
      style={{
        borderLeft: selected ? `3px solid ${color}` : '3px solid transparent',
        borderBottom: '1px solid rgba(30, 45, 61, 0.2)',
      }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-[10px] font-mono text-gray-500 w-4 text-right flex-shrink-0">
          {String(index + 1).padStart(2, '0')}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-gray-200 truncate">{stock.symbol}</span>
            {stock.relVolume !== null && stock.relVolume >= 2.0 && (
              <span
                className="text-[9px] px-1 py-0.2 rounded font-mono font-semibold"
                style={{ backgroundColor: 'rgba(0, 229, 255, 0.15)', color: '#00e5ff' }}
                title="Relative volume >= 2x 3-month average"
              >
                {stock.relVolume.toFixed(1)}x
              </span>
            )}
          </div>
          <span className="text-[10px] text-gray-500 truncate block">
            {SECTORS[stock.symbol] || stock.name}
            {stock.relVolume !== null && stock.relVolume < 2.0 && (
              <span className="ml-1 text-gray-600">· {stock.relVolume.toFixed(1)}x vol</span>
            )}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        {/* Strength Meter Bar */}
        <div className="hidden sm:flex flex-col items-end gap-0.5">
          <div className="flex items-center gap-1">
            <div className="h-1 rounded-full bg-gray-800" style={{ width: '40px' }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(100, Math.max(10, stock.strength))}%`, backgroundColor: color }}
              />
            </div>
            <span className="text-[10px] font-mono text-gray-400 w-5 text-right">{stock.strength}</span>
          </div>
          <span className="text-[8px] text-gray-600 uppercase">Strength</span>
        </div>

        {/* Change % */}
        <div className="text-right w-16">
          <span className="text-xs font-mono font-semibold block" style={{ color }}>
            {stock.changePct >= 0 ? '+' : ''}{stock.changePct.toFixed(2)}%
          </span>
          <span className="text-[9px] font-mono text-gray-500 block">
            ₹{stock.price ? stock.price.toFixed(1) : '—'}
          </span>
        </div>
      </div>
    </button>
  );
}

export default function RankedBoard({ nifty, selectedStock, onSelectStock, candleData, orderBlocks }) {
  const { quotes, status, failed, loaded, retry } = nifty;
  const ranking = useMemo(() => rankStocks(quotes), [quotes]);
  const [filterMode, setFilterMode] = useState('ALL'); // 'ALL', 'BULL', 'BEAR'
  const [sortBy, setSortBy] = useState('strength'); // 'strength', 'change', 'volume'

  if (quotes.length === 0) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: '#0d1117' }}>
        <UnavailableState status={failed ? 'UNAVAILABLE' : null} loading={!loaded} onRetry={retry} />
      </div>
    );
  }

  const statusMeta = failed ? STATUS_META.STALE : STATUS_META[status];
  const selectedQuote = quotes.find((q) => q.symbol === selectedStock?.symbol);
  const { counts } = ranking;

  // Sorter
  const sortList = (list) => {
    return [...list].sort((a, b) => {
      if (sortBy === 'change') return Math.abs(b.changePct) - Math.abs(a.changePct);
      if (sortBy === 'volume') return (b.relVolume ?? 0) - (a.relVolume ?? 0);
      return b.strength - a.strength;
    });
  };

  const sortedBullish = sortList(ranking.bullish);
  const sortedBearish = sortList(ranking.bearish);

  // Market Breadth Ratio
  const totalRanked = counts.bullish + counts.bearish + counts.choppy;
  const bullPct = totalRanked > 0 ? (counts.bullish / totalRanked) * 100 : 50;
  const bearPct = totalRanked > 0 ? (counts.bearish / totalRanked) * 100 : 50;

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ backgroundColor: '#0d1117' }}>
      {/* Header Status & Breadth */}
      <div
        className="px-3 py-2.5 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.4)', backgroundColor: '#0a0e17' }}
      >
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <BarChart2 size={13} className="text-emerald-400" />
            <h2 className="text-xs font-bold text-gray-300 uppercase tracking-wider">Momentum Rank</h2>
          </div>
          {statusMeta && (
            <span className="text-[10px] font-medium" style={{ color: statusMeta.color }} title={statusMeta.description}>
              {statusMeta.label}
            </span>
          )}
        </div>

        {/* Visual Breadth Bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] font-mono">
            <span style={{ color: '#00e676' }}>{counts.bullish} Bullish</span>
            <span className="text-gray-500">{counts.choppy} Choppy</span>
            <span style={{ color: '#ff1744' }}>{counts.bearish} Bearish</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-gray-800 flex overflow-hidden">
            <div style={{ width: `${bullPct}%`, backgroundColor: '#00e676' }} />
            <div style={{ width: `${100 - bullPct - bearPct}%`, backgroundColor: '#334155' }} />
            <div style={{ width: `${bearPct}%`, backgroundColor: '#ff1744' }} />
          </div>
        </div>
      </div>

      {/* Selected Stock Zone Breakdown */}
      {selectedQuote && Number.isFinite(selectedQuote.price) && candleData && candleData.length > 0 && (
        <ZoneCard
          symbol={selectedQuote.symbol}
          price={selectedQuote.price}
          candleData={candleData}
          orderBlocks={orderBlocks}
        />
      )}

      {/* Filter and Sort Pills */}
      <div
        className="flex items-center justify-between px-3 py-1.5 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)', backgroundColor: '#111827' }}
      >
        <div className="flex items-center gap-1">
          {[
            ['ALL', 'All'],
            ['BULL', `Bull (${counts.bullish})`],
            ['BEAR', `Bear (${counts.bearish})`],
          ].map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setFilterMode(mode)}
              className={`px-2 py-0.5 text-[10px] rounded font-medium cursor-pointer transition-all ${
                filterMode === mode ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[9px] text-gray-500 uppercase">Sort:</span>
          {[
            ['strength', 'Score'],
            ['change', '% Move'],
            ['volume', 'Vol'],
          ].map(([sKey, sLabel]) => (
            <button
              key={sKey}
              onClick={() => setSortBy(sKey)}
              className={`px-1.5 py-0.5 text-[9px] rounded font-mono cursor-pointer ${
                sortBy === sKey ? 'bg-emerald-500/15 text-emerald-400 font-semibold' : 'text-gray-500 hover:text-gray-400'
              }`}
            >
              {sLabel}
            </button>
          ))}
        </div>
      </div>

      {/* List Sections */}
      <div className="flex-1 overflow-y-auto">
        {(filterMode === 'ALL' || filterMode === 'BULL') && (
          <div className="mb-2">
            <div
              className="flex items-center justify-between px-3 py-1.5"
              style={{ backgroundColor: 'rgba(0, 230, 118, 0.05)', borderBottom: '1px solid rgba(0, 230, 118, 0.15)' }}
            >
              <div className="flex items-center gap-1.5">
                <TrendingUp size={12} style={{ color: '#00e676' }} />
                <span className="text-xs font-bold" style={{ color: '#00e676' }}>
                  Bullish Momentum ({sortedBullish.length})
                </span>
              </div>
            </div>
            {sortedBullish.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-gray-500">No stocks currently meet bullish momentum criteria</p>
            ) : (
              sortedBullish.map((s, idx) => (
                <StockRow
                  key={s.symbol}
                  stock={s}
                  index={idx}
                  isBull={true}
                  selectedSymbol={selectedStock?.symbol}
                  onSelect={onSelectStock}
                />
              ))
            )}
          </div>
        )}

        {(filterMode === 'ALL' || filterMode === 'BEAR') && (
          <div className="mb-2">
            <div
              className="flex items-center justify-between px-3 py-1.5"
              style={{ backgroundColor: 'rgba(255, 23, 68, 0.05)', borderBottom: '1px solid rgba(255, 23, 68, 0.15)' }}
            >
              <div className="flex items-center gap-1.5">
                <TrendingDown size={12} style={{ color: '#ff1744' }} />
                <span className="text-xs font-bold" style={{ color: '#ff1744' }}>
                  Bearish Momentum ({sortedBearish.length})
                </span>
              </div>
            </div>
            {sortedBearish.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-gray-500">No stocks currently meet bearish momentum criteria</p>
            ) : (
              sortedBearish.map((s, idx) => (
                <StockRow
                  key={s.symbol}
                  stock={s}
                  index={idx}
                  isBull={false}
                  selectedSymbol={selectedStock?.symbol}
                  onSelect={onSelectStock}
                />
              ))
            )}
          </div>
        )}
      </div>

      <div className="px-3 py-2 text-[9px] text-gray-500 flex-shrink-0" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.3)' }}>
        Strength = today&apos;s % move and position in day range (below {MIN_SCORE} is classified as choppy).
        Descriptive institutional ranking across Nifty 50 constituents.
      </div>
    </div>
  );
}
