// Merge the built-in Nifty 50 list with server search results into one deduplicated list.
// Local matches come first (symbol prefix, then symbol/name contains), then remaining server hits.
export function mergeSearchResults(local, remote, query, limit = 10) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return local.slice(0, limit);

  const rank = (s) => {
    const sym = s.symbol.toLowerCase();
    if (sym === q) return 0;
    if (sym.startsWith(q)) return 1;
    if (sym.includes(q) || (s.name || '').toLowerCase().includes(q)) return 2;
    return null;
  };

  const seen = new Set();
  const out = [];
  const add = (s) => {
    if (!s || !s.symbol || seen.has(s.symbol)) return;
    seen.add(s.symbol);
    out.push({ symbol: s.symbol, name: s.name || s.symbol, sector: s.sector || '' });
  };

  local
    .map((s) => ({ s, r: rank(s) }))
    .filter((x) => x.r !== null)
    .sort((a, b) => a.r - b.r || a.s.symbol.localeCompare(b.s.symbol))
    .forEach((x) => add(x.s));
  (remote || []).forEach(add);
  return out.slice(0, limit);
}
