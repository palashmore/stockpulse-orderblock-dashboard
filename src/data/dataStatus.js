// Display metadata for the data-status labels returned by the API (plus client-side SIMULATED).
export const STATUS_META = {
  LIVE: { label: 'LIVE MARKET', color: '#00e676', description: 'Verified real-time data: the broker feed\'s own exchange timestamp is current.' },
  DELAYED: { label: 'DELAYED DATA', color: '#00e5ff', description: 'Current-session data from an unofficial feed; real-time delivery is not guaranteed.' },
  MARKET_CLOSED: { label: 'MARKET CLOSED', color: '#94a3b8', description: 'The market is closed. Showing the latest completed trading session, not a live price.' },
  HISTORICAL: { label: 'HISTORICAL DATA', color: '#64748b', description: 'Historical data from completed sessions.' },
  STALE: { label: 'STALE DATA', color: '#ffd600', description: 'Older than expected, or a cached value served because the provider failed.' },
  SIMULATED: { label: 'SIMULATED', color: '#ff9100', description: 'Generated sample data. Not market data.' },
  UNAVAILABLE: { label: 'DATA UNAVAILABLE', color: '#ff1744', description: 'No reliable market data could be retrieved.' },
};

/** Short label for the exchange state shown beside the data badge. */
export function describeMarketState(market) {
  if (!market) return null;
  if (market.state === 'OPEN') return 'Market open';
  if (market.state === 'PRE_OPEN') return 'Pre-open';
  if (market.reason === 'holiday') return `Closed: ${market.holiday || 'exchange holiday'}`;
  if (market.reason === 'weekend') return 'Closed: weekend';
  return 'Market closed';
}

/** 'Fri 9 Oct' for a YYYY-MM-DD session date, or null. */
export function formatSessionDate(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/**
 * Headline status for the dashboard. Only labels backed by actual state:
 * demo mode -> SIMULATED; no backend or no data -> UNAVAILABLE; a failed refresh
 * over previously loaded data -> STALE; otherwise the provider-reported status.
 * Returns null until a load for the current stock has been attempted.
 */
export function resolveHeadlineStatus({ demoMode, backendUp, attempted, hasData, refreshFailed, quote, history }) {
  if (demoMode) return 'SIMULATED';
  if (backendUp === null) return null;
  if (backendUp === false) return hasData ? 'STALE' : 'UNAVAILABLE';
  if (refreshFailed) return hasData ? 'STALE' : 'UNAVAILABLE';
  if (!hasData) return attempted ? 'UNAVAILABLE' : null;
  return quote?.dataStatus ?? history?.dataStatus ?? 'UNAVAILABLE';
}

export function describeStatus({ status, provider, asOf, staleAgeSec }) {
  const meta = STATUS_META[status];
  if (!meta) return '';
  const parts = [meta.description];
  if (provider) parts.push(`Source: ${provider}.`);
  if (asOf) parts.push(`Data as of ${asOf}.`);
  if (staleAgeSec) parts.push(`Cached ${Math.round(staleAgeSec / 60)} min ago.`);
  return parts.join(' ');
}

/** True when the page URL explicitly opts into simulated data (?demo=1). */
export function isDemoModeRequested(search = '') {
  return new URLSearchParams(search).get('demo') === '1';
}
