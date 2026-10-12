import { useMemo } from 'react';
import { rankStocks } from '../data/ranking';
import { computeBreadth, sectorPerformance, binDots, DOT_AXIS_LIMIT } from '../data/marketOverview';
import { NIFTY_STOCKS } from '../data/stockData';
import { STATUS_META } from '../data/dataStatus';
import { UnavailableState } from './DataStatusBadge';

const SECTOR_MAP = Object.fromEntries(NIFTY_STOCKS.map((s) => [s.symbol, s.sector]));
const DOT_SIZE = 10;
const GREEN = '#00e676';
const RED = '#ff1744';

const pct = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

function Stat({ label, value, color }) {
  return (
    <div className="flex flex-col px-4 py-2">
      <span className="text-[10px] text-gray-600 uppercase tracking-wider">{label}</span>
      <span className="text-sm font-mono font-medium" style={{ color: color || '#d1d5db' }}>{value}</span>
    </div>
  );
}

function DotPlot({ dots, onSelect }) {
  const maxLevel = dots.reduce((m, d) => Math.max(m, d.level), 0);
  const height = (maxLevel + 1) * (DOT_SIZE + 2) + 8;
  return (
    <div>
      <div className="relative mx-3" style={{ height }}>
        <div className="absolute left-1/2 top-0 bottom-0" style={{ borderLeft: '1px dashed rgba(100, 116, 139, 0.4)' }} />
        {dots.map((d) => (
          <button
            key={d.symbol}
            onClick={() => onSelect({ symbol: d.symbol, name: d.name, sector: SECTOR_MAP[d.symbol] || '' })}
            title={`${d.symbol} ${pct(d.changePct)}${d.pinned ? ' (beyond axis)' : ''}`}
            aria-label={`${d.symbol} ${pct(d.changePct)}`}
            className="absolute rounded-full cursor-pointer hover:scale-150"
            style={{
              width: DOT_SIZE,
              height: DOT_SIZE,
              left: `calc(${d.x}% - ${DOT_SIZE / 2}px)`,
              bottom: 4 + d.level * (DOT_SIZE + 2),
              backgroundColor: d.changePct >= 0 ? GREEN : RED,
              opacity: d.pinned ? 0.5 : 0.9,
            }}
          />
        ))}
      </div>
      <div className="flex justify-between mx-3 mt-1 text-[10px] text-gray-600 font-mono">
        <span>-{DOT_AXIS_LIMIT}%</span>
        <span>0</span>
        <span>+{DOT_AXIS_LIMIT}%</span>
      </div>
    </div>
  );
}

export default function MarketXRay({ nifty, onSelectStock }) {
  const { quotes, status, failed, loaded, retry } = nifty;
  const breadth = useMemo(() => computeBreadth(quotes), [quotes]);
  const sectors = useMemo(() => sectorPerformance(quotes, SECTOR_MAP), [quotes]);
  const dots = useMemo(() => binDots(quotes), [quotes]);
  const { counts } = useMemo(() => rankStocks(quotes), [quotes]);

  if (quotes.length === 0) {
    return <UnavailableState status={failed ? 'UNAVAILABLE' : null} loading={!loaded} onRetry={retry} />;
  }

  const statusMeta = failed ? STATUS_META.STALE : STATUS_META[status];
  const maxAbs = Math.max(0.5, ...sectors.sectors.map((s) => Math.abs(s.avgChangePct)));

  return (
    <div className="flex-1 min-h-0 overflow-y-auto" style={{ backgroundColor: '#0a0e17' }}>
      <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Market X-Ray · Nifty 50</h2>
        {statusMeta && (
          <span className="text-[10px]" style={{ color: statusMeta.color }} title={statusMeta.description}>{statusMeta.label}</span>
        )}
      </div>

      <div className="flex flex-wrap" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <Stat label="Advancers" value={breadth.advancers} color={GREEN} />
        <Stat label="Decliners" value={breadth.decliners} color={RED} />
        <Stat label="Unchanged" value={breadth.unchanged} />
        <Stat label="A/D ratio" value={breadth.ratio ?? '—'} />
        <Stat label="Bullish" value={counts.bullish} color={GREEN} />
        <Stat label="Bearish" value={counts.bearish} color={RED} />
        <Stat label="Choppy" value={counts.choppy} />
        <Stat label="Leading sector" value={sectors.leading ? sectors.leading.sector : '—'} color={GREEN} />
        <Stat label="Lagging sector" value={sectors.lagging ? sectors.lagging.sector : '—'} color={RED} />
      </div>

      <section className="py-3">
        <h3 className="px-4 pb-2 text-[11px] text-gray-500 uppercase tracking-wider">Every stock at its move today</h3>
        <DotPlot dots={dots} onSelect={onSelectStock} />
      </section>

      <section className="py-3" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <h3 className="px-4 pb-2 text-[11px] text-gray-500 uppercase tracking-wider">Sector performance (equal-weighted average)</h3>
        {sectors.sectors.length === 0 && <p className="px-4 text-xs text-gray-600">Not enough sector data.</p>}
        {sectors.sectors.map((s) => {
          const color = s.avgChangePct >= 0 ? GREEN : RED;
          return (
            <div key={s.sector} className="grid grid-cols-[9rem_1fr_4.5rem] items-center gap-3 px-4 py-1">
              <span className="text-xs text-gray-300 truncate">{s.sector} <span className="text-gray-600">({s.count})</span></span>
              <div className="relative h-2 rounded" style={{ backgroundColor: 'rgba(30, 45, 61, 0.3)' }}>
                <div
                  className="absolute top-0 bottom-0 rounded"
                  style={{
                    backgroundColor: color,
                    width: `${(Math.abs(s.avgChangePct) / maxAbs) * 50}%`,
                    left: s.avgChangePct >= 0 ? '50%' : undefined,
                    right: s.avgChangePct < 0 ? '50%' : undefined,
                  }}
                />
              </div>
              <span className="text-xs font-mono text-right" style={{ color }}>{pct(s.avgChangePct)}</span>
            </div>
          );
        })}
      </section>

      <p className="px-4 py-3 text-[10px] text-gray-600">
        {sectors.uncovered > 0 && `${sectors.uncovered} stocks have no sector mapping and are left out of the sector view. `}
        {breadth.unknown > 0 && `${breadth.unknown} stocks have no price change and are excluded. `}
        Click a dot to open that stock. Dots beyond ±{DOT_AXIS_LIMIT}% are pinned to the edge (faded).
      </p>
    </div>
  );
}
