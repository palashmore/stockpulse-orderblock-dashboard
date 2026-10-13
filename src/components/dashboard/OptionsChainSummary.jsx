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

  // Default Nifty 50 Options strikes around 25,550 ATM
  const defaultStrikes = [
    { strike: 25350, callLtp: 245.10, callVol: 12450, callChgOI: 8210, callOI: 45320, putLtp: 35.25, putVol: 18420, putChgOI: -6540, putOI: 38120 },
    { strike: 25400, callLtp: 210.80, callVol: 25640, callChgOI: 12340, callOI: 62150, putLtp: 42.60, putVol: 22310, putChgOI: -4820, putOI: 42560 },
    { strike: 25450, callLtp: 178.25, callVol: 38920, callChgOI: 18340, callOI: 84220, putLtp: 52.30, putVol: 36180, putChgOI: -3210, putOI: 46210 },
    { strike: 25500, callLtp: 148.75, callVol: 52180, callChgOI: 22310, callOI: 112450, putLtp: 68.45, putVol: 48530, putChgOI: 2340, putOI: 72180 },
    { strike: 25550, callLtp: 122.50, callVol: 68420, callChgOI: 28450, callOI: 142680, putLtp: 88.20, putVol: 62940, putChgOI: 8120, putOI: 108450, isATM: true },
    { strike: 25600, callLtp: 98.60, callVol: 58320, callChgOI: 18540, callOI: 128320, putLtp: 112.75, putVol: 48210, putChgOI: 12430, putOI: 142320 },
    { strike: 25650, callLtp: 78.45, callVol: 42560, callChgOI: 12210, callOI: 95210, putLtp: 138.60, putVol: 36540, putChgOI: 14210, putOI: 128750 },
    { strike: 25700, callLtp: 62.10, callVol: 28180, callChgOI: 8320, callOI: 68450, putLtp: 168.25, putVol: 22650, putChgOI: 16540, putOI: 96430 },
    { strike: 25750, callLtp: 48.30, callVol: 18420, callChgOI: 4560, callOI: 42180, putLtp: 204.15, putVol: 12840, putChgOI: 18210, putOI: 68540 },
  ];

  const strikes = useMemo(() => {
    if (optionsData?.oiData && optionsData.oiData.length >= 5) {
      const sorted = [...optionsData.oiData].sort((a, b) => a.strike - b.strike);
      const atm = optionsData.underlyingValue || 25550;
      return sorted.slice(0, 9).map((d) => ({
        strike: d.strike,
        callLtp: d.callLtp,
        callVol: d.callVolume,
        callChgOI: d.callOIChange,
        callOI: d.callOI,
        putLtp: d.putLtp,
        putVol: d.putVolume,
        putChgOI: d.putOIChange,
        putOI: d.putOI,
        isATM: Math.abs(d.strike - atm) <= 50,
      }));
    }
    return defaultStrikes;
  }, [optionsData]);

  const expiry = optionsData?.currentExpiry || '30-Oct-2026';

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
