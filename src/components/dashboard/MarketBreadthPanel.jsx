
const GREEN = '#00e676';
const RED = '#ff1744';

function DonutGauge({ adv = 0, dec = 0, unc = 0 }) {
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
  // Breadth is counted from the stocks actually loaded; with none loaded there is no breadth to show
  const adv = breadth?.advancers ?? 0;
  const dec = breadth?.decliners ?? 0;
  const unc = breadth?.unchanged ?? 0;
  const total = adv + dec + unc;
  const pctOf = (n) => (total ? ((n / total) * 100).toFixed(0) : '0');
  const advPct = pctOf(adv);
  const decPct = pctOf(dec);
  const uncPct = pctOf(unc);
  if (total === 0) {
    return (
      <div className="flex flex-col h-full rounded-lg p-3 shadow-sm" style={{ backgroundColor: '#0d1117', border: '1px solid rgba(30, 45, 61, 0.5)' }}>
        <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">Market Breadth</h3>
        <div className="flex-1 flex items-center justify-center text-center text-[11px] text-gray-500">Breadth is counted from loaded stock quotes, which are not available right now.</div>
      </div>
    );
  }

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

      <div className="mt-2 pt-2 border-t border-white/5 text-[10px] text-gray-500">
        Counted from the {total.toLocaleString('en-IN')} loaded stocks in the selected universe. 52-week highs/lows and FII/DII flows are not shown because no feed for them is connected.
      </div>
    </div>
  );
}
