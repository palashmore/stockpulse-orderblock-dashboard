import { ArrowUpRight, ArrowDownRight, Activity } from 'lucide-react';

function MetricItem({ label, value, color, highlight }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-3 py-1">
      <span className="text-[10px] text-gray-600 uppercase tracking-wider">{label}</span>
      <span
        className={`text-xs font-mono font-medium ${highlight ? '' : 'text-gray-300'}`}
        style={highlight ? { color } : {}}
      >
        {value}
      </span>
    </div>
  );
}

export default function MetricsBar({ metrics, stockInfo }) {
  if (!metrics || !metrics.price) {
    return null;
  }

  const changeColor = metrics.isPositive ? '#00e676' : '#ff1744';
  const ChangeIcon = metrics.isPositive ? ArrowUpRight : ArrowDownRight;

  return (
    <div
      className="flex items-center gap-0 overflow-x-auto"
      style={{
        backgroundColor: 'rgba(17, 24, 39, 0.5)',
        borderBottom: '1px solid rgba(30, 45, 61, 0.3)',
      }}
    >
      {/* Stock Name & Price */}
      <div className="flex items-center gap-2 px-4 py-2" style={{ borderRight: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-white">{stockInfo?.symbol || 'RELIANCE'}</span>
            <div className="flex items-center gap-0.5" style={{ color: changeColor }}>
              <ChangeIcon size={14} />
              <span className="text-xs font-medium">{metrics.changePct}%</span>
            </div>
          </div>
          <div className="text-[10px] text-gray-500">{stockInfo?.name || 'Reliance Industries'}</div>
        </div>
      </div>

      {/* Price */}
      <div className="flex items-center gap-1 px-4 py-2" style={{ borderRight: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <span className="text-lg font-bold font-mono" style={{ color: changeColor }}>
          ₹{metrics.price}
        </span>
        <span className="text-xs font-mono" style={{ color: changeColor }}>
          {metrics.isPositive ? '+' : ''}{metrics.change}
        </span>
      </div>

      {/* Metric Items */}
      <div className="flex items-center" style={{ borderRight: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <MetricItem label="VWAP 20" value={metrics.vwap === null ? '—' : `₹${metrics.vwap}`} />
      </div>

      <div className="flex items-center" style={{ borderRight: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <MetricItem label="OPEN" value={`₹${metrics.open}`} />
        <MetricItem label="HIGH" value={`₹${metrics.high}`} color="#00e676" highlight />
        <MetricItem label="LOW" value={`₹${metrics.low}`} color="#ff1744" highlight />
      </div>

      <div className="flex items-center" style={{ borderRight: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <MetricItem label="VOL" value={formatVolume(metrics.volume)} />
        <MetricItem label="AVG VOL" value={formatVolume(metrics.avgVolume)} />
      </div>

      <div className="flex items-center" style={{ borderRight: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <MetricItem label="SMA 20" value={`₹${metrics.sma20}`} color="#2196f3" highlight />
        <MetricItem label="SMA 50" value={`₹${metrics.sma50}`} color="#00e5ff" highlight />
      </div>

      <div className="flex items-center" style={{ borderRight: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <MetricItem label="P/E" value={metrics.pe ? `${Number(metrics.pe).toFixed(1)}` : '—'} />
        <MetricItem label="DEBT/EQ" value={metrics.debtToEquity ? `${metrics.debtToEquity}` : '0.4'} />
        <MetricItem label="FCF" value={metrics.freeCashflow ? formatVolume(metrics.freeCashflow) : '—'} />
      </div>

      <div className="flex items-center">
        <MetricItem
          label="RSI"
          value={metrics.rsi ?? '—'}
          color={metrics.rsi > 70 ? '#ff1744' : metrics.rsi < 30 ? '#00e676' : '#ffd600'}
          highlight
        />
        <div className="flex items-center gap-1 px-3">
          <Activity size={12} className="text-gray-500" />
          <span className={`text-[10px] font-medium ${
            metrics.rsi > 70 ? 'text-red-400' : metrics.rsi < 30 ? 'text-green-400' : 'text-yellow-400'
          }`}>
            {metrics.rsi === null ? 'N/A' : metrics.rsi > 70 ? 'OVERBOUGHT' : metrics.rsi < 30 ? 'OVERSOLD' : 'NEUTRAL'}
          </span>
        </div>
      </div>
    </div>
  );
}

function formatVolume(vol) {
  if (vol === null || vol === undefined) return '—';
  if (vol >= 10000000) return `${(vol / 10000000).toFixed(1)}Cr`;
  if (vol >= 100000) return `${(vol / 100000).toFixed(1)}L`;
  if (vol >= 1000) return `${(vol / 1000).toFixed(1)}K`;
  return vol.toString();
}
