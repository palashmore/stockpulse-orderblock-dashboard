/**
 * Rule-based IPO checklist. It lines up the few things that can be measured from public data (grey-market premium,
 * subscription, anchor demand, ticket size, issue size, and for listed issues the listing result) and says how each
 * one reads. It does NOT assess the business (financials, valuation against peers, use of proceeds, promoter selling),
 * which matters most: that is always listed as "not assessed" and points to the offer document.
 * The verdict is a summary of the checks, not a recommendation to apply.
 */
const RETAIL_LIMIT = 200000; // a retail investor may bid up to ₹2 lakh

const fmtInr = (n) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const check = (key, label, status, detail) => ({ key, label, status, detail });

function gmpCheck(ipo) {
  const g = ipo.gmp;
  if (!g || g.gmp === null) return check('gmp', 'Grey-market premium', 'unknown', 'No premium is reported for this issue yet.');
  const pct = g.gmpPct;
  const range = g.low !== null && g.high !== null ? ` Over the recent days it ranged ${fmtInr(g.low)} to ${fmtInr(g.high)}.` : '';
  const fell = g.high !== null && g.high > 0 && g.gmp < g.high * 0.7 ? ' It has fallen well below its recent high.' : '';
  if (!(g.gmp > 0)) return check('gmp', 'Grey-market premium', 'bad', `No premium: the grey market sees a listing at or below the issue price.${range}`);
  const about = pct !== null ? ` (about ${pct.toFixed(1)}% over the issue price)` : '';
  if (pct !== null && pct >= 10) return check('gmp', 'Grey-market premium', fell ? 'neutral' : 'good', `Premium ${fmtInr(g.gmp)}${about}.${range}${fell} Unofficial and can be wrong or manipulated.`);
  return check('gmp', 'Grey-market premium', 'neutral', `Premium ${fmtInr(g.gmp)}${about}: modest.${range}${fell} Unofficial and can be wrong or manipulated.`);
}

function subscriptionCheck(ipo) {
  const subs = ipo.subscription ?? [];
  const total = subs.find((s) => s.category === 'Total')?.times ?? ipo.totalSubscription ?? null;
  if (ipo.stage === 'UPCOMING' || ipo.stage === 'ANNOUNCED') return check('subscription', 'Subscription', 'unknown', 'Not open yet. Demand shows up while the issue is open, mostly on the last day.');
  if (total === null) return check('subscription', 'Subscription', 'unknown', 'No subscription figures are available yet.');
  const parts = subs.filter((s) => s.category !== 'Total' && s.times !== null).map((s) => `${s.category} ${s.times.toFixed(2)}x`).join(', ');
  const detail = `Subscribed ${total.toFixed(2)}x in total${parts ? ` (${parts})` : ''}${ipo.stage === 'OPEN' ? ' so far; it usually builds on the last day' : ''}.`;
  if (total < 1) return check('subscription', 'Subscription', ipo.stage === 'OPEN' ? 'neutral' : 'bad', detail);
  if (total >= 3) return check('subscription', 'Subscription', 'good', detail);
  return check('subscription', 'Subscription', 'neutral', detail);
}

function listingCheck(ipo) {
  if (ipo.stage !== 'LISTED') return null;
  const gain = ipo.listingGainPct;
  if (gain === null || gain === undefined) return check('listing', 'Listing result', 'unknown', 'The listing-day result is not available.');
  const detail = `Reported listing gain ${gain >= 0 ? '+' : ''}${gain.toFixed(2)}% over the issue price${ipo.listingPrice ? ` (listed near ${fmtInr(ipo.listingPrice)})` : ''}. This is the listing day only, not today's price.`;
  return check('listing', 'Listing result', gain >= 10 ? 'good' : gain < 0 ? 'bad' : 'neutral', detail);
}

/** Checks, a verdict and the caveats for one issue (as built by buildIpos). */
export function analyseIpo(ipo) {
  const checks = [];
  if (ipo.stage !== 'LISTED' && ipo.stage !== 'ENDED') checks.push(gmpCheck(ipo));
  checks.push(subscriptionCheck(ipo));
  const listing = listingCheck(ipo);
  if (listing) checks.push(listing);

  checks.push(ipo.anchor
    ? check('anchor', 'Anchor investors', 'good', 'The anchor book has been allotted: institutions committed money before the public issue.')
    : check('anchor', 'Anchor investors', 'unknown', 'No anchor allocation reported yet (it usually comes the day before the issue opens).'));

  if (ipo.lotSize && ipo.priceHigh) {
    const lot = ipo.lotSize * ipo.priceHigh;
    const maxLots = Math.floor(RETAIL_LIMIT / lot);
    checks.push(check('ticket', 'Ticket size', 'neutral', maxLots >= 1
      ? `One lot is about ${fmtInr(lot)} at the upper price; a retail investor can bid up to ${maxLots} lot${maxLots > 1 ? 's' : ''} (${fmtInr(RETAIL_LIMIT)} limit).`
      : `One lot is about ${fmtInr(lot)}, above the ${fmtInr(RETAIL_LIMIT)} retail limit, so it falls in the larger-investor category.`));
  }

  if (ipo.issueSizeCr) {
    const note = ipo.issueSizeCr >= 5000 ? 'a very large issue needs a lot of buyers to list well' : ipo.issueSizeCr <= 250 ? 'a small issue can swing sharply after listing' : 'a mid-sized issue';
    checks.push(check('size', 'Issue size', 'neutral', `About ${fmtInr(ipo.issueSizeCr)} Cr: ${note}.`));
  }

  checks.push(check('fundamentals', 'The business', 'unknown', 'Not assessed. Financial track record, valuation against listed peers, what the money is used for, and how much is promoters selling (offer for sale) decide most outcomes: read the offer document (RHP).'));

  const good = checks.filter((c) => c.status === 'good').length;
  const bad = checks.filter((c) => c.status === 'bad').length;
  let verdict;
  if (good + bad < 2) verdict = { code: 'INSUFFICIENT', label: 'Not enough data yet', tone: 'neutral' };
  else if (bad === 0) verdict = { code: 'FAVOURABLE', label: 'Favourable on the data available', tone: 'good' };
  else if (bad > good) verdict = { code: 'UNFAVOURABLE', label: 'Unfavourable on the data available', tone: 'bad' };
  else verdict = { code: 'MIXED', label: 'Mixed signals', tone: 'warn' };
  return { checks, verdict, good, bad };
}

// ---------- allotment status ----------

const REGISTRARS = [
  { match: /kfin|karvy/i, name: 'KFin Technologies', url: 'https://ipostatus.kfintech.com/' },
  { match: /mufg|link\s*intime/i, name: 'MUFG Intime India (Link Intime)', url: 'https://in.mpms.mufg.com/Initial_Offer/public-issues.html' },
  { match: /bigshare/i, name: 'Bigshare Services', url: 'https://ipo.bigshareonline.com/IPO_Status.html' },
  { match: /skyline/i, name: 'Skyline Financial Services', url: 'https://www.skylinerta.com/ipo.php' },
  { match: /purva/i, name: 'Purva Sharegistry', url: 'https://www.purvashare.com/investor-service/ipo-query' },
  { match: /maashitla/i, name: 'Maashitla Securities', url: 'https://maashitla.com/allotment-status/public-issues' },
  { match: /integrated\s+registry/i, name: 'Integrated Registry Management Services', url: 'https://www.integratedregistry.in/' },
];
const BSE_ALLOTMENT = 'https://www.bseindia.com/investors/appli_check.aspx';

/** Where to check allotment: the registrar's own page when its name is recognised, always BSE's page, and InvestorGain's guide. */
export function allotmentLinks(registrarName, investorGainPath = null) {
  const known = REGISTRARS.find((r) => r.match.test(String(registrarName ?? '')));
  const links = [];
  if (known) links.push({ label: `${known.name} (the registrar)`, url: known.url, primary: true });
  else if (registrarName) links.push({ label: `Find ${String(registrarName).slice(0, 60)} (the registrar) on its own website`, url: null, primary: true });
  links.push({ label: 'BSE allotment status', url: BSE_ALLOTMENT, primary: !known });
  if (investorGainPath) links.push({ label: 'InvestorGain allotment guide', url: `https://www.investorgain.com${investorGainPath.replace('/gmp/', '/allotment-status/')}`, primary: false });
  return { registrar: registrarName ? String(registrarName).slice(0, 80) : null, links };
}
