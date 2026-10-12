import { useRef, useEffect } from 'react';
import { Shield, AlertTriangle, TrendingUp, TrendingDown, Activity, Target } from 'lucide-react';

// Mini OI Distribution Chart using Canvas
function OIDistributionChart({ oiData, currentPrice, width = 280, height = 200 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !oiData || oiData.length === 0) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Filter to strikes near current price (±10 strikes)
    const sorted = [...oiData].sort((a, b) => a.strike - b.strike);
    const currentIdx = sorted.findIndex(d => d.strike >= currentPrice);
    const startIdx = Math.max(0, currentIdx - 8);
    const endIdx = Math.min(sorted.length, currentIdx + 8);
    const filtered = sorted.slice(startIdx, endIdx);

    if (filtered.length === 0) return;

    const maxOI = Math.max(...filtered.map(d => Math.max(d.callOI || 0, d.putOI || 0)), 1);
    const barHeight = Math.min(10, (height - 30) / filtered.length - 1);
    const midX = width / 2;
    const maxBarWidth = midX - 40;

    // Header
    ctx.font = '9px Inter, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.fillText('PUT OI', midX / 2, 10);
    ctx.fillText('CALL OI', midX + midX / 2, 10);

    // Center line
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(midX, 15);
    ctx.lineTo(midX, height);
    ctx.stroke();

    filtered.forEach((d, i) => {
      const y = 20 + i * (barHeight + 2);
      const callWidth = (d.callOI / maxOI) * maxBarWidth;
      const putWidth = (d.putOI / maxOI) * maxBarWidth;
      const isCurrentStrike = Math.abs(d.strike - currentPrice) < (currentPrice * 0.005);

      // Call OI bar (right side - red)
      ctx.fillStyle = isCurrentStrike ? 'rgba(255, 23, 68, 0.5)' : 'rgba(255, 23, 68, 0.25)';
      ctx.fillRect(midX + 2, y, callWidth, barHeight);

      // Put OI bar (left side - green)
      ctx.fillStyle = isCurrentStrike ? 'rgba(0, 230, 118, 0.5)' : 'rgba(0, 230, 118, 0.25)';
      ctx.fillRect(midX - 2 - putWidth, y, putWidth, barHeight);

      // Strike price label
      ctx.font = isCurrentStrike ? 'bold 8px Inter, sans-serif' : '8px Inter, sans-serif';
      ctx.fillStyle = isCurrentStrike ? '#ffd600' : '#4a5568';
      ctx.textAlign = 'center';
      ctx.fillText(d.strike.toFixed(0), midX, y + barHeight - 1);

      // Highlight current price strike
      if (isCurrentStrike) {
        ctx.strokeStyle = '#ffd600';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(0, y + barHeight / 2);
        ctx.lineTo(width, y + barHeight / 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });
  }, [oiData, currentPrice, width, height]);

  return <canvas ref={canvasRef} style={{ width, height }} />;
}

// PCR Gauge component
function PCRGauge({ pcr }) {
  const pcrValue = parseFloat(pcr) || 1;
  const angle = Math.min(Math.max((pcrValue - 0.3) / 1.4, 0), 1) * 180; // 0.3 to 1.7 mapped to 0-180
  const sentiment = pcrValue > 1.2 ? 'Bullish' : pcrValue < 0.8 ? 'Bearish' : 'Neutral';
  const color = pcrValue > 1.2 ? '#00e676' : pcrValue < 0.8 ? '#ff1744' : '#ffd600';

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: 80, height: 45, overflow: 'hidden' }}>
        {/* Background arc */}
        <div
          className="absolute inset-0 rounded-t-full"
          style={{
            background: `conic-gradient(
              from 180deg,
              #ff1744 0deg,
              #ff9100 60deg,
              #ffd600 90deg,
              #00e676 150deg,
              #00e676 180deg,
              transparent 180deg
            )`,
            opacity: 0.3,
          }}
        />
        {/* Needle */}
        <div
          className="absolute bottom-0 left-1/2 origin-bottom"
          style={{
            width: 2,
            height: 35,
            backgroundColor: color,
            transform: `translateX(-50%) rotate(${angle - 90}deg)`,
            boxShadow: `0 0 6px ${color}`,
            transition: 'transform 0.5s ease',
          }}
        />
        {/* Center dot */}
        <div
          className="absolute bottom-0 left-1/2 w-2 h-2 rounded-full"
          style={{
            transform: 'translate(-50%, 50%)',
            backgroundColor: color,
          }}
        />
      </div>
      <div className="text-center mt-1">
        <div className="text-sm font-bold font-mono" style={{ color }}>
          {pcrValue.toFixed(2)}
        </div>
        <div className="text-[9px]" style={{ color }}>
          {sentiment}
        </div>
      </div>
    </div>
  );
}

export default function OIAnalysisPanel({ optionsData, priceChange }) {
  if (!optionsData) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-3 py-2"
          style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">OI Analysis</h3>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Activity size={24} className="mx-auto text-gray-700 mb-2" />
            <p className="text-xs text-gray-600">Options data not available</p>
            <p className="text-[10px] text-gray-700 mt-1">F&O stocks only</p>
          </div>
        </div>
      </div>
    );
  }

  const { pcr, maxPain, totalCallOI, totalPutOI, totalCallOIChange, totalPutOIChange, support, resistance, underlyingValue, oiData, source } = optionsData;

  // OI Buildup Classification
  const oiChangeTotal = (totalCallOIChange || 0) + (totalPutOIChange || 0);
  let buildupType, buildupColor, buildupIcon;
  if (priceChange > 0 && oiChangeTotal > 0) {
    buildupType = 'LONG BUILD-UP';
    buildupColor = '#00e676';
    buildupIcon = TrendingUp;
  } else if (priceChange < 0 && oiChangeTotal > 0) {
    buildupType = 'SHORT BUILD-UP';
    buildupColor = '#ff1744';
    buildupIcon = TrendingDown;
  } else if (priceChange < 0 && oiChangeTotal < 0) {
    buildupType = 'LONG UNWINDING';
    buildupColor = '#ff9100';
    buildupIcon = TrendingDown;
  } else if (priceChange > 0 && oiChangeTotal < 0) {
    buildupType = 'SHORT COVERING';
    buildupColor = '#00b0ff';
    buildupIcon = TrendingUp;
  } else {
    buildupType = 'NEUTRAL';
    buildupColor = '#64748b';
    buildupIcon = Activity;
  }
  const BuildupIcon = buildupIcon;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">OI Analysis</h3>
        <span className="text-[9px] px-1.5 py-0.5 rounded text-gray-500"
          style={{ backgroundColor: 'rgba(30, 45, 61, 0.5)' }}>
          {[source, optionsData.dataStatus].filter(Boolean).join(' · ')}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {/* OI Buildup Badge */}
        <div
          className="rounded-lg p-2.5 flex items-center gap-3"
          style={{
            background: `linear-gradient(135deg, ${buildupColor}10, ${buildupColor}05)`,
            border: `1px solid ${buildupColor}30`,
          }}
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${buildupColor}20` }}>
            <BuildupIcon size={16} style={{ color: buildupColor }} />
          </div>
          <div>
            <div className="text-xs font-bold tracking-wide" style={{ color: buildupColor }}>
              {buildupType}
            </div>
            <div className="text-[10px] text-gray-500">Current OI Activity</div>
          </div>
        </div>

        {/* PCR + Max Pain Row */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg p-2" style={{ backgroundColor: 'rgba(17, 24, 39, 0.5)', border: '1px solid rgba(30, 45, 61, 0.3)' }}>
            <div className="text-[9px] text-gray-600 uppercase mb-1 text-center">Put-Call Ratio</div>
            <PCRGauge pcr={pcr} />
          </div>
          <div className="rounded-lg p-2" style={{ backgroundColor: 'rgba(17, 24, 39, 0.5)', border: '1px solid rgba(30, 45, 61, 0.3)' }}>
            <div className="text-[9px] text-gray-600 uppercase mb-1 text-center">Max Pain</div>
            <div className="flex flex-col items-center mt-2">
              <Target size={18} className="text-yellow-400 mb-1" />
              <div className="text-sm font-bold font-mono text-yellow-400">
                ₹{maxPain?.toFixed(0) || '—'}
              </div>
              <div className="text-[9px] text-gray-500 mt-0.5">
                CMP: ₹{underlyingValue?.toFixed(0) || '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Total OI */}
        <div className="rounded-lg p-2" style={{ backgroundColor: 'rgba(17, 24, 39, 0.5)', border: '1px solid rgba(30, 45, 61, 0.3)' }}>
          <div className="text-[9px] text-gray-600 uppercase mb-2">Total Open Interest</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[9px] text-red-400">Call OI</div>
              <div className="text-xs font-mono text-gray-300">{formatLargeNumber(totalCallOI)}</div>
              {totalCallOIChange !== 0 && (
                <div className={`text-[9px] font-mono ${totalCallOIChange > 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {totalCallOIChange > 0 ? '+' : ''}{formatLargeNumber(totalCallOIChange)}
                </div>
              )}
            </div>
            <div>
              <div className="text-[9px] text-green-400">Put OI</div>
              <div className="text-xs font-mono text-gray-300">{formatLargeNumber(totalPutOI)}</div>
              {totalPutOIChange !== 0 && (
                <div className={`text-[9px] font-mono ${totalPutOIChange > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {totalPutOIChange > 0 ? '+' : ''}{formatLargeNumber(totalPutOIChange)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* OI Distribution Chart */}
        {oiData && oiData.length > 0 && (
          <div className="rounded-lg p-2" style={{ backgroundColor: 'rgba(17, 24, 39, 0.5)', border: '1px solid rgba(30, 45, 61, 0.3)' }}>
            <div className="text-[9px] text-gray-600 uppercase mb-1">OI Distribution</div>
            <OIDistributionChart
              oiData={oiData}
              currentPrice={underlyingValue}
              width={260}
              height={180}
            />
          </div>
        )}

        {/* Support from Put OI */}
        {support && support.length > 0 && (
          <div className="rounded-lg p-2" style={{ backgroundColor: 'rgba(17, 24, 39, 0.5)', border: '1px solid rgba(30, 45, 61, 0.3)' }}>
            <div className="flex items-center gap-1 mb-1.5">
              <Shield size={10} className="text-green-400" />
              <span className="text-[9px] text-green-400 uppercase font-medium">Support (Put OI)</span>
            </div>
            {support.map((s, i) => (
              <div key={i} className="flex items-center justify-between py-0.5">
                <span className="text-[10px] text-gray-400 font-mono">₹{s.strike?.toFixed(0)}</span>
                <span className="text-[10px] text-green-400 font-mono">{formatLargeNumber(s.oi)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Resistance from Call OI */}
        {resistance && resistance.length > 0 && (
          <div className="rounded-lg p-2" style={{ backgroundColor: 'rgba(17, 24, 39, 0.5)', border: '1px solid rgba(30, 45, 61, 0.3)' }}>
            <div className="flex items-center gap-1 mb-1.5">
              <AlertTriangle size={10} className="text-red-400" />
              <span className="text-[9px] text-red-400 uppercase font-medium">Resistance (Call OI)</span>
            </div>
            {resistance.map((r, i) => (
              <div key={i} className="flex items-center justify-between py-0.5">
                <span className="text-[10px] text-gray-400 font-mono">₹{r.strike?.toFixed(0)}</span>
                <span className="text-[10px] text-red-400 font-mono">{formatLargeNumber(r.oi)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatLargeNumber(num) {
  if (!num) return '0';
  const absNum = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  if (absNum >= 10000000) return `${sign}${(absNum / 10000000).toFixed(2)}Cr`;
  if (absNum >= 100000) return `${sign}${(absNum / 100000).toFixed(2)}L`;
  if (absNum >= 1000) return `${sign}${(absNum / 1000).toFixed(1)}K`;
  return `${sign}${absNum}`;
}
