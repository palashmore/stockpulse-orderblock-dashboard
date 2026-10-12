// Options-chain analytics. All inputs are rows of { strike, callOI, putOI }.

/** Put-call ratio by open interest, rounded to 2 dp. Null when there is no call OI. */
export function computePCR(totalPutOI, totalCallOI) {
  if (!(totalCallOI > 0)) return null;
  return Math.round((totalPutOI / totalCallOI) * 100) / 100;
}

/**
 * Max pain: the strike at which the summed intrinsic value paid to option holders
 * (calls with strike < K pay K - strike, puts with strike > K pay strike - K, each weighted
 * by OI) is smallest. Candidates are the strikes present in the chain; ties resolve to the
 * lowest strike. Returns null for an empty chain.
 */
export function computeMaxPain(rows) {
  let best = null;
  let minPain = Infinity;
  for (const candidate of rows) {
    let pain = 0;
    for (const row of rows) {
      if (row.strike < candidate.strike) pain += row.callOI * (candidate.strike - row.strike);
      if (row.strike > candidate.strike) pain += row.putOI * (row.strike - candidate.strike);
    }
    if (pain < minPain) {
      minPain = pain;
      best = candidate.strike;
    }
  }
  return best;
}

const topBy = (rows, oiKey, changeKey) =>
  [...rows]
    .sort((a, b) => b[oiKey] - a[oiKey])
    .slice(0, 3)
    .map((d) => ({ strike: d.strike, oi: d[oiKey], oiChange: d[changeKey] }));

/**
 * Turn an NSE option-chain payload into the dashboard's chain summary for the nearest expiry.
 * Throws when the payload is structurally unusable (no rows for the expiry, or no call OI),
 * so the caller reports the data as unavailable instead of showing zeros.
 */
export function buildOptionsChain(nseData, symbol) {
  const records = nseData?.records;
  const expiryDates = records?.expiryDates;
  if (!records) {
    throw new Error('NSE returned no option chain (symbol not in F&O, or the request was blocked)');
  }
  if (!Array.isArray(expiryDates) || expiryDates.length === 0 || !Array.isArray(records.data)) {
    throw new Error('Malformed NSE option chain response');
  }

  const currentExpiry = expiryDates[0];
  const oiData = records.data
    .filter((row) => row.expiryDate === currentExpiry && Number.isFinite(row.strikePrice))
    .map((row) => ({
      strike: row.strikePrice,
      callOI: row.CE?.openInterest || 0,
      putOI: row.PE?.openInterest || 0,
      callOIChange: row.CE?.changeinOpenInterest || 0,
      putOIChange: row.PE?.changeinOpenInterest || 0,
      callVolume: row.CE?.totalTradedVolume || 0,
      putVolume: row.PE?.totalTradedVolume || 0,
      callLTP: row.CE?.lastPrice || 0,
      putLTP: row.PE?.lastPrice || 0,
      callIV: row.CE?.impliedVolatility || 0,
      putIV: row.PE?.impliedVolatility || 0,
    }))
    .sort((a, b) => a.strike - b.strike);

  if (oiData.length === 0) throw new Error(`No option rows for expiry ${currentExpiry}`);

  const sum = (key) => oiData.reduce((s, r) => s + r[key], 0);
  const totalCallOI = sum('callOI');
  const totalPutOI = sum('putOI');
  const pcr = computePCR(totalPutOI, totalCallOI);
  if (pcr === null) throw new Error('Option chain has no call open interest');

  return {
    symbol,
    underlyingValue: records.underlyingValue || null,
    currentExpiry,
    expiryDates,
    pcr,
    maxPain: computeMaxPain(oiData),
    totalCallOI,
    totalPutOI,
    totalCallOIChange: sum('callOIChange'),
    totalPutOIChange: sum('putOIChange'),
    resistance: topBy(oiData, 'callOI', 'callOIChange'),
    support: topBy(oiData, 'putOI', 'putOIChange'),
    oiData,
    source: 'NSE',
    providerTimestamp: records.timestamp || null,
  };
}
