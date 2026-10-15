import { useMemo } from 'react';

const GREEN = '#00e676';
const RED = '#ff1744';

export default function SectorPerformancePanel({ sectors = [], onSelectSector = null, activeSector = '' }) {

  // Only sectors measured from the loaded stocks. Nothing is filled in.
  const displaySectors = useMemo(() => (sectors || []).filter((x) => Number.isFinite(x.avgChangePct)), [sectors]);

  const maxAbs = Math.max(0.5, ...displaySectors.map((s) => Math.abs(s.avgChangePct)));

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

        <span className="text-[10px] text-gray-500">Today (1D)</span>
      </div>

      {/* Divergent Bar Chart */}
      {displaySectors.length === 0 && <div className="py-8 text-center text-[11px] text-gray-500">Sector figures need the stock quotes to load.</div>}
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
