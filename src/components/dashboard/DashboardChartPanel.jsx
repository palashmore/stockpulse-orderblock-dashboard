import { useState, useMemo, useEffect } from 'react';
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

  const tfConfig = useMemo(() => TIMEFRAMES.find((t) => t.id === timeframe) || TIMEFRAMES[4], [timeframe]);

  useEffect(() => {
    let cancelled = false;
    if (demoMode) {
      setCandles(generateCandlestickData('RELIANCE', 120));
      return;
    }

    setLoading(true);
    fetchHistory(symbol, tfConfig.range, tfConfig.interval)
      .then((data) => {
        if (cancelled) return;
        if (data?.candles?.length) {
          setCandles(data.candles);
        } else {
          // Fallback to representative candles
          setCandles(generateCandlestickData('RELIANCE', 100));
        }
      })
      .catch(() => {
        if (!cancelled) setCandles(generateCandlestickData('RELIANCE', 100));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, tfConfig, demoMode]);

  const latest = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const price = latest?.close ?? 25623.45;
  const prevPrice = prev?.close ?? (latest?.open ?? 25600);
  const chg = price - prevPrice;
  const chgPct = prevPrice > 0 ? (chg / prevPrice) * 100 : 0;
  const isUp = chg >= 0;

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
            <span className="font-bold text-white">{price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            <span className="text-[11px] font-semibold" style={{ color: isUp ? GREEN : RED }}>
              {isUp ? '+' : ''}{chg.toFixed(2)} ({isUp ? '+' : ''}{chgPct.toFixed(2)}%)
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
        {candles.length > 0 && (
          <TradingChart
            candleData={candles}
            indicators={{ ...DEFAULT_INDICATORS, sma20: true, sma50: true, vwap: true }}
            resetKey={`${symbol}_${timeframe}`}
          />
        )}
      </div>
    </div>
  );
}
