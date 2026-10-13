import { useMemo } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useIndexLevels } from '../../hooks/useIndexLevels';

const GREEN = '#00e676';
const RED = '#ff1744';

const BENCHMARKS = [
  { id: 'nifty50', label: 'NIFTY 50', fallback: { last: 25623.45, change: 185.25, changePct: 0.73 } },
  { id: 'bse_sensex', label: 'SENSEX', fallback: { last: 83912.14, change: 612.38, changePct: 0.74 } },
  { id: 'bank', label: 'NIFTY BANK', fallback: { last: 57234.60, change: 421.15, changePct: 0.74 } },
  { id: 'midcap100', label: 'NIFTY MIDCAP 100', fallback: { last: 59880.22, change: 382.10, changePct: 0.64 } },
  { id: 'smallcap100', label: 'NIFTY SMALLCAP 100', fallback: { last: 18945.35, change: 102.48, changePct: 0.54 } },
  { id: 'indiavix', label: 'INDIA VIX', fallback: { last: 12.48, change: -0.62, changePct: -4.74 } },
];

export default function MarketTickerStrip({ demoMode = false }) {
  const { levels, failed } = useIndexLevels(!demoMode);

  const items = useMemo(() => {
    return BENCHMARKS.map((b) => {
      const live = levels?.indices?.[b.id];
      const data = live && live.last !== null ? live : b.fallback;
      const isUp = (data.change ?? 0) >= 0;
      return {
        id: b.id,
        label: b.label,
        last: data.last,
        change: data.change,
        changePct: data.changePct,
        isUp,
      };
    });
  }, [levels]);

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
            {item.last?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span
            className="flex items-center text-[10px] font-medium"
            style={{ color: item.isUp ? GREEN : RED }}
          >
            {item.isUp ? (
              <TrendingUp size={10} className="mr-0.5" />
            ) : (
              <TrendingDown size={10} className="mr-0.5" />
            )}
            {item.change >= 0 ? '+' : ''}
            {item.change?.toFixed(2)} ({item.changePct >= 0 ? '+' : ''}
            {item.changePct?.toFixed(2)}%)
          </span>
        </div>
      ))}
    </div>
  );
}
