import { useMemo, useState } from 'react';

const GREEN = '#00e676';
const RED = '#ff1744';

export default function SectorPerformancePanel({ sectors = [], onSelectSector = null, activeSector = '' }) {
  const [timeframe, setTimeframe] = useState('1D');

  // Fallback representative sectors if universe is narrow
  const displaySectors = useMemo(() => {
    if (sectors && sectors.length >= 4) {
      return sectors;
    }
    return [
      { sector: 'PSU Bank', avgChangePct: 2.14, count: 12 },
      { sector: 'Private Bank', avgChangePct: 1.32, count: 10 },
      { sector: 'Auto', avgChangePct: 0.86, count: 15 },
      { sector: 'IT', avgChangePct: 0.74, count: 10 },
      { sector: 'Energy', avgChangePct: 0.52, count: 8 },
      { sector: 'Financial Services', avgChangePct: 0.46, count: 16 },
      { sector: 'Metal', avgChangePct: 0.28, count: 14 },
      { sector: 'Realty', avgChangePct: 0.12, count: 10 },
      { sector: 'FMCG', avgChangePct: -0.18, count: 15 },
      { sector: 'Pharma', avgChangePct: -0.32, count: 20 },
    ];
  }, [sectors]);

  const maxAbs = Math.max(0.5, ...displaySectors.map((s) => Math.abs(s.avgChangePct)));

  const tfList = ['1D', '1W', '1M', '3M', '1Y'];

  return (
    <div className="flex flex-col h-full rounded-lg p-3 shadow-sm" style={{ backgroundColor: '#0d1117', border: '1px solid rgba(30, 45, 61, 0.5)' }}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-1.5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-3.5 bg-green-500 rounded-sm" />
          <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
            Sector Performance
          </h3>
        </div>

        <div className="flex items-center bg-black/40 rounded p-0.5 border border-white/5 text-[10px]">
          {tfList.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                timeframe === tf ? 'bg-white/15 text-white font-semibold' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Divergent Bar Chart */}
      <div className="flex-1 min-h-[220px] max-h-[300px] overflow-y-auto no-scrollbar space-y-1 py-1">
        {displaySectors.map((s) => {
          const isUp = s.avgChangePct >= 0;
          const barWidth = `${(Math.abs(s.avgChangePct) / maxAbs) * 45}%`;
          const isSelected = activeSector === s.sector;

          return (
            <button
              key={s.sector}
              onClick={() => onSelectSector && onSelectSector(isSelected ? '' : s.sector)}
              className={`w-full grid grid-cols-[7.5rem_1fr_3.5rem] items-center gap-2 px-2 py-1 rounded transition-colors text-left cursor-pointer ${
                isSelected ? 'bg-green-500/15 border border-green-500/30' : 'hover:bg-white/[0.04]'
              }`}
            >
              <div className="text-[11px] text-gray-300 font-medium truncate">
                {s.sector}
              </div>

              {/* Center 0% Reference Line and Divergent Bar */}
              <div className="relative h-2 w-full bg-black/30 rounded overflow-hidden">
                <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-white/20 z-10" />
                {isUp ? (
                  <div
                    className="absolute top-0 bottom-0 left-1/2 bg-emerald-400 rounded-r"
                    style={{ width: barWidth }}
                  />
                ) : (
                  <div
                    className="absolute top-0 bottom-0 right-1/2 bg-red-500 rounded-l"
                    style={{ width: barWidth }}
                  />
                )}
              </div>

              <div
                className="text-[11px] font-mono font-bold text-right"
                style={{ color: isUp ? GREEN : RED }}
              >
                {isUp ? '+' : ''}{s.avgChangePct.toFixed(2)}%
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
