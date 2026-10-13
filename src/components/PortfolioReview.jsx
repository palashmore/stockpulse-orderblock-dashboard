import { Fragment, useState } from 'react';
import { ACTIONS, LIMITS } from '../data/portfolioAnalysis';
import { AlertTriangle, Info, TrendingUp, TrendingDown, Layers, ChevronDown, ChevronRight, PieChart } from 'lucide-react';

const TONE = { good: '#00e676', neutral: '#9ca3af', warn: '#ffd600', caution: '#ff9100', bad: '#ff1744' };
const LONG_TONE = { UPTREND: 'good', WEAKENING: 'warn', BELOW_200: 'caution', DOWNTREND: 'bad', INSUFFICIENT: 'neutral' };
const SHORT_TONE = { SETUP_LONG: 'good', UP: 'good', OVERSOLD: 'warn', MIXED: 'neutral', UNKNOWN: 'neutral', EXTENDED: 'warn', DOWN: 'bad', SETUP_SHORT: 'bad' };
const rule = { borderBottom: '1px solid rgba(30, 45, 61, 0.4)' };
const inr = (n) => (Number.isFinite(n) ? `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—');
const pct = (n, digits = 1) => (Number.isFinite(n) ? `${n.toFixed(digits)}%` : '—');
const signedPct = (n) => (Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(1)}%` : '—');

function Chip({ tone, children, title }) {
  return (
    <span
      title={title}
      className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase whitespace-nowrap"
      style={{ color: TONE[tone], backgroundColor: `${TONE[tone]}1f` }}
    >
      {children}
    </span>
  );
}

function Loading({ progress, missing }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8 text-xs text-gray-500">
      Loading 1-year daily price history for holdings… {progress.total ? `${progress.done} of ${progress.total}` : ''}
      {missing.length > 0 ? ` (${missing.length} unavailable)` : ''}
    </div>
  );
}

function Disclaimer() {
  return (
    <div className="px-4 py-3 text-[11px] text-gray-500 space-y-1.5" style={{ backgroundColor: '#0d1117', borderTop: '1px solid rgba(30, 45, 61, 0.3)' }}>
      <p>
        These represent quantitative rule matches on past daily prices, not personalized investment advice.
        StockPulse is a self-directed research terminal and does not place, route, or execute orders.
      </p>
      <details className="cursor-pointer">
        <summary className="text-gray-400 font-medium hover:text-gray-300">Detailed rule methodology & criteria</summary>
        <ul className="mt-1.5 ml-4 list-disc space-y-1 text-gray-400 text-[10px]">
          <li>
            <b>Long-term trend</b> uses 200-day and 50-day moving averages: uptrend = price above 200-day and 50-day above 200-day; weakening = price above 200-day but 50-day below it; downtrend = price and 50-day below 200-day.
          </li>
          <li>
            <b>Short-term view</b> uses technical swing rules (valid breakout/pullback setup), RSI extremes ({LIMITS.rsiLow} oversold, {LIMITS.rsiHigh} overbought), and 20-day EMA extension ({LIMITS.extendedPct}%+).
          </li>
          <li>
            <b>Add rule match</b> requires long-term uptrend with valid bullish confluence, where position size is under {LIMITS.addMaxWeightPct}% of the portfolio.
          </li>
          <li>
            <b>Consider trimming</b>: uptrend but extended, position size exceeds {LIMITS.stockWarnPct}% of the portfolio. <b>Review / reduce</b>: both long-term and short-term trends pointing down.
          </li>
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
    <div className="flex flex-col flex-1 min-h-0">
      {/* Portfolio Advisory Notes */}
      {analysis.notes.length > 0 && (
        <section className="px-4 py-3 space-y-1.5" style={{ backgroundColor: '#0d1117', ...rule }}>
          <div className="flex items-center gap-1.5 text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
            <Info size={13} className="text-cyan-400" />
            <span>Portfolio Intelligence Alerts</span>
          </div>
          <div className="space-y-1">
            {analysis.notes.map((n, i) => (
              <div
                key={i}
                className="flex items-start gap-2 p-2 rounded text-xs text-gray-300"
                style={{
                  backgroundColor: n.level === 'warn' ? 'rgba(255, 214, 0, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                  border: n.level === 'warn' ? '1px solid rgba(255, 214, 0, 0.2)' : '1px solid rgba(30, 45, 61, 0.3)',
                }}
              >
                {n.level === 'warn' ? (
                  <AlertTriangle size={13} style={{ color: '#ffd600' }} className="mt-0.5 flex-shrink-0" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 flex-shrink-0" />
                )}
                <span>{n.text}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Action Distribution Bar */}
      <section className="flex flex-wrap items-center gap-3 px-4 py-2.5 flex-shrink-0" style={{ backgroundColor: '#111827', ...rule }}>
        <span className="text-[10px] text-gray-500 uppercase font-medium">Verdicts:</span>
        {Object.entries(ACTIONS)
          .filter(([key]) => analysis.actionShare[key])
          .map(([key, a]) => (
            <div key={key} className="flex items-center gap-1.5 text-xs text-gray-300">
              <Chip tone={a.tone}>{a.label}</Chip>
              <span className="font-mono font-medium">{analysis.actionShare[key].count} stocks</span>
              <span className="text-[11px] text-gray-500">({pct(analysis.actionShare[key].weightPct)})</span>
            </div>
          ))}
      </section>

      {(missing.length > 0 || limited || unnamed > 0) && (
        <div className="px-4 py-2 text-[11px] flex items-center gap-1" style={{ color: '#ffd600', backgroundColor: 'rgba(255, 214, 0, 0.04)' }}>
          <AlertTriangle size={12} />
          <span>
            {missing.length > 0 && `No usable price history for ${missing.join(', ')}; `}
            {limited && 'Only largest holdings reviewed; '}
            {unnamed > 0 && `${unnamed} unmapped holding${unnamed > 1 ? 's' : ''} excluded.`}
          </span>
        </div>
      )}

      {/* Table of Verdicts */}
      <div className="flex-1 overflow-x-auto min-h-0">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10" style={{ backgroundColor: '#0d1117' }}>
            <tr className="text-[10px] text-gray-500 uppercase tracking-wider" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.5)' }}>
              <th className="px-4 py-2 font-medium text-left">Stock</th>
              <th className="px-3 py-2 font-medium text-right">Weight %</th>
              <th className="px-3 py-2 font-medium text-left">Long-Term</th>
              <th className="px-3 py-2 font-medium text-left">Short-Term</th>
              <th className="px-3 py-2 font-medium text-left hidden md:table-cell">Action Verdict</th>
              <th className="px-4 py-2 font-medium text-right">Avg Buy Price (₹)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ holding, review, avgCost }) => {
              const symbol = holding.symbol;
              const isOpen = open === symbol;
              return (
                <Fragment key={symbol}>
                  <tr
                    className="hover:bg-white/5 transition-colors"
                    style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}
                  >
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => setOpen(isOpen ? null : symbol)}
                        aria-expanded={isOpen}
                        className="text-left cursor-pointer flex items-center gap-1 group"
                      >
                        <span className="font-bold text-gray-200 group-hover:text-emerald-400 transition-colors">
                          {symbol}
                        </span>
                        {isOpen ? <ChevronDown size={12} className="text-gray-400" /> : <ChevronRight size={12} className="text-gray-500" />}
                      </button>
                      <div className="text-[10px] text-gray-500 truncate max-w-[14rem]">{holding.name}</div>
                      {review && (
                        <div className="md:hidden mt-1">
                          <Chip tone={ACTIONS[review.action].tone} title={ACTIONS[review.action].detail}>
                            {ACTIONS[review.action].label}
                          </Chip>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-300 font-semibold">{pct(holding.weightPct)}</td>
                    <td className="px-3 py-2.5">
                      {review ? (
                        <Chip tone={LONG_TONE[review.longTerm.state]} title={review.longTerm.reasons.join(' ')}>
                          {review.longTerm.label}
                        </Chip>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {review ? (
                        <Chip tone={SHORT_TONE[review.shortTerm.state]} title={review.shortTerm.reasons.join(' ')}>
                          {review.shortTerm.label}
                        </Chip>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell">
                      {review ? (
                        <Chip tone={ACTIONS[review.action].tone} title={ACTIONS[review.action].detail}>
                          {ACTIONS[review.action].label}
                        </Chip>
                      ) : (
                        <span className="text-gray-600">No price history</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          defaultValue={avgCost ?? ''}
                          key={`${symbol}-${avgCost ?? ''}`}
                          onBlur={(e) => onCost(symbol, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                          }}
                          aria-label={`Average buy price of ${symbol}`}
                          placeholder="Cost ₹"
                          className="w-20 px-2 py-0.5 text-xs font-mono rounded text-right text-gray-200 border border-gray-700 focus:border-green-500 outline-none"
                          style={{ backgroundColor: '#111827' }}
                        />
                        {review && Number.isFinite(review.pnlPct) && (
                          <span
                            className="font-mono text-xs font-bold w-14 text-right"
                            style={{ color: review.pnlPct >= 0 ? '#00e676' : '#ff1744' }}
                          >
                            {signedPct(review.pnlPct)}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Expandable Rationale Drawer */}
                  {isOpen && review && (
                    <tr style={{ backgroundColor: '#111827' }}>
                      <td colSpan={6} className="px-5 py-3">
                        <div className="p-3 rounded-lg" style={{ backgroundColor: '#0d1117', border: '1px solid #1e2d3d' }}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-gray-200">
                              {ACTIONS[review.action].label}: {ACTIONS[review.action].detail}
                            </span>
                            {onSelectStock && (
                              <button
                                onClick={() => onSelectStock({ symbol, name: holding.name, sector: '' })}
                                className="text-xs underline cursor-pointer font-medium"
                                style={{ color: '#00e5ff' }}
                              >
                                View Interactive Chart →
                              </button>
                            )}
                          </div>
                          <ul className="list-disc ml-4 text-xs text-gray-400 space-y-1">
                            {review.reasons.map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                            {Number.isFinite(review.longTerm.from52wHighPct) && (
                              <li>Price sits {Math.abs(review.longTerm.from52wHighPct).toFixed(1)}% below its 52-week peak.</li>
                            )}
                          </ul>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2 text-[10px] text-gray-600 flex-shrink-0" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.3)' }}>
        Average buy prices are stored locally in your browser. P&L is calculated against your recorded cost basis.
      </div>
      <Disclaimer />
    </div>
  );
}

function Bars({ title, groups, hidden, note }) {
  return (
    <section className="px-4 py-3" style={rule}>
      <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2.5">{title}</h3>
      <ul className="space-y-2">
        {groups.map((g) => (
          <li key={g.key} className="p-2 rounded" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
            <div className="flex items-baseline justify-between gap-2 text-xs mb-1">
              <span className="text-gray-200 font-semibold truncate">
                {g.key}{' '}
                <span className="text-gray-500 font-normal">
                  ({g.symbols.slice(0, 4).join(', ')}
                  {g.symbols.length > 4 ? `, +${g.symbols.length - 4}` : ''})
                </span>
              </span>
              <span className="font-mono text-gray-300 font-semibold whitespace-nowrap">
                {pct(g.weightPct)}
                {hidden ? '' : ` · ${inr(g.value)}`}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(100, g.weightPct)}%`, backgroundColor: '#00b0ff' }}
              />
            </div>
          </li>
        ))}
      </ul>
      {note && <p className="mt-2 text-[10px] text-gray-500">{note}</p>}
    </section>
  );
}

export function AllocationView({ analysis, loading, progress, missing, holdings, hidden }) {
  if (loading || !analysis) return <Loading progress={progress} missing={missing} />;
  const c = analysis.concentration;
  const byStock = holdings
    .filter((h) => Number.isFinite(h.value) && h.value > 0)
    .map((h) => ({ key: h.symbol || h.code, value: h.value, weightPct: h.weightPct, symbols: [h.name] }));

  return (
    <div className="flex-1 overflow-y-auto">
      {c && (
        <div
          className="grid grid-cols-2 sm:grid-cols-5 gap-2 px-4 py-3 flex-shrink-0"
          style={{ backgroundColor: '#0a0e17', ...rule }}
        >
          <div className="p-2.5 rounded" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
            <span className="text-[10px] text-gray-500 uppercase block mb-0.5">Largest Stock</span>
            <span className="text-sm font-mono font-bold text-gray-100">{pct(c.top1Pct)}</span>
          </div>
          <div className="p-2.5 rounded" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
            <span className="text-[10px] text-gray-500 uppercase block mb-0.5">Top 3 Weights</span>
            <span className="text-sm font-mono font-bold text-gray-100">{pct(c.top3Pct)}</span>
          </div>
          <div className="p-2.5 rounded" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
            <span className="text-[10px] text-gray-500 uppercase block mb-0.5">Top 5 Weights</span>
            <span className="text-sm font-mono font-bold text-gray-100">{pct(c.top5Pct)}</span>
          </div>
          <div className="p-2.5 rounded" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
            <span className="text-[10px] text-gray-500 uppercase block mb-0.5">Effective Stocks</span>
            <span className="text-sm font-mono font-bold text-emerald-400">{c.effectiveStocks.toFixed(1)}</span>
          </div>
          <div className="p-2.5 rounded" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
            <span className="text-[10px] text-gray-500 uppercase block mb-0.5">Holdings Count</span>
            <span className="text-sm font-mono font-bold text-gray-100">{c.count}</span>
          </div>
        </div>
      )}

      <div className="px-4 py-2 text-[11px] text-gray-400" style={rule}>
        &quot;Effective stocks&quot; measures Herfindahl diversification: close to the holdings count indicates well-diversified weighting.
      </div>
      <Bars title="Allocation By Stock" groups={byStock} hidden={hidden} />
      <Bars
        title="Allocation By Sector"
        groups={analysis.sectors}
        hidden={hidden}
        note="Sectors map to official NSE sectoral index classifications. Stocks outside indices are designated as Other."
      />
      <Bars
        title="Allocation By Market Cap Tier"
        groups={analysis.sizes}
        hidden={hidden}
        note="Large Cap = Nifty 100, Mid Cap = Nifty Midcap 150, Small Cap = Nifty Smallcap 250."
      />
    </div>
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
    return (
      <div className="p-8 text-center text-xs text-gray-500">
        Correlation matrix requires at least two holdings with {LIMITS.corrMinOverlap}+ common trading days of history.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Portfolio Risk Header Strip */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 py-3 flex-shrink-0"
        style={{ backgroundColor: '#0a0e17', ...rule }}
      >
        <div className="p-2.5 rounded" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
          <span className="text-[10px] text-gray-500 uppercase block mb-0.5">Average Correlation</span>
          <span className="text-sm font-mono font-bold text-gray-100">
            {Number.isFinite(avgCorr) ? avgCorr.toFixed(2) : '—'}
          </span>
        </div>
        {risk && (
          <>
            <div className="p-2.5 rounded" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
              <span className="text-[10px] text-gray-500 uppercase block mb-0.5">1-Year Volatility</span>
              <span className="text-sm font-mono font-bold text-gray-100">{pct(risk.volPct)}</span>
            </div>
            <div className="p-2.5 rounded" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
              <span className="text-[10px] text-gray-500 uppercase block mb-0.5">Worst Historical Fall</span>
              <span className="text-sm font-mono font-bold" style={{ color: '#ff1744' }}>
                {pct(risk.maxDrawdownPct)}
              </span>
            </div>
            <div className="p-2.5 rounded" style={{ backgroundColor: '#111827', border: '1px solid #1e2d3d' }}>
              <span className="text-[10px] text-gray-500 uppercase block mb-0.5">Backtest Window</span>
              <span className="text-sm font-mono font-bold text-gray-100">{risk.days} trading days</span>
            </div>
          </>
        )}
      </div>

      <div className="px-4 py-2 text-[11px] text-gray-400" style={rule}>
        Pairwise correlation measures daily move synchronization: orange (+1) indicates synchronized co-movement, blue (−1) indicates hedging inverse movement.
      </div>

      {pairs.length > 0 && (
        <section className="px-4 py-3" style={rule}>
          <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <AlertTriangle size={13} style={{ color: '#ff9100' }} />
            <span>High Correlation Warning ({LIMITS.corrHigh}+)</span>
          </h3>
          <ul className="text-xs text-gray-300 space-y-1">
            {pairs.slice(0, 8).map((p) => (
              <li key={`${p.a}-${p.b}`} className="flex items-center gap-2">
                <span>{p.a} & {p.b}:</span>
                <span className="font-mono font-bold" style={{ color: '#ff9100' }}>
                  {p.r.toFixed(2)}
                </span>
                <span className="text-[10px] text-gray-500">co-moving risk concentration</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Heatmap Grid Table */}
      <div className="overflow-x-auto px-4 py-4">
        <table className="text-[10px] border-separate" style={{ borderSpacing: 2 }}>
          <thead>
            <tr>
              <th />
              {correlation.symbols.map((s) => (
                <th key={s} className="font-bold text-gray-400 px-1 pb-1 text-center" style={{ writingMode: 'vertical-rl' }}>
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {correlation.symbols.map((rowSym, i) => (
              <tr key={rowSym}>
                <th className="font-bold text-gray-400 text-right pr-2 whitespace-nowrap">{rowSym}</th>
                {correlation.cells[i].map((r, j) => (
                  <td
                    key={j}
                    title={
                      i === j
                        ? rowSym
                        : `${rowSym} / ${correlation.symbols[j]}: ${Number.isFinite(r) ? r.toFixed(2) : 'Insufficient shared data'}`
                    }
                    className="text-center font-mono text-gray-100 rounded"
                    style={{ minWidth: 32, height: 26, backgroundColor: i === j ? 'rgba(255,255,255,0.08)' : heat(r) }}
                  >
                    {i === j ? '1.0' : Number.isFinite(r) ? r.toFixed(2) : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Disclaimer />
    </div>
  );
}
