// "My watchlist": stocks you want to follow today. Saved in this browser, validated on load.
// Each entry remembers when it was added and the price at that moment (when known), so the list can
// show how a stock has moved since you started tracking it.
export const WATCH_KEY_V2 = 'stockpulse.watchlist.v2';
const WATCH_KEY_V1 = 'stockpulse.watchlist.v1'; // earlier format: an array of symbols
export const MAX_WATCH = 100;
const SYMBOL = /^[A-Z0-9&.-]{1,20}$/;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function sanitize(list) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const e = typeof raw === 'string' ? { symbol: raw } : raw;
    if (!e || typeof e.symbol !== 'string' || !SYMBOL.test(e.symbol) || seen.has(e.symbol)) continue;
    seen.add(e.symbol);
    out.push({
      symbol: e.symbol,
      addedAt: typeof e.addedAt === 'string' && !Number.isNaN(Date.parse(e.addedAt)) ? e.addedAt : null,
      addedPrice: isNum(e.addedPrice) && e.addedPrice > 0 ? e.addedPrice : null,
    });
    if (out.length >= MAX_WATCH) break;
  }
  return out;
}

/** Load the list, converting the earlier symbols-only format when that is all that exists. */
export function loadWatch(storage) {
  try {
    const v2 = storage.getItem(WATCH_KEY_V2);
    if (v2 !== null) return sanitize(JSON.parse(v2));
    return sanitize(JSON.parse(storage.getItem(WATCH_KEY_V1)));
  } catch {
    return [];
  }
}

export function saveWatch(list, storage) {
  try {
    storage.setItem(WATCH_KEY_V2, JSON.stringify(sanitize(list)));
    return true;
  } catch {
    return false;
  }
}

/** Add a symbol (no-op when present or invalid). `price` is the price at the time, or null if unknown. */
export function addToWatch(list, symbol, price, nowIso) {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!SYMBOL.test(sym) || list.some((e) => e.symbol === sym) || list.length >= MAX_WATCH) return list;
  return [{ symbol: sym, addedAt: nowIso, addedPrice: isNum(price) && price > 0 ? price : null }, ...list];
}

export const removeFromWatch = (list, symbol) => list.filter((e) => e.symbol !== symbol);

/** Change since added, as a percent; null when either price is unknown. */
export function sinceAddedPct(entry, price) {
  return isNum(entry.addedPrice) && isNum(price) && entry.addedPrice > 0 ? ((price - entry.addedPrice) / entry.addedPrice) * 100 : null;
}

// ---- two separate lists: stocks for today's trading, and stocks for swing trades over days or weeks.
// They are stored together but never mix: adding to one does not touch the other.
export const WATCH_KEY_V3 = 'stockpulse.watchlists.v3';
export const WATCH_KINDS = ['daily', 'swing'];
export const WATCH_LABELS = { daily: 'Daily trading', swing: 'Swing' };

export const emptyLists = () => ({ daily: [], swing: [] });

/** Load both lists. The earlier single list becomes the daily list, and the swing list starts empty. */
export function loadWatchlists(storage) {
  try {
    const v3 = storage.getItem(WATCH_KEY_V3);
    if (v3 !== null) {
      const parsed = JSON.parse(v3);
      return { daily: sanitize(parsed?.daily), swing: sanitize(parsed?.swing) };
    }
  } catch {
    return emptyLists();
  }
  return { daily: loadWatch(storage), swing: [] };
}

export function saveWatchlists(lists, storage) {
  try {
    storage.setItem(WATCH_KEY_V3, JSON.stringify({ daily: sanitize(lists.daily), swing: sanitize(lists.swing) }));
    return true;
  } catch {
    return false;
  }
}

const validKind = (kind) => WATCH_KINDS.includes(kind);

export function addToList(lists, kind, symbol, price, nowIso) {
  if (!validKind(kind)) return lists;
  const next = addToWatch(lists[kind], symbol, price, nowIso);
  return next === lists[kind] ? lists : { ...lists, [kind]: next };
}

export function removeFromList(lists, kind, symbol) {
  if (!validKind(kind)) return lists;
  return { ...lists, [kind]: removeFromWatch(lists[kind], symbol) };
}

/** Move a stock from one list to the other, keeping when and at what price it was first added. */
export function moveBetween(lists, symbol, from, to) {
  if (!validKind(from) || !validKind(to) || from === to) return lists;
  const entry = lists[from].find((e) => e.symbol === symbol);
  if (!entry || lists[to].some((e) => e.symbol === symbol)) return lists;
  return { ...lists, [from]: removeFromWatch(lists[from], symbol), [to]: [entry, ...lists[to]] };
}
