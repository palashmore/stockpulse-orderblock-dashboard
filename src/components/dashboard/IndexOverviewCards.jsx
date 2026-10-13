import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Clock, ShieldCheck } from 'lucide-react';

const GREEN = '#00e676';
const RED = '#ff1744';

function MiniSparkline({ isUp = true }) {
  // Smooth SVG sparkline path
  const points = isUp
    ? [20, 18, 22, 16, 19, 14, 15, 11, 13, 8, 10, 4]
    : [6, 10, 8, 13, 11, 15, 14, 18, 16, 20, 19, 22];
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const width = 80;
  const height = 28;
  const step = width / (points.length - 1);

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(((p - min) / range) * (height - 6) + 3).toFixed(1)}`)
    .join(' ');

  const strokeColor = isUp ? GREEN : RED;

  return (
    <svg width={width} height={height} className="overflow-visible opacity-90">
      <path d={path} fill="none" stroke={strokeColor} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const DEFAULT_INDICES = [
  {
    id: 'nifty50',
    label: 'NIFTY 50',
    last: 25623.45,
    change: 185.25,
    changePct: 0.73,
    open: 25412.10,
    high: 25681.30,
    low: 25381.50,
    prevClose: 25438.20,
  },
  {
    id: 'bse_sensex',
    label: 'SENSEX',
    last: 83912.14,
    change: 612.38,
    changePct: 0.74,
    open: 83210.55,
    high: 84056.22,
    low: 83102.10,
    prevClose: 83299.76,
  },
  {
    id: 'bank',
    label: 'NIFTY BANK',
    last: 57234.60,
    change: 421.15,
    changePct: 0.74,
    open: 56720.15,
    high: 57410.90,
    low: 56612.40,
    prevClose: 56813.45,
  },
  {
    id: 'midcap100',
    label: 'NIFTY MIDCAP 100',
    last: 59880.22,
    change: 382.10,
    changePct: 0.64,
    open: 59442.10,
    high: 59921.80,
    low: 59110.30,
    prevClose: 59498.12,
  },
  {
    id: 'smallcap100',
    label: 'NIFTY SMALLCAP 100',
    last: 18945.35,
    change: 102.48,
    changePct: 0.54,
    open: 18820.14,
    high: 18960.75,
    low: 18755.60,
    prevClose: 18842.87,
  },
];

export default function IndexOverviewCards({ levels = null, market = null, onSelectIndex = null }) {
  const cards = useMemo(() => {
    return DEFAULT_INDICES.map((def) => {
      const live = levels?.indices?.[def.id];
      if (live && live.last !== null) {
        return {
          id: def.id,
          label: def.label,
          last: live.last,
          change: live.change ?? def.change,
          changePct: live.changePct ?? def.changePct,
          open: live.open ?? def.open,
          high: live.high ?? def.high,
          low: live.low ?? def.low,
          prevClose: live.previousClose ?? def.prevClose,
        };
      }
      return def;
    });
  }, [levels]);

  // Market status calculation
  const isOpen = market ? market.isOpen : true;
  const nifty = cards[0];
  const dayRangeLow = nifty.low || 25381;
  const dayRangeHigh = nifty.high || 25681;
  const currentPrice = nifty.last || 25623.45;
  const rangeSpan = dayRangeHigh - dayRangeLow || 1;
  const rangePct = Math.min(100, Math.max(0, ((currentPrice - dayRangeLow) / rangeSpan) * 100));

  const nowIST = new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
  const todayIST = new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5 px-4 py-2">
      {/* 5 Index Cards */}
      {cards.map((c) => {
        const isUp = (c.change ?? 0) >= 0;
        return (
          <div
            key={c.id}
            onClick={() => onSelectIndex && onSelectIndex(c.id)}
            className="group flex flex-col justify-between p-3 rounded-lg cursor-pointer transition-all duration-200 hover:border-white/20 shadow-sm"
            style={{ backgroundColor: '#0d1117', border: '1px solid rgba(30, 45, 61, 0.5)' }}
          >
            {/* Header: Label + Sparkline */}
            <div className="flex items-center justify-between gap-1 mb-1">
              <span className="text-[11px] font-bold text-gray-400 group-hover:text-gray-200 tracking-wider">
                {c.label}
              </span>
              <MiniSparkline isUp={isUp} />
            </div>

            {/* Price & Change */}
            <div className="my-1">
              <div className="text-lg font-bold font-mono tracking-tight text-white">
                {c.last.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div
                className="flex items-center gap-1 text-[11px] font-semibold font-mono"
                style={{ color: isUp ? GREEN : RED }}
              >
                {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                <span>
                  {c.change >= 0 ? '+' : ''}{c.change?.toFixed(2)} ({c.changePct >= 0 ? '+' : ''}{c.changePct?.toFixed(2)}%)
                </span>
              </div>
            </div>

            {/* Bottom OHLC stats */}
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 pt-2 mt-1 border-t border-white/5 text-[9px] font-mono text-gray-500">
              <div className="truncate">O <span className="text-gray-300">{c.open?.toLocaleString('en-IN')}</span></div>
              <div className="truncate text-right">H <span className="text-gray-300">{c.high?.toLocaleString('en-IN')}</span></div>
              <div className="truncate">L <span className="text-gray-300">{c.low?.toLocaleString('en-IN')}</span></div>
              <div className="truncate text-right">Prev <span className="text-gray-300">{c.prevClose?.toLocaleString('en-IN')}</span></div>
            </div>
          </div>
        );
      })}

      {/* 6th Card: Market Status Card */}
      <div
        className="flex flex-col justify-between p-3 rounded-lg shadow-sm"
        style={{ backgroundColor: '#0d1117', border: '1px solid rgba(30, 45, 61, 0.5)' }}
      >
        <div>
          <div className="flex items-center justify-between text-[11px] font-bold text-gray-400 tracking-wider mb-2">
            <span>MARKET STATUS</span>
            <span className="flex items-center gap-1 text-[10px] text-gray-400">
              <Clock size={11} />
              <span>IST</span>
            </span>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                isOpen ? 'bg-[#00e676] animate-pulse shadow-[0_0_8px_#00e676]' : 'bg-[#ff1744]'
              }`}
            />
            <span className="text-base font-bold text-white tracking-wide">
              {isOpen ? 'Open' : 'Closed'}
            </span>
          </div>

          <div className="text-[10px] text-gray-400 font-mono mb-2">
            {nowIST} | {todayIST}
          </div>
        </div>

        {/* Day Range Bar */}
        <div className="pt-2 border-t border-white/5">
          <div className="flex justify-between items-center text-[9px] text-gray-400 font-mono mb-1">
            <span>Day Range</span>
            <span>{currentPrice.toLocaleString('en-IN')}</span>
          </div>
          <div className="relative w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-green-500 to-emerald-400 rounded-full"
              style={{ width: `${rangePct}%` }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-gray-500 font-mono mt-1">
            <span>{dayRangeLow.toLocaleString('en-IN')}</span>
            <span>{dayRangeHigh.toLocaleString('en-IN')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
