// The stock universe the lists and screens work on: one or more NSE indices combined, plus any custom
// symbols you add. Index membership itself is never stored here (it comes from NSE's official lists
// through the server); only which indices you picked, your custom symbols and saved presets are kept.
export const UNIVERSE_KEY = 'stockpulse.universe.v1';
export const MAX_INDICES = 8;
export const MAX_CUSTOM = 100;
export const MAX_PRESETS = 20;
const ID = /^[a-z0-9]{2,30}$/;
const SYMBOL = /^[A-Z0-9&.-]{1,20}$/;

export const DEFAULT_UNIVERSE = { ids: ['nifty50'], custom: [], presets: [] };

const cleanIds = (ids) => [...new Set((Array.isArray(ids) ? ids : []).filter((x) => typeof x === 'string' && ID.test(x)))].slice(0, MAX_INDICES);
const cleanCustom = (list) => [...new Set((Array.isArray(list) ? list : []).filter((x) => typeof x === 'string' && SYMBOL.test(x)))].slice(0, MAX_CUSTOM);

/** Coerce arbitrary input into a valid universe. At least one index or custom symbol must remain. */
export function validateUniverse(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const ids = cleanIds(r.ids);
  const custom = cleanCustom(r.custom);
  const presets = (Array.isArray(r.presets) ? r.presets : [])
    .filter((p) => p && typeof p.name === 'string' && p.name.trim() !== '')
    .map((p) => ({ name: p.name.trim().slice(0, 40), ids: cleanIds(p.ids), custom: cleanCustom(p.custom) }))
    .filter((p) => p.ids.length + p.custom.length > 0)
    .slice(0, MAX_PRESETS);
  return { ids: ids.length + custom.length > 0 ? ids : DEFAULT_UNIVERSE.ids, custom, presets };
}

/** Load the universe; when none is saved, start from the single index chosen before this feature existed. */
export function loadUniverse(storage, legacyIndexId = null) {
  try {
    const raw = storage.getItem(UNIVERSE_KEY);
    if (raw !== null) return validateUniverse(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_UNIVERSE, presets: [] };
  }
  return validateUniverse({ ids: legacyIndexId ? [legacyIndexId] : DEFAULT_UNIVERSE.ids });
}

export function saveUniverse(universe, storage) {
  try {
    storage.setItem(UNIVERSE_KEY, JSON.stringify(validateUniverse(universe)));
    return true;
  } catch {
    return false;
  }
}

export function toggleIndex(universe, id) {
  const ids = universe.ids.includes(id) ? universe.ids.filter((x) => x !== id) : [...universe.ids, id].slice(0, MAX_INDICES);
  return validateUniverse({ ...universe, ids });
}

/** Select every index in a group (up to the limit), or clear that group when all of it is already selected. */
export function toggleGroup(universe, groupIds) {
  const all = groupIds.every((id) => universe.ids.includes(id));
  const ids = all ? universe.ids.filter((id) => !groupIds.includes(id)) : [...new Set([...universe.ids, ...groupIds])].slice(0, MAX_INDICES);
  return validateUniverse({ ...universe, ids });
}

export function setCustom(universe, symbols) {
  return validateUniverse({ ...universe, custom: symbols });
}

/** Parse pasted text ("TCS, infy\nITC") into valid symbols, reporting what was skipped. */
export function parseSymbols(text) {
  const tokens = String(text || '').split(/[\s,;]+/).map((t) => t.trim().toUpperCase()).filter(Boolean);
  const valid = [...new Set(tokens.filter((t) => SYMBOL.test(t)))];
  return { valid, skipped: [...new Set(tokens.filter((t) => !SYMBOL.test(t)))] };
}

/** Save the current selection as a named preset (same name, any case, replaces it). Null for a blank name. */
export function savePreset(universe, name) {
  const clean = String(name || '').trim().slice(0, 40);
  if (!clean || universe.ids.length + universe.custom.length === 0) return null;
  const rest = universe.presets.filter((p) => p.name.toLowerCase() !== clean.toLowerCase());
  return validateUniverse({ ...universe, presets: [{ name: clean, ids: universe.ids, custom: universe.custom }, ...rest] });
}

export function applyPreset(universe, name) {
  const p = universe.presets.find((x) => x.name === name);
  return p ? validateUniverse({ ...universe, ids: p.ids, custom: p.custom }) : universe;
}

export function deletePreset(universe, name) {
  return { ...universe, presets: universe.presets.filter((p) => p.name !== name) };
}

/**
 * Combine the loaded index lists and custom symbols into one deduplicated stock list.
 *   lists   [{ id, label, stocks: [{ symbol, name, industry }] }] in the order selected
 *   custom  symbols added by hand; each gets the "Custom" membership and keeps any index membership it has
 * Every stock carries `indices`: the labels of every selected index it belongs to.
 */
export function combineUniverse(lists, custom = []) {
  const bySymbol = new Map();
  for (const list of lists) {
    for (const s of list.stocks) {
      const have = bySymbol.get(s.symbol);
      if (have) {
        if (!have.indices.includes(list.label)) have.indices.push(list.label);
      } else {
        bySymbol.set(s.symbol, { symbol: s.symbol, name: s.name, sector: s.industry ?? s.sector ?? '', indices: [list.label] });
      }
    }
  }
  for (const symbol of custom) {
    const have = bySymbol.get(symbol);
    if (have) have.indices.push('Custom');
    else bySymbol.set(symbol, { symbol, name: symbol, sector: '', indices: ['Custom'] });
  }
  return [...bySymbol.values()];
}

/** Short text for the selector button: "Nifty Bank", "Nifty 50 + 2 more", "Custom list". */
export function describeUniverse(universe, labels, count = null) {
  const names = universe.ids.map((id) => labels[id] ?? id);
  if (universe.custom.length > 0) names.push(`${universe.custom.length} custom`);
  const head = names.length === 0 ? 'No selection' : names.length === 1 ? names[0] : `${names[0]} + ${names.length - 1} more`;
  return count === null ? head : `${head} (${count} stocks)`;
}
