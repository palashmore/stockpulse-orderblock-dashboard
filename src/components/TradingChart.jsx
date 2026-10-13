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
import { useTheme } from '../hooks/useTheme';
import { chartColors } from '../data/theme';
import { nearestAtOrBefore, clampRange } from '../data/chartLink';
import { dataKey, needsRefit } from '../data/chartData';

/**
 * Price chart. The chart itself is created once (and again only when the theme, the timeframe style or the link change).
 * New candles, indicator switches, zones and markers are applied to the existing chart, so a parent re-render, a price tick
 * or a refresh never resets the zoom or scroll position. The view is refitted only when the stock or timeframe really
 * changes (`resetKey` when the caller knows it, otherwise the first candle and the size of the history).
 */
export default function TradingChart({ candleData, orderBlocks = null, indicators = DEFAULT_INDICATORS, signals = [], trades = [], selectedId = null, onSelectSignal, intraday = false, link = null, linkId = null, resetKey = '' }) {
  const { theme } = useTheme();
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const markersApiRef = useRef(null);
  const dynamicRef = useRef([]); // overlay and indicator series, replaced when the data or switches change
  const priceLinesRef = useRef([]);
  const fitRef = useRef({ key: '', length: 0 });
  const candleRef = useRef(candleData);
  const signalsRef = useRef(signals);
  const onSelectRef = useRef(onSelectSignal);

  useEffect(() => {
    signalsRef.current = signals;
    onSelectRef.current = onSelectSignal;
  }, [signals, onSelectSignal]);

  const markers = useMemo(() => buildSignalMarkers(signals, trades, candleData || []), [signals, trades, candleData]);
  // Content keys: a new array with the same content must not trigger work
  const indicatorKey = JSON.stringify(indicators);
  const candlesKey = dataKey(candleData);
  const blocksKey = JSON.stringify((orderBlocks || []).slice(-10).map((b) => [b.time, b.type]));
  const markersKey = JSON.stringify(markers);
  const indicatorsRef = useRef(indicators);
  const blocksRef = useRef(orderBlocks);
  const markersRef = useRef(markers);
  useEffect(() => {
    candleRef.current = candleData;
    indicatorsRef.current = indicators;
    blocksRef.current = orderBlocks;
    markersRef.current = markers;
  });

  // 1. The chart and its fixed parts: candles, volume, crosshair/zoom link, click handling, resizing
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const colors = chartColors(theme);
    const chart = createChart(container, {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: colors.text, fontSize: 11, panes: { separatorColor: colors.separator } },
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: colors.crosshair, width: 1, style: 2, labelBackgroundColor: colors.labelBg },
        horzLine: { color: colors.crosshair, width: 1, style: 2, labelBackgroundColor: colors.labelBg },
      },
      rightPriceScale: { borderColor: colors.border, scaleMargins: { top: 0.1, bottom: 0.25 } },
      timeScale: { borderColor: colors.border, timeVisible: intraday, secondsVisible: false },
      width: container.clientWidth || 600,
      height: container.clientHeight || 400,
    });
    chartRef.current = chart;
    fitRef.current = { key: '', length: 0 }; // a new chart has no view to keep

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: colors.up, downColor: colors.down, borderDownColor: colors.down, borderUpColor: colors.up, wickDownColor: colors.down, wickUpColor: colors.up,
    });
    candleSeriesRef.current = candles;
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume' });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    volumeSeriesRef.current = volume;
    markersApiRef.current = createSeriesMarkers(candles, []);

    // Crosshair and zoom linking with other charts (Multi-Chart). Events caused by following another chart are not
    // sent back out (a short mute), and any chart call that fails (a chart being removed) is ignored.
    let unregisterLink = null;
    if (link && linkId !== null) {
      let mutedUntil = 0;
      const mute = () => { mutedUntil = Date.now() + 60; };
      const guarded = (fn) => { try { fn(); } catch { /* the chart was disposed or has no such time */ } };
      unregisterLink = link.register(linkId, {
        show(time) {
          const bar = nearestAtOrBefore(candleRef.current, time);
          mute();
          if (!bar) guarded(() => chart.clearCrosshairPosition());
          else guarded(() => chart.setCrosshairPosition(bar.close, bar.time, candles));
        },
        clear() {
          mute();
          guarded(() => chart.clearCrosshairPosition());
        },
        setRange(range) {
          const clamped = clampRange(candleRef.current, range);
          if (!clamped) return;
          mute();
          guarded(() => chart.timeScale().setVisibleRange(clamped));
        },
      });
      chart.subscribeCrosshairMove((param) => {
        if (Date.now() < mutedUntil) return;
        link.crosshair(linkId, param.time ?? null);
      });
      chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
        if (Date.now() < mutedUntil) return;
        link.range(linkId, range);
      });
    }

    chart.subscribeClick((param) => {
      const t = normaliseTime(param?.time);
      if (t === undefined || t === null) return;
      const hit = signalsRef.current.find((s) => s.time === t);
      onSelectRef.current?.(hit ? hit.id : null);
    });

    const resize = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) chart.applyOptions({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    resize.observe(container);

    return () => {
      resize.disconnect();
      if (unregisterLink) unregisterLink();
      priceLinesRef.current = [];
      dynamicRef.current = [];
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      markersApiRef.current = null;
      chart.remove();
      chartRef.current = null;
    };
  }, [theme, intraday, link, linkId]);

  // 2. The data: candles, volume, overlays, indicator panes and markers, applied to the existing chart
  useEffect(() => {
    const chart = chartRef.current;
    const candles = candleSeriesRef.current;
    const volume = volumeSeriesRef.current;
    const data = candleRef.current;
    if (!chart || !candles || !volume || !data || data.length === 0) return;
    const colors = chartColors(theme);
    const inds = indicatorsRef.current || DEFAULT_INDICATORS;

    // Keep the view the user has chosen unless this is a different stock or timeframe
    const refit = needsRefit(fitRef.current, { resetKey, data });
    let range = null;
    if (!refit) {
      try { range = chart.timeScale().getVisibleLogicalRange(); } catch { range = null; }
    }

    candles.setData(data);
    volume.setData(
      data
        .filter((d) => Number.isFinite(d.volume))
        .map((d) => ({ time: d.time, value: d.volume, color: d.close >= d.open ? colors.volumeUp : colors.volumeDown }))
    );

    for (const s of dynamicRef.current) {
      try { chart.removeSeries(s); } catch { /* already gone with its chart */ }
    }
    const added = [];
    const add = (type, options, pane) => {
      const series = pane === undefined ? chart.addSeries(type, options) : chart.addSeries(type, options, pane);
      added.push(series);
      return series;
    };

    for (const o of OVERLAYS) {
      if (!inds[o.key]) continue;
      add(LineSeries, { color: o.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, lineStyle: o.key === 'vwap' ? 2 : 0 }).setData(toLine(data, o.build(data)));
    }

    // Indicator panes below the price chart
    let pane = 1;
    const paneLine = (color, values, opts = {}) => {
      const s = add(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: true, ...opts }, pane);
      s.setData(values);
      return s;
    };
    if (inds.rsi) {
      const s = paneLine('#ba68c8', toLine(data, rsi(data, 14)));
      s.createPriceLine({ price: 70, color: 'rgba(255,23,68,0.4)', lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
      s.createPriceLine({ price: 30, color: 'rgba(0,230,118,0.4)', lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
      pane++;
    }
    if (inds.macd) {
      const m = macd(data);
      add(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane)
        .setData(data.flatMap((c, i) => (m.hist[i] === null ? [] : [{ time: c.time, value: m.hist[i], color: m.hist[i] >= 0 ? 'rgba(0,230,118,0.5)' : 'rgba(255,23,68,0.5)' }])));
      add(LineSeries, { color: '#2196f3', lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, pane).setData(toLine(data, m.macd));
      add(LineSeries, { color: '#ff9100', lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, pane).setData(toLine(data, m.signal));
      pane++;
    }
    if (inds.adx) {
      const a = adx(data, 14);
      paneLine('#ffd600', toLine(data, a.adx));
      paneLine('#00e676', toLine(data, a.plusDI), { lastValueVisible: false });
      paneLine('#ff1744', toLine(data, a.minusDI), { lastValueVisible: false });
      pane++;
    }
    dynamicRef.current = added;
    try {
      chart.panes().forEach((p, i) => { if (i > 0) p.setStretchFactor(0.35); });
    } catch {
      // older chart builds without pane sizing: default sizes are fine
    }

    // Order blocks plus Buy/Sell markers
    const ob = (blocksRef.current || []).slice(-10).map((b) => ({
      time: b.time,
      position: b.type === 'bullish' ? 'belowBar' : 'aboveBar',
      color: b.type === 'bullish' ? 'rgba(0,230,118,0.55)' : 'rgba(255,23,68,0.55)',
      shape: b.type === 'bullish' ? 'arrowUp' : 'arrowDown',
      text: 'OB',
    }));
    markersApiRef.current?.setMarkers([...ob, ...markersRef.current].sort(compare));

    if (refit || !range) chart.timeScale().fitContent();
    else {
      try { chart.timeScale().setVisibleLogicalRange(range); } catch { /* range no longer valid: keep the chart's own */ }
    }
    fitRef.current = { key: needsRefit.keyOf(resetKey, data), length: data.length };
  }, [candlesKey, indicatorKey, blocksKey, markersKey, theme, intraday, link, linkId, resetKey]);

  // Entry / stop / target lines for the selected signal, without rebuilding anything
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    for (const line of priceLinesRef.current) {
      try { series.removePriceLine(line); } catch { /* the chart was rebuilt */ }
    }
    priceLinesRef.current = [];
    const s = signals.find((x) => x.id === selectedId);
    if (!s) return;
    const addLine = (price, color, title) => priceLinesRef.current.push(series.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title }));
    addLine(s.entry, '#90a4ae', 'Entry');
    addLine(s.stop, '#ff1744', 'Stop');
    addLine(s.target1, '#69f0ae', 'T1');
    addLine(s.target2, '#00e676', 'T2');
  }, [selectedId, signals, candlesKey, indicatorKey, markersKey, theme, intraday, link, linkId]);

  return <div ref={containerRef} className="flex-1 min-h-[250px] w-full" />;
}
