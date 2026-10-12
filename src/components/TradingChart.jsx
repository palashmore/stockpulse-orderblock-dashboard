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

export default function TradingChart({ candleData, orderBlocks = [], indicators = DEFAULT_INDICATORS, signals = [], trades = [], selectedId = null, onSelectSignal, intraday = false, link = null, linkId = null }) {
  const { theme } = useTheme();
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

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: colors.up, downColor: colors.down, borderDownColor: colors.down, borderUpColor: colors.up, wickDownColor: colors.down, wickUpColor: colors.up,
    });
    candles.setData(candleData);
    candleSeriesRef.current = candles;

    // Crosshair and zoom linking with other charts (Multi-Chart). Events caused by following another chart are not
    // sent back out (a short mute), and any chart call that fails (a chart being removed) is ignored.
    let unregisterLink = null;
    if (link && linkId !== null) {
      let mutedUntil = 0;
      const mute = () => { mutedUntil = Date.now() + 60; };
      const guarded = (fn) => { try { fn(); } catch { /* the chart was disposed or has no such time */ } };
      unregisterLink = link.register(linkId, {
        show(time) {
          const bar = nearestAtOrBefore(candleData, time);
          mute();
          if (!bar) guarded(() => chart.clearCrosshairPosition());
          else guarded(() => chart.setCrosshairPosition(bar.close, bar.time, candles));
        },
        clear() {
          mute();
          guarded(() => chart.clearCrosshairPosition());
        },
        setRange(range) {
          const clamped = clampRange(candleData, range);
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

    // Volume (only bars that actually have a volume figure)
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume' });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    volume.setData(
      candleData
        .filter((d) => Number.isFinite(d.volume))
        .map((d) => ({ time: d.time, value: d.volume, color: d.close >= d.open ? colors.volumeUp : colors.volumeDown }))
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
      if (unregisterLink) unregisterLink();
      priceLinesRef.current = [];
      candleSeriesRef.current = null;
      chart.remove();
      chartRef.current = null;
    };
    // The chart is rebuilt when the data, indicator set or markers change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candleData, orderBlocks, indicatorKey, markers, intraday, theme, link, linkId]);

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
