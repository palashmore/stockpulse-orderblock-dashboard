import { useEffect, useState } from 'react';
import { fetchDiagnostics } from '../services/api';

const REFRESH_MS = 5000;

function Row({ label, value, tone }) {
  const color = tone === 'bad' ? '#ff1744' : tone === 'warn' ? '#ffd600' : tone === 'good' ? '#00e676' : '#d1d5db';
  return (
    <div className="flex items-baseline justify-between gap-4 py-1" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}>
      <span className="text-[11px] text-gray-500">{label}</span>
      <span className="text-xs font-mono text-right" style={{ color }}>{value}</span>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <section className="rounded-md px-4 py-3" style={{ border: '1px solid rgba(30, 45, 61, 0.5)', backgroundColor: 'rgba(17, 24, 39, 0.5)' }}>
      <h3 className="text-xs font-semibold text-gray-300 mb-1">{title}</h3>
      {children}
    </section>
  );
}

const when = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');
const uptime = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)}m ${s % 60}s`);

export default function DiagnosticsPanel() {
  const [data, setData] = useState(undefined); // undefined = loading, null = unreachable

  useEffect(() => {
    let cancelled = false;
    const load = () => fetchDiagnostics().then((d) => { if (!cancelled) setData(d); });
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  if (data === undefined) return <p className="px-4 py-6 text-xs text-gray-500">Loading diagnostics…</p>;
  if (data === null) {
    return <p className="px-4 py-6 text-xs" style={{ color: '#ff1744' }}>The StockPulse server is not reachable, or this page is not on the same machine as the server.</p>;
  }

  const { market, broker, stream, instruments, yahoo, recentErrors } = data;
  const hosted = Boolean(data.hosted);
  const b = broker.budget;
  const streamTone = !stream ? undefined : stream.state === 'connected' ? 'good' : stream.state === 'stopped' ? undefined : 'warn';

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3" style={{ backgroundColor: '#0a0e17' }}>
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">API Diagnostics</h2>
        <span className="text-[10px] text-gray-600">Updated {when(data.generatedAt)} · refreshes every {REFRESH_MS / 1000}s</span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Card title="Market">
          <Row label="State" value={market.state + (market.reason ? ` (${market.reason}${market.holiday ? `: ${market.holiday}` : ''})` : '')} tone={market.state === 'OPEN' ? 'good' : undefined} />
          <Row label="Last completed session" value={market.lastSession} />
          <Row label="Holiday calendar" value={market.calendar === 'nse' ? `NSE (${market.holidaysLoaded} holidays)` : 'weekends only'} tone={market.calendar === 'nse' ? 'good' : 'warn'} />
        </Card>

        {!hosted && <Card title="ICICI Direct (Breeze)">
          <Row label="API key configured" value={broker.configured ? 'yes' : 'no'} tone={broker.configured ? 'good' : 'warn'} />
          <Row label="Signed in" value={broker.connected ? `yes (since ${when(broker.connectedAt)})` : 'no'} tone={broker.connected ? 'good' : 'warn'} />
          <Row label="Calls this minute" value={`${b.minuteUsed} / ${b.minuteLimit}`} tone={b.minuteUsed >= b.minuteLimit * 0.8 ? 'warn' : undefined} />
          <Row label="Calls today" value={`${b.dayUsed} / ${b.dayLimit}`} tone={b.dayUsed >= b.dayLimit * 0.8 ? 'warn' : undefined} />
        </Card>}

        {!hosted && <Card title="Live tick stream">
          <Row label="State" value={stream.state} tone={streamTone} />
          <Row label="Subscriptions" value={`${stream.subscriptions} wanted, ${stream.joined} joined`} />
          <Row label="Ticks received" value={`${stream.ticks} quotes, ${stream.depthTicks} depth`} />
          <Row label="Last tick" value={stream.lastTickAgeSec === null ? 'none yet' : `${stream.lastTickAgeSec}s ago`} />
          <Row label="Connects / drops" value={`${stream.connects} / ${stream.disconnects}`} tone={stream.disconnects > 0 ? 'warn' : undefined} />
          <Row label="Rejected messages" value={stream.rejectedMessages} tone={stream.rejectedMessages > 0 ? 'warn' : undefined} />
          {stream.lastError && <Row label="Last error" value={stream.lastError} tone="bad" />}
          <Row label="Browsers watching" value={data.liveClients} />
        </Card>}

        {hosted && (
          <Card title="Hosted copy">
            <Row label="Mode" value="serverless (no live stream or broker session kept on the server)" />
            <Row label="Providers paused" value={data.providersPaused?.length ? data.providersPaused.map((p) => `${p.provider} ${p.resumesInSec}s`).join(', ') : 'none'} tone={data.providersPaused?.length ? 'warn' : 'good'} />
          </Card>
        )}

        <Card title="Instruments and data">
          <Row label="Instrument list" value={instruments.loaded ? `${instruments.count.toLocaleString('en-IN')} NSE stocks` : 'not loaded'} tone={instruments.loaded ? 'good' : 'warn'} />
          <Row label="Yahoo session" value={yahoo.sessionReady ? 'ready' : 'not needed yet'} />
          <Row label="Cache entries" value={data.cacheEntries} />
          <Row label="Server uptime" value={uptime(data.uptimeSec)} />
        </Card>
      </div>

      {stream && stream.recentEvents.length > 0 && (
        <Card title="Stream events">
          {stream.recentEvents.map((e, i) => <Row key={i} label={when(e.at)} value={e.message} />)}
        </Card>
      )}

      <Card title={`Recent errors (${recentErrors.length})`}>
        {recentErrors.length === 0 && <p className="text-xs text-gray-600">No errors since this server instance started.</p>}
        {recentErrors.map((e, i) => <Row key={i} label={`${when(e.at)} · ${e.source}`} value={e.message} tone="warn" />)}
      </Card>

      <p className="text-[10px] text-gray-600">
        The stream's exchange timestamps are checked against this computer's clock. Until they have been confirmed during a trading session,
        no data is labelled LIVE from the stream alone. Credentials and session tokens never appear on this page.
      </p>
    </div>
  );
}
