import { useMemo, useState } from 'react';

const GREEN = '#00e676';
const RED = '#ff1744';

function getColor(pct) {
  if (!Number.isFinite(pct) || pct === 0) return 'rgba(100, 116, 139, 0.35)';
  if (pct >= 3) return 'rgba(0, 230, 118, 0.90)';
  if (pct >= 1.5) return 'rgba(0, 230, 118, 0.70)';
  if (pct > 0) return 'rgba(0, 230, 118, 0.45)';
  if (pct <= -3) return 'rgba(255, 23, 68, 0.90)';
  if (pct <= -1.5) return 'rgba(255, 23, 68, 0.70)';
  return 'rgba(255, 23, 68, 0.45)';
}

export default function MarketHeatmap({ rows = [], onOpen = null }) {
  const [filterTab, setFilterTab] = useState('All Sectors');
  const [timeframe, setTimeframe] = useState('Intraday');
  const [sizeMode, setSizeMode] = useState('Market Cap');

  // Filter rows based on selected universe filter tab
  const filteredRows = useMemo(() => {
    if (!rows || rows.length === 0) return [];
    if (filterTab === 'Nifty 50') return rows.filter((r) => r.indices?.includes('nifty50'));
    if (filterTab === 'Nifty 100') return rows.filter((r) => r.indices?.includes('nifty100') || r.indices?.includes('nifty50'));
    return rows;
  }, [rows, filterTab]);

  // Group stocks by sector and apply size mode sorting
  const sectorGroups = useMemo(() => {
    const groups = {};
    for (const r of filteredRows) {
      const sec = r.sector || 'Unclassified';
      if (!groups[sec]) groups[sec] = { name: sec, stocks: [], sum: 0 };
      groups[sec].stocks.push(r);
      groups[sec].sum += r.changePct || 0;
    }

    return Object.values(groups)
      .map((g) => {
        let sorted = [...g.stocks];
        if (sizeMode === 'Volume') {
          sorted.sort((a, b) => (b.volume || 0) - (a.volume || 0));
        } else if (sizeMode === 'Equal') {
          sorted.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
        } else {
          // Market Cap / Liquidity Proxy
          sorted.sort((a, b) => (b.volume || 0) * (b.price || 1) - (a.volume || 0) * (a.price || 1));
        }
        return {
          ...g,
          avgChange: g.stocks.length ? g.sum / g.stocks.length : 0,
          stocks: sorted,
        };
      })
      .sort((a, b) => b.stocks.length - a.stocks.length);
  }, [filteredRows, sizeMode]);

  const tabs = ['All Sectors', 'Nifty 50', 'Nifty 100', 'NSE', 'BSE'];

  const cardStyle = {
    backgroundColor: '#0d1117',
    border: '1px solid rgba(30, 45, 61, 0.5)',
  };

  const sectorBoxStyle = {
    backgroundColor: 'rgba(17, 24, 39, 0.6)',
    border: '1px solid rgba(30, 45, 61, 0.4)',
  };

  return (
    <div className="flex flex-col h-full rounded-lg p-3 shadow-sm" style={cardStyle}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.4)' }}>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-3.5 bg-green-400 rounded-sm" />
          <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
            Market Heatmap
          </h3>
          <span className="text-[10px] text-gray-500 font-mono">({filteredRows.length} stocks)</span>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center rounded p-0.5 text-[10px]" style={{ backgroundColor: 'rgba(17, 24, 39, 0.7)', border: '1px solid rgba(30, 45, 61, 0.5)' }}>
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setFilterTab(t)}
                className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                  filterTab === t ? 'bg-white/15 text-white font-semibold' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 text-[10px]">
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="text-gray-300 rounded px-1.5 py-0.5 outline-none cursor-pointer"
              style={{ backgroundColor: 'rgba(17, 24, 39, 0.8)', border: '1px solid rgba(30, 45, 61, 0.5)' }}
            >
              <option value="Intraday">Intraday</option>
              <option value="1D">1D</option>
              <option value="1W">1W</option>
            </select>

            <select
              value={sizeMode}
              onChange={(e) => setSizeMode(e.target.value)}
              className="text-gray-300 rounded px-1.5 py-0.5 outline-none cursor-pointer"
              style={{ backgroundColor: 'rgba(17, 24, 39, 0.8)', border: '1px solid rgba(30, 45, 61, 0.5)' }}
            >
              <option value="Market Cap">Weight: Market Cap</option>
              <option value="Volume">Weight: Volume</option>
              <option value="Equal">Weight: Equal</option>
            </select>
          </div>
        </div>
      </div>

      {/* Heatmap Grid */}
      <div className="flex-1 min-h-[220px] max-h-[300px] overflow-y-auto no-scrollbar grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {sectorGroups.map((g) => {
          const isUp = g.avgChange >= 0;
          return (
            <div
              key={g.name}
              className="flex flex-col p-2 rounded transition-colors"
              style={sectorBoxStyle}
            >
              {/* Sector Header */}
              <div className="flex items-center justify-between text-[10px] mb-1.5">
                <span className="font-bold text-gray-300 uppercase truncate max-w-[70%]">
                  {g.name}
                </span>
                <span
                  className="font-mono font-semibold"
                  style={{ color: isUp ? GREEN : RED }}
                >
                  {isUp ? '+' : ''}{g.avgChange.toFixed(2)}%
                </span>
              </div>

              {/* Constituent tiles */}
              <div className="grid grid-cols-3 gap-1">
                {g.stocks.slice(0, 9).map((s) => {
                  const sUp = s.changePct >= 0;
                  return (
                    <button
                      key={s.symbol}
                      onClick={() => onOpen && onOpen(s.symbol)}
                      title={`${s.symbol} (${s.name || s.symbol}): ₹${s.price?.toFixed(2)} (${sUp ? '+' : ''}${s.changePct?.toFixed(2)}%)`}
                      className="flex flex-col items-center justify-center p-1 rounded text-center cursor-pointer transition-transform hover:scale-105"
                      style={{ backgroundColor: getColor(s.changePct) }}
                    >
                      <span className="text-[9px] font-bold text-white truncate max-w-full leading-tight">
                        {s.symbol}
                      </span>
                      <span className="text-[8px] font-mono text-white/90 leading-tight">
                        {sUp ? '+' : ''}{s.changePct?.toFixed(1)}%
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
