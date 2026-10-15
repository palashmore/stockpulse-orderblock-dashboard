import { useState, useMemo } from 'react';

const GREEN = '#00e676';
const RED = '#ff1744';

function fmtNum(n) {
  if (!n) return '—';
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return n.toLocaleString();
}

export default function OptionsChainSummary({ optionsData = null }) {
  const [activeSide, setActiveSide] = useState('All'); // 'All' | 'Calls' | 'Puts'

  // Strikes come only from a real chain, the nine nearest the underlying. No chain, no rows.
  const strikes = useMemo(() => {
    if (!optionsData?.oiData || optionsData.oiData.length < 5 || !Number.isFinite(optionsData.underlyingValue)) return [];
    const atm = optionsData.underlyingValue;
    const nearest = [...optionsData.oiData].sort((a, b) => Math.abs(a.strike - atm) - Math.abs(b.strike - atm)).slice(0, 9).sort((a, b) => a.strike - b.strike);
    const atmStrike = nearest.reduce((best, d) => (Math.abs(d.strike - atm) < Math.abs(best - atm) ? d.strike : best), nearest[0].strike);
    return nearest.map((d) => ({
      strike: d.strike,
      callLtp: d.callLTP,
      callVol: d.callVolume,
      callChgOI: d.callOIChange,
      callOI: d.callOI,
      putLtp: d.putLTP,
      putVol: d.putVolume,
      putChgOI: d.putOIChange,
      putOI: d.putOI,
      isATM: d.strike === atmStrike,
    }));
  }, [optionsData]);

  const expiry = optionsData?.currentExpiry ?? '—';

  if (strikes.length === 0) {
    return (
      <div className="flex flex-col h-full rounded-lg p-3 shadow-sm" style={{ backgroundColor: '#0d1117', border: '1px solid rgba(30, 45, 61, 0.5)' }}>
        <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">Options Chain (Nifty 50)</h3>
        <div className="flex-1 flex items-center justify-center text-center text-[11px] text-gray-500 px-2">Option chain unavailable: no options data source is connected, so no strikes, OI or PCR are shown.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full rounded-lg p-3 shadow-sm" style={{ backgroundColor: '#0d1117', border: '1px solid rgba(30, 45, 61, 0.5)' }}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-1.5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-3.5 bg-blue-500 rounded-sm" />
          <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
            Options Chain (Nifty 50)
          </h3>
        </div>

        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="text-gray-400 font-mono">Expiry: {expiry}</span>
          <div className="flex items-center bg-black/40 rounded p-0.5 border border-white/5">
            {['All', 'Calls', 'Puts'].map((mode) => (
              <button
                key={mode}
                onClick={() => setActiveSide(mode)}
                className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                  activeSide === mode ? 'bg-white/15 text-white font-semibold' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-[220px] max-h-[300px] overflow-y-auto no-scrollbar">
        <table className="w-full text-center text-xs font-mono">
          <thead>
            <tr className="text-[9px] text-gray-500 uppercase tracking-wider border-b border-white/5 pb-1">
              {(activeSide === 'All' || activeSide === 'Calls') && (
                <>
                  <th className="py-1 px-1 text-left font-normal">OI</th>
                  <th className="py-1 px-1 text-right font-normal">Chg OI</th>
                  <th className="py-1 px-1 text-right font-normal">Call LTP</th>
                </>
              )}
              <th className="py-1 px-2 font-bold text-yellow-400">Strike</th>
              {(activeSide === 'All' || activeSide === 'Puts') && (
                <>
                  <th className="py-1 px-1 text-left font-normal">Put LTP</th>
                  <th className="py-1 px-1 text-right font-normal">Chg OI</th>
                  <th className="py-1 px-1 text-right font-normal">OI</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04] text-[11px]">
            {strikes.map((s) => (
              <tr
                key={s.strike}
                className={`transition-colors ${
                  s.isATM ? 'bg-blue-500/15 border-y border-blue-500/30' : 'hover:bg-white/[0.04]'
                }`}
              >
                {(activeSide === 'All' || activeSide === 'Calls') && (
                  <>
                    <td className="py-1 px-1 text-left text-gray-400">{fmtNum(s.callOI)}</td>
                    <td
                      className="py-1 px-1 text-right font-semibold"
                      style={{ color: s.callChgOI >= 0 ? GREEN : RED }}
                    >
                      {s.callChgOI >= 0 ? '+' : ''}{fmtNum(s.callChgOI)}
                    </td>
                    <td className="py-1 px-1 text-right text-gray-200">{s.callLtp?.toFixed(2)}</td>
                  </>
                )}

                {/* Strike */}
                <td className={`py-1 px-2 font-bold ${s.isATM ? 'text-cyan-300 font-extrabold' : 'text-gray-300'}`}>
                  {s.strike}
                </td>

                {(activeSide === 'All' || activeSide === 'Puts') && (
                  <>
                    <td className="py-1 px-1 text-left text-gray-200">{s.putLtp?.toFixed(2)}</td>
                    <td
                      className="py-1 px-1 text-right font-semibold"
                      style={{ color: s.putChgOI >= 0 ? GREEN : RED }}
                    >
                      {s.putChgOI >= 0 ? '+' : ''}{fmtNum(s.putChgOI)}
                    </td>
                    <td className="py-1 px-1 text-right text-gray-400">{fmtNum(s.putOI)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
