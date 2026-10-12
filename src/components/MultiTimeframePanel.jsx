import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { fetchHistory } from '../services/api';
import { MTF_FRAMES, timeframeTrend, alignment } from '../data/mtf';
import { dropFormingBar } from '../data/strategyGate';
import { STATUS_META } from '../data/dataStatus';

const GREEN = '#00e676';
const RED = '#ff1744';
const TREND = { up: { label: 'UP', color: GREEN }, down: { label: 'DOWN', color: RED }, mixed: { label: 'MIXED', color: '#ffd600' }, unknown: { label: 'N/A', color: '#64748b' } };
const REFRESH_MS = 120000;

// Trend on five timeframes for the selected stock, from completed candles only. It describes where each
// timeframe stands; it does not combine them into a trade call.
export default function MultiTimeframePanel({ symbol, demoMode }) {
  const [frames, setFrames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadedAt, setLoadedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const results = await Promise.all(MTF_FRAMES.map(async (f) => {
      const h = await fetchHistory(symbol, f.range, f.interval);
      if (!h) return { ...f, reading: { state: 'unknown', candles: 0 }, status: 'UNAVAILABLE' };
      const done = h.candles.filter((c) => !c.partial);
      const usable = f.intraday ? dropFormingBar(done, f.intervalMs, Date.now()) : done;
      return { ...f, reading: timeframeTrend(usable), status: h.dataStatus, provider: h.provider };
    }));
    setFrames(results);
    setLoadedAt(Date.now());
    setLoading(false);
  }, [symbol]);

  useEffect(() => {
    if (demoMode) return undefined;
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load, demoMode]);

  if (demoMode) return <p className="px-3 py-4 text-xs text-gray-500">Needs real market data (off in simulated mode).</p>;
  const summary = frames.length ? alignment(frames.map((f) => f.reading)) : null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Multi-timeframe trend</h3>
        <button onClick={load} disabled={loading} aria-label="Refresh" className="p-1 rounded text-gray-500 hover:text-gray-200 hover:bg-white/5 cursor-pointer">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {summary && <p className="text-xs text-gray-300 mb-2">{summary.label}</p>}
        {frames.length === 0 && <p className="text-xs text-gray-600">{loading ? 'Loading five timeframes…' : 'No data yet.'}</p>}
        {frames.map((f) => {
          const t = TREND[f.reading.state];
          const r = f.reading;
          return (
            <div key={f.id} className="py-2" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-300">{f.label}</span>
                <span className="text-[11px] font-semibold" style={{ color: t.color }}>{t.label}</span>
              </div>
              {r.state === 'unknown' ? (
                <p className="text-[10px] text-gray-600">{r.candles ? `Only ${r.candles} candles; about 50 are needed` : 'No data for this timeframe'}</p>
              ) : (
                <p className="text-[10px] text-gray-500 font-mono">
                  RSI {r.rsi === null ? '—' : r.rsi.toFixed(0)} · MACD {r.macdHist === null ? '—' : r.macdHist >= 0 ? '+' : '−'} · ADX {r.adx === null ? '—' : r.adx.toFixed(0)}
                </p>
              )}
              <p className="text-[9px] text-gray-700">{STATUS_META[f.status]?.label ?? f.status}{f.provider ? ` · ${f.provider}` : ''}</p>
            </div>
          );
        })}
      </div>

      <p className="px-3 py-2 text-[9px] text-gray-600" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}>
        UP = close above the 20-period EMA above the 50-period EMA; DOWN is the reverse. Completed candles only.
        {loadedAt ? ` Loaded ${new Date(loadedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.` : ''}
      </p>
    </div>
  );
}
