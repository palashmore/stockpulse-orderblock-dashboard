// Display helpers for the alerts that the server checks (pure; the server owns the rules).

const OUTCOMES = {
  'not-run-yet': { label: 'Waiting for the first check', tone: 'warn' },
  ok: { label: 'Checked', tone: 'ok' },
  'no-active-alerts': { label: 'No active alerts to check', tone: 'idle' },
  'market-closed': { label: 'Market closed: checks resume at the open', tone: 'idle' },
  'data-not-live': { label: 'Waiting for live or delayed prices', tone: 'warn' },
  'data-unavailable': { label: 'Price feed unavailable', tone: 'bad' },
};

/** { label, tone } for the engine's last outcome, with the server's detail appended when it has one. */
export function describeEngine(engine) {
  if (!engine) return { label: 'Server status unknown', tone: 'warn' };
  const base = OUTCOMES[engine.outcome] ?? { label: 'Unknown state', tone: 'warn' };
  return { label: engine.detail && base.tone !== 'ok' ? `${base.label} (${engine.detail})` : base.label, tone: base.tone };
}

/** Events whose ids are not in `seen` (a Set). Returns them newest first, as given. */
export function unseenEvents(events, seen) {
  return (events || []).filter((e) => !seen.has(e.id));
}

/** One line for a notification or history row. */
export function eventLine(event) {
  if (event.kind === 'feed' || event.kind === 'broker') return event.message;
  const level = `₹${event.threshold.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const price = `₹${event.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const verb = event.type === 'above' ? `rose to ${level} or above` : `fell to ${level} or below`;
  return `${event.symbol} ${verb}; last price ${price}${event.status ? ` (${event.status})` : ''}`;
}

/** Title for a browser notification about an event. */
export const eventTitle = (event) => (event.kind === 'feed' ? 'Price feed' : event.kind === 'broker' ? 'ICICI Direct session' : `${event.symbol} alert`);

const DELIVERY = { sent: 'push sent', failed: 'push failed', none: 'no push channel', pending: 'push pending' };
export const deliveryLabel = (delivery) => DELIVERY[delivery] ?? DELIVERY.none;
