import { useMemo, useState } from 'react';

const GREEN = '#00e676';
const RED = '#ff1744';

function formatVol(vol) {
  if (!vol || !Number.isFinite(vol)) return '—';
  if (vol >= 10000000) return `${(vol / 10000000).toFixed(1)}Cr`;
  if (vol >= 1000000) return `${(vol / 1000000).toFixed(1)}M`;
  if (vol >= 100000) return `${(vol / 100000).toFixed(1)}L`;
  if (vol >= 1000) return `${(vol / 1000).toFixed(0)}K`;
  return vol.toString();
}

export default function TopMoversPanel({ rows = [], onOpen = null }) {
  const [activeTab, setActiveTab] = useState('Gainers');
  const [exchange, setExchange] = useState('NSE');

  const filteredList = useMemo(() => {
    if (!rows || rows.length === 0) return [];
    let list = [...rows];
    if (activeTab === 'Gainers') {
      list = list.filter((r) => (r.changePct ?? 0) > 0).sort((a, b) => b.changePct - a.changePct);
    } else if (activeTab === 'Losers') {
      list = list.filter((r) => (r.changePct ?? 0) < 0).sort((a, b) => a.changePct - b.changePct);
    } else if (activeTab === 'High Volume') {
      list = list.sort((a, b) => (b.volume || 0) - (a.volume || 0));
    } else if (activeTab === '52W High') {
      list = list
        .filter((r) => r.changePct > 0)
        .sort((a, b) => {
          const scoreB = b.high && b.low ? (b.price - b.low) / (b.high - b.low || 1) : b.changePct;
          const scoreA = a.high && a.low ? (a.price - a.low) / (a.high - a.low || 1) : a.changePct;
          return scoreB - scoreA;
        });
    } else if (activeTab === '52W Low') {
      list = list
        .filter((r) => r.changePct < 0)
        .sort((a, b) => {
          const scoreA = a.high && a.low ? (a.price - a.low) / (a.high - a.low || 1) : a.changePct;
          const scoreB = b.high && b.low ? (b.price - b.low) / (b.high - b.low || 1) : b.changePct;
          return scoreA - scoreB;
        });
    }
    return list.slice(0, 10);
  }, [rows, activeTab]);

  const tabs = ['Gainers', 'Losers', 'High Volume', '52W High', '52W Low'];

  const cardStyle = {
    backgroundColor: '#0d1117',
    border: '1px solid rgba(30, 45, 61, 0.5)',
  };

  return (
    <div className="flex flex-col h-full rounded-lg p-3 shadow-sm" style={cardStyle}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.4)' }}>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-3.5 bg-cyan-400 rounded-sm" />
          <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
            Top Movers
          </h3>
          <span className="text-[10px] text-gray-500 font-mono">({activeTab})</span>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex items-center rounded p-0.5 text-[10px]" style={{ backgroundColor: 'rgba(17, 24, 39, 0.7)', border: '1px solid rgba(30, 45, 61, 0.5)' }}>
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                  activeTab === t ? 'bg-white/15 text-white font-semibold' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <select
            value={exchange}
            onChange={(e) => setExchange(e.target.value)}
            className="text-[10px] text-gray-300 rounded px-1.5 py-0.5 outline-none cursor-pointer"
            style={{ backgroundColor: 'rgba(17, 24, 39, 0.8)', border: '1px solid rgba(30, 45, 61, 0.5)' }}
          >
            <option value="NSE">NSE</option>
            <option value="BSE">BSE</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-[220px] max-h-[300px] overflow-y-auto no-scrollbar">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-[10px] text-gray-500 uppercase tracking-wider pb-1" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
              <th className="py-1 px-1.5 font-normal w-6">#</th>
              <th className="py-1 px-1.5 font-normal">Symbol</th>
              <th className="py-1 px-1.5 font-normal text-right">LTP</th>
              <th className="py-1 px-1.5 font-normal text-right">Chg</th>
              <th className="py-1 px-1.5 font-normal text-right">Chg %</th>
              <th className="py-1 px-1.5 font-normal text-right">Volume</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {filteredList.map((r, i) => {
              const isUp = (r.changePct ?? 0) >= 0;
              const chgVal = (r.price * (r.changePct / 100)) / (1 + r.changePct / 100) || 0;
              return (
                <tr
                  key={r.symbol}
                  onClick={() => onOpen && onOpen(r.symbol)}
                  className="hover:bg-white/[0.04] cursor-pointer transition-colors"
                >
                  <td className="py-1 px-1.5 text-[10px] font-mono text-gray-500">{i + 1}</td>
                  <td className="py-1 px-1.5">
                    <span className="font-semibold text-gray-200">{r.symbol}</span>
                  </td>
                  <td className="py-1 px-1.5 text-right font-mono text-gray-300">
                    ₹{r.price?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-1 px-1.5 text-right font-mono text-[11px]" style={{ color: isUp ? GREEN : RED }}>
                    {isUp ? '+' : ''}{chgVal.toFixed(2)}
                  </td>
                  <td className="py-1 px-1.5 text-right font-mono text-[11px] font-bold" style={{ color: isUp ? GREEN : RED }}>
                    {isUp ? '+' : ''}{r.changePct?.toFixed(2)}%
                  </td>
                  <td className="py-1 px-1.5 text-right font-mono text-gray-400 text-[11px]">
                    {formatVol(r.volume)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
