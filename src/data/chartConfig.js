import { emaOfCloses, smaOfCloses, vwap } from './indicators';

// Colours for the overlays, kept distinct from the green/red used for price direction
export const OVERLAYS = [
  { key: 'sma20', label: 'SMA 20', color: '#2196f3', build: (c) => smaOfCloses(c, 20) },
  { key: 'sma50', label: 'SMA 50', color: '#00e5ff', build: (c) => smaOfCloses(c, 50) },
  { key: 'ema9', label: 'EMA 9', color: '#ffeb3b', build: (c) => emaOfCloses(c, 9) },
  { key: 'ema20', label: 'EMA 20', color: '#ffb300', build: (c) => emaOfCloses(c, 20) },
  { key: 'ema21', label: 'EMA 21', color: '#ff9100', build: (c) => emaOfCloses(c, 21) },
  { key: 'ema50', label: 'EMA 50', color: '#ba68c8', build: (c) => emaOfCloses(c, 50) },
  { key: 'ema100', label: 'EMA 100', color: '#7e57c2', build: (c) => emaOfCloses(c, 100) },
  { key: 'ema200', label: 'EMA 200', color: '#f06292', build: (c) => emaOfCloses(c, 200) },
  { key: 'vwap', label: 'VWAP', color: 'rgba(255, 214, 0, 0.7)', build: (c) => vwap(c) },
];

export const PANES = [
  { key: 'rsi', label: 'RSI 14' },
  { key: 'macd', label: 'MACD' },
  { key: 'adx', label: 'ADX 14' },
];

export const DEFAULT_INDICATORS = { sma20: true, sma50: true, vwap: true };

export const toLine = (candles, values) => candles.flatMap((c, i) => (values[i] === null || values[i] === undefined ? [] : [{ time: c.time, value: values[i] }]));
export const compare = (a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0);

/** Normalise a chart event time (number, string or business-day object) to the candle `time` format. */
export function normaliseTime(t) {
  if (t && typeof t === 'object') return `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
  return t;
}

/** Chart markers for signals (entries) and simulated trade exits. */
export function buildSignalMarkers(signals, trades, candles) {
  const markers = [];
  for (const s of signals || []) {
    const buy = s.side === 'BUY';
    markers.push({
      time: s.time,
      position: buy ? 'belowBar' : 'aboveBar',
      color: buy ? '#00e676' : '#ff1744',
      shape: buy ? 'arrowUp' : 'arrowDown',
      text: buy ? 'BUY' : 'SHORT',
      id: s.id,
    });
  }
  for (const t of trades || []) {
    const exitBar = candles[t.exitIndex];
    if (!exitBar) continue;
    const long = t.side === 'BUY';
    markers.push({
      time: exitBar.time,
      position: long ? 'aboveBar' : 'belowBar',
      color: t.net > 0 ? '#69f0ae' : '#ff8a80',
      shape: 'circle',
      text: long ? 'EXIT' : 'COVER',
    });
  }
  return markers.sort(compare);
}

