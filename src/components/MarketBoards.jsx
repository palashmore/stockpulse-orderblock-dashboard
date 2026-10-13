import { useState } from 'react';
import { WINDOWS, HIDE_KEYS, DEFAULT_BOARD_CONFIG, STATUS_STYLE } from '../data/boards';

const GREEN = '#00e676';
const RED = '#ff1744';
const rule = { borderBottom: '1px solid rgba(30, 45, 61, 0.3)' };
const inputClass = 'px-2 py-1 text-xs rounded bg-transparent text-gray-200 border border-gray-700 focus:border-green-500 outline-none';
const HIDE_LABELS = { volume: 'volume', liquidity: 'liquidity', trend: 'trend / VWAP', volatility: 'volatility', setup: 'a valid setup' };
const CHECK_LABELS = { volume: 'Vol', liquidity: 'Liq', trend: 'Trend', volatility: 'Vola', setup: 'Setup' };

const px = (n) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

function Checks({ checks }) {
  return (
    <span className="inline-flex gap-1">
      {Object.keys(CHECK_LABELS).map((k) => {
        const pass = checks[k].pass;
        const color = pass === true ? GREEN : pass === false ? RED : '#64748b';
        return (
          <span
            key={k}
            title={`${CHECK_LABELS[k]}: ${pass === true ? 'passes' : pass === false ? 'fails' : 'unknown'} — ${checks[k].detail}`}
            className="px-1 rounded text-[9px] font-medium"
            style={{ color, backgroundColor: `${color}1f` }}
          >
            {CHECK_LABELS[k]}
          </span>
        );
      })}
    </span>
  );
}

function Board({ title, color, entries, total, onOpen, showAll, onToggleAll, empty }) {
  const shown = showAll ? entries : entries.slice(0, 10);
  const maxStrength = Math.max(1, ...entries.map((e) => e.strength));
  return (
    <section className="min-w-0" style={{ borderRight: '1px solid rgba(30, 45, 61, 0.2)' }}>
      <h3 className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wider flex items-center gap-2" style={{ color }}>
        {title} <span className="text-gray-600">({total})</span>
      </h3>
      {entries.length === 0 ? (
        <p className="px-4 py-4 text-xs text-gray-600">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] text-gray-600 uppercase tracking-wider">
                {['#', 'Stock', 'Price / day', 'Strength', 'Rel vol', 'Trend / VWAP', 'Checks', 'Status'].map((h, i) => (
                  <th key={h} className={`px-2 py-1.5 font-normal whitespace-nowrap ${i === 2 || i === 4 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((e, i) => {
                const st = STATUS_STYLE[e.status];
                return (
                  <tr key={e.symbol} onClick={() => onOpen(e.symbol)} className="cursor-pointer hover:bg-white/5" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }} title={`Open ${e.symbol} chart`}>
                    <td className="px-2 py-1.5 text-gray-600 font-mono">{i + 1}</td>
                    <td className="px-2 py-1.5">
                      <div className="font-medium text-gray-200">{e.symbol}</div>
                      <div className="text-[10px] text-gray-600 truncate max-w-[9rem]">{e.sector}</div>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">
                      <div className="text-gray-300">{px(e.price)}</div>
                      <div style={{ color }} title="Change on the day">{pct(e.changePct)}</div>
                    </td>
                    <td className="px-2 py-1.5" title={`Moved ${pct(e.movePct)} from the open = ${e.strength.toFixed(2)} average daily ranges${e.clean !== null ? `; ${(e.clean * 100).toFixed(0)}% of today's range is one-directional` : ''}`}>
                      <div className="font-mono text-gray-200">{e.strength.toFixed(2)}×</div>
                      <div className="h-1 w-14 rounded bg-white/5"><div className="h-full rounded" style={{ width: `${Math.min(100, (e.strength / maxStrength) * 100)}%`, backgroundColor: color }} /></div>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-gray-400">{Number.isFinite(e.relVolume) ? `${e.relVolume.toFixed(1)}x` : '—'}</td>
                    <td className="px-2 py-1.5 text-gray-400 whitespace-nowrap">
                      {e.trend}
                      {e.aboveVwap !== null && <span className="text-gray-600"> · {e.aboveVwap ? '>' : '<'} VWAP</span>}
                    </td>
                    <td className="px-2 py-1.5"><Checks checks={e.checks} /></td>
                    <td className="px-2 py-1.5">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap" style={{ color: st.color, backgroundColor: `${st.color}1f` }} title={`${st.hint}. ${e.reasons.join('; ')}`}>{st.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {entries.length > 10 && (
        <button onClick={onToggleAll} className="mx-4 my-2 px-2 py-1 text-[11px] rounded cursor-pointer bg-white/5 text-gray-300 hover:bg-white/10">
          {showAll ? 'Show top 10' : `Show all ${entries.length}`}
        </button>
      )}
    </section>
  );
}

function Settings({ config, onChange }) {
  const num = (key, value) => {
    const n = Number(value);
    if (value !== '' && Number.isFinite(n)) onChange({ ...config, [key]: n });
  };
  const field = (key, label, step = 'any') => (
    <label className="flex flex-col gap-1 text-[10px] text-gray-500 uppercase tracking-wider">
      {label}
      <input type="number" step={step} defaultValue={config[key]} key={`${key}-${config[key]}`} onBlur={(e) => num(key, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} className={`${inputClass} w-20`} aria-label={label} />
    </label>
  );
  return (
    <div className="px-4 py-2 space-y-2" style={rule}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[10px] text-gray-500 uppercase tracking-wider">
          Average range window
          <select value={config.window} onChange={(e) => onChange({ ...config, window: Number(e.target.value) })} className={inputClass} style={{ backgroundColor: '#0d1117' }} aria-label="Average daily range window">
            {WINDOWS.map((w) => <option key={w} value={w}>{w} days</option>)}
          </select>
        </label>
        {field('minStrength', 'Min strength (×)')}
        {field('minRelVol', 'Volume ≥ (×)')}
        {field('minTurnoverCr', 'Turnover ≥ (₹ Cr)')}
        {field('maxAtrPct', 'ATR ≤ (% of price)')}
        {field('minRR', 'Setup R:R ≥')}
        <button onClick={() => onChange(DEFAULT_BOARD_CONFIG)} className="px-2 py-1 text-xs rounded cursor-pointer bg-white/5 text-gray-300 hover:bg-white/10">Defaults</button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-400">
        <span className="text-gray-500">Only list stocks that pass:</span>
        {HIDE_KEYS.map((k) => (
          <label key={k} className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={config.hide[k]} onChange={(e) => onChange({ ...config, hide: { ...config.hide, [k]: e.target.checked } })} aria-label={`Only list stocks with ${HIDE_LABELS[k]}`} />
            {HIDE_LABELS[k]}
          </label>
        ))}
      </div>
    </div>
  );
}

export default function MarketBoards({ boards, config, onConfig, fresh, scan, onOpen, asOf, sector }) {
  const [showAll, setShowAll] = useState({ bullish: false, bearish: false });
  const ex = boards.excluded;
  return (
    <div style={rule}>
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Bullish and Bearish boards</h2>
        <span className="text-[11px] text-gray-500">
          ranked by move from the open ÷ average daily range ({config.window} days){sector ? ` · ${sector} only` : ''}{asOf ? ` · prices as of ${asOf} IST` : ''}
        </span>
      </div>
      {!fresh && (
        <p className="mx-4 mt-2 px-3 py-1.5 rounded text-[11px]" style={{ color: '#94a3b8', backgroundColor: 'rgba(148, 163, 184, 0.1)' }}>
          The data is not current (market closed or stale). These boards show the last session for review: they are history, not live opportunities, so every status reads REVIEW.
        </p>
      )}
      {scan.loading && <p className="px-4 pt-2 text-[11px] text-gray-500">Loading daily history to measure each stock&apos;s average range… {scan.done} of {scan.total}</p>}

      <details className="mt-2">
        <summary className="px-4 py-1 text-[11px] text-gray-400 cursor-pointer">Ranking settings and how it works</summary>
        <Settings config={config} onChange={onConfig} />
        <div className="px-4 py-2 text-[11px] text-gray-500 space-y-1">
          <p><b className="text-gray-400">Strength</b> = (price now − today&apos;s open) ÷ average daily range, where the average daily range is the mean true range of the last {config.window} completed daily bars. A strength of 1.0× means the stock has moved one typical day in one direction since the open. The same formula is used for every stock; only stocks with a full {config.window}-day history and an open price are ranked.</p>
          <p><b className="text-gray-400">Strength is not a signal.</b> The checks are separate: Vol (volume at least {config.minRelVol}× its average), Liq (average turnover at least ₹{config.minTurnoverCr} Cr), Trend (daily trend and price vs the 20-day VWAP agree with the direction), Vola (ATR at most {config.maxAtrPct}% of price) and Setup (a still-valid swing setup in the same direction with at least {config.minRR}R).</p>
          <p><b className="text-gray-400">Status</b>: SETUP = valid setup and every check passes. WAIT = strong move without a valid or fully confirmed setup. NO TRADE = liquidity or volatility fails, the trend disagrees, or a valid setup points the other way. REVIEW = data not current. Volume reads low early in the session.</p>
        </div>
      </details>

      <div className="grid grid-cols-1 2xl:grid-cols-2">
        <Board title="Bullish board" color={GREEN} entries={boards.bullish} total={boards.counts.bullish} onOpen={onOpen} showAll={showAll.bullish} onToggleAll={() => setShowAll((s) => ({ ...s, bullish: !s.bullish }))} empty="No stock has moved up strongly enough yet." />
        <Board title="Bearish board" color={RED} entries={boards.bearish} total={boards.counts.bearish} onOpen={onOpen} showAll={showAll.bearish} onToggleAll={() => setShowAll((s) => ({ ...s, bearish: !s.bearish }))} empty="No stock has moved down strongly enough yet." />
      </div>

      <p className="px-4 py-2 text-[10px] text-gray-600">
        Not ranked: {ex.noHistory} without a {config.window}-day history, {ex.noOpen} without an open price, {ex.flat} unchanged from the open, {ex.weak} below {config.minStrength}× strength{ex.hidden ? `, ${ex.hidden} hidden by the pass-only checks` : ''}.
        Rule matches on price and volume data, not buy or sell advice.
      </p>
    </div>
  );
}
