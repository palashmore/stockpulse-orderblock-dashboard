import { TIMEFRAMES, getTimeframe } from '../data/timeframes';
import { OVERLAYS, PANES } from '../data/chartConfig';
import TradingChart from './TradingChart';

function IndicatorMenu({ indicators, onChange }) {
  return (
    <details className="relative">
      <summary className="px-2 py-1 text-xs rounded cursor-pointer text-gray-400 hover:text-gray-200 list-none">Indicators ▾</summary>
      <div className="absolute right-0 z-20 mt-1 p-2 rounded-md grid grid-cols-2 gap-x-4 gap-y-1" style={{ backgroundColor: '#151d2b', border: '1px solid #1e2d3d', minWidth: 260 }}>
        {[...OVERLAYS, ...PANES].map((o) => (
          <label key={o.key} className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
            <input type="checkbox" checked={Boolean(indicators[o.key])} onChange={(e) => onChange({ ...indicators, [o.key]: e.target.checked })} />
            {o.label}
          </label>
        ))}
      </div>
    </details>
  );
}

export function TimeframeBar({ timeframe, onTimeframeChange, demoMode, indicators, onIndicatorsChange }) {
  return (
    <div className="flex items-center gap-1 px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
      {TIMEFRAMES.map((tf) => {
        // Demo data is generated daily candles only
        const disabled = demoMode && tf.id !== 'D';
        return (
          <button
            key={tf.id}
            onClick={() => onTimeframeChange(tf.id)}
            disabled={disabled}
            title={disabled ? 'Simulated data is daily only' : undefined}
            className={`px-2.5 py-1 text-xs rounded transition-all ${disabled ? 'text-gray-700 cursor-not-allowed' : 'cursor-pointer'} ${
              timeframe === tf.id ? 'bg-green-500/15 text-green-400 font-medium' : disabled ? '' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
          >
            {tf.id}
          </button>
        );
      })}
      <div className="flex-1" />
      {indicators && onIndicatorsChange && <IndicatorMenu indicators={indicators} onChange={onIndicatorsChange} />}
    </div>
  );
}

// The main chart: candles, volume, configurable indicators and order blocks, on the shared TradingChart
export default function StockChart({ candleData, orderBlocks, stockSymbol = '', timeframe, onTimeframeChange, demoMode, indicators, onIndicatorsChange }) {
  return (
    <div className="flex flex-col h-full w-full">
      <TimeframeBar timeframe={timeframe} onTimeframeChange={onTimeframeChange} demoMode={demoMode} indicators={indicators} onIndicatorsChange={onIndicatorsChange} />
      <TradingChart candleData={candleData} orderBlocks={orderBlocks} indicators={indicators} intraday={getTimeframe(timeframe).intraday} resetKey={`${stockSymbol}|${timeframe}`} />
    </div>
  );
}
