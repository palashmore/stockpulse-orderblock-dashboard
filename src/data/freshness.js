/** How current a panel's data is, judged by the last successful refresh (not by the clock on screen). */
export function freshness({ lastSuccessAt, now, intervalMs = 60000, failures = 0 }) {
  if (!lastSuccessAt) return { state: 'unknown', ageSec: null, text: failures > 0 ? 'No update yet · refresh failing' : 'Waiting for first update' };
  const ageSec = Math.max(0, Math.round((now - lastSuccessAt) / 1000));
  const age = ageSec < 60 ? `${ageSec}s ago` : `${Math.floor(ageSec / 60)}m ago`;
  const state = ageSec * 1000 <= intervalMs * 1.5 ? 'fresh' : ageSec * 1000 <= intervalMs * 5 ? 'delayed' : 'stale';
  const time = new Date(lastSuccessAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return { state, ageSec, text: `Updated ${time} · ${age}${failures > 0 ? ' · refresh failing, showing last good data' : ''}` };
}
