import { useEffect, useMemo, useRef } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createSeriesMarkers,
} from 'lightweight-charts';
import { rsi, macd, adx } from '../data/indicators';
import { OVERLAYS, DEFAULT_INDICATORS, toLine, compare, normaliseTime, buildSignalMarkers } from '../data/chartConfig';

export default function TradingChart({ candleData, orderBlocks = [], indicators = DEFAULT_INDICATORS, signals = [], trades = [], selectedId = null, onSelectSignal, intraday = false }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const priceLinesRef = useRef([]);
  const signalsRef = useRef(signals);
  const onSelectRef = useRef(onSelectSignal);

  useEffect(() => {
    signalsRef.current = signals;
    onSelectRef.current = onSelectSignal;
  }, [signals, onSelectSignal]);

  const indicatorKey = JSON.stringify(indicators);
  const markers = useMemo(() => buildSignalMarkers(signals, trades, candleData || []), [signals, trades, candleData]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !candleData || candleData.length === 0) return undefined;

    const chart = createChart(container, {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#64748b', fontSize: 11, panes: { separatorColor: '#1e2d3d' } },
      grid: { vertLines: { color: 'rgba(30, 45, 61, 0.3)' }, horzLines: { color: 'rgba(30, 45, 61, 0.3)' } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(0, 230, 118, 0.3)', width: 1, style: 2, labelBackgroundColor: '#1a2332' },
        horzLine: { color: 'rgba(0, 230, 118, 0.3)', width: 1, style: 2, labelBackgroundColor: '#1a2332' },
      },
      rightPriceScale: { borderColor: '#1e2d3d', scaleMargins: { top: 0.1, bottom: 0.25 } },
      timeScale: { borderColor: '#1e2d3d', timeVisible: intraday, secondsVisible: false },
      width: container.clientWidth || 600,
      height: container.clientHeight || 400,
    });
    chartRef.current = chart;

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: '#00e676', downColor: '#ff1744', borderDownColor: '#ff1744', borderUpColor: '#00e676', wickDownColor: '#ff1744', wickUpColor: '#00e676',
    });
    candles.setData(candleData);
    candleSeriesRef.current = candles;

    // Volume (only bars that actually have a volume figure)
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume' });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    volume.setData(
      candleData
        .filter((d) => Number.isFinite(d.volume))
        .map((d) => ({ time: d.time, value: d.volume, color: d.close >= d.open ? 'rgba(0, 230, 118, 0.15)' : 'rgba(255, 23, 68, 0.15)' }))
    );

    // Overlays on the price pane
    for (const o of OVERLAYS) {
      if (!indicators[o.key]) continue;
      const line = chart.addSeries(LineSeries, { color: o.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, lineStyle: o.key === 'vwap' ? 2 : 0 });
      line.setData(toLine(candleData, o.build(candleData)));
    }

    // Indicator panes below the price chart
    let pane = 1;
    const paneLine = (color, data, opts = {}) => {
      const s = chart.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: true, ...opts }, pane);
      s.setData(data);
      return s;
    };
    if (indicators.rsi) {
      const s = paneLine('#ba68c8', toLine(candleData, rsi(candleData, 14)));
      s.createPriceLine({ price: 70, color: 'rgba(255,23,68,0.4)', lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
      s.createPriceLine({ price: 30, color: 'rgba(0,230,118,0.4)', lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
      pane++;
    }
    if (indicators.macd) {
      const m = macd(candleData);
      const hist = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane);
      hist.setData(candleData.flatMap((c, i) => (m.hist[i] === null ? [] : [{ time: c.time, value: m.hist[i], color: m.hist[i] >= 0 ? 'rgba(0,230,118,0.5)' : 'rgba(255,23,68,0.5)' }])));
      chart.addSeries(LineSeries, { color: '#2196f3', lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, pane).setData(toLine(candleData, m.macd));
      chart.addSeries(LineSeries, { color: '#ff9100', lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, pane).setData(toLine(candleData, m.signal));
      pane++;
    }
    if (indicators.adx) {
      const a = adx(candleData, 14);
      paneLine('#ffd600', toLine(candleData, a.adx));
      paneLine('#00e676', toLine(candleData, a.plusDI), { lastValueVisible: false });
      paneLine('#ff1744', toLine(candleData, a.minusDI), { lastValueVisible: false });
      pane++;
    }
    try {
      const panes = chart.panes();
      panes.forEach((p, i) => { if (i > 0) p.setStretchFactor(0.35); });
    } catch {
      // older chart builds without pane sizing: default sizes are fine
    }

    // Order blocks (existing method) plus Buy/Sell markers
    const ob = (orderBlocks || []).slice(-10).map((b) => ({
      time: b.time,
      position: b.type === 'bullish' ? 'belowBar' : 'aboveBar',
      color: b.type === 'bullish' ? 'rgba(0,230,118,0.55)' : 'rgba(255,23,68,0.55)',
      shape: b.type === 'bullish' ? 'arrowUp' : 'arrowDown',
      text: 'OB',
    }));
    createSeriesMarkers(candles, [...ob, ...markers].sort(compare));

    chart.subscribeClick((param) => {
      const t = normaliseTime(param?.time);
      if (t === undefined || t === null) return;
      const hit = signalsRef.current.find((s) => s.time === t);
      onSelectRef.current?.(hit ? hit.id : null);
    });

    chart.timeScale().fitContent();

    const resize = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) chart.applyOptions({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    resize.observe(container);

    return () => {
      resize.disconnect();
      priceLinesRef.current = [];
      candleSeriesRef.current = null;
      chart.remove();
      chartRef.current = null;
    };
    // The chart is rebuilt when the data, indicator set or markers change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candleData, orderBlocks, indicatorKey, markers, intraday]);

  // Entry / stop / target lines for the selected signal, without rebuilding the chart
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    for (const line of priceLinesRef.current) series.removePriceLine(line);
    priceLinesRef.current = [];
    const s = signals.find((x) => x.id === selectedId);
    if (!s) return;
    const add = (price, color, title) => priceLinesRef.current.push(series.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title }));
    add(s.entry, '#90a4ae', 'Entry');
    add(s.stop, '#ff1744', 'Stop');
    add(s.target1, '#69f0ae', 'T1');
    add(s.target2, '#00e676', 'T2');
  }, [selectedId, signals, candleData, indicatorKey, markers]);

  return <div ref={containerRef} className="flex-1 min-h-[250px] w-full" />;
}
