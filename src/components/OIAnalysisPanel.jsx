import { useRef, useEffect } from 'react';
import { Shield, AlertTriangle, TrendingUp, TrendingDown, Activity, Target, Layers } from 'lucide-react';

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

    // Filter to strikes near current price (±8 strikes)
    const sorted = [...oiData].sort((a, b) => a.strike - b.strike);
    const currentIdx = sorted.findIndex((d) => d.strike >= currentPrice);
    const startIdx = Math.max(0, currentIdx - 7);
    const endIdx = Math.min(sorted.length, currentIdx + 7);
    const filtered = sorted.slice(startIdx, endIdx);

    if (filtered.length === 0) return;

    const maxOI = Math.max(...filtered.map((d) => Math.max(d.callOI || 0, d.putOI || 0)), 1);
    const barHeight = Math.min(10, (height - 30) / filtered.length - 1);
    const midX = width / 2;
    const maxBarWidth = midX - 35;

    // Header labels
    ctx.font = 'bold 9px Inter, sans-serif';
    ctx.fillStyle = '#00e676';
    ctx.textAlign = 'center';
    ctx.fillText('PUT OI (SUPPORT)', midX / 2, 10);

    ctx.fillStyle = '#ff1744';
    ctx.fillText('CALL OI (RESIST)', midX + midX / 2, 10);

    // Center divider line
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
      const isCurrentStrike = Math.abs(d.strike - currentPrice) < currentPrice * 0.005;

      // Call OI bar (right side - red)
      ctx.fillStyle = isCurrentStrike ? 'rgba(255, 23, 68, 0.65)' : 'rgba(255, 23, 68, 0.3)';
      ctx.fillRect(midX + 2, y, callWidth, barHeight);

      // Put OI bar (left side - green)
      ctx.fillStyle = isCurrentStrike ? 'rgba(0, 230, 118, 0.65)' : 'rgba(0, 230, 118, 0.3)';
      ctx.fillRect(midX - 2 - putWidth, y, putWidth, barHeight);

      // Strike price label in center
      ctx.font = isCurrentStrike ? 'bold 8.5px Inter, sans-serif' : '8px Inter, sans-serif';
      ctx.fillStyle = isCurrentStrike ? '#ffd600' : '#94a3b8';
      ctx.textAlign = 'center';
      ctx.fillText(d.strike.toFixed(0), midX, y + barHeight - 1);

      // Highlight current price strike
      if (isCurrentStrike) {
        ctx.strokeStyle = '#ffd600';
        ctx.lineWidth = 0.8;
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

// PCR Semi-circle Gauge
function PCRGauge({ pcr }) {
  const pcrValue = parseFloat(pcr) || 1;
  const angle = Math.min(Math.max((pcrValue - 0.3) / 1.4, 0), 1) * 180;
  const sentiment = pcrValue > 1.2 ? 'Bullish' : pcrValue < 0.8 ? 'Bearish' : 'Neutral';
  const color = pcrValue > 1.2 ? '#00e676' : pcrValue < 0.8 ? '#ff1744' : '#ffd600';

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: 80, height: 44, overflow: 'hidden' }}>
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
            opacity: 0.35,
          }}
        />
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
        <div className="text-[9px] uppercase tracking-wider font-semibold" style={{ color }}>
          {sentiment}
        </div>
      </div>
    </div>
  );
}

export default function OIAnalysisPanel({ optionsData, priceChange }) {
  if (!optionsData) {
    return (
      <div className="flex flex-col h-full overflow-hidden" style={{ backgroundColor: '#0d1117' }}>
        <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.4)' }}>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Open Interest Analytics</h3>
        </div>
        <div className="flex-1 flex items-center justify-center p-6 text-center">
          <div>
            <Activity size={24} className="mx-auto text-gray-600 mb-2 opacity-50" />
            <p className="text-xs text-gray-400 font-medium">Options Chain Unavailable</p>
            <p className="text-[10px] text-gray-600 mt-1">Real-time OI requires official NSE F&O derivatives coverage</p>
          </div>
        </div>
      </div>
    );
  }

  const {
    pcr,
    maxPain,
    totalCallOI,
    totalPutOI,
    totalCallOIChange,
    totalPutOIChange,
    support,
    resistance,
    underlyingValue,
    oiData,
    source,
  } = optionsData;

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

  // Aggregate ratio
  const grandTotal = (totalCallOI || 0) + (totalPutOI || 0);
  const putRatio = grandTotal > 0 ? ((totalPutOI || 0) / grandTotal) * 100 : 50;
  const callRatio = 100 - putRatio;

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ backgroundColor: '#0d1117' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.4)', backgroundColor: '#0a0e17' }}
      >
        <div className="flex items-center gap-1.5">
          <Layers size={13} className="text-cyan-400" />
          <h3 className="text-xs font-bold text-gray-200 uppercase tracking-wider">OI Analytics</h3>
        </div>
        <span
          className="text-[9px] px-1.5 py-0.5 rounded font-mono font-medium text-gray-400"
          style={{ backgroundColor: 'rgba(30, 45, 61, 0.5)' }}
        >
          {[source, optionsData.dataStatus].filter(Boolean).join(' · ')}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
        {/* OI Buildup Badge Card */}
        <div
          className="rounded-lg p-2.5 flex items-center gap-3"
          style={{
            background: `linear-gradient(135deg, ${buildupColor}15, ${buildupColor}05)`,
            border: `1px solid ${buildupColor}35`,
          }}
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${buildupColor}20` }}>
            <BuildupIcon size={16} style={{ color: buildupColor }} />
          </div>
          <div>
            <div className="text-xs font-bold tracking-wide" style={{ color: buildupColor }}>
              {buildupType}
            </div>
            <div className="text-[10px] text-gray-400">Institutional Derivative Activity</div>
          </div>
        </div>

        {/* PCR + Max Pain Grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg p-2.5" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
            <div className="text-[9px] text-gray-500 uppercase mb-1 text-center font-medium">Put-Call Ratio</div>
            <PCRGauge pcr={pcr} />
          </div>
          <div className="rounded-lg p-2.5" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
            <div className="text-[9px] text-gray-500 uppercase mb-1 text-center font-medium">Max Pain Strike</div>
            <div className="flex flex-col items-center mt-2">
              <Target size={16} style={{ color: '#ffd600' }} className="mb-1" />
              <div className="text-sm font-bold font-mono" style={{ color: '#ffd600' }}>
                ₹{maxPain?.toFixed(0) || '—'}
              </div>
              <div className="text-[9px] text-gray-500 mt-0.5">CMP: ₹{underlyingValue?.toFixed(0) || '—'}</div>
            </div>
          </div>
        </div>

        {/* Total Call vs Put OI Ratio Bar */}
        <div className="rounded-lg p-2.5" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
          <div className="flex items-center justify-between text-[9px] text-gray-500 uppercase mb-1.5 font-medium">
            <span style={{ color: '#00e676' }}>Put OI: {formatLargeNumber(totalPutOI)}</span>
            <span style={{ color: '#ff1744' }}>Call OI: {formatLargeNumber(totalCallOI)}</span>
          </div>

          <div className="h-1.5 w-full bg-gray-800 rounded-full flex overflow-hidden mb-2">
            <div style={{ width: `${putRatio}%`, backgroundColor: '#00e676' }} />
            <div style={{ width: `${callRatio}%`, backgroundColor: '#ff1744' }} />
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-[9px] text-gray-500">Put Chg</div>
              <div className="font-mono text-[11px] font-semibold" style={{ color: totalPutOIChange >= 0 ? '#00e676' : '#ff1744' }}>
                {totalPutOIChange >= 0 ? '+' : ''}{formatLargeNumber(totalPutOIChange)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[9px] text-gray-500">Call Chg</div>
              <div className="font-mono text-[11px] font-semibold" style={{ color: totalCallOIChange >= 0 ? '#ff1744' : '#00e676' }}>
                {totalCallOIChange >= 0 ? '+' : ''}{formatLargeNumber(totalCallOIChange)}
              </div>
            </div>
          </div>
        </div>

        {/* OI Distribution Chart */}
        {oiData && oiData.length > 0 && (
          <div className="rounded-lg p-2.5" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
            <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1 font-medium">Strike Distribution</div>
            <OIDistributionChart oiData={oiData} currentPrice={underlyingValue} width={260} height={180} />
          </div>
        )}

        {/* Key Support (Put OI) */}
        {support && support.length > 0 && (
          <div className="rounded-lg p-2.5" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
            <div className="flex items-center gap-1 mb-1.5">
              <Shield size={11} style={{ color: '#00e676' }} />
              <span className="text-[10px] uppercase font-bold" style={{ color: '#00e676' }}>
                Key Supports (Put Wall)
              </span>
            </div>
            {support.map((s, i) => (
              <div key={i} className="flex items-center justify-between py-0.5">
                <span className="text-xs font-mono text-gray-200">₹{s.strike?.toFixed(0)}</span>
                <span className="text-xs font-mono font-medium" style={{ color: '#00e676' }}>
                  {formatLargeNumber(s.oi)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Key Resistance (Call OI) */}
        {resistance && resistance.length > 0 && (
          <div className="rounded-lg p-2.5" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
            <div className="flex items-center gap-1 mb-1.5">
              <AlertTriangle size={11} style={{ color: '#ff1744' }} />
              <span className="text-[10px] uppercase font-bold" style={{ color: '#ff1744' }}>
                Key Resistances (Call Wall)
              </span>
            </div>
            {resistance.map((r, i) => (
              <div key={i} className="flex items-center justify-between py-0.5">
                <span className="text-xs font-mono text-gray-200">₹{r.strike?.toFixed(0)}</span>
                <span className="text-xs font-mono font-medium" style={{ color: '#ff1744' }}>
                  {formatLargeNumber(r.oi)}
                </span>
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
