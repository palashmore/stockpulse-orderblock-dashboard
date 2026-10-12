import { TIMEFRAMES, getTimeframe } from './timeframes';

// Multi-Chart layout: how many charts, which stock and timeframe each shows, and whether the
// timeframe is shared. Saved in this browser and validated on load.
export const LAYOUT_KEY = 'stockpulse.multichart.v1';
export const COUNTS = [2, 4, 6];
const SYMBOL = /^[A-Z0-9&.-]{1,20}$/;
export const DEFAULT_SYMBOLS = ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN'];

export function defaultLayout() {
  return { count: 4, linkTimeframe: true, timeframe: 'D', linkCrosshair: true, linkSymbol: false, cells: DEFAULT_SYMBOLS.map((symbol) => ({ symbol, timeframe: 'D' })) };
}

export function validateLayout(raw) {
  const d = defaultLayout();
  if (!raw || typeof raw !== 'object') return d;
  const count = COUNTS.includes(raw.count) ? raw.count : d.count;
  const cells = d.cells.map((cell, i) => {
    const c = Array.isArray(raw.cells) ? raw.cells[i] : null;
    return {
      symbol: c && typeof c.symbol === 'string' && SYMBOL.test(c.symbol) ? c.symbol : cell.symbol,
      timeframe: c && TIMEFRAMES.some((t) => t.id === c.timeframe) ? c.timeframe : 'D',
    };
  });
  return {
    count,
    linkTimeframe: typeof raw.linkTimeframe === 'boolean' ? raw.linkTimeframe : true,
    timeframe: TIMEFRAMES.some((t) => t.id === raw.timeframe) ? raw.timeframe : 'D',
    linkCrosshair: typeof raw.linkCrosshair === 'boolean' ? raw.linkCrosshair : d.linkCrosshair,
    linkSymbol: typeof raw.linkSymbol === 'boolean' ? raw.linkSymbol : d.linkSymbol,
    cells,
  };
}

export function loadLayout(storage) {
  try {
    return validateLayout(JSON.parse(storage.getItem(LAYOUT_KEY)));
  } catch {
    return defaultLayout();
  }
}

export function saveLayout(layout, storage) {
  try {
    storage.setItem(LAYOUT_KEY, JSON.stringify(validateLayout(layout)));
    return true;
  } catch {
    return false;
  }
}

/** The timeframe a cell shows, honouring the "same timeframe for all" switch. */
export function cellTimeframe(layout, index) {
  return getTimeframe(layout.linkTimeframe ? layout.timeframe : layout.cells[index].timeframe);
}

/** The stock a cell shows: its own, or the first cell's when "same stock in every chart" is on. */
export function cellSymbol(layout, index) {
  return layout.linkSymbol ? layout.cells[0].symbol : layout.cells[index].symbol;
}

/** Change one cell's symbol without touching any other cell (with linked symbols, the shared one changes for all). */
export function setCellSymbol(layout, index, symbol) {
  if (!SYMBOL.test(symbol) || index < 0 || index >= layout.cells.length) return layout;
  const target = layout.linkSymbol ? 0 : index;
  return { ...layout, cells: layout.cells.map((c, i) => (i === target ? { ...c, symbol } : c)) };
}

export function setCellTimeframe(layout, index, timeframe) {
  if (!TIMEFRAMES.some((t) => t.id === timeframe)) return layout;
  if (layout.linkTimeframe) return { ...layout, timeframe };
  return { ...layout, cells: layout.cells.map((c, i) => (i === index ? { ...c, timeframe } : c)) };
}
