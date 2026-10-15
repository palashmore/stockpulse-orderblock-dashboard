import { useMemo } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useIndexLevels } from '../../hooks/useIndexLevels';

const GREEN = '#00e676';
const RED = '#ff1744';

const BENCHMARKS = [
  { id: 'nifty50', label: 'NIFTY 50' },
  { id: 'bse_sensex', label: 'SENSEX' },
  { id: 'bank', label: 'NIFTY BANK' },
  { id: 'midcap100', label: 'NIFTY MIDCAP 100' },
  { id: 'smallcap100', label: 'NIFTY SMALLCAP 100' },
  { id: 'indiavix', label: 'INDIA VIX' },
];

export default function MarketTickerStrip({ demoMode = false }) {
  const { levels } = useIndexLevels(!demoMode);

  // Every figure is live; an index with no feed shows a dash rather than an invented level
  const items = useMemo(() => BENCHMARKS.map((b) => {
    const live = levels?.indices?.[b.id];
    const ok = live && Number.isFinite(live.last);
    return { id: b.id, label: b.label, last: ok ? live.last : null, change: ok ? live.change ?? null : null, changePct: ok ? live.changePct ?? null : null, isUp: (live?.change ?? 0) >= 0 };
  }), [levels]);

  return (
    <div className="hidden lg:flex items-center gap-3 overflow-x-auto no-scrollbar py-0.5 px-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/[0.03] border border-white/5 whitespace-nowrap text-xs font-mono transition-colors hover:bg-white/[0.06]"
        >
          <span className="text-[10px] font-sans font-semibold text-gray-400 tracking-wider">
            {item.label}
          </span>
          <span className="text-gray-200 font-bold">
            {Number.isFinite(item.last) ? item.last.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
          </span>
          <span
            className="flex items-center text-[10px] font-medium"
            style={{ color: !Number.isFinite(item.change) ? '#64748b' : item.isUp ? GREEN : RED }}
          >
            {!Number.isFinite(item.change) ? null : item.isUp ? (
              <TrendingUp size={10} className="mr-0.5" />
            ) : (
              <TrendingDown size={10} className="mr-0.5" />
            )}
            {Number.isFinite(item.change) ? `${item.change >= 0 ? '+' : ''}${item.change.toFixed(2)} (${item.changePct >= 0 ? '+' : ''}${item.changePct?.toFixed(2)}%)` : ''}
          </span>
        </div>
      ))}
    </div>
  );
}
