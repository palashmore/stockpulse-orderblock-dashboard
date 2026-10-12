/**
 * Grey-market premium (GMP) and announced IPO dates from InvestorGain's public "IPO GMP" report page
 * (https://www.investorgain.com/report/ipo-gmp-live/331/, allowed by the site's robots.txt).
 *
 * GMP is an UNOFFICIAL, indicative figure quoted by grey-market dealers. It is not exchange data, it can be wrong
 * or manipulated, and it does not guarantee a listing gain. Everything here is parsed defensively: a row that does not
 * look as expected is skipped, and if nothing parses the source is reported unavailable instead of guessed.
 */
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAY_MS = 86400000;

const decode = (s) => String(s ?? '')
  .replace(/&#8377;|&#x20b9;/gi, '₹')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'").replace(/&nbsp;/g, ' ');
const text = (html) => decode(String(html ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const num = (s) => {
  const cleaned = String(s ?? '').replace(/,/g, '').trim();
  if (cleaned === '' || cleaned === '-' || cleaned === '--') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

/** '15-Oct' -> 'YYYY-MM-DD', choosing the year that puts it closest to today (the page shows no year). */
export function inferDate(dayMonth, todayKey) {
  const m = /(\d{1,2})-([A-Za-z]{3})/.exec(String(dayMonth ?? ''));
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toLowerCase());
  if (month < 0) return null;
  const today = Date.parse(`${todayKey}T00:00:00Z`);
  const year = Number(todayKey.slice(0, 4));
  let best = null;
  for (const y of [year - 1, year, year + 1]) {
    const key = `${y}-${String(month + 1).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
    const t = Date.parse(`${key}T00:00:00Z`);
    if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== key) continue;
    if (best === null || Math.abs(t - today) < best.gap) best = { key, gap: Math.abs(t - today) };
  }
  return best ? best.key : null;
}

/** '12-Oct 23:37' (India time) -> ISO instant, or null. */
export function inferUpdated(value, todayKey) {
  const m = /(\d{1,2}-[A-Za-z]{3})\s+(\d{1,2}):(\d{2})/.exec(String(value ?? ''));
  if (!m) return null;
  const day = inferDate(m[1], todayKey);
  if (!day) return null;
  const ms = Date.parse(`${day}T${m[2].padStart(2, '0')}:${m[3]}:00Z`) - 5.5 * 3600000;
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function parseGmpCell(cell) {
  const t = text(cell);
  const price = /₹\s*(-?[\d,.]+)/.exec(t);
  const pct = /\((-?[\d.]+)%\)/.exec(t);
  const low = /(-?[\d,.]+)\s*↓/.exec(t);
  const high = /(-?[\d,.]+)\s*↑/.exec(t);
  const gmp = price ? num(price[1]) : null;
  return {
    gmp,
    // "0.00%" next to "--" means "no figure", not "zero premium"
    gmpPct: gmp === null ? null : pct ? num(pct[1]) : null,
    low: low ? num(low[1]) : null,
    high: high ? num(high[1]) : null,
  };
}

/** Rows of the GMP table: one object per issue, mainboard and SME alike (`kind` tells them apart). */
export function parseGmpPage(html, todayKey) {
  const source = String(html ?? '');
  const start = source.indexOf('<table class="report-data-table"');
  if (start < 0) return [];
  const table = source.slice(start, source.indexOf('</table>', start) + 8);
  const rows = [];
  for (const [, tr] of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = {};
    for (const [, label, body] of tr.matchAll(/<td[^>]*data-label="([^"]*)"[^>]*>([\s\S]*?)<\/td>/g)) cells[label] = body;
    if (!cells.Name) continue;
    const link = /<a[^>]*href="(\/gmp\/([a-z0-9-]+)\/(\d+)\/?)"[^>]*?(?:title="([^"]*)")?[^>]*>([\s\S]*?)<\/a>/i.exec(cells.Name);
    if (!link) continue;
    const name = decode(link[4] || text(link[5])).trim();
    const badges = [...cells.Name.matchAll(/<span class="badge[^"]*">([^<]*)<\/span>/g)].map((b) => b[1].trim());
    const nameText = text(cells.Name);
    const kind = badges.some((b) => /SME/i.test(b)) || /\bSME\b/.test(nameText) ? 'SME' : badges.some((b) => /^IPO$/i.test(b)) || /\bIPO\b/.test(nameText) ? 'MAINBOARD' : null;
    if (!name || !kind) continue;
    const listed = /L@\s*([\d.]+)\s*\((-?[\d.]+)%\)/.exec(nameText) ?? /(?:\[email[^\]]*\]|L@)[^(]*\((-?[\d.]+)%\)/.exec(nameText);
    const gmp = parseGmpCell(cells.GMP);
    const price = num(text(cells['Price (₹)'] ?? ''));
    const size = /₹\s*([\d,.]+)\s*Cr/i.exec(text(cells['IPO Size']));
    const sub = /([\d.]+)\s*x/i.exec(text(cells.Sub));
    const slug = link[2];
    const id = link[3];
    rows.push({
      id,
      slug,
      path: link[1],
      name,
      kind,
      upcoming: badges.includes('U'),
      ...gmp,
      price: price && price > 0 ? price : null,
      sizeCr: size ? num(size[1]) : null,
      lot: num(text(cells.Lot)),
      openDate: inferDate(text(cells.Open), todayKey),
      closeDate: inferDate(text(cells.Close), todayKey),
      boaDate: inferDate(text(cells['BoA Dt']), todayKey),
      listingDate: inferDate(text(cells.Listing), todayKey),
      subscription: sub ? num(sub[1]) : null,
      anchor: /✅/.test(text(cells.Anchor)),
      listingPrice: listed && listed.length === 3 ? num(listed[1]) : null,
      listingGainPct: listed ? num(listed[listed.length - 1]) : null,
      updatedAt: inferUpdated(text(cells['Updated-On']), todayKey),
    });
  }
  return rows;
}

// ---------- matching to NSE's issues ----------

const STOP = new Set(['limited', 'ltd', 'private', 'pvt', 'the', 'and', 'of', 'ipo']);
const tokens = (name) => String(name ?? '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').split(' ').filter((t) => t && !STOP.has(t));

/** Same company? Equal after dropping "Limited/Ltd/Pvt..." and punctuation, or one name's words all appear in the other's. */
export function sameCompany(a, b) {
  const x = tokens(a);
  const y = tokens(b);
  if (x.length === 0 || y.length === 0) return false;
  if (x.join(' ') === y.join(' ')) return true;
  const [small, large] = x.length <= y.length ? [x, y] : [y, x];
  return small.length >= 2 && small.every((t) => large.includes(t));
}

/**
 * The GMP row for an issue: same company, and when both have an opening date the dates agree (a company that lists
 * again years later must not borrow an old row).
 */
export function findGmpRow(ipo, rows) {
  return rows.find((r) => r.kind === 'MAINBOARD' && sameCompany(r.name, ipo.name)
    && (!r.openDate || !ipo.openDate || Math.abs(Date.parse(r.openDate) - Date.parse(ipo.openDate)) <= 3 * DAY_MS)) ?? null;
}

/** The part of a row the app shows next to an issue. */
export function gmpSummary(row, priceHigh = null) {
  if (!row) return null;
  const base = priceHigh ?? row.price;
  return {
    gmp: row.gmp,
    gmpPct: row.gmpPct ?? (row.gmp !== null && base ? Math.round((row.gmp / base) * 10000) / 100 : null),
    low: row.low,
    high: row.high,
    impliedListing: row.gmp !== null && base ? Math.round((base + row.gmp) * 100) / 100 : null,
    updatedAt: row.updatedAt,
    path: row.path,
  };
}
