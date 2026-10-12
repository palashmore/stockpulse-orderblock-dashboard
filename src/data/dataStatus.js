// Display metadata for the data-status labels returned by the API (plus client-side SIMULATED).
export const STATUS_META = {
  LIVE: { label: 'LIVE', color: '#00e676', description: 'Real-time data from the provider.' },
  DELAYED: { label: 'DELAYED', color: '#00e5ff', description: 'Current-session data from an unofficial feed; real-time delivery is not guaranteed.' },
  HISTORICAL: { label: 'HISTORICAL', color: '#64748b', description: 'Data from the last completed session or earlier.' },
  STALE: { label: 'STALE', color: '#ffd600', description: 'Older than expected, or a cached value served because the provider failed.' },
  SIMULATED: { label: 'SIMULATED', color: '#ff9100', description: 'Generated sample data. Not market data.' },
  UNAVAILABLE: { label: 'UNAVAILABLE', color: '#ff1744', description: 'No reliable market data could be retrieved.' },
};

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
