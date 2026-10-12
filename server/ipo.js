import { nextTradingDay } from './marketCalendar.js';
import { findGmpRow, gmpSummary } from './ipoGmp.js';
import { analyseIpo, allotmentLinks } from './ipoAnalysis.js';

/**
 * Mainboard IPO tracking from NSE's public IPO feeds (unofficial website endpoints):
 *   all-upcoming-issues?category=ipo  forthcoming and open issues
 *   ipo-current-issue                 open issues (carries the exchange flag)
 *   public-past-issues                closed issues with their listing dates
 *   ipo-detail?symbol=&series=EQ      bid lot and category-wise subscription for open/forthcoming issues
 *
 * Only mainboard issues are kept (series/securityType "EQ"); SME, debt and withdrawal-window entries are dropped.
 * Dates NSE publishes are "actual". The remaining post-issue steps are "expected" dates derived from SEBI's
 * T+3 listing timeline (T = issue closing day) on the exchange trading calendar, and are labelled as such.
 */
export const HISTORY_FROM = '2023-01-01'; // older issues are not returned
const T3_FROM = '2023-12-01'; // SEBI's T+3 listing timeline became mandatory
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** '13-Oct-2026' or '05-OCT-2026' -> '2026-10-13'; anything else (including '-') -> null. */
export function parseNseDate(text) {
  const m = /(\d{1,2})-([A-Za-z]{3})-(\d{4})/.exec(String(text ?? ''));
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toLowerCase());
  const day = Number(m[1]);
  if (month < 0 || day < 1 || day > 31) return null;
  const key = `${m[3]}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  // Date.parse rolls 31 Feb over instead of rejecting it, so compare the round trip
  const parsed = new Date(`${key}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === key ? key : null;
}

const num = (text) => {
  const cleaned = String(text ?? '').replace(/,/g, '').trim();
  if (cleaned === '') return null; // Number('') is 0, which would read as a real value
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

/** 'Rs.258 to Rs.271' -> { low: 258, high: 271 }; 'Rs.1000' -> { low: 1000, high: 1000 }; unusable -> null. */
export function parsePriceBand(text) {
  const found = String(text ?? '').match(/\d[\d,]*(?:\.\d+)?/g);
  if (!found) return null;
  const values = found.map(num).filter((n) => n !== null && n > 0);
  if (values.length === 0 || values.length > 2) return null;
  return { low: Math.min(...values), high: Math.max(...values) };
}

const detailValue = (detail, title) => (detail?.issueInfo?.dataList ?? []).find((row) => row?.title === title)?.value ?? null;

/** Minimum bid quantity (the lot) from an ipo-detail response, or null. */
export function parseLot(detail) {
  for (const title of ['Minimum Order Quantity', 'Bid Lot']) {
    const m = /(\d[\d,]*)/.exec(String(detailValue(detail, title) ?? ''));
    const lot = m ? num(m[1]) : null;
    if (lot && lot > 0) return lot;
  }
  return null;
}

export const parseIssueType = (detail) => {
  const text = String(detailValue(detail, 'Issue Type') ?? '').trim();
  return text ? text.slice(0, 40) : null;
};

const CATEGORY_NAMES = [
  [/total/i, 'Total'],
  [/qualified|qib/i, 'QIB'],
  [/non[\s-]*institutional|nii|nib/i, 'NII'],
  [/retail|rii/i, 'Retail'],
  [/employee/i, 'Employee'],
];
const shortCategory = (name) => CATEGORY_NAMES.find(([re]) => re.test(name))?.[1] ?? String(name).trim().slice(0, 24);

/** Category-wise subscription (times) from an ipo-detail response: [{ category, times }]. Sub-rows without a figure are dropped. */
export function parseSubscription(detail) {
  const rows = detail?.activeCat?.dataList ?? [];
  const seen = new Set();
  return rows
    // top-level categories only: numbered 1, 2, 3 (sub-rows are 1(a), 2(b)...) plus the unnumbered Total row
    .filter((r) => r && r.category && r.category !== 'Category' && (r.srNo === null || r.srNo === undefined || /^\d+$/.test(String(r.srNo).trim())))
    .map((r) => ({ category: shortCategory(String(r.category)), times: num(r.noOfTotalMeant) }))
    .filter((r) => r.times !== null && !seen.has(r.category) && seen.add(r.category));
}

/** The registrar named in an ipo-detail response, or null. */
export function parseRegistrar(detail) {
  const name = String(detailValue(detail, 'Name of the Registrar') ?? '').replace(/^"|"$/g, '').trim();
  return name ? name.slice(0, 80) : null;
}

/** Link to the red herring prospectus, only when it is on NSE's own archive. */
export function parseRhpUrl(detail) {
  const url = String(detailValue(detail, 'Red Herring Prospectus') ?? '').trim();
  return /^https:\/\/nsearchives\.nseindia\.com\/[\w./%-]+$/.test(url) ? url : null;
}

const isWithdrawalEntry = (name) => /withdrawal/i.test(name);

function fromUpcoming(row, bseSymbols) {
  if (row?.series !== 'EQ' || !row.symbol) return null;
  return {
    symbol: String(row.symbol).toUpperCase(),
    name: String(row.companyName ?? row.symbol).trim(),
    openDate: parseNseDate(row.issueStartDate),
    closeDate: parseNseDate(row.issueEndDate),
    band: parsePriceBand(row.issuePrice ?? row.priceBand),
    issuePrice: null,
    sizeShares: num(row.issueSize),
    listingDate: null,
    exchange: row.isBse === '1' || bseSymbols.has(String(row.symbol).toUpperCase()) ? 'BSE' : 'NSE',
  };
}

function fromPast(row) {
  if (row?.securityType !== 'EQ' || !row.symbol) return null;
  const name = String(row.company ?? row.symbol).trim();
  if (isWithdrawalEntry(name)) return null;
  const band = parsePriceBand(row.priceRange);
  return {
    symbol: String(row.symbol).toUpperCase(),
    name,
    openDate: parseNseDate(row.ipoStartDate),
    closeDate: parseNseDate(row.ipoEndDate),
    band,
    issuePrice: parsePriceBand(row.issuePrice)?.high ?? null,
    sizeShares: null,
    listingDate: parseNseDate(row.listingDate),
    exchange: 'NSE',
  };
}

/** Lifecycle stage from the dates published so far and today's IST date. */
export function stageOf({ openDate, closeDate, listingDate }, todayKey) {
  if (!openDate || !closeDate) return 'ANNOUNCED'; // listed by InvestorGain before any dates are fixed
  if (listingDate && listingDate <= todayKey) return 'LISTED';
  if (todayKey < openDate) return 'UPCOMING';
  if (todayKey <= closeDate) return 'OPEN';
  if (listingDate || addDaysKey(closeDate, 15) >= todayKey) return 'CLOSED';
  return 'ENDED'; // closed a while ago and NSE has not published a listing date
}

const addDaysKey = (key, n) => new Date(Date.parse(`${key}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/**
 * The steps shown for an issue: dates the exchange or InvestorGain publish ("actual"), then expected ones from the T+3 rule.
 * @param extra { boaDate, listingDate } announced dates from InvestorGain (used when NSE has not published its own)
 */
export function buildTimeline(ipo, stage, holidays, extra = {}) {
  if (stage === 'ANNOUNCED') return [];
  const steps = [
    { key: 'open', label: 'Opens', date: ipo.openDate, kind: 'actual' },
    { key: 'close', label: 'Closes', date: ipo.closeDate, kind: 'actual' },
  ];
  const listingDate = ipo.listingDate ?? extra.listingDate ?? null;
  if (stage === 'LISTED') {
    steps.push({ key: 'listing', label: 'Listed', date: ipo.listingDate, kind: 'actual' });
  } else if (stage !== 'ENDED') {
    const derive = ipo.closeDate >= T3_FROM;
    let t1 = null;
    let t2 = null;
    let t3 = null;
    if (derive) {
      t1 = nextTradingDay(ipo.closeDate, holidays);
      t2 = nextTradingDay(t1, holidays);
      t3 = nextTradingDay(t2, holidays);
    }
    steps.push(
      extra.boaDate ? { key: 'allotment', label: 'Allotment', date: extra.boaDate, kind: 'actual' } : { key: 'allotment', label: 'Allotment', date: t1, kind: 'expected' },
      { key: 'refund', label: 'Refund / credit', date: t2, kind: 'expected' },
      listingDate
        ? { key: 'listing', label: 'Listing', date: listingDate, kind: 'actual' }
        : { key: 'listing', label: 'Listing', date: t3, kind: 'expected' },
    );
  }
  return steps;
}

const RECENT_LISTED_DAYS = 10; // after this the registrar, refunds and credit are long done
const daysSince = (key, todayKey) => Math.round((Date.parse(`${todayKey}T00:00:00Z`) - Date.parse(`${key}T00:00:00Z`)) / 86400000);

/** Issues that need an ipo-detail lookup (bid lot, subscription, registrar): everything not long listed. */
export function needsDetail(ipo, todayKey) {
  if (!ipo.symbol) return false;
  if (ipo.stage === 'UPCOMING' || ipo.stage === 'OPEN' || ipo.stage === 'CLOSED') return true;
  return ipo.stage === 'LISTED' && ipo.listingDate && daysSince(ipo.listingDate, todayKey) <= RECENT_LISTED_DAYS;
}

/**
 * Merge the feeds into one mainboard IPO list, newest first.
 * @param feeds   { upcoming, current, past, details, gmpRows } raw NSE arrays; details maps SYMBOL -> ipo-detail JSON;
 *                gmpRows are parsed InvestorGain rows (optional)
 * @param context { todayKey: 'YYYY-MM-DD' (IST), holidays: Map|null }
 */
export function buildIpos({ upcoming = [], current = [], past = [], details = {}, gmpRows = [] }, { todayKey, holidays = null }) {
  const bseSymbols = new Set((current || []).filter((r) => r?.isBse === '1').map((r) => String(r.symbol).toUpperCase()));
  const byId = new Map();
  const put = (ipo) => {
    if (!ipo || !ipo.openDate || !ipo.closeDate || ipo.closeDate < ipo.openDate) return;
    if (ipo.openDate < HISTORY_FROM) return;
    const id = `${ipo.symbol}-${ipo.openDate}`;
    const existing = byId.get(id);
    byId.set(id, existing ? { ...existing, ...Object.fromEntries(Object.entries(ipo).filter(([, v]) => v !== null)) } : ipo);
  };
  for (const row of [...upcoming, ...current]) put(fromUpcoming(row, bseSymbols));
  for (const row of past) put(fromPast(row));

  const mainboardGmp = (gmpRows || []).filter((r) => r.kind === 'MAINBOARD');
  const used = new Set();
  const build = (id, ipo, row, detail) => {
    const stage = stageOf(ipo, todayKey);
    const lot = (detail ? parseLot(detail) : null) ?? row?.lot ?? null;
    const high = ipo.band?.high ?? row?.price ?? null;
    const listingDate = ipo.listingDate ?? (stage === 'LISTED' ? null : row?.listingDate ?? null);
    const subscription = detail ? parseSubscription(detail) : [];
    const registrar = detail ? parseRegistrar(detail) : null;
    const base = {
      id,
      symbol: ipo.symbol,
      name: ipo.name,
      exchange: ipo.exchange,
      source: ipo.symbol ? 'NSE' : 'InvestorGain',
      stage,
      openDate: ipo.openDate,
      closeDate: ipo.closeDate,
      listingDate: ipo.listingDate ?? listingDate,
      priceLow: ipo.band?.low ?? null,
      priceHigh: high,
      issuePrice: ipo.issuePrice,
      lotSize: lot,
      minInvestment: lot && high ? Math.round(lot * high) : null,
      issueType: detail ? parseIssueType(detail) : null,
      issueSizeShares: ipo.sizeShares,
      issueSizeCr: ipo.sizeShares && high ? Math.round((ipo.sizeShares * high) / 1e5) / 100 : row?.sizeCr ?? null, // NSE's share count at the upper band, else InvestorGain's figure
      subscription: stage === 'UPCOMING' || stage === 'ANNOUNCED' ? [] : subscription,
      totalSubscription: row?.subscription ?? null,
      anchor: Boolean(row?.anchor),
      gmp: stage === 'LISTED' || stage === 'ENDED' ? null : gmpSummary(row, high),
      listingGainPct: stage === 'LISTED' ? row?.listingGainPct ?? null : null,
      listingPrice: stage === 'LISTED' ? row?.listingPrice ?? null : null,
      rhpUrl: detail ? parseRhpUrl(detail) : null,
      timeline: buildTimeline(ipo, stage, holidays, { boaDate: row?.boaDate ?? null, listingDate }),
    };
    if (stage === 'CLOSED' || (stage === 'LISTED' && ipo.listingDate && daysSince(ipo.listingDate, todayKey) <= RECENT_LISTED_DAYS)) {
      base.allotment = allotmentLinks(registrar, row?.path ?? null);
    }
    return { ...base, analysis: analyseIpo(base) };
  };

  const out = [...byId.entries()].map(([id, ipo]) => {
    const row = findGmpRow(ipo, mainboardGmp);
    if (row) used.add(row.id);
    return build(id, ipo, row, details[ipo.symbol]);
  });

  // Announced mainboard issues InvestorGain already lists but NSE's feed does not carry yet (dates may still be unset)
  for (const row of mainboardGmp) {
    if (used.has(row.id)) continue;
    const dated = row.openDate && row.closeDate && row.closeDate >= row.openDate;
    if (dated ? row.openDate < HISTORY_FROM : !(row.upcoming && !row.openDate && !row.closeDate)) continue;
    const ipo = {
      symbol: null,
      name: row.name,
      openDate: dated ? row.openDate : null,
      closeDate: dated ? row.closeDate : null,
      band: row.price ? { low: row.price, high: row.price } : null,
      issuePrice: null,
      sizeShares: null,
      listingDate: null,
      exchange: 'NSE/BSE',
    };
    const stage = stageOf({ ...ipo, listingDate: row.listingDate }, todayKey);
    if (stage === 'LISTED' || stage === 'ENDED') continue; // finished issues come from NSE's own list
    out.push(build(`IG${row.id}-${dated ? row.openDate : 'undated'}`, ipo, row, null));
  }

  const key = (i) => i.openDate ?? '9999-12-31'; // undated announcements sort as the furthest away
  return out.sort((a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : String(a.symbol ?? a.name).localeCompare(String(b.symbol ?? b.name))));
}
