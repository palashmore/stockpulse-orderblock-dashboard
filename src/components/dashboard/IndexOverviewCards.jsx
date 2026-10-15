import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Clock } from 'lucide-react';

const GREEN = '#00e676';
const RED = '#ff1744';

// Labels only: every number on a card comes from the live index feed. No feed, no number.
const INDICES = [
  { id: 'nifty50', label: 'NIFTY 50' },
  { id: 'bse_sensex', label: 'SENSEX' },
  { id: 'bank', label: 'NIFTY BANK' },
  { id: 'midcap100', label: 'NIFTY MIDCAP 100' },
  { id: 'smallcap100', label: 'NIFTY SMALLCAP 100' },
];

const fmt = (v, opts) => (Number.isFinite(v) ? v.toLocaleString('en-IN', opts) : '—');
const two = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

export default function IndexOverviewCards({ levels = null, market = null, onSelectIndex = null }) {
  const cards = useMemo(() => INDICES.map((def) => {
    const live = levels?.indices?.[def.id];
    if (live && Number.isFinite(live.last)) {
      return { id: def.id, label: def.label, last: live.last, change: live.change ?? null, changePct: live.changePct ?? null, open: live.open ?? null, high: live.high ?? null, low: live.low ?? null, prevClose: live.previousClose ?? null };
    }
    return { id: def.id, label: def.label, last: null, change: null, changePct: null, open: null, high: null, low: null, prevClose: null };
  }), [levels]);

  // Market status calculation
  const known = Boolean(market);
  const isOpen = known && market.isOpen;
  const nifty = cards[0];
  const hasRange = Number.isFinite(nifty.low) && Number.isFinite(nifty.high) && Number.isFinite(nifty.last) && nifty.high > nifty.low;
  const dayRangeLow = nifty.low;
  const dayRangeHigh = nifty.high;
  const currentPrice = nifty.last;
  const rangePct = hasRange ? Math.min(100, Math.max(0, ((currentPrice - dayRangeLow) / (dayRangeHigh - dayRangeLow)) * 100)) : 0;

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
        const live = Number.isFinite(c.last);
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
              {!live && <span className="text-[9px] text-gray-500">Unavailable</span>}
            </div>

            {/* Price & Change */}
            <div className="my-1">
              <div className="text-lg font-bold font-mono tracking-tight text-white">
                {fmt(c.last, two)}
              </div>
              <div
                className="flex items-center gap-1 text-[11px] font-semibold font-mono"
                style={{ color: !Number.isFinite(c.change) ? '#64748b' : isUp ? GREEN : RED }}
              >
                {Number.isFinite(c.change) && (isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />)}
                <span>
                  {Number.isFinite(c.change) ? `${c.change >= 0 ? '+' : ''}${c.change.toFixed(2)} (${c.changePct >= 0 ? '+' : ''}${c.changePct?.toFixed(2)}%)` : '—'}
                </span>
              </div>
            </div>

            {/* Bottom OHLC stats */}
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 pt-2 mt-1 border-t border-white/5 text-[9px] font-mono text-gray-500">
              <div className="truncate">O <span className="text-gray-300">{fmt(c.open)}</span></div>
              <div className="truncate text-right">H <span className="text-gray-300">{fmt(c.high)}</span></div>
              <div className="truncate">L <span className="text-gray-300">{fmt(c.low)}</span></div>
              <div className="truncate text-right">Prev <span className="text-gray-300">{fmt(c.prevClose)}</span></div>
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
              {!known ? 'Unknown' : isOpen ? 'Open' : 'Closed'}
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
            <span>{fmt(currentPrice)}</span>
          </div>
          <div className="relative w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-green-500 to-emerald-400 rounded-full"
              style={{ width: `${rangePct}%` }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-gray-500 font-mono mt-1">
            <span>{fmt(dayRangeLow)}</span>
            <span>{fmt(dayRangeHigh)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
