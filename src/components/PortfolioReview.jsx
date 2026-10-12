import { Fragment, useState } from 'react';
import { ACTIONS, LIMITS } from '../data/portfolioAnalysis';

const TONE = { good: '#00e676', neutral: '#9ca3af', warn: '#ffd600', caution: '#ff9100', bad: '#ff1744' };
const LONG_TONE = { UPTREND: 'good', WEAKENING: 'warn', BELOW_200: 'caution', DOWNTREND: 'bad', INSUFFICIENT: 'neutral' };
const SHORT_TONE = { SETUP_LONG: 'good', UP: 'good', OVERSOLD: 'warn', MIXED: 'neutral', UNKNOWN: 'neutral', EXTENDED: 'warn', DOWN: 'bad', SETUP_SHORT: 'bad' };
const rule = { borderBottom: '1px solid rgba(30, 45, 61, 0.3)' };
const inr = (n) => (Number.isFinite(n) ? `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—');
const pct = (n, digits = 1) => (Number.isFinite(n) ? `${n.toFixed(digits)}%` : '—');
const signedPct = (n) => (Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(1)}%` : '—');

function Chip({ tone, children, title }) {
  return (
    <span title={title} className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap" style={{ color: TONE[tone], backgroundColor: `${TONE[tone]}1f` }}>
      {children}
    </span>
  );
}

function Loading({ progress, missing }) {
  return (
    <p className="px-4 py-6 text-xs text-gray-500">
      Loading about a year of daily prices for your holdings… {progress.total ? `${progress.done} of ${progress.total}` : ''}
      {missing.length > 0 ? ` (${missing.length} unavailable)` : ''}
    </p>
  );
}

function Disclaimer() {
  return (
    <div className="px-4 py-3 text-[11px] text-gray-500 space-y-1">
      <p>
        These are rule matches on past daily prices, not investment advice. They do not know your goals, time horizon, taxes or what you paid, and
        a past trend does not predict what happens next. Use them as a checklist of what to look at, then decide for yourself. StockPulse cannot place or change orders.
      </p>
      <details>
        <summary className="cursor-pointer text-gray-400">How each label is decided</summary>
        <ul className="mt-1 ml-4 list-disc space-y-0.5">
          <li><b>Long-term view</b> uses the 200-day and 50-day averages: uptrend = price above the 200-day and 50-day above 200-day; weakening = price above the 200-day but 50-day below it; below 200-day = price under the 200-day while the 50-day is still above; downtrend = price under the 200-day and 50-day below it. Needs about a year of history.</li>
          <li><b>Short-term view</b> uses the same swing rules as the Swing screen (a setup that is still valid), RSI ({LIMITS.rsiLow} or below oversold, {LIMITS.rsiHigh}+ overbought), and the distance from the 20-day average ({LIMITS.extendedPct}%+ stretched).</li>
          <li><b>Add: rule match</b> only in a long-term uptrend with a valid bullish setup or an oversold pullback, and a position under {LIMITS.addMaxWeightPct}% of the portfolio.</li>
          <li><b>Consider trimming</b>: uptrend but stretched and the position is {LIMITS.stockWarnPct}% or more of the portfolio. <b>Review: reduce or exit</b>: long-term and short-term both down.</li>
          <li><b>Hold</b> means no rule is triggered; <b>hold, watch closely</b> means the trend is weakening, a bounce is inside a downtrend, or there is too little history.</li>
          <li>Sector and size come from NSE index membership (a rough guide). Correlation uses daily returns on shared dates (at least {LIMITS.corrMinOverlap} days); pairs at {LIMITS.corrHigh} or more are flagged.</li>
        </ul>
      </details>
    </div>
  );
}

/** Rule-based verdict for each holding, with the reasons, plus notes about the whole portfolio. */
export function ReviewView({ analysis, loading, progress, missing, limited, onCost, onSelectStock }) {
  const [open, setOpen] = useState(null);
  if (loading || !analysis) return <Loading progress={progress} missing={missing} />;
  const rows = analysis.rows.filter((r) => r.holding.symbol);
  const unnamed = analysis.rows.length - rows.length;

  return (
    <>
      {analysis.notes.length > 0 && (
        <section className="px-4 py-3" style={rule}>
          <h3 className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Portfolio notes</h3>
          <ul className="space-y-1">
            {analysis.notes.map((n, i) => (
              <li key={i} className="text-xs text-gray-300 flex gap-2">
                <span style={{ color: n.level === 'warn' ? '#ffd600' : '#64748b' }} aria-hidden="true">{n.level === 'warn' ? '▲' : '●'}</span>
                <span>{n.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-wrap gap-2 px-4 py-2" style={rule}>
        {Object.entries(ACTIONS).filter(([key]) => analysis.actionShare[key]).map(([key, a]) => (
          <span key={key} className="text-[11px] text-gray-400">
            <Chip tone={a.tone}>{a.label}</Chip> {analysis.actionShare[key].count} · {pct(analysis.actionShare[key].weightPct)} of portfolio
          </span>
        ))}
      </section>

      {(missing.length > 0 || limited || unnamed > 0) && (
        <p className="px-4 py-2 text-[11px]" style={{ color: '#ffd600' }}>
          {missing.length > 0 && `No usable price history for ${missing.join(', ')}; they have no verdict. `}
          {limited && 'Only the largest holdings are reviewed. '}
          {unnamed > 0 && `${unnamed} holding${unnamed > 1 ? 's' : ''} without an NSE symbol cannot be reviewed.`}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] text-gray-600 uppercase tracking-wider">
              {['Stock', 'Weight', 'Long-term', 'Short-term', 'Rule-based action', 'Your avg cost'].map((h, i) => (
                <th key={h} className={`px-3 py-1.5 font-normal ${i === 0 ? 'text-left' : i === 1 ? 'text-right' : 'text-left'} ${i === 4 ? 'hidden md:table-cell' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ holding, review, avgCost }) => {
              const symbol = holding.symbol;
              const isOpen = open === symbol;
              return (
                <Fragment key={symbol}>
                  <tr style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}>
                    <td className="px-3 py-1.5">
                      <button onClick={() => setOpen(isOpen ? null : symbol)} aria-expanded={isOpen} className="text-left cursor-pointer">
                        <span className="font-medium text-gray-200">{symbol}</span>
                        <span className="ml-1 text-[10px] text-gray-600">{isOpen ? '▾ why' : '▸ why'}</span>
                      </button>
                      <div className="text-[10px] text-gray-600 truncate max-w-[14rem]">{holding.name}</div>
                      {review && <div className="md:hidden mt-1"><Chip tone={ACTIONS[review.action].tone} title={ACTIONS[review.action].detail}>{ACTIONS[review.action].label}</Chip></div>}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-gray-300">{pct(holding.weightPct)}</td>
                    <td className="px-3 py-1.5">
                      {review ? <Chip tone={LONG_TONE[review.longTerm.state]} title={review.longTerm.reasons.join(' ')}>{review.longTerm.label}</Chip> : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-3 py-1.5">
                      {review ? <Chip tone={SHORT_TONE[review.shortTerm.state]} title={review.shortTerm.reasons.join(' ')}>{review.shortTerm.label}</Chip> : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-3 py-1.5 hidden md:table-cell">
                      {review ? <Chip tone={ACTIONS[review.action].tone} title={ACTIONS[review.action].detail}>{ACTIONS[review.action].label}</Chip> : <span className="text-gray-600">No price history</span>}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          defaultValue={avgCost ?? ''}
                          key={`${symbol}-${avgCost ?? ''}`}
                          onBlur={(e) => onCost(symbol, e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                          aria-label={`Average buy price of ${symbol}`}
                          placeholder="optional"
                          className="w-20 px-1.5 py-0.5 text-xs font-mono rounded bg-transparent text-gray-200 border border-gray-700 focus:border-green-500 outline-none"
                        />
                        {review && Number.isFinite(review.pnlPct) && (
                          <span className="font-mono" style={{ color: review.pnlPct >= 0 ? '#00e676' : '#ff1744' }}>{signedPct(review.pnlPct)}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isOpen && review && (
                    <tr style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                      <td colSpan={6} className="px-3 py-2">
                        <p className="text-[11px] text-gray-300 mb-1">{ACTIONS[review.action].label}: {ACTIONS[review.action].detail}.</p>
                        <ul className="list-disc ml-4 text-[11px] text-gray-400 space-y-0.5">
                          {review.reasons.map((r, i) => <li key={i}>{r}</li>)}
                          {Number.isFinite(review.longTerm.from52wHighPct) && <li>It is {Math.abs(review.longTerm.from52wHighPct).toFixed(1)}% below its 52-week high.</li>}
                        </ul>
                        {onSelectStock && (
                          <button onClick={() => onSelectStock({ symbol, name: holding.name, sector: '' })} className="mt-1 text-[11px] underline cursor-pointer" style={{ color: '#00e5ff' }}>Open chart</button>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-4 pt-2 text-[10px] text-gray-600">
        Your average buy price is optional and stays in this browser (ICICI&apos;s holdings feed does not include what you paid). With it, the profit or loss against cost is shown.
      </p>
      <Disclaimer />
    </>
  );
}

function Bars({ title, groups, hidden, note }) {
  return (
    <section className="px-4 py-3" style={rule}>
      <h3 className="text-[11px] text-gray-500 uppercase tracking-wider mb-2">{title}</h3>
      <ul className="space-y-1.5">
        {groups.map((g) => (
          <li key={g.key}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-gray-300 truncate">{g.key} <span className="text-gray-600">({g.symbols.slice(0, 4).join(', ')}{g.symbols.length > 4 ? `, +${g.symbols.length - 4}` : ''})</span></span>
              <span className="font-mono text-gray-400 whitespace-nowrap">{pct(g.weightPct)}{hidden ? '' : ` · ${inr(g.value)}`}</span>
            </div>
            <div className="h-1.5 rounded bg-white/5 mt-0.5"><div className="h-full rounded" style={{ width: `${Math.min(100, g.weightPct)}%`, backgroundColor: '#00b0ff' }} /></div>
          </li>
        ))}
      </ul>
      {note && <p className="mt-2 text-[10px] text-gray-600">{note}</p>}
    </section>
  );
}

export function AllocationView({ analysis, loading, progress, missing, holdings, hidden }) {
  if (loading || !analysis) return <Loading progress={progress} missing={missing} />;
  const c = analysis.concentration;
  const byStock = holdings.filter((h) => Number.isFinite(h.value) && h.value > 0).map((h) => ({ key: h.symbol || h.code, value: h.value, weightPct: h.weightPct, symbols: [h.name] }));
  return (
    <>
      {c && (
        <section className="flex flex-wrap" style={rule}>
          {[
            ['Largest holding', pct(c.top1Pct)],
            ['Top 3', pct(c.top3Pct)],
            ['Top 5', pct(c.top5Pct)],
            ['Effective stocks', c.effectiveStocks.toFixed(1)],
            ['Holdings', String(c.count)],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-col px-4 py-2">
              <span className="text-[10px] text-gray-600 uppercase tracking-wider">{label}</span>
              <span className="text-sm font-mono font-medium text-gray-200">{value}</span>
            </div>
          ))}
        </section>
      )}
      <p className="px-4 py-2 text-[11px] text-gray-500" style={rule}>
        &quot;Effective stocks&quot; is how many equal-sized positions would be as concentrated as this portfolio: close to the holdings count means well spread, much lower means a few positions dominate.
      </p>
      <Bars title="By stock" groups={byStock} hidden={hidden} />
      <Bars title="By sector" groups={analysis.sectors} hidden={hidden} note="Sector is the NSE sector index that holds the stock (a rough guide). Stocks in none of them are grouped as other." />
      <Bars title="By size" groups={analysis.sizes} hidden={hidden} note="Large = in the Nifty 100, mid = Nifty Midcap 150, small = Nifty Smallcap 250." />
    </>
  );
}

function heat(r) {
  if (!Number.isFinite(r)) return 'transparent';
  return r >= 0 ? `rgba(255, 145, 0, ${Math.min(1, r) * 0.7})` : `rgba(0, 176, 255, ${Math.min(1, -r) * 0.7})`;
}

export function CorrelationView({ analysis, loading, progress, missing }) {
  if (loading || !analysis) return <Loading progress={progress} missing={missing} />;
  const { correlation, risk, pairs, avgCorr } = analysis;
  if (!correlation) {
    return <p className="px-4 py-6 text-xs text-gray-500">Correlation needs at least two holdings with {LIMITS.corrMinOverlap} or more trading days of price history. Not enough could be loaded.</p>;
  }
  return (
    <>
      <section className="flex flex-wrap" style={rule}>
        <div className="flex flex-col px-4 py-2">
          <span className="text-[10px] text-gray-600 uppercase tracking-wider">Average correlation</span>
          <span className="text-sm font-mono font-medium text-gray-200">{Number.isFinite(avgCorr) ? avgCorr.toFixed(2) : '—'}</span>
        </div>
        {risk && (
          <>
            <div className="flex flex-col px-4 py-2">
              <span className="text-[10px] text-gray-600 uppercase tracking-wider">Volatility (a year)</span>
              <span className="text-sm font-mono font-medium text-gray-200">{pct(risk.volPct)}</span>
            </div>
            <div className="flex flex-col px-4 py-2">
              <span className="text-[10px] text-gray-600 uppercase tracking-wider">Worst fall</span>
              <span className="text-sm font-mono font-medium" style={{ color: '#ff1744' }}>{pct(risk.maxDrawdownPct)}</span>
            </div>
            <div className="flex flex-col px-4 py-2">
              <span className="text-[10px] text-gray-600 uppercase tracking-wider">Window</span>
              <span className="text-sm font-mono font-medium text-gray-200">{risk.days} days</span>
            </div>
          </>
        )}
      </section>
      <p className="px-4 py-2 text-[11px] text-gray-500" style={rule}>
        Correlation is how closely two stocks&apos; daily moves match (+1 move together, 0 unrelated, −1 opposite). Orange = move together, blue = move opposite.
        {risk && ` Volatility and worst fall replay today's weights over the last ${risk.days} trading days (${risk.from} to ${risk.to}), covering ${risk.coveredWeightPct.toFixed(0)}% of the portfolio by value. They are not your actual past returns.`}
      </p>

      {pairs.length > 0 && (
        <section className="px-4 py-3" style={rule}>
          <h3 className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Closely correlated pairs ({LIMITS.corrHigh}+)</h3>
          <ul className="text-xs text-gray-300 space-y-0.5">
            {pairs.slice(0, 8).map((p) => <li key={`${p.a}-${p.b}`}>{p.a} and {p.b}: <span className="font-mono" style={{ color: '#ff9100' }}>{p.r.toFixed(2)}</span></li>)}
          </ul>
        </section>
      )}

      <div className="overflow-x-auto px-4 py-3">
        <table className="text-[10px] border-separate" style={{ borderSpacing: 2 }}>
          <thead>
            <tr>
              <th />
              {correlation.symbols.map((s) => <th key={s} className="font-normal text-gray-500 px-1 pb-1" style={{ writingMode: 'vertical-rl' }}>{s}</th>)}
            </tr>
          </thead>
          <tbody>
            {correlation.symbols.map((rowSym, i) => (
              <tr key={rowSym}>
                <th className="font-normal text-gray-500 text-right pr-2 whitespace-nowrap">{rowSym}</th>
                {correlation.cells[i].map((r, j) => (
                  <td
                    key={j}
                    title={i === j ? rowSym : `${rowSym} / ${correlation.symbols[j]}: ${Number.isFinite(r) ? r.toFixed(2) : 'not enough shared days'}`}
                    className="text-center font-mono text-gray-200 rounded"
                    style={{ minWidth: 30, height: 24, backgroundColor: i === j ? 'rgba(255,255,255,0.06)' : heat(r) }}
                  >
                    {i === j ? '' : Number.isFinite(r) ? r.toFixed(2).replace('0.', '.').replace('-0.', '-.') : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Disclaimer />
    </>
  );
}
