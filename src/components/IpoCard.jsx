import { useState } from 'react';
import { Star, ExternalLink } from 'lucide-react';
import { STATUS_META } from '../data/dataStatus';
import { STAGE_META, countdown, stepState, formatDay, againstIssuePrice, nseIssueUrl, investorGainUrl } from '../data/ipoView';

const STEP_COLOR = { done: '#00e676', today: '#ffd600', upcoming: '#475569', unknown: '#334155' };
const CHECK_STYLE = {
  good: { mark: '✔', color: '#00e676', word: 'favourable' },
  bad: { mark: '✖', color: '#ff1744', word: 'unfavourable' },
  neutral: { mark: '●', color: '#94a3b8', word: 'neutral' },
  unknown: { mark: '?', color: '#64748b', word: 'not assessed' },
};
const VERDICT_COLOR = { good: '#00e676', warn: '#ffd600', bad: '#ff1744', neutral: '#94a3b8' };
const smallButton = 'px-2 py-1 text-[11px] rounded cursor-pointer bg-white/5 text-gray-300 hover:bg-white/10';

const inr = (n) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtStamp = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

function Timeline({ ipo, todayKey }) {
  if (ipo.timeline.length === 0) return null;
  return (
    <ol className="grid gap-1 mt-2" style={{ gridTemplateColumns: `repeat(${ipo.timeline.length}, minmax(0, 1fr))` }}>
      {ipo.timeline.map((step) => {
        const state = stepState(step, todayKey);
        return (
          <li key={step.key} className="min-w-0">
            <div className="h-1 rounded-full" style={{ backgroundColor: STEP_COLOR[state] }} />
            <div className="mt-1 text-[10px] leading-tight text-gray-500">{step.label}</div>
            <div className="text-[11px] font-medium leading-tight" style={{ color: state === 'unknown' ? '#64748b' : '#e2e8f0' }}>
              {formatDay(step.date, todayKey)}
              {step.kind === 'expected' && step.date && <span className="ml-1 text-[9px] font-normal text-gray-500" title="Expected from SEBI's T+3 timeline, not announced by the exchange">exp.</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Gmp({ ipo }) {
  const g = ipo.gmp;
  if (!g) return null;
  if (g.gmp === null) return <p className="mt-1 text-[11px] text-gray-500">Grey-market premium: none reported yet.</p>;
  const up = g.gmp > 0;
  return (
    <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] text-gray-400">
      <span
        className="font-semibold px-1.5 py-0.5 rounded"
        style={{ color: up ? '#00e676' : '#ff1744', backgroundColor: up ? 'rgba(0,230,118,0.12)' : 'rgba(255,23,68,0.12)' }}
        title="Grey-market premium: an unofficial price dealers quote before listing. It can be wrong or manipulated and does not guarantee a listing gain."
      >
        GMP {g.gmp >= 0 ? '+' : ''}{inr(g.gmp)}{Number.isFinite(g.gmpPct) ? ` (${g.gmpPct >= 0 ? '+' : ''}${g.gmpPct.toFixed(1)}%)` : ''}
      </span>
      {g.low !== null && g.high !== null && g.high > 0 && <span>range {inr(g.low)} to {inr(g.high)}</span>}
      {g.impliedListing !== null && <span>implied listing ≈ {inr(g.impliedListing)}</span>}
      <span className="text-gray-600">unofficial{g.updatedAt ? ` · updated ${fmtStamp(g.updatedAt)}` : ''}</span>
    </p>
  );
}

function Analysis({ ipo }) {
  const { checks, verdict } = ipo.analysis;
  const links = [
    ipo.rhpUrl ? { label: 'Offer document (RHP, NSE)', url: ipo.rhpUrl } : null,
    nseIssueUrl(ipo) ? { label: 'NSE issue page', url: nseIssueUrl(ipo) } : null,
    investorGainUrl(ipo) ? { label: 'InvestorGain page (grey-market history, reviews)', url: investorGainUrl(ipo) } : null,
  ].filter(Boolean);
  return (
    <div className="mt-2 rounded-md px-3 py-2" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(30, 45, 61, 0.5)' }}>
      <p className="text-[11px] text-gray-400">
        Rule-based view:{' '}
        <span className="font-semibold" style={{ color: VERDICT_COLOR[verdict.tone] }}>{verdict.label}</span>
        <span className="text-gray-600"> · {ipo.analysis.good} favourable, {ipo.analysis.bad} unfavourable</span>
      </p>
      <ul className="mt-1.5 space-y-1">
        {checks.map((c) => {
          const style = CHECK_STYLE[c.status];
          return (
            <li key={c.key} className="text-[11px] text-gray-400 flex gap-2">
              <span style={{ color: style.color }} aria-label={style.word} title={style.word} className="w-3 flex-shrink-0 text-center">{style.mark}</span>
              <span><span className="text-gray-200">{c.label}.</span> {c.detail}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[10px] text-gray-500">
        This lines up a few measurable signals; it is not a recommendation to apply or to avoid. Most IPO outcomes depend on the business and its price,
        which this does not assess. Read the offer document and decide for yourself.
      </p>
      {links.length > 0 && (
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
          {links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="underline" style={{ color: '#00e5ff' }}>{l.label}</a>)}
        </p>
      )}
    </div>
  );
}

function Allotment({ ipo }) {
  const { registrar, links } = ipo.allotment;
  return (
    <div className="mt-2 rounded-md px-3 py-2" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(30, 45, 61, 0.5)' }}>
      <p className="text-[11px] text-gray-300 font-medium">Check your allotment status</p>
      <p className="mt-1 text-[11px] text-gray-400">
        {registrar ? <>The registrar for this issue is <span className="text-gray-200">{registrar}</span>. </> : 'The registrar is not known for this issue. '}
        Open its page, pick this company, and enter your PAN, application number or demat account number there. You enter these on the registrar&apos;s own site; StockPulse never sees them.
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-2">
        {links.map((l) => (l.url
          ? (
            <li key={l.url}>
              <a
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px]"
                style={l.primary ? { backgroundColor: 'rgba(0, 230, 118, 0.15)', color: '#00e676' } : { backgroundColor: 'rgba(255,255,255,0.05)', color: '#cbd5e1' }}
              >
                {l.label} <ExternalLink size={11} />
              </a>
            </li>
          )
          : <li key={l.label} className="text-[11px] text-gray-500 self-center">{l.label}</li>))}
      </ul>
      <p className="mt-1.5 text-[10px] text-gray-500">The bank or your broker also sends an SMS or email, and shares appear in your demat account on the listing-date timeline above.</p>
    </div>
  );
}

export default function IpoCard({ ipo, todayKey, tracked, onToggle, quote }) {
  const stage = STAGE_META[ipo.stage];
  const move = againstIssuePrice(ipo, quote?.price);
  const [panel, setPanel] = useState(ipo.stage === 'CLOSED' && ipo.allotment ? 'allotment' : null);
  const nseUrl = nseIssueUrl(ipo);
  const toggle = (name) => setPanel((p) => (p === name ? null : name));
  const facts = [
    ipo.priceHigh ? `Price band ${ipo.priceLow === ipo.priceHigh ? inr(ipo.priceHigh) : `${inr(ipo.priceLow)} to ${inr(ipo.priceHigh)}`}` : null,
    ipo.lotSize ? `Lot ${ipo.lotSize} shares` : null,
    ipo.minInvestment ? `Minimum ≈ ${inr(ipo.minInvestment)}` : null,
    ipo.issueSizeCr ? `Size ≈ ₹${ipo.issueSizeCr.toLocaleString('en-IN')} Cr${ipo.source === 'NSE' ? ' at upper band' : ''}` : null,
    ipo.issueType,
  ].filter(Boolean);

  return (
    <article className="px-4 py-3" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
      <div className="flex items-start gap-2">
        <button
          onClick={() => onToggle(ipo.id)}
          aria-label={tracked ? `Stop tracking ${ipo.name}` : `Track ${ipo.name}`}
          aria-pressed={tracked}
          title={tracked ? 'Tracked' : 'Track this IPO'}
          className="p-1 -ml-1 cursor-pointer text-gray-500 hover:text-yellow-400"
        >
          <Star size={15} fill={tracked ? '#ffd600' : 'none'} color={tracked ? '#ffd600' : 'currentColor'} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-sm font-medium text-gray-100">{ipo.name}</h3>
            {ipo.symbol && <span className="text-[10px] text-gray-500 font-mono">{ipo.symbol}</span>}
            {ipo.exchange === 'BSE' && <span className="text-[9px] px-1 rounded bg-white/10 text-gray-400">BSE</span>}
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: stage.color, backgroundColor: `${stage.color}1f` }}>{stage.label}</span>
            <span className="text-[11px] text-gray-400">{countdown(ipo, todayKey)}</span>
          </div>
          {ipo.source !== 'NSE' && <p className="mt-0.5 text-[10px] text-gray-500">Announced, not yet on NSE&apos;s issue list. Dates and price come from InvestorGain and may change.</p>}
          {facts.length > 0 && <p className="mt-1 text-[11px] text-gray-400">{facts.join(' · ')}</p>}
          <Gmp ipo={ipo} />
          {ipo.stage === 'LISTED' && (ipo.issuePrice || ipo.listingGainPct !== null) && (
            <p className="mt-1 text-[11px] text-gray-400">
              {ipo.issuePrice ? `Issue price ${inr(ipo.issuePrice)}` : null}
              {ipo.listingGainPct !== null && (
                <>
                  {ipo.issuePrice ? ' · ' : ''}Listing day{' '}
                  <span style={{ color: ipo.listingGainPct >= 0 ? '#00e676' : '#ff1744' }}>{ipo.listingGainPct >= 0 ? '+' : ''}{ipo.listingGainPct.toFixed(1)}%</span>
                  {ipo.listingPrice ? ` (listed near ${inr(ipo.listingPrice)})` : ''} <span className="text-gray-600">as reported by InvestorGain</span>
                </>
              )}
              {move && (
                <>
                  {' · '}Latest {inr(move.price)}{' '}
                  <span style={{ color: move.pct >= 0 ? '#00e676' : '#ff1744' }}>({move.pct >= 0 ? '+' : ''}{move.pct.toFixed(1)}% vs issue price)</span>
                  <span className="text-gray-600"> · {STATUS_META[quote.status]?.label ?? 'price'}</span>
                </>
              )}
            </p>
          )}
          {ipo.subscription.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-gray-400">
              <span className="text-gray-500">{ipo.stage === 'OPEN' ? 'Subscribed so far:' : 'Subscribed:'}</span>
              {ipo.subscription.map((s) => <span key={s.category}>{s.category} <span className="text-gray-200">{s.times.toFixed(2)}x</span></span>)}
            </p>
          )}
          <Timeline ipo={ipo} todayKey={todayKey} />
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={() => toggle('analysis')} aria-expanded={panel === 'analysis'} className={smallButton}>
              {panel === 'analysis' ? 'Hide analysis' : 'Analysis'}
            </button>
            {ipo.allotment && (
              <button onClick={() => toggle('allotment')} aria-expanded={panel === 'allotment'} className={smallButton}>
                {panel === 'allotment' ? 'Hide allotment status' : 'Allotment status'}
              </button>
            )}
          </div>
          {panel === 'analysis' && <Analysis ipo={ipo} />}
          {panel === 'allotment' && ipo.allotment && <Allotment ipo={ipo} />}
        </div>
        {nseUrl && (
          <a href={nseUrl} target="_blank" rel="noreferrer" title="Official issue page on NSE" aria-label={`Open ${ipo.name} on NSE`} className="p-1 text-gray-500 hover:text-gray-200">
            <ExternalLink size={14} />
          </a>
        )}
      </div>
    </article>
  );
}
