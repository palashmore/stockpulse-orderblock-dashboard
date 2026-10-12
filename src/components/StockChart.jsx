import { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createSeriesMarkers,
} from 'lightweight-charts';

import { calculateVWAP } from '../data/marketAnalysis';
import { TIMEFRAMES, getTimeframe } from '../data/timeframes';

export function TimeframeBar({ timeframe, onTimeframeChange, demoMode }) {
  return (
    <div
      className="flex items-center gap-1 px-3 py-2 flex-shrink-0"
      style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}
    >
      {TIMEFRAMES.map((tf) => {
        // Demo data is generated daily candles only
        const disabled = demoMode && tf.id !== 'D';
        return (
          <button
            key={tf.id}
            onClick={() => onTimeframeChange(tf.id)}
            disabled={disabled}
            title={disabled ? 'Simulated data is daily only' : undefined}
            className={`px-2.5 py-1 text-xs rounded transition-all ${
              disabled ? 'text-gray-700 cursor-not-allowed' : 'cursor-pointer'
            } ${
              timeframe === tf.id
                ? 'bg-green-500/15 text-green-400 font-medium'
                : disabled ? '' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
          >
            {tf.id}
          </button>
        );
      })}
      <div className="flex-1" />
      <span className="text-xs text-gray-600">SMA 20 / 50 + VWAP 20 ({timeframe})</span>
    </div>
  );
}

export default function StockChart({ candleData, orderBlocks, stockSymbol, timeframe, onTimeframeChange, demoMode }) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const intraday = getTimeframe(timeframe).intraday;

  useEffect(() => {
    if (!chartContainerRef.current || !candleData || candleData.length === 0) return;

    // Clear previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const container = chartContainerRef.current;
    const width = container.clientWidth || 600;
    const height = container.clientHeight || 400;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#64748b',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(30, 45, 61, 0.3)' },
        horzLines: { color: 'rgba(30, 45, 61, 0.3)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(0, 230, 118, 0.3)',
          width: 1,
          style: 2,
          labelBackgroundColor: '#1a2332',
        },
        horzLine: {
          color: 'rgba(0, 230, 118, 0.3)',
          width: 1,
          style: 2,
          labelBackgroundColor: '#1a2332',
        },
      },
      rightPriceScale: {
        borderColor: '#1e2d3d',
        scaleMargins: { top: 0.1, bottom: 0.25 },
      },
      timeScale: {
        borderColor: '#1e2d3d',
        timeVisible: intraday,
        secondsVisible: false,
      },
      width,
      height,
    });

    // Candlestick series (v5 API)
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#00e676',
      downColor: '#ff1744',
      borderDownColor: '#ff1744',
      borderUpColor: '#00e676',
      wickDownColor: '#ff1744',
      wickUpColor: '#00e676',
    });
    candlestickSeries.setData(candleData);

    // Volume series (v5 API)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });
    volumeSeries.setData(
      candleData.filter((d) => Number.isFinite(d.volume)).map((d) => ({
        time: d.time,
        value: d.volume,
        color: d.close >= d.open ? 'rgba(0, 230, 118, 0.15)' : 'rgba(255, 23, 68, 0.15)',
      }))
    );

    // SMA 20 line (v5 API)
    const sma20Data = [];
    for (let i = 19; i < candleData.length; i++) {
      const sum = candleData.slice(i - 19, i + 1).reduce((s, c) => s + c.close, 0);
      sma20Data.push({ time: candleData[i].time, value: sum / 20 });
    }
    const sma20Series = chart.addSeries(LineSeries, {
      color: '#2196f3',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    sma20Series.setData(sma20Data);

    // SMA 50 line (v5 API)
    const sma50Data = [];
    for (let i = 49; i < candleData.length; i++) {
      const sum = candleData.slice(i - 49, i + 1).reduce((s, c) => s + c.close, 0);
      sma50Data.push({ time: candleData[i].time, value: sum / 50 });
    }
    const sma50Series = chart.addSeries(LineSeries, {
      color: '#00e5ff',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    sma50Series.setData(sma50Data);

    // VWAP line: rolling 20-candle VWAP (shared with the metrics bar)
    const vwapData = calculateVWAP(candleData, 20);
    const vwapSeries = chart.addSeries(LineSeries, {
      color: 'rgba(255, 214, 0, 0.5)',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    vwapSeries.setData(vwapData);

    // Order block markers (v5 API)
    if (orderBlocks && orderBlocks.length > 0) {
      const markers = orderBlocks.slice(-10).map((ob) => ({
        time: ob.time,
        position: ob.type === 'bullish' ? 'belowBar' : 'aboveBar',
        color: ob.type === 'bullish' ? '#00e676' : '#ff1744',
        shape: ob.type === 'bullish' ? 'arrowUp' : 'arrowDown',
        text: 'OB',
      }));
      createSeriesMarkers(candlestickSeries, markers);
    }

    chart.timeScale().fitContent();
    chartRef.current = chart;

    // Resize handler
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          chart.applyOptions({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [candleData, orderBlocks, stockSymbol, intraday]);

  return (
    <div className="flex flex-col h-full w-full">
      <TimeframeBar timeframe={timeframe} onTimeframeChange={onTimeframeChange} demoMode={demoMode} />
      {/* Chart Canvas Container */}
      <div ref={chartContainerRef} className="flex-1 min-h-[250px] w-full" />
    </div>
  );
}
