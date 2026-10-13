import { useState } from 'react';
import { TrendingUp, TrendingDown, ChevronDown, ChevronRight, Crosshair, ShieldCheck, AlertCircle } from 'lucide-react';

const GREEN = '#00e676';
const RED = '#ff1744';

export default function OrderBlockPanel({ orderBlocks = [], selectedBlock = null, onSelectBlock = null }) {
  const [bullishOpen, setBullishOpen] = useState(true);
  const [bearishOpen, setBearishOpen] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all', 'bullish', 'bearish'

  if (!orderBlocks || orderBlocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 text-xs p-4 bg-[#0d1117]">
        <AlertCircle size={20} className="text-gray-600 mb-1" />
        <span>No unmitigated order blocks detected in this timeframe.</span>
      </div>
    );
  }

  const bullish = orderBlocks.filter((ob) => ob.type === 'bullish');
  const bearish = orderBlocks.filter((ob) => ob.type === 'bearish');

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#0d1117]">
      {/* Top Header & Filter Bar */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-white/5 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}
      >
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
            Order Blocks (SMC Zones)
          </h3>
          <span className="text-[10px] text-gray-500 font-mono">
            {orderBlocks.length} detected
          </span>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 bg-[#111827] rounded p-0.5 border border-white/5 text-[10px]">
          {[
            ['all', `All (${orderBlocks.length})`],
            ['bullish', `Demand (${bullish.length})`],
            ['bearish', `Supply (${bearish.length})`],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                filter === id
                  ? 'bg-white/15 text-white font-semibold'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Blocks List Grid */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* 1. Bullish Demand Blocks */}
        {(filter === 'all' || filter === 'bullish') && (
          <div>
            <button
              onClick={() => setBullishOpen(!bullishOpen)}
              className="w-full flex items-center justify-between px-1 mb-1.5 text-left cursor-pointer group"
            >
              <div className="flex items-center gap-1.5">
                <TrendingUp size={13} className="text-green-400" />
                <span className="text-xs font-semibold text-green-400">
                  Bullish Demand Blocks ({bullish.length})
                </span>
              </div>
              <span className="text-gray-500 group-hover:text-gray-300">
                {bullishOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            </button>

            {bullishOpen && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {bullish.length === 0 ? (
                  <p className="text-[11px] text-gray-600 px-2 py-1">No bullish blocks in view.</p>
                ) : (
                  bullish.map((ob, i) => {
                    const isSelected = selectedBlock?.time === ob.time;
                    const lifecycle = ob.mitigated ? 'MITIGATED' : ob.tested ? 'TESTED' : 'ACTIVE';
                    return (
                      <div
                        key={`bull-${i}`}
                        onClick={() => onSelectBlock && onSelectBlock(ob)}
                        className={`rounded-lg p-2.5 transition-all cursor-pointer border ${
                          isSelected
                            ? 'border-green-400/60 bg-green-500/15'
                            : 'border-green-500/20 hover:border-green-400/40 bg-gradient-to-r from-green-500/[0.07] to-transparent'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-bold text-green-400 tracking-wide">
                            {ob.label || 'DEMAND ZONE'}
                          </span>
                          <span
                            className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase ${
                              lifecycle === 'ACTIVE'
                                ? 'bg-green-500/20 text-green-300'
                                : lifecycle === 'TESTED'
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-gray-700/40 text-gray-400'
                            }`}
                          >
                            {lifecycle}
                          </span>
                        </div>

                        {/* Zone Levels */}
                        <div className="flex items-center justify-between text-xs font-mono text-gray-200 mb-1.5">
                          <span>
                            ₹{ob.low?.toFixed(2)} — ₹{ob.high?.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {ob.time ? new Date(ob.time).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
                          </span>
                        </div>

                        {/* Strength Bar & Invalidation */}
                        <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[9px] text-gray-400">
                          <div className="flex items-center gap-1.5">
                            <span>Strength</span>
                            <div className="h-1 rounded-full bg-gray-700" style={{ width: '36px' }}>
                              <div
                                className="h-full rounded-full bg-green-400"
                                style={{ width: `${Math.min(100, ob.strength || 60)}%` }}
                              />
                            </div>
                            <span className="text-green-400 font-mono">{ob.strength || 60}%</span>
                          </div>

                          <span className="text-gray-500 font-mono">
                            Inv: &lt;₹{ob.low?.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}

        {/* 2. Bearish Supply Blocks */}
        {(filter === 'all' || filter === 'bearish') && (
          <div className="pt-1">
            <button
              onClick={() => setBearishOpen(!bearishOpen)}
              className="w-full flex items-center justify-between px-1 mb-1.5 text-left cursor-pointer group"
            >
              <div className="flex items-center gap-1.5">
                <TrendingDown size={13} className="text-red-400" />
                <span className="text-xs font-semibold text-red-400">
                  Bearish Supply Blocks ({bearish.length})
                </span>
              </div>
              <span className="text-gray-500 group-hover:text-gray-300">
                {bearishOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            </button>

            {bearishOpen && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {bearish.length === 0 ? (
                  <p className="text-[11px] text-gray-600 px-2 py-1">No bearish blocks in view.</p>
                ) : (
                  bearish.map((ob, i) => {
                    const isSelected = selectedBlock?.time === ob.time;
                    const lifecycle = ob.mitigated ? 'MITIGATED' : ob.tested ? 'TESTED' : 'ACTIVE';
                    return (
                      <div
                        key={`bear-${i}`}
                        onClick={() => onSelectBlock && onSelectBlock(ob)}
                        className={`rounded-lg p-2.5 transition-all cursor-pointer border ${
                          isSelected
                            ? 'border-red-400/60 bg-red-500/15'
                            : 'border-red-500/20 hover:border-red-400/40 bg-gradient-to-r from-red-500/[0.07] to-transparent'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-bold text-red-400 tracking-wide">
                            {ob.label || 'SUPPLY ZONE'}
                          </span>
                          <span
                            className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase ${
                              lifecycle === 'ACTIVE'
                                ? 'bg-red-500/20 text-red-300'
                                : lifecycle === 'TESTED'
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-gray-700/40 text-gray-400'
                            }`}
                          >
                            {lifecycle}
                          </span>
                        </div>

                        {/* Zone Levels */}
                        <div className="flex items-center justify-between text-xs font-mono text-gray-200 mb-1.5">
                          <span>
                            ₹{ob.low?.toFixed(2)} — ₹{ob.high?.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {ob.time ? new Date(ob.time).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
                          </span>
                        </div>

                        {/* Strength Bar & Invalidation */}
                        <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[9px] text-gray-400">
                          <div className="flex items-center gap-1.5">
                            <span>Strength</span>
                            <div className="h-1 rounded-full bg-gray-700" style={{ width: '36px' }}>
                              <div
                                className="h-full rounded-full bg-red-400"
                                style={{ width: `${Math.min(100, ob.strength || 60)}%` }}
                              />
                            </div>
                            <span className="text-red-400 font-mono">{ob.strength || 60}%</span>
                          </div>

                          <span className="text-gray-500 font-mono">
                            Inv: &gt;₹{ob.high?.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
