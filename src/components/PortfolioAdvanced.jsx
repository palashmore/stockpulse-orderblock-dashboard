import { useEffect, useMemo, useState } from 'react';
import { fetchHistory } from '../services/api';
import { advancedPortfolio, advancedFindings } from '../data/portfolioAdvanced';

const GREEN = '#00e676';
const RED = '#ff1744';
const AMBER = '#ffd600';
const pct = (v, d = 1) => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(d)}%` : '—');
const plain = (v, d = 1) => (Number.isFinite(v) ? `${v.toFixed(d)}%` : '—');
const colour = (v) => (!Number.isFinite(v) ? '#9ca3af' : v >= 0 ? GREEN : RED);
const inr = (v) => `${v < 0 ? '-' : ''}₹${Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

function Card({ label, value, sub, color }) {
  return (
    <div className="p-3 rounded-lg min-w-0" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
      <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">{label}</div>
      <div className="text-base font-mono font-bold mt-0.5 text-gray-100" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">{sub}</div>}
    </div>
  );
}

export default function PortfolioAdvanced({ analysis, candles, holdings, loading, progress, hidden }) {
  const [bench, setBench] = useState({ candles: null, done: false });
  const [cap, setCap] = useState(15);

  useEffect(() => {
    let cancelled = false;
    fetchHistory('^NSEI', '1y', '1d', { bulk: true }).then((h) => { if (!cancelled) setBench({ candles: h?.candles ?? null, done: true }); });
    return () => { cancelled = true; };
  }, []);

  const result = useMemo(
    () => (candles && holdings ? advancedPortfolio({ holdings, candlesBySymbol: candles, benchmarkCandles: bench.candles, capPct: cap }) : null),
    [candles, holdings, bench.candles, cap],
  );
  const findings = useMemo(() => advancedFindings(result), [result]);
  const mask = (t) => (hidden ? '••••' : t);

  if (!analysis && loading) {
    return <div className="p-6 text-xs text-gray-500">Loading price history… {progress.done} of {progress.total} holdings</div>;
  }
  if (!result) return <div className="p-6 text-xs text-gray-500">Open this view after the review has loaded price history.</div>;
  if (!result.ok) return <div className="p-6 text-xs" style={{ color: AMBER }}>{result.reason}</div>;
  const r = result;

  return (
    <div className="px-3 sm:px-4 py-3 space-y-4 flex-shrink-0">
      <div className="text-[11px] text-gray-500 leading-snug">
        Window: {r.window.from} to {r.window.to} ({r.window.days} trading days) · {r.stocks} stocks covering {r.coveragePct.toFixed(0)}% of value.
        History uses today&apos;s mix on past prices, not your actual past returns. Descriptive statistics, not advice.
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Card label="Volatility (yearly)" value={plain(r.volPct)} sub="How much the mix swings" />
        <Card label="Worst 5% day (VaR)" value={pct(r.var95Pct, 2)} sub={`Average of those days ${pct(r.es95Pct, 2)}`} color={RED} />
        <Card label="Max drawdown" value={pct(r.maxDrawdownPct)} sub="Deepest fall from a peak" color={RED} />
        <Card label="Return in window" value={pct(r.returnPct)} sub="Today's mix, past prices" color={colour(r.returnPct)} />
        <Card label="Beta vs Nifty" value={r.beta === null ? (bench.done ? 'n/a' : '…') : r.beta.toFixed(2)} sub={r.beta === null ? 'Index history unavailable' : `Correlation ${r.correlation.toFixed(2)} over ${r.benchmarkDays} days`} />
        <Card label="Diversification ratio" value={r.diversificationRatio === null ? '—' : r.diversificationRatio.toFixed(2)} sub="1.0 = no benefit; higher is better" />
        <Card label="Best day" value={pct(r.bestDayPct, 2)} color={GREEN} />
        <Card label="Worst day" value={pct(r.worstDayPct, 2)} color={RED} />
      </div>

      <section>
        <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">What stands out</h3>
        <ul className="space-y-1.5">
          {findings.map((f, i) => (
            <li key={i} className="text-xs leading-snug pl-2" style={{ borderLeft: `3px solid ${f.level === 'warn' ? AMBER : '#475569'}`, color: '#cbd5e1' }}>{f.text}</li>
          ))}
        </ul>
      </section>

      {r.stress.length > 0 && (
        <section>
          <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">If the market falls (using beta {r.beta.toFixed(2)})</h3>
          <div className="grid grid-cols-3 gap-2">
            {r.stress.map((s) => (
              <Card key={s.marketPct} label={`Market ${s.marketPct}%`} value={pct(s.portfolioPct)} sub={mask(inr(s.amount))} color={RED} />
            ))}
          </div>
          <p className="text-[10px] text-gray-500 mt-1">A rough scale from past behaviour; real falls differ, especially in crashes.</p>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">Single-stock cap</h3>
          <label className="text-[11px] text-gray-400 flex items-center gap-1">
            Cap
            <select value={cap} onChange={(e) => setCap(Number(e.target.value))} className="bg-[#111827] border border-[#1e2d3d] rounded px-1 py-0.5 text-gray-200">
              {[10, 15, 20, 25].map((c) => <option key={c} value={c}>{c}%</option>)}
            </select>
          </label>
        </div>
        {r.overCap.length === 0 ? (
          <p className="text-xs text-gray-400">No holding is above {r.capPct}%.</p>
        ) : (
          <ul className="space-y-1">
            {r.overCap.map((o) => (
              <li key={o.symbol} className="text-xs text-gray-300 flex justify-between gap-2">
                <span className="font-semibold">{o.symbol} <span className="text-gray-500 font-normal">{o.weightPct.toFixed(1)}%</span></span>
                <span className="font-mono" style={{ color: AMBER }}>{mask(inr(o.excessValue))} above the cap</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">Holding by holding (largest risk first)</h3>
        <div className="space-y-2">
          {r.rows.map((x) => (
            <div key={x.symbol} className="p-2.5 rounded-lg" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-bold text-gray-100 text-sm">{x.symbol}</span>
                  <span className="text-[10px] text-gray-500 ml-2 truncate">{x.name}</span>
                </div>
                <span className="text-[11px] font-mono text-gray-400 flex-shrink-0">weight {x.weightPct.toFixed(1)}%</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-gray-800 overflow-hidden relative" title="Bar: share of portfolio risk. Tick: share of money.">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(1, x.riskSharePct))}%`, backgroundColor: x.riskVsWeight > 1.5 ? AMBER : '#22d3ee' }} />
                <div className="absolute top-0 bottom-0 w-px bg-white/70" style={{ left: `${Math.min(100, x.weightPct)}%` }} />
              </div>
              <div className="mt-1.5 grid grid-cols-3 sm:grid-cols-6 gap-x-2 gap-y-1 text-[10px] font-mono">
                <span className="text-gray-500">Risk <b className="text-gray-200">{plain(x.riskSharePct)}</b></span>
                <span className="text-gray-500">Vol <b className="text-gray-200">{plain(x.volPct, 0)}</b></span>
                <span className="text-gray-500">Beta <b className="text-gray-200">{x.beta === null ? '—' : x.beta.toFixed(2)}</b></span>
                <span className="text-gray-500">1M <b style={{ color: colour(x.ret1m) }}>{pct(x.ret1m)}</b></span>
                <span className="text-gray-500">3M <b style={{ color: colour(x.ret3m) }}>{pct(x.ret3m)}</b></span>
                <span className="text-gray-500">From high <b style={{ color: colour(x.fromHighPct) }}>{pct(x.fromHighPct)}</b></span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-500 mt-2">Bar = share of the portfolio&apos;s risk; white tick = share of the money. A bar beyond its tick means the stock adds more risk than money.</p>
      </section>
    </div>
  );
}
