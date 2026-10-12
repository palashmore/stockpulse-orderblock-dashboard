import { STATUS_META, describeStatus } from '../data/dataStatus';

export function DataStatusBadge({ status, loading, detail }) {
  const meta = status ? STATUS_META[status] : null;
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
      style={{ backgroundColor: 'rgba(30, 45, 61, 0.3)' }}
      title={meta ? describeStatus({ status, ...detail }) : 'Connecting to market data'}
    >
      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: meta?.color ?? '#64748b' }} />
      <span className="text-xs text-gray-400">NSE</span>
      <span className="text-xs text-gray-600">|</span>
      <span className="text-xs" style={{ color: meta?.color ?? '#64748b' }}>
        {meta ? meta.label : 'CONNECTING'}
      </span>
      {loading && (
        <>
          <span className="text-xs text-gray-600">|</span>
          <span className="text-xs text-blue-400 animate-pulse">Loading...</span>
        </>
      )}
    </div>
  );
}

export function SimulationBanner() {
  return (
    <div
      role="alert"
      className="px-4 py-1.5 text-xs font-medium text-center flex-shrink-0"
      style={{ backgroundColor: 'rgba(255, 145, 0, 0.15)', color: '#ff9100', borderBottom: '1px solid rgba(255, 145, 0, 0.4)' }}
    >
      SIMULATED DATA — every price, candle, signal and watchlist value on this screen is generated sample data, not market data.
    </div>
  );
}

export function UnavailableState({ status, loading, onRetry }) {
  return (
    <div className="flex-1 h-full flex items-center justify-center">
      <div className="text-center max-w-sm px-4">
        <h2 className="text-sm font-semibold text-gray-300 mb-1">
          {loading ? 'Loading market data…' : 'Market data unavailable'}
        </h2>
        {!loading && (
          <>
            <p className="text-xs text-gray-500 mb-3">
              {status === 'UNAVAILABLE'
                ? 'The data providers did not return usable data. Nothing is shown rather than showing unreliable numbers.'
                : 'No data could be loaded.'}
            </p>
            {onRetry && (
              <button
                onClick={onRetry}
                className="px-3 py-1.5 text-xs rounded cursor-pointer bg-green-500/15 text-green-400 hover:bg-green-500/25"
              >
                Retry
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
