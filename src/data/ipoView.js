// Display logic for the IPO tab (pure). The server decides stages and dates; this only filters, counts and describes.

export const IPO_VIEWS = [
  { id: 'open', label: 'Open now' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'closed', label: 'Closed, awaiting listing' },
  { id: 'listed', label: 'Listed' },
  { id: 'tracked', label: 'Tracked' },
  { id: 'all', label: 'All' },
];

export const STAGE_META = {
  OPEN: { label: 'OPEN', color: '#00e676' },
  UPCOMING: { label: 'UPCOMING', color: '#00b0ff' },
  ANNOUNCED: { label: 'DATES NOT SET', color: '#00b0ff' },
  CLOSED: { label: 'CLOSED', color: '#ffd600' },
  LISTED: { label: 'LISTED', color: '#94a3b8' },
  ENDED: { label: 'COMPLETED', color: '#64748b' },
};

const VIEW_STAGES = {
  open: ['OPEN'],
  upcoming: ['UPCOMING', 'ANNOUNCED'],
  closed: ['CLOSED'],
  listed: ['LISTED', 'ENDED'],
};

const keyMs = (key) => Date.parse(`${key}T00:00:00Z`);
export const daysBetween = (fromKey, toKey) => Math.round((keyMs(toKey) - keyMs(fromKey)) / 86400000);

export function inView(ipo, view, tracked = new Set()) {
  if (view === 'all') return true;
  if (view === 'tracked') return tracked.has(ipo.id);
  return (VIEW_STAGES[view] ?? []).includes(ipo.stage);
}

export function countByView(ipos, tracked = new Set()) {
  return Object.fromEntries(IPO_VIEWS.map((v) => [v.id, ipos.filter((i) => inView(i, v.id, tracked)).length]));
}

/** Years (newest first) in which listed or completed issues opened, for the year filter. */
export function yearsOf(ipos) {
  return [...new Set(ipos.filter((i) => i.openDate).map((i) => i.openDate.slice(0, 4)))].sort().reverse();
}

/**
 * Filter by view, text (name or symbol) and year. The default sort puts what needs attention first:
 * open and upcoming issues by date ascending, everything else newest first.
 */
export function filterIpos(ipos, { view = 'open', query = '', year = '', tracked = new Set() } = {}) {
  const q = query.trim().toLowerCase();
  const out = ipos.filter((i) => inView(i, view, tracked)
    && (!year || (i.openDate ?? '').startsWith(year))
    && (!q || i.name.toLowerCase().includes(q) || (i.symbol ?? '').toLowerCase().includes(q)));
  const soonFirst = view === 'open' || view === 'upcoming';
  const when = (i) => i.openDate ?? '9999-12-31'; // issues with no dates yet count as the furthest away
  return out.sort((a, b) => (soonFirst ? when(a).localeCompare(when(b)) : when(b).localeCompare(when(a))));
}

/** One line saying where an issue stands today. */
export function countdown(ipo, todayKey) {
  const plural = (n) => `${n} day${n === 1 ? '' : 's'}`;
  switch (ipo.stage) {
    case 'ANNOUNCED':
      return 'Announced; opening and closing dates are not set yet';
    case 'UPCOMING': {
      const n = daysBetween(todayKey, ipo.openDate);
      return n === 1 ? 'Opens tomorrow' : `Opens in ${plural(n)}`;
    }
    case 'OPEN': {
      const n = daysBetween(todayKey, ipo.closeDate);
      return n === 0 ? 'Closes today' : n === 1 ? 'Closes tomorrow' : `Closes in ${plural(n)}`;
    }
    case 'CLOSED': {
      const listing = ipo.timeline.find((s) => s.key === 'listing');
      if (!listing?.date) return 'Closed; listing date not announced';
      const n = daysBetween(todayKey, listing.date);
      const when = n <= 0 ? 'due now' : n === 1 ? 'tomorrow' : `in ${plural(n)}`;
      return `${listing.kind === 'actual' ? 'Lists' : 'Listing expected'} ${when}`;
    }
    case 'LISTED':
      return `Listed ${plural(Math.max(0, daysBetween(ipo.listingDate, todayKey)))} ago`;
    default:
      return 'Listing date not published by NSE';
  }
}

/** done / today / upcoming for a dated step, "unknown" when the date could not be worked out. */
export function stepState(step, todayKey) {
  if (!step.date) return 'unknown';
  if (step.date < todayKey) return 'done';
  return step.date === todayKey ? 'today' : 'upcoming';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** '2026-10-13' -> '13 Oct' (with the year when it differs from today's, or when `withYear`). */
export function formatDay(key, todayKey = null, withYear = false) {
  if (!key) return '—';
  const [y, m, d] = key.split('-');
  const showYear = withYear || (todayKey && todayKey.slice(0, 4) !== y);
  return `${Number(d)} ${MONTHS[Number(m) - 1]}${showYear ? ` ${y}` : ''}`;
}

/** Price now against the issue price: { price, pct } or null when either is missing. */
export function againstIssuePrice(ipo, price) {
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(ipo.issuePrice) || ipo.issuePrice <= 0) return null;
  return { price, pct: ((price - ipo.issuePrice) / ipo.issuePrice) * 100 };
}

/** Listed issues recent enough to be worth a price lookup (listed within `days`). */
export function recentlyListed(ipos, todayKey, days = 45) {
  return ipos.filter((i) => i.symbol && i.stage === 'LISTED' && i.listingDate && daysBetween(i.listingDate, todayKey) <= days);
}

export const nseIssueUrl = (ipo) => (ipo.symbol
  ? `https://www.nseindia.com/market-data/issue-information?symbol=${encodeURIComponent(ipo.symbol)}&series=EQ&type=${ipo.stage === 'LISTED' || ipo.stage === 'ENDED' ? 'Past' : 'Active'}`
  : null);

/** The issue's InvestorGain page (grey-market history, details), when the server matched one. The path is validated server-side. */
export const investorGainUrl = (ipo) => (ipo.gmp?.path && /^\/gmp\/[a-z0-9-]+\/\d+\/?$/.test(ipo.gmp.path) ? `https://www.investorgain.com${ipo.gmp.path}` : null);

// ---- tracked issues (saved in this browser)
export const TRACKED_KEY = 'stockpulse.ipo.tracked.v1';
export const MAX_TRACKED = 100;
const ID = /^[A-Z0-9&.-]{1,20}-(\d{4}-\d{2}-\d{2}|undated)$/;

export function loadTracked(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(TRACKED_KEY));
    return new Set((Array.isArray(parsed) ? parsed : []).filter((id) => typeof id === 'string' && ID.test(id)).slice(0, MAX_TRACKED));
  } catch {
    return new Set();
  }
}

export function saveTracked(set, storage) {
  try {
    storage.setItem(TRACKED_KEY, JSON.stringify([...set].slice(0, MAX_TRACKED)));
    return true;
  } catch {
    return false;
  }
}

/** New set with `id` added or removed. Adding beyond the limit is refused (returns the same set). */
export function toggleTracked(set, id) {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else if (next.size < MAX_TRACKED) next.add(id);
  return next;
}
