import { useState, useMemo, useCallback } from 'react';
import { useRefresh } from '../../hooks/useRefresh';
import Freshness from '../Freshness';
import TradingChart from '../TradingChart';
import { generateCandlestickData } from '../../data/stockData';
import { fetchHistory } from '../../services/api';
import { DEFAULT_INDICATORS } from '../../data/chartConfig';

const GREEN = '#00e676';
const RED = '#ff1744';

const TIMEFRAMES = [
  { id: '1m', label: '1m', range: '1d', interval: '1m' },
  { id: '5m', label: '5m', range: '5d', interval: '5m' },
  { id: '15m', label: '15m', range: '5d', interval: '15m' },
  { id: '1h', label: '1h', range: '1mo', interval: '60m' },
  { id: 'D', label: 'D', range: '6mo', interval: '1d' },
  { id: 'W', label: 'W', range: '2y', interval: '1wk' },
  { id: 'M', label: 'M', range: '5y', interval: '1mo' },
];

export default function DashboardChartPanel({ symbol = '^NSEI', displayName = 'NIFTY 50', demoMode = false }) {
  const [timeframe, setTimeframe] = useState('D');
  const [candles, setCandles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loadedKey, setLoadedKey] = useState('');

  const tfConfig = useMemo(() => TIMEFRAMES.find((t) => t.id === timeframe) || TIMEFRAMES[4], [timeframe]);
  const key = `${symbol}_${timeframe}`;

  // Real index candles only, refreshed on the shared scheduler without remounting the chart.
  // A failed refresh keeps the last good candles (and says so); it never substitutes another symbol's data.
  const load = useCallback(async () => {
    if (demoMode) return null;
    setLoading(true);
    const data = await fetchHistory(symbol, tfConfig.range, tfConfig.interval);
    setLoading(false);
    if (!data?.candles?.length) { setFailed(true); return null; }
    setCandles(data.candles);
    setLoadedKey(key);
    setFailed(false);
    return data;
  }, [symbol, tfConfig, demoMode, key]);
  const feed = useRefresh(`dash-chart:${key}`, load, !demoMode);

  const shown = demoMode ? generateCandlestickData('NIFTY', 120) : loadedKey === key ? candles : [];
  const latest = shown[shown.length - 1];
  const prev = shown[shown.length - 2];
  const price = latest?.close ?? null;
  const prevPrice = prev?.close ?? null;
  const chg = price !== null && prevPrice !== null ? price - prevPrice : null;
  const chgPct = chg !== null && prevPrice > 0 ? (chg / prevPrice) * 100 : null;
  const isUp = (chg ?? 0) >= 0;

  return (
    <div className="flex flex-col h-full rounded-lg p-3 shadow-sm" style={{ backgroundColor: '#0d1117', border: '1px solid rgba(30, 45, 61, 0.5)' }}>
      {/* Top Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1 pb-1.5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-3.5 bg-yellow-400 rounded-sm" />
          <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
            {displayName}
          </h3>
          <div className="flex items-baseline gap-1.5 font-mono text-xs">
            <span className="font-bold text-white">{price === null ? '—' : price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            <span className="text-[11px] font-semibold" style={{ color: isUp ? GREEN : RED }}>
              {chg === null ? '' : `${isUp ? '+' : ''}${chg.toFixed(2)} (${isUp ? '+' : ''}${chgPct.toFixed(2)}%)`}
            </span>
          </div>
        </div>

        {/* Timeframe Bar */}
        <div className="flex items-center gap-1">
          <div className="flex items-center bg-black/40 rounded p-0.5 border border-white/5 text-[10px]">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.id}
                onClick={() => setTimeframe(tf.id)}
                className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                  timeframe === tf.id ? 'bg-white/15 text-white font-semibold' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="flex-1 min-h-[220px] max-h-[300px] w-full relative">
        {loading && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-10 text-xs text-gray-400">
            Updating Chart…
          </div>
        )}
        {shown.length === 0 && !loading && (
          <div className="absolute inset-0 flex items-center justify-center text-center text-xs text-gray-500 px-4">Chart data unavailable for {displayName} right now.</div>
        )}
        {!demoMode && <div className="absolute right-1 bottom-0 z-10"><Freshness lastSuccessAt={feed.lastSuccessAt} failures={failed ? Math.max(1, feed.failures) : feed.failures} /></div>}
        {shown.length > 0 && (
          <TradingChart
            candleData={shown}
            indicators={{ ...DEFAULT_INDICATORS, sma20: true, sma50: true, vwap: true }}
            resetKey={`${symbol}_${timeframe}`}
          />
        )}
      </div>
    </div>
  );
}
