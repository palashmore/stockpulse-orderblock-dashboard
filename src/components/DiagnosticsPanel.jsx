import { useState } from 'react';
import { useRefresh } from '../hooks/useRefresh';
import { Activity, Server, Radio, Database, ShieldCheck, AlertCircle, RefreshCw } from 'lucide-react';
import { fetchDiagnostics } from '../services/api';

const REFRESH_MS = 5000;

function Row({ label, value, tone }) {
  const color = tone === 'bad' ? '#ff1744' : tone === 'warn' ? '#ffd600' : tone === 'good' ? '#00e676' : '#d1d5db';
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 px-1 rounded hover:bg-white/2" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}>
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs font-mono font-semibold text-right" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

function Card({ title, icon: Icon, children }) {
  return (
    <section
      className="rounded-lg p-3.5 flex flex-col justify-between"
      style={{
        border: '1px solid rgba(30, 45, 61, 0.5)',
        backgroundColor: '#111827',
      }}
    >
      <div>
        <div className="flex items-center gap-1.5 mb-2.5 pb-1.5" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
          {Icon && <Icon size={14} className="text-cyan-400" />}
          <h3 className="text-xs font-bold text-gray-200 uppercase tracking-wider">{title}</h3>
        </div>
        <div className="space-y-1">{children}</div>
      </div>
    </section>
  );
}

const when = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');
const uptime = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)}m ${s % 60}s`);

export default function DiagnosticsPanel() {
  const [data, setData] = useState(undefined);

  // Diagnostics poll faster than the market feeds (operator view), still on the shared scheduler
  useRefresh('diagnostics', async () => {
    const d = await fetchDiagnostics();
    setData(d);
    return d ?? { unreachable: true };
  }, true, REFRESH_MS);

  if (data === undefined) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-xs text-gray-500">
        Loading operational telemetry from StockPulse backend…
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="p-8 text-center text-xs space-y-2">
        <p style={{ color: '#ff1744' }} className="font-bold">
          StockPulse Backend Server Unreachable
        </p>
        <p className="text-gray-500">Ensure `node server/index.js` or `npm run dev:all` is running on port 3001.</p>
      </div>
    );
  }

  const { market, broker, stream, instruments, yahoo, recentErrors } = data;
  const hosted = Boolean(data.hosted);
  const b = broker.budget;
  const streamTone = !stream ? undefined : stream.state === 'connected' ? 'good' : stream.state === 'stopped' ? undefined : 'warn';

  const minutePct = b ? Math.min(100, (b.minuteUsed / b.minuteLimit) * 100) : 0;
  const dayPct = b ? Math.min(100, (b.dayUsed / b.dayLimit) * 100) : 0;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3" style={{ backgroundColor: '#0a0e17' }}>
      {/* Header Bar */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg"
        style={{ backgroundColor: '#0d1117', border: '1px solid rgba(30, 45, 61, 0.5)' }}
      >
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-emerald-400" />
          <h2 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
            Operational Telemetry & System Diagnostics
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-mono text-gray-400">
            Updated {when(data.generatedAt)} · Poll every {REFRESH_MS / 1000}s
          </span>
        </div>
      </div>

      {/* Telemetry Cards Grid */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {/* 1. Market Telemetry */}
        <Card title="Exchange Market Status" icon={Activity}>
          <Row
            label="Market State"
            value={market.state + (market.reason ? ` (${market.reason}${market.holiday ? `: ${market.holiday}` : ''})` : '')}
            tone={market.state === 'OPEN' ? 'good' : undefined}
          />
          <Row label="Last Completed Session" value={market.lastSession} />
          <Row
            label="Exchange Holiday Calendar"
            value={market.calendar === 'nse' ? `NSE Loaded (${market.holidaysLoaded} holidays)` : 'Weekends Only'}
            tone={market.calendar === 'nse' ? 'good' : 'warn'}
          />
        </Card>

        {/* 2. Broker Connection */}
        {!hosted && (
          <Card title="Broker Gateway (ICICI Breeze)" icon={Server}>
            <Row label="API Key Configured" value={broker.configured ? 'Configured' : 'Missing'} tone={broker.configured ? 'good' : 'warn'} />
            <Row
              label="Session State"
              value={broker.connected ? `Authenticated (Since ${when(broker.connectedAt)})` : 'Disconnected'}
              tone={broker.connected ? 'good' : 'warn'}
            />
            <div className="py-1">
              <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                <span>Rate Budget (Minute)</span>
                <span className="font-mono text-gray-200">{b.minuteUsed} / {b.minuteLimit}</span>
              </div>
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${minutePct}%`,
                    backgroundColor: minutePct > 80 ? '#ff1744' : '#00e676',
                  }}
                />
              </div>
            </div>
            <div className="py-1">
              <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                <span>Rate Budget (Daily)</span>
                <span className="font-mono text-gray-200">{b.dayUsed} / {b.dayLimit}</span>
              </div>
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${dayPct}%`,
                    backgroundColor: dayPct > 80 ? '#ff1744' : '#00e676',
                  }}
                />
              </div>
            </div>
          </Card>
        )}

        {/* 3. Live WebSocket Stream */}
        {!hosted && (
          <Card title="WebSocket Stream Feed" icon={Radio}>
            <Row label="Connection State" value={stream.state.toUpperCase()} tone={streamTone} />
            <Row label="Active Subscriptions" value={`${stream.joined} joined / ${stream.subscriptions} requested`} />
            <Row label="Ticks Ingested" value={`${stream.ticks.toLocaleString('en-IN')} quotes · ${stream.depthTicks.toLocaleString('en-IN')} depth`} />
            <Row
              label="Last Tick Latency"
              value={stream.lastTickAgeSec === null ? 'None yet' : `${stream.lastTickAgeSec}s ago`}
              tone={stream.lastTickAgeSec > 30 ? 'warn' : 'good'}
            />
            <Row label="Disconnects / Drops" value={`${stream.disconnects}`} tone={stream.disconnects > 0 ? 'warn' : undefined} />
            <Row label="Connected Web Clients" value={`${data.liveClients} browsers`} />
            {stream.lastError && <Row label="Last Stream Error" value={stream.lastError} tone="bad" />}
          </Card>
        )}

        {hosted && (
          <Card title="Hosted Instance" icon={Server}>
            <Row label="Environment" value="Serverless Hosted" />
            <Row
              label="Providers Paused"
              value={data.providersPaused?.length ? data.providersPaused.map((p) => `${p.provider} (${p.resumesInSec}s)`).join(', ') : 'None'}
              tone={data.providersPaused?.length ? 'warn' : 'good'}
            />
          </Card>
        )}

        {/* 4. Cache & Instruments Master */}
        <Card title="Instruments & Cache Subsystem" icon={Database}>
          <Row
            label="NSE Securities Master"
            value={instruments.loaded ? `${instruments.count.toLocaleString('en-IN')} Equities Indexed` : 'Unindexed'}
            tone={instruments.loaded ? 'good' : 'warn'}
          />
          <Row label="Yahoo Finance Session" value={yahoo.sessionReady ? 'Authenticated (Crumb Ready)' : 'On Demand'} />
          <Row label="Active Cache Entries" value={`${data.cacheEntries} in-memory objects`} />
          <Row label="Daemon Uptime" value={uptime(data.uptimeSec)} />
        </Card>
      </div>

      {/* Stream Events Log */}
      {stream && stream.recentEvents.length > 0 && (
        <Card title="Live Stream Event Ledger" icon={Radio}>
          <div className="space-y-1">
            {stream.recentEvents.map((e, i) => (
              <Row key={i} label={when(e.at)} value={e.message} />
            ))}
          </div>
        </Card>
      )}

      {/* Recent Errors Ledger */}
      <Card title={`Recent System Errors (${recentErrors.length})`} icon={AlertCircle}>
        {recentErrors.length === 0 ? (
          <p className="text-xs text-gray-500 py-2">No upstream errors recorded during this daemon lifecycle.</p>
        ) : (
          <div className="space-y-1">
            {recentErrors.map((e, i) => (
              <Row key={i} label={`${when(e.at)} · ${e.source}`} value={e.message} tone="warn" />
            ))}
          </div>
        )}
      </Card>

      <p className="text-[10px] text-gray-600">
        Exchange tick timestamps are verified against local server synchronization. Credentials, API keys, and session tokens are strictly redacted and never transmitted across telemetry.
      </p>
    </div>
  );
}
