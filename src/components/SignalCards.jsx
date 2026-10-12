import { useRef, useEffect } from 'react';
import { Shield, AlertTriangle } from 'lucide-react';

function MiniSparkline({ data, color, width = 80, height = 30 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const stepX = width / (data.length - 1);

    // Gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, color + '30');
    gradient.addColorStop(1, color + '05');

    ctx.beginPath();
    ctx.moveTo(0, height);
    data.forEach((val, i) => {
      const x = i * stepX;
      const y = height - ((val - min) / range) * height * 0.8 - height * 0.1;
      if (i === 0) ctx.lineTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Line
    ctx.beginPath();
    data.forEach((val, i) => {
      const x = i * stepX;
      const y = height - ((val - min) / range) * height * 0.8 - height * 0.1;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // End dot
    const lastX = (data.length - 1) * stepX;
    const lastY = height - ((data[data.length - 1] - min) / range) * height * 0.8 - height * 0.1;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }, [data, color, width, height]);

  return <canvas ref={canvasRef} style={{ width, height }} />;
}

function SignalCard({ signal }) {
  const isBull = signal.type === 'BULL';
  const color = isBull ? '#00e676' : '#ff1744';
  const bgGradient = isBull
    ? 'linear-gradient(135deg, rgba(0, 230, 118, 0.06) 0%, rgba(0, 200, 83, 0.02) 100%)'
    : 'linear-gradient(135deg, rgba(255, 23, 68, 0.06) 0%, rgba(213, 0, 0, 0.02) 100%)';
  const borderColor = isBull ? 'rgba(0, 230, 118, 0.2)' : 'rgba(255, 23, 68, 0.2)';

  return (
    <div
      className="rounded-lg p-3 transition-all hover:scale-[1.01] cursor-pointer"
      style={{ background: bgGradient, border: `1px solid ${borderColor}` }}
    >
      {/* Top Row: Badge + Label + Sparkline */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className="px-2 py-0.5 rounded text-xs font-bold"
            style={{
              backgroundColor: isBull ? 'rgba(0, 230, 118, 0.2)' : 'rgba(255, 23, 68, 0.2)',
              color,
            }}
          >
            {signal.type}
          </span>
          <div
            className="w-2 h-2 rounded-full"
            style={{
              backgroundColor: color,
              boxShadow: `0 0 6px ${color}`,
              animation: 'pulse 2s infinite',
            }}
          />
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-[10px] font-semibold tracking-wide" style={{ color }}>
            {signal.label}
          </span>
          <div className="flex items-center gap-1 text-[10px] text-gray-500">
            <span>OI:</span>
            <span style={{ color }}>{signal.oi}</span>
          </div>
        </div>
      </div>

      {/* Sparkline */}
      <div className="mb-2">
        <MiniSparkline data={signal.sparkData} color={color} width={200} height={35} />
      </div>

      {/* S/R Levels Row */}
      <div className="grid grid-cols-5 gap-1 text-center">
        <div>
          <div className="text-[9px] text-gray-600 mb-0.5">S1</div>
          <div className="text-[10px] text-gray-400 font-mono">{signal.s1}</div>
        </div>
        <div>
          <div className="text-[9px] text-gray-600 mb-0.5">ZONE</div>
          <div className="text-[10px] font-mono" style={{ color }}>{signal.zone}</div>
        </div>
        <div>
          <div className="text-[9px] text-gray-600 mb-0.5">R1</div>
          <div className="text-[10px] text-gray-400 font-mono">{signal.r1}</div>
        </div>
        <div>
          <div className="text-[9px] text-gray-600 mb-0.5">R2</div>
          <div className="text-[10px] text-gray-400 font-mono">{signal.r2}</div>
        </div>
        <div>
          <div className="text-[9px] text-gray-600 mb-0.5">RISK</div>
          <div className="flex items-center justify-center">
            {signal.risk === 'LOW' ? (
              <Shield size={10} className="text-green-400" />
            ) : signal.risk === 'HIGH' ? (
              <AlertTriangle size={10} className="text-red-400" />
            ) : (
              <AlertTriangle size={10} className="text-yellow-400" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignalCards({ signals }) {
  if (!signals || signals.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-600 text-sm">
        No signals: options data is unavailable for this stock
      </div>
    );
  }

  const bullSignals = signals.filter((s) => s.type === 'BULL');
  const bearSignals = signals.filter((s) => s.type === 'BEAR');

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Signals</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {bullSignals.map((signal, i) => (
          <SignalCard key={`bull-${i}`} signal={signal} />
        ))}
        {bearSignals.map((signal, i) => (
          <SignalCard key={`bear-${i}`} signal={signal} />
        ))}
      </div>
    </div>
  );
}
