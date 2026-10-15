import { useCallback, useState } from 'react';
import { useRefresh } from '../hooks/useRefresh';
import { RefreshCw, TrendingUp, TrendingDown, Minus, ShieldCheck, Activity } from 'lucide-react';
import { fetchHistory } from '../services/api';
import { MTF_FRAMES, timeframeTrend, alignment } from '../data/mtf';
import { dropFormingBar } from '../data/strategyGate';
import { STATUS_META } from '../data/dataStatus';

const GREEN = '#00e676';
const RED = '#ff1744';
const TREND = {
  up: { label: 'BULLISH', color: GREEN, icon: TrendingUp },
  down: { label: 'BEARISH', color: RED, icon: TrendingDown },
  mixed: { label: 'MIXED', color: '#ffd600', icon: Minus },
  unknown: { label: 'N/A', color: '#64748b', icon: Minus },
};

export default function MultiTimeframePanel({ symbol, demoMode }) {
  const [frames, setFrames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadedAt, setLoadedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const results = await Promise.all(
      MTF_FRAMES.map(async (f) => {
        const h = await fetchHistory(symbol, f.range, f.interval);
        if (!h) return { ...f, reading: { state: 'unknown', candles: 0 }, status: 'UNAVAILABLE' };
        const done = h.candles.filter((c) => !c.partial);
        const usable = f.intraday ? dropFormingBar(done, f.intervalMs, Date.now()) : done;
        return { ...f, reading: timeframeTrend(usable), status: h.dataStatus, provider: h.provider };
      })
    );
    setLoading(false);
    if (results.every((f) => f.status === 'UNAVAILABLE')) return false; // keep the last good reading
    setFrames(results);
    setLoadedAt(Date.now());
    return true;
  }, [symbol]);

  useRefresh(`mtf:${symbol}`, async () => ((await load()) ? { ok: true } : null), !demoMode);

  if (demoMode) {
    return (
      <div className="p-4 text-xs text-gray-500 bg-[#0d1117] h-full">
        Multi-timeframe engine requires real market candles (disabled in simulated mode).
      </div>
    );
  }

  const summary = frames.length ? alignment(frames.map((f) => f.reading)) : null;
  const upCount = frames.filter((f) => f.reading?.state === 'up').length;
  const downCount = frames.filter((f) => f.reading?.state === 'down').length;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#0d1117]">
      {/* Top Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-white/5 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}
      >
        <div className="flex items-center gap-1.5">
          <Activity size={13} className="text-cyan-400" />
          <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
            MTF Trend Concordance
          </h3>
        </div>
        <button
          onClick={load}
          disabled={loading}
          aria-label="Refresh"
          className="p-1 rounded text-gray-500 hover:text-gray-200 hover:bg-white/5 cursor-pointer"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {/* Alignment Hero Card */}
        {summary && (
          <div className="p-2.5 rounded-lg border border-white/5 bg-[#111827]/70">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-400 font-medium">Alignment Score</span>
              <span
                className="font-bold font-mono text-[11px]"
                style={{ color: upCount >= 4 ? GREEN : downCount >= 4 ? RED : '#ffd600' }}
              >
                {upCount > downCount ? `${upCount}/5 BULL` : downCount > upCount ? `${downCount}/5 BEAR` : 'MIXED CHOP'}
              </span>
            </div>
            <p className="text-[11px] text-gray-300 leading-snug">{summary.label}</p>
          </div>
        )}

        {frames.length === 0 && (
          <p className="text-xs text-gray-600 py-3">{loading ? 'Analyzing 5 timeframes…' : 'No data yet.'}</p>
        )}

        {/* Individual Timeframe Cards */}
        <div className="space-y-1.5">
          {frames.map((f) => {
            const t = TREND[f.reading?.state] || TREND.unknown;
            const r = f.reading;
            const Icon = t.icon;
            return (
              <div
                key={f.id}
                className="p-2 rounded border border-white/5 bg-[#111827]/40 hover:bg-[#111827]/80 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold font-mono text-gray-200">{f.label}</span>
                    <span className="text-[9px] px-1 py-0.2 rounded bg-white/5 text-gray-400">
                      {f.range}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] font-bold" style={{ color: t.color }}>
                    <Icon size={12} />
                    <span>{t.label}</span>
                  </div>
                </div>

                {r.state === 'unknown' ? (
                  <p className="text-[10px] text-gray-600">
                    {r.candles ? `Only ${r.candles} candles loaded` : 'No data available'}
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-1 pt-1 border-t border-white/5 text-[9px] font-mono text-gray-400">
                    <div>
                      RSI: <span className="text-gray-200">{r.rsi === null ? '—' : r.rsi.toFixed(0)}</span>
                    </div>
                    <div>
                      MACD: <span style={{ color: r.macdHist >= 0 ? GREEN : RED }}>{r.macdHist === null ? '—' : r.macdHist >= 0 ? '+Bull' : '-Bear'}</span>
                    </div>
                    <div className="text-right">
                      ADX: <span className="text-gray-200">{r.adx === null ? '—' : r.adx.toFixed(0)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Info */}
      <div
        className="px-3 py-1.5 text-[9px] text-gray-500 border-t border-white/5 flex items-center justify-between"
        style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}
      >
        <span>EMA 20 &gt; 50 = Bullish</span>
        {loadedAt && (
          <span className="font-mono">
            {new Date(loadedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} IST
          </span>
        )}
      </div>
    </div>
  );
}
