import { useMemo } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
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
  const rows = [
    { label: 'Resistance', value: fmt(levels.resistance), color: '#ff1744' },
    { label: 'Supply block', value: zone(levels.supplyZone), color: '#ff9100' },
    { label: 'Demand block', value: zone(levels.demandZone), color: '#00b0ff' },
    { label: 'Support', value: fmt(levels.support), color: '#00e676' },
  ];

  return (
    <div className="mx-2 mt-2 rounded-md px-3 py-2" style={{ border: '1px solid rgba(30, 45, 61, 0.5)', backgroundColor: 'rgba(17, 24, 39, 0.5)' }}>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-xs font-semibold text-gray-200">{symbol}</span>
        <span className="text-xs font-mono text-gray-300">{fmt(price)}</span>
      </div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between py-0.5">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: r.color }}>{r.label}</span>
          <span className="text-xs font-mono text-gray-300">{r.value}</span>
        </div>
      ))}
      <p className="text-[9px] text-gray-600 mt-1">
        Resistance/support: 20-day high/low. Blocks: nearest unmitigated, daily candles.
      </p>
    </div>
  );
}

function BoardSection({ title, icon: Icon, color, rows, selectedSymbol, onSelect }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 px-3 py-1.5">
        <Icon size={12} style={{ color }} />
        <span className="text-xs font-medium" style={{ color }}>{title}</span>
      </div>
      {rows.length === 0 && <p className="px-3 pb-2 text-[11px] text-gray-600">None right now</p>}
      {rows.map((s, i) => {
        const selected = s.symbol === selectedSymbol;
        return (
          <button
            key={s.symbol}
            onClick={() => onSelect({ symbol: s.symbol, name: s.name, sector: SECTORS[s.symbol] || '' })}
            className={`w-full grid grid-cols-[1.5rem_1fr_auto_2.5rem] items-center gap-2 px-3 py-1.5 text-left cursor-pointer ${
              selected ? 'bg-white/5' : 'hover:bg-white/3'
            }`}
            style={{ borderLeft: selected ? `2px solid ${color}` : '2px solid transparent' }}
          >
            <span className="text-[10px] font-mono text-gray-600">{String(i + 1).padStart(2, '0')}</span>
            <span className="min-w-0">
              <span className="block text-xs font-medium text-gray-200 truncate">{s.symbol}</span>
              {s.relVolume !== null && (
                <span className="block text-[9px] text-gray-600">{s.relVolume.toFixed(1)}x vol vs 3M avg</span>
              )}
            </span>
            <span className="text-xs font-mono" style={{ color }}>
              {s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(2)}%
            </span>
            <span className="text-right text-[10px] font-mono text-gray-400" title="Strength score (0-100)">{s.strength}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function RankedBoard({ nifty, selectedStock, onSelectStock, candleData, orderBlocks }) {
  const { quotes, status, failed, loaded, retry } = nifty;
  const ranking = useMemo(() => rankStocks(quotes), [quotes]);

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

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ backgroundColor: '#0d1117' }}>
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <span className="text-[11px] text-gray-500">
          <span className="text-green-400">{counts.bullish} bullish</span>
          {' · '}
          <span className="text-red-400">{counts.bearish} bearish</span>
          {' · '}
          {counts.choppy} choppy
        </span>
        {statusMeta && (
          <span className="text-[10px]" style={{ color: statusMeta.color }} title={statusMeta.description}>
            {statusMeta.label}
          </span>
        )}
      </div>

      {selectedQuote && Number.isFinite(selectedQuote.price) && candleData.length > 0 && (
        <ZoneCard symbol={selectedQuote.symbol} price={selectedQuote.price} candleData={candleData} orderBlocks={orderBlocks} />
      )}

      <BoardSection title="Bullish" icon={TrendingUp} color="#00e676" rows={ranking.bullish}
        selectedSymbol={selectedStock?.symbol} onSelect={onSelectStock} />
      <BoardSection title="Bearish" icon={TrendingDown} color="#ff1744" rows={ranking.bearish}
        selectedSymbol={selectedStock?.symbol} onSelect={onSelectStock} />

      <p className="px-3 py-3 text-[9px] text-gray-600">
        Strength = today&apos;s % move and where price sits in the day&apos;s range (score below {MIN_SCORE} is choppy and hidden).
        Descriptive ranking of Nifty 50 stocks, not a prediction or advice.
      </p>
    </div>
  );
}
