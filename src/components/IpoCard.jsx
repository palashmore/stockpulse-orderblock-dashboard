import { useState } from 'react';
import { Star, ExternalLink, Calendar, CheckCircle2, XCircle, AlertCircle, Clock } from 'lucide-react';
import { STATUS_META } from '../data/dataStatus';
import {
  STAGE_META,
  countdown,
  stepState,
  formatDay,
  againstIssuePrice,
  nseIssueUrl,
  investorGainUrl,
} from '../data/ipoView';

const STEP_COLOR = { done: '#00e676', today: '#ffd600', upcoming: '#475569', unknown: '#334155' };
const CHECK_STYLE = {
  good: { mark: '✔', color: '#00e676', word: 'favourable' },
  bad: { mark: '✖', color: '#ff1744', word: 'unfavourable' },
  neutral: { mark: '●', color: '#94a3b8', word: 'neutral' },
  unknown: { mark: '?', color: '#64748b', word: 'not assessed' },
};
const VERDICT_COLOR = { good: '#00e676', warn: '#ffd600', bad: '#ff1744', neutral: '#94a3b8' };
const smallButton =
  'px-2.5 py-1 text-xs rounded font-medium cursor-pointer bg-white/5 text-gray-300 hover:text-white hover:bg-white/10 transition-colors';

const inr = (n) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtStamp = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

function Timeline({ ipo, todayKey }) {
  if (ipo.timeline.length === 0) return null;
  return (
    <ol
      className="grid gap-2 mt-3 p-2.5 rounded-lg"
      style={{
        gridTemplateColumns: `repeat(${ipo.timeline.length}, minmax(0, 1fr))`,
        backgroundColor: '#111827',
        border: '1px solid #1e2d3d',
      }}
    >
      {ipo.timeline.map((step) => {
        const state = stepState(step, todayKey);
        return (
          <li key={step.key} className="min-w-0">
            <div className="h-1.5 rounded-full overflow-hidden bg-gray-800">
              <div
                className="h-full rounded-full"
                style={{
                  width: state === 'done' || state === 'today' ? '100%' : '0%',
                  backgroundColor: STEP_COLOR[state],
                }}
              />
            </div>
            <div className="mt-1.5 text-[10px] leading-tight text-gray-500 uppercase font-medium truncate">
              {step.label}
            </div>
            <div
              className="text-xs font-mono font-semibold leading-tight mt-0.5"
              style={{ color: state === 'unknown' ? '#64748b' : '#e2e8f0' }}
            >
              {formatDay(step.date, todayKey)}
              {step.kind === 'expected' && step.date && (
                <span className="ml-1 text-[9px] font-normal text-amber-400" title="Expected from SEBI T+3 timeline">
                  exp.
                </span>
              )}
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
  if (g.gmp === null) {
    return <p className="mt-1 text-xs text-gray-500">Grey-Market Premium (GMP): No dealer quotes reported yet.</p>;
  }
  const up = g.gmp > 0;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <span
        className="font-bold px-2 py-0.5 rounded text-xs"
        style={{
          color: up ? '#00e676' : '#ff1744',
          backgroundColor: up ? 'rgba(0,230,118,0.12)' : 'rgba(255,23,68,0.12)',
        }}
        title="Grey-market premium is an unofficial dealer price estimate before listing"
      >
        GMP {g.gmp >= 0 ? '+' : ''}
        {inr(g.gmp)}
        {Number.isFinite(g.gmpPct) ? ` (${g.gmpPct >= 0 ? '+' : ''}${g.gmpPct.toFixed(1)}%)` : ''}
      </span>
      {g.impliedListing !== null && (
        <span className="text-gray-300 font-mono text-xs">
          Implied Listing ≈ <span className="font-bold text-gray-100">{inr(g.impliedListing)}</span>
        </span>
      )}
      {g.low !== null && g.high !== null && g.high > 0 && (
        <span className="text-gray-500 text-[11px]">
          (range {inr(g.low)} to {inr(g.high)})
        </span>
      )}
      <span className="text-gray-600 text-[10px] ml-auto">
        Unofficial estimate{g.updatedAt ? ` · ${fmtStamp(g.updatedAt)}` : ''}
      </span>
    </div>
  );
}

function Analysis({ ipo }) {
  const { checks, verdict } = ipo.analysis;
  const links = [
    ipo.rhpUrl ? { label: 'Offer Document (RHP, NSE)', url: ipo.rhpUrl } : null,
    nseIssueUrl(ipo) ? { label: 'Official NSE Issue Page', url: nseIssueUrl(ipo) } : null,
    investorGainUrl(ipo) ? { label: 'InvestorGain Page (GMP History)', url: investorGainUrl(ipo) } : null,
  ].filter(Boolean);

  return (
    <div
      className="mt-3 rounded-lg p-3"
      style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}
    >
      <div className="flex items-center justify-between mb-2 pb-1.5" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.4)' }}>
        <span className="text-xs font-bold text-gray-200">
          Rule-Based Evaluation:{' '}
          <span style={{ color: VERDICT_COLOR[verdict.tone] }}>{verdict.label}</span>
        </span>
        <span className="text-[11px] text-gray-500">
          {ipo.analysis.good} Favourable · {ipo.analysis.bad} Unfavourable
        </span>
      </div>

      <ul className="space-y-1.5">
        {checks.map((c) => {
          const style = CHECK_STYLE[c.status];
          return (
            <li key={c.key} className="text-xs text-gray-300 flex items-start gap-2">
              <span style={{ color: style.color }} className="font-bold flex-shrink-0 mt-0.5">
                {style.mark}
              </span>
              <span>
                <span className="font-semibold text-gray-200">{c.label}:</span> {c.detail}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-2.5 text-[10px] text-gray-500">
        Quantitative checklist only. Public offering outcomes depend heavily on promoter background and market valuations. Always review the Red Herring Prospectus.
      </p>

      {links.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          {links.map((l) => (
            <a
              key={l.url}
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline font-medium"
              style={{ color: '#00e5ff' }}
            >
              {l.label} <ExternalLink size={11} />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function Allotment({ ipo }) {
  const { registrar, links } = ipo.allotment;
  return (
    <div
      className="mt-3 rounded-lg p-3"
      style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}
    >
      <div className="text-xs font-bold text-gray-200 mb-1">Check Allotment Status</div>
      <p className="text-xs text-gray-400 mb-2 leading-relaxed">
        {registrar ? (
          <>
            Official Registrar:{' '}
            <span className="font-bold text-emerald-400">{registrar}</span>.{' '}
          </>
        ) : (
          'Registrar currently unlisted for this issue. '
        )}
        Verify allotment by entering your PAN or Demat Client ID on the registrar&apos;s portal.
      </p>

      <ul className="flex flex-wrap gap-2">
        {links.map((l) =>
          l.url ? (
            <li key={l.url}>
              <a
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium"
                style={
                  l.primary
                    ? { backgroundColor: 'rgba(0, 230, 118, 0.15)', color: '#00e676' }
                    : { backgroundColor: 'rgba(255, 255, 255, 0.05)', color: '#cbd5e1' }
                }
              >
                {l.label} <ExternalLink size={12} />
              </a>
            </li>
          ) : (
            <li key={l.label} className="text-xs text-gray-500 self-center">
              {l.label}
            </li>
          )
        )}
      </ul>
      <p className="mt-2 text-[10px] text-gray-500">
        Allotted equity shares appear directly in your demat account on the scheduled credit date.
      </p>
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
    ipo.priceHigh
      ? `Price Band: ${ipo.priceLow === ipo.priceHigh ? inr(ipo.priceHigh) : `${inr(ipo.priceLow)} – ${inr(ipo.priceHigh)}`}`
      : null,
    ipo.lotSize ? `Lot Size: ${ipo.lotSize} shares` : null,
    ipo.minInvestment ? `Min Application: ≈ ${inr(ipo.minInvestment)}` : null,
    ipo.issueSizeCr
      ? `Issue Size: ≈ ₹${ipo.issueSizeCr.toLocaleString('en-IN')} Cr${ipo.source === 'NSE' ? ' (Upper Band)' : ''}`
      : null,
    ipo.issueType,
  ].filter(Boolean);

  return (
    <article
      className="p-4 transition-colors hover:bg-white/1"
      style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={() => onToggle(ipo.id)}
          aria-label={tracked ? `Stop tracking ${ipo.name}` : `Track ${ipo.name}`}
          aria-pressed={tracked}
          title={tracked ? 'Tracked' : 'Track this IPO'}
          className="p-1 cursor-pointer text-gray-500 hover:text-amber-400 mt-0.5"
        >
          <Star size={16} fill={tracked ? '#ffd600' : 'none'} color={tracked ? '#ffd600' : 'currentColor'} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-sm font-bold text-gray-100">{ipo.name}</h3>
            {ipo.symbol && <span className="text-[11px] text-gray-400 font-mono font-medium">({ipo.symbol})</span>}
            {ipo.exchange === 'BSE' && (
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/10 text-gray-300 font-mono">BSE</span>
            )}
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded uppercase"
              style={{ color: stage.color, backgroundColor: `${stage.color}1f` }}
            >
              {stage.label}
            </span>
            <span className="text-xs font-medium text-gray-400">{countdown(ipo, todayKey)}</span>
          </div>

          {facts.length > 0 && <p className="mt-1 text-xs text-gray-400">{facts.join(' · ')}</p>}

          <Gmp ipo={ipo} />

          {/* Listed statistics */}
          {ipo.stage === 'LISTED' && (ipo.issuePrice || ipo.listingGainPct !== null) && (
            <p className="mt-1 text-xs text-gray-400 font-mono">
              {ipo.issuePrice ? `Issue Price ${inr(ipo.issuePrice)}` : null}
              {ipo.listingGainPct !== null && (
                <>
                  {ipo.issuePrice ? ' · ' : ''}Listing Day:{' '}
                  <span style={{ color: ipo.listingGainPct >= 0 ? '#00e676' : '#ff1744' }} className="font-bold">
                    {ipo.listingGainPct >= 0 ? '+' : ''}
                    {ipo.listingGainPct.toFixed(1)}%
                  </span>
                  {ipo.listingPrice ? ` (listed at ${inr(ipo.listingPrice)})` : ''}
                </>
              )}
              {move && (
                <>
                  {' · '}LTP {inr(move.price)}{' '}
                  <span style={{ color: move.pct >= 0 ? '#00e676' : '#ff1744' }} className="font-bold">
                    ({move.pct >= 0 ? '+' : ''}
                    {move.pct.toFixed(1)}% vs Issue)
                  </span>
                </>
              )}
            </p>
          )}

          {/* Subscription multiples */}
          {ipo.subscription.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-400">
              <span className="text-gray-500 font-medium">
                {ipo.stage === 'OPEN' ? 'Live Subscription:' : 'Final Subscription:'}
              </span>
              {ipo.subscription.map((s) => (
                <span
                  key={s.category}
                  className="px-2 py-0.5 rounded bg-white/5 text-gray-300 font-mono text-[11px]"
                >
                  {s.category}: <span className="font-bold text-gray-100">{s.times.toFixed(2)}x</span>
                </span>
              ))}
            </div>
          )}

          <Timeline ipo={ipo} todayKey={todayKey} />

          {/* Actions */}
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => toggle('analysis')} aria-expanded={panel === 'analysis'} className={smallButton}>
              {panel === 'analysis' ? 'Hide Analysis' : 'Rules Analysis'}
            </button>
            {ipo.allotment && (
              <button onClick={() => toggle('allotment')} aria-expanded={panel === 'allotment'} className={smallButton}>
                {panel === 'allotment' ? 'Hide Allotment Portal' : 'Check Allotment'}
              </button>
            )}
          </div>

          {panel === 'analysis' && <Analysis ipo={ipo} />}
          {panel === 'allotment' && ipo.allotment && <Allotment ipo={ipo} />}
        </div>

        {nseUrl && (
          <a
            href={nseUrl}
            target="_blank"
            rel="noreferrer"
            title="Official issue page on NSE"
            aria-label={`Open ${ipo.name} on NSE`}
            className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
          >
            <ExternalLink size={14} />
          </a>
        )}
      </div>
    </article>
  );
}
