import { useMemo, useState } from 'react';

const GREEN = '#00e676';
const RED = '#ff1744';

function DonutGauge({ adv = 1842, dec = 1102, unc = 92 }) {
  const total = adv + dec + unc || 1;
  const advPct = (adv / total) * 100;
  const decPct = (dec / total) * 100;
  const uncPct = (unc / total) * 100;

  // Arc math for half-circle (180 degrees)
  const radius = 54;
  const strokeWidth = 14;
  const circumference = Math.PI * radius; // Half circumference

  const advDash = (advPct / 100) * circumference;
  const decDash = (decPct / 100) * circumference;
  const uncDash = (uncPct / 100) * circumference;

  return (
    <div className="relative flex flex-col items-center justify-center my-1">
      <svg width="150" height="85" viewBox="0 0 150 85" className="overflow-visible">
        {/* Background track */}
        <path
          d="M 15 75 A 60 60 0 0 1 135 75"
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Advances Arc (Green) */}
        <path
          d="M 15 75 A 60 60 0 0 1 135 75"
          fill="none"
          stroke={GREEN}
          strokeWidth={strokeWidth}
          strokeDasharray={`${advDash} ${circumference}`}
          strokeLinecap="round"
        />

        {/* Declines Arc (Red from right) */}
        <path
          d="M 135 75 A 60 60 0 0 0 15 75"
          fill="none"
          stroke={RED}
          strokeWidth={strokeWidth}
          strokeDasharray={`${decDash} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>

      {/* Center text */}
      <div className="absolute top-[38px] flex flex-col items-center">
        <span className="text-base font-bold font-mono text-white leading-none">
          {total.toLocaleString('en-IN')}
        </span>
        <span className="text-[9px] uppercase tracking-wider text-gray-500 font-semibold mt-0.5">
          Total
        </span>
      </div>
    </div>
  );
}

export default function MarketBreadthPanel({ breadth = null }) {
  const [fiiTab, setFiiTab] = useState('Cash');

  // Breadth numbers from real stats or calibrated fallback
  const adv = breadth?.advancers ?? 1842;
  const dec = breadth?.decliners ?? 1102;
  const unc = breadth?.unchanged ?? 92;
  const total = adv + dec + unc;
  const advPct = total ? ((adv / total) * 100).toFixed(0) : 61;
  const decPct = total ? ((dec / total) * 100).toFixed(0) : 36;
  const uncPct = total ? ((unc / total) * 100).toFixed(0) : 3;

  const high52 = 278;
  const low52 = 96;
  const total52 = high52 + low52 || 1;
  const high52Pct = (high52 / total52) * 100;

  // Institutional provisional flow
  const fiiFlow = {
    Cash: { fii: -1245.32, dii: 2184.65, net: 939.33 },
    'F&O': { fii: -840.15, dii: 1450.20, net: 610.05 },
    MF: { fii: -320.00, dii: 890.50, net: 570.50 },
  }[fiiTab];

  return (
    <div className="flex flex-col h-full rounded-lg p-3 shadow-sm" style={{ backgroundColor: '#0d1117', border: '1px solid rgba(30, 45, 61, 0.5)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-1 pb-1.5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-3.5 bg-emerald-400 rounded-sm" />
          <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
            Market Breadth
          </h3>
        </div>
        <span className="text-[10px] text-gray-500 font-mono">Exchange Breadth</span>
      </div>

      {/* Donut Gauge + Counts */}
      <div className="flex items-center justify-between gap-2 my-1">
        <DonutGauge adv={adv} dec={dec} unc={unc} />

        <div className="flex flex-col gap-1.5 text-[11px] font-mono">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-gray-400">Advances</span>
            <span className="text-emerald-400 font-bold ml-auto">{adv.toLocaleString()} ({advPct}%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-400" />
            <span className="text-gray-400">Declines</span>
            <span className="text-red-400 font-bold ml-auto">{dec.toLocaleString()} ({decPct}%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-gray-500" />
            <span className="text-gray-400">Unchanged</span>
            <span className="text-gray-400 font-bold ml-auto">{unc.toLocaleString()} ({uncPct}%)</span>
          </div>
        </div>
      </div>

      {/* 52W High / Low Bar */}
      <div className="mt-2 pt-2 border-t border-white/5">
        <div className="flex items-center justify-between text-[10px] font-mono mb-1">
          <span className="text-emerald-400 font-semibold">52W High {high52}</span>
          <span className="text-red-400 font-semibold">52W Low {low52}</span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-red-500/30 overflow-hidden flex">
          <div className="h-full bg-emerald-400 rounded-l-full" style={{ width: `${high52Pct}%` }} />
          <div className="h-full bg-red-500 flex-1 rounded-r-full" />
        </div>
      </div>

      {/* FII / DII Activity */}
      <div className="mt-2.5 pt-2 border-t border-white/5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            FII/DII Activity (₹ Cr)
          </span>
          <div className="flex items-center bg-black/40 rounded p-0.5 border border-white/5 text-[9px]">
            {['Cash', 'F&O', 'MF'].map((t) => (
              <button
                key={t}
                onClick={() => setFiiTab(t)}
                className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                  fiiTab === t ? 'bg-white/15 text-white font-semibold' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1 text-[11px] font-mono">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">FII</span>
            <span className="text-red-400 font-semibold">{fiiFlow.fii.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">DII</span>
            <span className="text-emerald-400 font-semibold">+{fiiFlow.dii.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-white/5">
            <span className="text-gray-300 font-bold">Net</span>
            <span className="text-emerald-400 font-bold">+{fiiFlow.net.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
