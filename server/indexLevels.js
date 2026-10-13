/**
 * Index levels from NSE's public "allIndices" feed (the live market indices page): level, day change, open/high/low,
 * 52-week range, P/E and NSE's own advance/decline counts. Only NSE indices are covered; BSE indices (Sensex, BSE 100/500)
 * are not available because BSE blocks automated access.
 */
const num = (v) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v.replace(/,/g, '')) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

const norm = (name) => String(name ?? '').toUpperCase().replace(/\s+/g, ' ').trim();

/** Rows of NSE's allIndices response as plain objects keyed by the normalised index name. */
export function parseAllIndices(json) {
  const rows = Array.isArray(json?.data) ? json.data : [];
  const out = new Map();
  for (const r of rows) {
    const name = norm(r?.index);
    const last = num(r?.last);
    if (!name || last === null) continue;
    out.set(name, {
      name: String(r.index),
      last,
      change: num(r.variation),
      changePct: num(r.percentChange),
      open: num(r.open),
      high: num(r.high),
      low: num(r.low),
      previousClose: num(r.previousClose),
      yearHigh: num(r.yearHigh),
      yearLow: num(r.yearLow),
      pe: num(r.pe),
      advances: num(r.advances),
      declines: num(r.declines),
      unchanged: num(r.unchanged),
    });
  }
  return { rows: out, timestamp: typeof json?.timestamp === 'string' ? json.timestamp : null };
}

/**
 * Level for each configured index (INDEX_DEFS entries { id, label }), matched by name ("Nifty Bank" -> "NIFTY BANK").
 * Returns { byId, missing }: indices NSE did not report are listed in `missing`, never filled in.
 */
export function matchIndexLevels(defs, parsed) {
  const byId = {};
  const missing = [];
  for (const def of defs) {
    const row = parsed.rows.get(norm(def.label));
    if (row) byId[def.id] = row;
    else missing.push(def.id);
  }
  return { byId, missing };
}
