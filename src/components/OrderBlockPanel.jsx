import { TrendingUp, TrendingDown } from 'lucide-react';

export default function OrderBlockPanel({ orderBlocks }) {
  if (!orderBlocks || orderBlocks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-600 text-sm">
        No order blocks detected
      </div>
    );
  }

  const bullish = orderBlocks.filter((ob) => ob.type === 'bullish');
  const bearish = orderBlocks.filter((ob) => ob.type === 'bearish');

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Order Blocks</h3>
        <span className="text-xs text-gray-600">{orderBlocks.length} detected</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {/* Bullish Section */}
        <div>
          <div className="flex items-center gap-1.5 px-1 mb-1.5">
            <TrendingUp size={12} className="text-green-400" />
            <span className="text-xs font-medium text-green-400">Bullish Blocks ({bullish.length})</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {bullish.map((ob, i) => (
              <div
                key={`bull-${i}`}
                className="rounded-md px-2 py-1.5 transition-all hover:scale-[1.02] cursor-pointer"
                style={{
                  background: 'linear-gradient(135deg, rgba(0, 230, 118, 0.08) 0%, rgba(0, 200, 83, 0.03) 100%)',
                  border: '1px solid rgba(0, 230, 118, 0.15)',
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-green-400 tracking-wide">{ob.label}</span>
                  {ob.tested && (
                    <span className="text-[8px] px-1 py-0.5 rounded bg-green-500/20 text-green-300">TESTED</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">
                    {ob.low.toFixed(1)} - {ob.high.toFixed(1)}
                  </span>
                  <div className="flex items-center gap-1">
                    <div className="h-1 rounded-full bg-gray-700" style={{ width: '30px' }}>
                      <div
                        className="h-full rounded-full bg-green-400"
                        style={{ width: `${ob.strength}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-green-400">{ob.strength}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bearish Section */}
        <div>
          <div className="flex items-center gap-1.5 px-1 mb-1.5">
            <TrendingDown size={12} className="text-red-400" />
            <span className="text-xs font-medium text-red-400">Bearish Blocks ({bearish.length})</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {bearish.map((ob, i) => (
              <div
                key={`bear-${i}`}
                className="rounded-md px-2 py-1.5 transition-all hover:scale-[1.02] cursor-pointer"
                style={{
                  background: 'linear-gradient(135deg, rgba(255, 23, 68, 0.08) 0%, rgba(213, 0, 0, 0.03) 100%)',
                  border: '1px solid rgba(255, 23, 68, 0.15)',
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-red-400 tracking-wide">{ob.label}</span>
                  {ob.tested && (
                    <span className="text-[8px] px-1 py-0.5 rounded bg-red-500/20 text-red-300">TESTED</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">
                    {ob.low.toFixed(1)} - {ob.high.toFixed(1)}
                  </span>
                  <div className="flex items-center gap-1">
                    <div className="h-1 rounded-full bg-gray-700" style={{ width: '30px' }}>
                      <div
                        className="h-full rounded-full bg-red-400"
                        style={{ width: `${ob.strength}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-red-400">{ob.strength}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
