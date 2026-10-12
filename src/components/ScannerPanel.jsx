import { useMemo, useState } from 'react';
import { ArrowUpDown } from 'lucide-react';
import { runScan, presetCriteria, DEFAULT_CRITERIA, PRESETS, NEAR_EDGE } from '../data/scanner';
import { NIFTY_STOCKS } from '../data/stockData';
import { STATUS_META } from '../data/dataStatus';
import { UnavailableState } from './DataStatusBadge';

const SECTORS = Object.fromEntries(NIFTY_STOCKS.map((s) => [s.symbol, s.sector]));
const GREEN = '#00e676';
const RED = '#ff1744';

const COLUMNS = [
  { key: 'symbol', label: 'Stock', align: 'left' },
  { key: 'price', label: 'Price', align: 'right' },
  { key: 'changePct', label: 'Change', align: 'right' },
  { key: 'gapPct', label: 'Gap', align: 'right' },
  { key: 'relVolume', label: 'Rel vol', align: 'right' },
  { key: 'strength', label: 'Strength', align: 'right' },
];

const pct = (n) => (Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(2)}%` : '—');
const color = (n) => (!Number.isFinite(n) || n === 0 ? '#9ca3af' : n > 0 ? GREEN : RED);

// A number box that holds null when empty so an unset rule stays off
function NumberField({ label, value, onChange, step = 'any' }) {
  return (
    <label className="flex flex-col gap-1 text-[10px] text-gray-500 uppercase tracking-wider">
      {label}
      <input
        type="number"
        step={step}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="w-24 px-2 py-1.5 text-xs rounded bg-transparent text-gray-200 border border-gray-700 focus:border-green-500 outline-none"
      />
    </label>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export default function ScannerPanel({ nifty, onSelectStock }) {
  const { quotes, status, failed, loaded, retry } = nifty;
  const [criteria, setCriteria] = useState(DEFAULT_CRITERIA);
  const [preset, setPreset] = useState(null);
  const [sort, setSort] = useState({ key: 'strength', dir: 'desc' });

  const result = useMemo(() => runScan(quotes, criteria, sort.key, sort.dir), [quotes, criteria, sort]);

  if (quotes.length === 0) {
    return <UnavailableState status={failed ? 'UNAVAILABLE' : null} loading={!loaded} onRetry={retry} />;
  }

  const statusMeta = failed ? STATUS_META.STALE : STATUS_META[status];
  const update = (patch) => {
    setPreset(null);
    setCriteria((c) => ({ ...c, ...patch }));
  };
  const applyPreset = (id) => {
    setPreset(id);
    setCriteria(presetCriteria(id));
  };
  const reset = () => {
    setPreset(null);
    setCriteria(DEFAULT_CRITERIA);
  };
  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'symbol' ? 'asc' : 'desc' }));
  const open = (m) => onSelectStock({ symbol: m.symbol, name: m.name, sector: SECTORS[m.symbol] || '' });

  const active = Object.entries(criteria).filter(([k, v]) => v !== DEFAULT_CRITERIA[k]).length;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto" style={{ backgroundColor: '#0a0e17' }}>
      <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Scanner · Nifty 50</h2>
        {statusMeta && (
          <span className="text-[10px]" style={{ color: statusMeta.color }} title={statusMeta.description}>{statusMeta.label}</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-4 py-2" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <span className="text-[10px] text-gray-600 uppercase tracking-wider mr-1">Presets</span>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => applyPreset(p.id)}
            className={`px-2.5 py-1 text-xs rounded cursor-pointer ${
              preset === p.id ? 'bg-green-500/15 text-green-400' : 'bg-white/5 text-gray-400 hover:text-gray-200'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-4 px-4 py-3" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <label className="flex flex-col gap-1 text-[10px] text-gray-500 uppercase tracking-wider">
          Direction
          <select
            value={criteria.direction}
            onChange={(e) => update({ direction: e.target.value })}
            className="px-2 py-1.5 text-xs rounded text-gray-200 border border-gray-700 outline-none"
            style={{ backgroundColor: '#0d1117' }}
          >
            <option value="ANY">Any</option>
            <option value="BULLISH">Bullish</option>
            <option value="BEARISH">Bearish</option>
            <option value="CHOPPY">Choppy</option>
          </select>
        </label>
        <NumberField label="Change ≥ %" value={criteria.minChangePct} onChange={(v) => update({ minChangePct: v })} />
        <NumberField label="Change ≤ %" value={criteria.maxChangePct} onChange={(v) => update({ maxChangePct: v })} />
        <NumberField label="Gap ≥ %" value={criteria.minGapPct} onChange={(v) => update({ minGapPct: v })} />
        <NumberField label="Gap ≤ %" value={criteria.maxGapPct} onChange={(v) => update({ maxGapPct: v })} />
        <NumberField label="Rel vol ≥ x" value={criteria.minRelVolume} onChange={(v) => update({ minRelVolume: v })} />
        <NumberField label="Strength ≥" value={criteria.minStrength} onChange={(v) => update({ minStrength: v })} step="1" />
        <div className="flex flex-col gap-1.5">
          <Toggle label="Near day high" checked={criteria.nearHigh} onChange={(v) => update({ nearHigh: v })} />
          <Toggle label="Near day low" checked={criteria.nearLow} onChange={(v) => update({ nearLow: v })} />
        </div>
        <button
          onClick={reset}
          disabled={active === 0}
          className="px-3 py-1.5 text-xs rounded bg-white/5 text-gray-400 enabled:hover:text-gray-200 enabled:cursor-pointer disabled:opacity-40"
        >
          Clear filters{active > 0 ? ` (${active})` : ''}
        </button>
      </div>

      <div className="px-4 py-2 text-[11px] text-gray-500" aria-live="polite">
        {result.rows.length} of {quotes.length} stocks match
        {result.unscannable > 0 && ` · ${result.unscannable} could not be scanned (no price data)`}
      </div>

      {result.rows.length === 0 ? (
        <p className="px-4 py-6 text-xs text-gray-600">No stocks match these filters. Loosen a rule or clear the filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] text-gray-600 uppercase tracking-wider">
                {COLUMNS.map((c) => (
                  <th key={c.key} className={`px-4 py-1.5 font-normal text-${c.align}`} aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 cursor-pointer hover:text-gray-300">
                      {c.label} <ArrowUpDown size={8} />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((m) => (
                <tr
                  key={m.symbol}
                  onClick={() => open(m)}
                  className="cursor-pointer hover:bg-white/5"
                  style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}
                >
                  <td className="px-4 py-1.5">
                    <div className="font-medium text-gray-200">{m.symbol}</div>
                    <div className="text-[10px] text-gray-600">{SECTORS[m.symbol] || ''}</div>
                  </td>
                  <td className="px-4 py-1.5 text-right font-mono text-gray-300">₹{m.price.toFixed(2)}</td>
                  <td className="px-4 py-1.5 text-right font-mono" style={{ color: color(m.changePct) }}>{pct(m.changePct)}</td>
                  <td className="px-4 py-1.5 text-right font-mono" style={{ color: color(m.gapPct) }}>{pct(m.gapPct)}</td>
                  <td className="px-4 py-1.5 text-right font-mono text-gray-300">{m.relVolume === null ? '—' : `${m.relVolume.toFixed(1)}x`}</td>
                  <td className="px-4 py-1.5 text-right font-mono" style={{ color: m.direction === 'BULLISH' ? GREEN : m.direction === 'BEARISH' ? RED : '#9ca3af' }}>
                    {m.strength} <span className="text-[9px] text-gray-600">{m.direction === 'CHOPPY' ? 'choppy' : ''}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="px-4 py-3 text-[10px] text-gray-600">
        Gap = open vs previous close. Near day high/low = price in the top/bottom {Math.round((1 - NEAR_EDGE) * 50)}% of today&apos;s range.
        Relative volume compares today&apos;s volume with the 3-month daily average, so it reads low early in the session.
        A stock missing a field never matches a rule that needs it. Click a row to open its chart. This describes today&apos;s moves; it is not a recommendation.
      </p>
    </div>
  );
}
