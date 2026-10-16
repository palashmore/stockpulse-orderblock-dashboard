import { useMemo, useState } from 'react';
import { Star } from 'lucide-react';
import { rankOpportunities, SCORE_CRITERIA } from '../data/opportunities';
import { liquidityList, depthStats } from '../data/orderFlow';
import { DEFAULT_FILTERS, PRESETS, presetFilters, loadSavedFilters } from '../data/screenFilters';
import { fetchDepths } from '../services/api';
import { useRefresh } from '../hooks/useRefresh';

const GREEN = '#00e676';
const RED = '#ff1744';
const px = (n) => (Number.isFinite(n) ? n.toFixed(2) : '—');
const signed = (n) => (Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(2)}%` : '—');
const tone = (n) => (!Number.isFinite(n) || n === 0 ? '#9ca3af' : n > 0 ? GREEN : RED);
const qty = (v) => (!Number.isFinite(v) ? '—' : v >= 1e5 ? `${(v / 1e5).toFixed(2)} L` : v.toLocaleString('en-IN'));

function Panel({ title, hint, count, children }) {
  return (
    <section className="rounded-md overflow-hidden" style={{ border: '1px solid rgba(30, 45, 61, 0.5)', backgroundColor: 'rgba(17, 24, 39, 0.4)' }}>
      <div className="flex items-baseline justify-between gap-2 px-3 py-2" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <h3 className="text-xs font-semibold text-gray-300">{title} {count !== undefined && <span className="text-gray-600 font-normal">({count})</span>}</h3>
        {hint && <span className="text-[10px] text-gray-600 text-right">{hint}</span>}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}
const Empty = ({ children }) => <p className="px-3 py-4 text-xs text-gray-600">{children}</p>;

function Star2({ symbol, price, watch }) {
  const on = watch.symbols.has(symbol);
  return (
    <button onClick={(e) => { e.stopPropagation(); watch.toggle(symbol, price); }} aria-label={on ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`} className="cursor-pointer p-1">
      <Star size={13} fill={on ? '#ffd600' : 'none'} color={on ? '#ffd600' : '#64748b'} />
    </button>
  );
}

function Name({ r }) {
  return (
    <div title={r.indices ? r.indices.join(', ') : undefined}>
      <div className="font-medium text-gray-200 text-xs">{r.symbol}</div>
      <div className="text-[10px] text-gray-600 truncate max-w-[10rem]">{r.name}</div>
      {r.indices && r.indices.length > 0 && <div className="text-[9px] text-gray-700 truncate max-w-[10rem]">{r.indices.slice(0, 2).join(' · ')}{r.indices.length > 2 ? ` +${r.indices.length - 2}` : ''}</div>}
    </div>
  );
}

// Ranked candidates from the selected universe that pass your chosen filter. The score is a summary of
// how well several conditions line up, with every point explained; it is not a chance of profit.
export function Opportunities({ scan, watch, onOpen, lastSession }) {
  const [filterKey, setFilterKey] = useState('none');
  const [minScore, setMinScore] = useState(0);
  const [saved] = useState(() => loadSavedFilters(window.localStorage));
  const [openRow, setOpenRow] = useState(null);

  const filters = useMemo(() => {
    if (filterKey === 'none') return DEFAULT_FILTERS;
    if (filterKey.startsWith('preset:')) return presetFilters(filterKey.slice(7));
    return saved.find((s) => `saved:${s.name}` === filterKey)?.filters ?? DEFAULT_FILTERS;
  }, [filterKey, saved]);

  const result = useMemo(
    () => rankOpportunities(scan.rows, { filters, minScore, lastSession, starred: watch.symbols }),
    [scan.rows, filters, minScore, lastSession, watch.symbols]
  );

  return (
    <>
      <div className="flex flex-wrap items-end gap-3 pb-2">
        <label className="flex flex-col gap-1 text-[10px] text-gray-500 uppercase tracking-wider">Condition
          <select value={filterKey} onChange={(e) => setFilterKey(e.target.value)} aria-label="Filter for opportunities" className="px-2 py-1.5 text-xs rounded text-gray-200 border border-gray-700 outline-none normal-case tracking-normal" style={{ backgroundColor: '#0d1117', maxWidth: 260 }}>
            <option value="none">No filter (rank everything)</option>
            <optgroup label="Presets">{PRESETS.map((p) => <option key={p.id} value={`preset:${p.id}`}>{p.label}</option>)}</optgroup>
            {saved.length > 0 && <optgroup label="Your saved filters">{saved.map((s) => <option key={s.name} value={`saved:${s.name}`}>{s.name}</option>)}</optgroup>}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-gray-500 uppercase tracking-wider">Minimum score
          <select value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} aria-label="Minimum score" className="px-2 py-1.5 text-xs rounded text-gray-200 border border-gray-700 outline-none normal-case tracking-normal" style={{ backgroundColor: '#0d1117' }}>
            {[0, 30, 40, 50, 60, 70, 80].map((v) => <option key={v} value={v}>{v === 0 ? 'Any' : `${v}+`}</option>)}
          </select>
        </label>
        <span className="text-[11px] text-gray-500 pb-1.5">{result.ranked.length} candidates · {result.passedFilter} passed the filter{result.undirected > 0 ? ` · ${result.undirected} skipped (no clear direction)` : ''}</span>
      </div>

      <Panel title="My Opportunities" hint="ranked by score, highest first" count={result.ranked.length}>
        {result.ranked.length === 0 ? <Empty>No stock passes this condition and score. Loosen the condition or the minimum score.</Empty> : (
          <table className="w-full">
            <thead>
              <tr className="text-[10px] text-gray-600 uppercase tracking-wider">
                <th className="px-2 py-1 font-normal text-right w-8">#</th><th className="w-8" /><th className="px-2 py-1 font-normal text-left">Stock</th>
                {['Side', 'Score', 'Price', 'Day', 'Setup', 'Entry / Stop / T1'].map((h) => <th key={h} className="px-2 py-1 font-normal text-right">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {result.ranked.map((r, i) => {
                const long = r.direction === 'long';
                const sw = r.metrics.swing;
                const expanded = openRow === r.symbol;
                return [
                  <tr key={r.symbol} onClick={() => onOpen({ symbol: r.symbol, name: r.name, sector: r.sector ?? '' }, r.target)} className="cursor-pointer hover:bg-white/5" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}>
                    <td className="px-2 py-1.5 text-right font-mono text-[10px] text-gray-600">{i + 1}</td>
                    <td className="pl-1"><Star2 symbol={r.symbol} price={r.metrics.price} watch={watch} /></td>
                    <td className="px-2 py-1.5"><Name r={r} /></td>
                    <td className="px-2 py-1.5 text-right text-xs font-medium" style={{ color: long ? GREEN : RED }}>{long ? 'LONG' : 'SHORT'}</td>
                    <td className="px-2 py-1.5 text-right">
                      <button onClick={(e) => { e.stopPropagation(); setOpenRow(expanded ? null : r.symbol); }} aria-expanded={expanded} aria-label={`Score breakdown for ${r.symbol}`} className="font-mono text-xs underline decoration-dotted cursor-pointer" style={{ color: r.score >= 70 ? GREEN : r.score >= 50 ? '#ffd600' : '#9ca3af' }}>{r.score}</button>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs text-gray-300">{px(r.metrics.price)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs" style={{ color: tone(r.metrics.changePct) }}>{signed(r.metrics.changePct)}</td>
                    <td className="px-2 py-1.5 text-right text-xs" style={{ color: sw?.actionable ? (long ? GREEN : RED) : '#64748b' }}>{sw ? (sw.actionable ? sw.strategy : `${sw.strategy} (${sw.label ?? 'not valid'})`) : '—'}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-[11px] text-gray-400">{sw?.actionable ? `${px(sw.entry)} / ${px(sw.stop)} / ${px(sw.target1)}` : '—'}</td>
                  </tr>,
                  expanded && (
                    <tr key={`${r.symbol}-d`}>
                      <td colSpan={9} className="px-4 py-2" style={{ backgroundColor: 'rgba(17, 24, 39, 0.6)' }}>
                        <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                          {r.breakdown.map((b) => (
                            <div key={b.key} className="text-[11px]">
                              <div className="flex justify-between text-gray-300"><span>{b.label}</span><span className="font-mono">{b.points}/{b.max}</span></div>
                              <div className="h-1 rounded" style={{ backgroundColor: 'rgba(30, 45, 61, 0.5)' }}><div className="h-1 rounded" style={{ width: `${(b.points / b.max) * 100}%`, backgroundColor: b.points === b.max ? GREEN : '#00e5ff' }} /></div>
                              <p className="text-[9px] text-gray-600 mt-0.5">{SCORE_CRITERIA.find((c) => c.key === b.key)?.rule}</p>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        )}
      </Panel>
      <p className="pt-2 text-[10px] text-gray-600">
        The score (0 to 100) adds six independent conditions: setup validity, trend alignment, relative volume, liquidity, risk/reward and data freshness. Click a score to see each part and its rule.
        A high score means the conditions line up today; it is not a probability of profit and does not predict the next move. Clicking a row opens the Swing tab when a valid setup exists, otherwise Market Analysis.
      </p>
    </>
  );
}

// Polls the broker's depth feed for a few stocks. It only has data while the market is open and the
// live stream is connected, and says why when it does not.
function useDepths(symbols, enabled) {
  const key = symbols.join(',');
  const [state, setState] = useState({ key: '', depths: [], failed: false });
  useRefresh(`depths:${key}`, async () => {
    const r = await fetchDepths(key.split(','));
    setState(r ? { key, depths: r.depths, failed: false } : (st) => ({ ...st, key, failed: true }));
    return r;
  }, enabled && Boolean(key), 3000);

  return state.key === key ? state : { key, depths: [], failed: false };
}

export function OrderFlow({ scan, watch, onOpen, marketOpen }) {
  const liquid = useMemo(() => liquidityList(scan.rows, 30), [scan.rows]);
  const symbols = useMemo(() => watch.list.slice(0, 10).map((e) => e.symbol), [watch.list]);
  const { depths, failed } = useDepths(symbols, true);
  const rows = depths.map((d) => ({ ...d, stats: d.available ? depthStats(d.levels) : null }));
  const anyDepth = rows.some((r) => r.stats);

  return (
    <>
      <Panel title="Live order flow" hint="bid / ask from the exchange depth feed, for your Daily trading watchlist" count={symbols.length}>
        {symbols.length === 0 ? <Empty>Star stocks into your Daily trading watchlist (choose it at the top) to watch their order flow here.</Empty> : (
          <>
            {!anyDepth && (
              <p className="px-3 py-2 text-[11px]" style={{ color: '#ffd600' }}>
                {failed ? 'The server could not be reached for depth.' : marketOpen === false ? 'Depth is not available: the market is closed and the exchange sends no depth.' : (rows[0]?.reason ?? 'Waiting for depth.')}
              </p>
            )}
            <table className="w-full">
              <thead>
                <tr className="text-[10px] text-gray-600 uppercase tracking-wider">
                  <th className="px-3 py-1 font-normal text-left">Stock</th>
                  {['Best bid', 'Best ask', 'Spread', 'Spread %', 'Bid qty', 'Ask qty', 'Imbalance*'].map((h) => <th key={h} className="px-2 py-1 font-normal text-right">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.symbol} onClick={() => onOpen({ symbol: r.symbol, name: r.symbol, sector: '' }, 'intraday')} className="cursor-pointer hover:bg-white/5" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}>
                    <td className="px-3 py-1.5 text-xs font-medium text-gray-200">{r.symbol}</td>
                    {r.stats ? (
                      <>
                        <td className="px-2 py-1.5 text-right font-mono text-xs" style={{ color: GREEN }}>{px(r.stats.bestBid)}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-xs" style={{ color: RED }}>{px(r.stats.bestAsk)}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-xs text-gray-300">{px(r.stats.spread)}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-xs text-gray-300">{r.stats.spreadPct.toFixed(3)}%</td>
                        <td className="px-2 py-1.5 text-right font-mono text-xs text-gray-300">{qty(r.stats.bidQty)}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-xs text-gray-300">{qty(r.stats.askQty)}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-xs" style={{ color: tone(r.stats.imbalance) }}>{Number.isFinite(r.stats.imbalance) ? `${r.stats.imbalance >= 0 ? '+' : ''}${(r.stats.imbalance * 100).toFixed(0)}%` : '—'}</td>
                      </>
                    ) : <td colSpan={7} className="px-2 py-1.5 text-[11px] text-gray-600">{r.reason ?? 'No usable depth'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-2 text-[10px] text-gray-600">*Imbalance is calculated here from the visible depth levels: (bid quantity − ask quantity) ÷ total. It is a snapshot of resting orders, not a forecast. Depth is only available while the market is open and the broker is signed in.</p>
          </>
        )}
      </Panel>

      <div className="mt-3">
        <Panel title="Liquidity ranking" hint="20-day average turnover (price × volume), from daily candles" count={liquid.length}>
          {liquid.length === 0 ? <Empty>{scan.loading ? 'Loading candles…' : 'No turnover data for this universe.'}</Empty> : (
            <table className="w-full">
              <thead>
                <tr className="text-[10px] text-gray-600 uppercase tracking-wider">
                  <th className="w-8" /><th className="px-2 py-1 font-normal text-left">Stock</th>
                  {['Price', 'Turnover ₹Cr', 'Tier', 'ATR %'].map((h) => <th key={h} className="px-2 py-1 font-normal text-right">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {liquid.map((r) => (
                  <tr key={r.symbol} onClick={() => onOpen({ symbol: r.symbol, name: r.name, sector: r.sector ?? '' }, 'analysis')} className="cursor-pointer hover:bg-white/5" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}>
                    <td className="pl-2"><Star2 symbol={r.symbol} price={r.price} watch={watch} /></td>
                    <td className="px-2 py-1.5"><Name r={r} /></td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs text-gray-300">{px(r.price)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs text-gray-300">{r.turnoverCr.toFixed(0)}</td>
                    <td className="px-2 py-1.5 text-right text-xs" style={{ color: r.tier.id === 'high' ? GREEN : r.tier.id === 'thin' ? RED : '#ffd600' }}>{r.tier.label}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs text-gray-300">{px(r.atrPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
      <p className="pt-2 text-[10px] text-gray-600">Liquidity tiers: High ≥ ₹100 Cr, Medium ≥ ₹20 Cr, Low ≥ ₹5 Cr, Thin below that. Turnover is a measure of how easily a stock trades, not of its quality.</p>
    </>
  );
}
