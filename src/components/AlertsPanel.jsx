import { useState } from 'react';
import { Trash2, Pause, Play, RotateCcw, Bell, CheckCircle2, AlertTriangle, Send, RefreshCw } from 'lucide-react';
import { describeAlert } from '../data/alerts';
import { describeEngine, eventLine, deliveryLabel } from '../data/serverAlerts';
import { NIFTY_STOCKS } from '../data/stockData';
import { STATUS_META } from '../data/dataStatus';
import { useWatchlist } from '../hooks/useWatchlist';

const STATUS_STYLE = {
  active: { label: 'ACTIVE', color: '#00e676' },
  paused: { label: 'PAUSED', color: '#64748b' },
  triggered: { label: 'TRIGGERED', color: '#ffd600' },
};
const TONE_COLOR = { ok: '#00e676', idle: '#94a3b8', warn: '#ffd600', bad: '#ff1744' };

const fmtPrice = (n) => (Number.isFinite(n) ? `₹${n.toFixed(2)}` : '—');
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');

function IconButton({ label, onClick, children }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/5 cursor-pointer transition-colors"
    >
      {children}
    </button>
  );
}

const smallButton =
  'px-2.5 py-1 text-xs rounded font-medium cursor-pointer bg-white/5 text-gray-300 hover:text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-default transition-colors';

export default function AlertsPanel({ nifty, alertsApi, selectedStock, demoMode }) {
  const {
    mode,
    alerts,
    events,
    engine,
    offline,
    recent,
    evaluating,
    saveFailed,
    permission,
    browserAlertCount,
    addAlert,
    removeAlert,
    pause,
    activate,
    checkNow,
    sendTest,
    saveFeed,
    migrate,
    requestNotifications,
  } = alertsApi;
  const server = mode === 'server';
  const watch = useWatchlist('daily');
  const [symbol, setSymbol] = useState(selectedStock?.symbol || NIFTY_STOCKS[0].symbol);
  const [type, setType] = useState('above');
  const [threshold, setThreshold] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');

  const priceOf = (sym) => nifty.quotes.find((q) => q.symbol === sym)?.price;
  const currentPrice = priceOf(symbol.trim().toUpperCase());
  const statusMeta = STATUS_META[nifty.status];
  const engineInfo = describeEngine(engine);
  const suggestions = [...new Set([...NIFTY_STOCKS.map((s) => s.symbol), ...watch.allSymbols])];

  const submit = async (e) => {
    e.preventDefault();
    setBusy('add');
    const result = await addAlert({ symbol: symbol.trim().toUpperCase(), type, threshold: Number(threshold) });
    setBusy('');
    if (result.error) {
      setError(result.error);
      return;
    }
    setError('');
    setThreshold('');
  };

  const run = async (name, action, onDone) => {
    setBusy(name);
    setNote('');
    const result = await action();
    setBusy('');
    setNote(onDone(result));
  };

  const inputClass =
    'px-2.5 py-1.5 text-xs rounded text-gray-200 border border-gray-700 focus:border-green-500 outline-none font-medium';
  const rule = { borderBottom: '1px solid rgba(30, 45, 61, 0.4)' };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col" style={{ backgroundColor: '#0a0e17' }}>
      {/* Top Header Bar */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 flex-shrink-0"
        style={{ backgroundColor: '#0d1117', ...rule }}
      >
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-emerald-400" />
          <h2 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
            {server ? 'Real-Time Price Alerts (Server Engine)' : 'Price Alerts · Nifty 50 (Browser Mode)'}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {mode === 'checking' && (
            <span className="text-[10px] font-mono text-gray-500">CONNECTING TO ENGINE…</span>
          )}
          {server && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded font-mono uppercase"
              style={{
                color: offline ? '#ff1744' : TONE_COLOR[engineInfo.tone],
                backgroundColor: 'rgba(30, 45, 61, 0.5)',
              }}
            >
              {offline ? 'SERVER OFFLINE' : engineInfo.label}
            </span>
          )}
          {mode === 'local' && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded font-mono uppercase"
              style={{
                color: evaluating ? '#00e676' : '#ffd600',
                backgroundColor: 'rgba(30, 45, 61, 0.5)',
              }}
            >
              {evaluating ? 'ACTIVE IN TAB' : 'PAUSED'}
            </span>
          )}
        </div>
      </div>

      {/* Operational Telemetry Banner */}
      {server ? (
        <div className="px-4 py-3 text-xs text-gray-400 space-y-1.5 flex-shrink-0" style={{ backgroundColor: '#111827', ...rule }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-gray-300">
              {engine?.lastCheckAt ? (
                <>
                  Heartbeat check: {fmtTime(engine.lastCheckAt)} (Every {engine?.intervalSec ?? 60}s during market hours)
                </>
              ) : (
                'Alert engine starting…'
              )}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={busy === 'check'}
                onClick={() =>
                  run('check', checkNow, (r) =>
                    r.ok
                      ? `Evaluated: ${describeEngine({ outcome: r.body.outcome, detail: r.body.detail }).label}`
                      : 'Evaluation failed'
                  )
                }
                className={smallButton}
              >
                {busy === 'check' ? 'Evaluating…' : 'Check Now'}
              </button>
              {engine?.channel && engine.channel !== 'none' && (
                <button
                  type="button"
                  disabled={busy === 'test'}
                  onClick={() =>
                    run('test', sendTest, (r) =>
                      r.ok ? 'Test notification sent successfully!' : `Push failed: ${r.error}`
                    )
                  }
                  className={smallButton}
                >
                  {busy === 'test' ? 'Sending…' : 'Test Push'}
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500 pt-1">
            <span>
              Push Destination:{' '}
              {engine?.channel && engine.channel !== 'none' ? (
                <span className="text-emerald-400 font-mono font-semibold">{engine.channel.toUpperCase()}</span>
              ) : (
                <span>None (supports Telegram, Discord, Twilio, ntfy)</span>
              )}
            </span>
            {offline && <span style={{ color: '#ff1744' }}>· Server unreachable</span>}
            {saveFailed && <span style={{ color: '#ff1744' }}>· Disk persistence error</span>}
          </div>
        </div>
      ) : (
        <div className="px-4 py-2 text-xs text-gray-400 space-y-1 flex-shrink-0" style={rule}>
          <p>
            Browser alerts evaluate on active tab quotes (~every 60s). Keep this tab open to monitor price triggers.
          </p>
        </div>
      )}

      {/* Migration Notice */}
      {server && browserAlertCount > 0 && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-xs text-gray-300 flex-shrink-0"
          style={{ ...rule, backgroundColor: 'rgba(0, 176, 255, 0.08)' }}
        >
          <span>
            {browserAlertCount} alert{browserAlertCount === 1 ? ' is' : 's are'} saved in browser memory only. Migrate to the server daemon for 24/7 background evaluation.
          </span>
          <button
            disabled={busy === 'migrate'}
            onClick={() =>
              run('migrate', migrate, (r) =>
                r.ok
                  ? `Migrated ${r.body.added} alert(s) to server`
                  : r.body?.error || 'Migration failed'
              )
            }
            className={smallButton}
          >
            {busy === 'migrate' ? 'Migrating…' : 'Migrate to Server'}
          </button>
        </div>
      )}

      {/* Alert Creation Form */}
      <form
        onSubmit={submit}
        className="flex flex-wrap items-end gap-3 px-4 py-3 flex-shrink-0"
        style={{ backgroundColor: '#0d1117', ...rule }}
      >
        <label className="flex flex-col gap-1 text-[10px] text-gray-500 uppercase tracking-wider font-medium">
          Symbol
          {server ? (
            <>
              <input
                value={symbol}
                list="alert-symbols"
                onChange={(e) => {
                  setSymbol(e.target.value.toUpperCase());
                  setError('');
                }}
                placeholder="RELIANCE"
                className={`${inputClass} w-36`}
                style={{ backgroundColor: '#111827' }}
                autoComplete="off"
                spellCheck={false}
              />
              <datalist id="alert-symbols">
                {suggestions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </>
          ) : (
            <select
              value={symbol}
              onChange={(e) => {
                setSymbol(e.target.value);
                setError('');
              }}
              className={inputClass}
              style={{ backgroundColor: '#111827' }}
            >
              {NIFTY_STOCKS.map((s) => (
                <option key={s.symbol} value={s.symbol}>
                  {s.symbol}
                </option>
              ))}
            </select>
          )}
        </label>

        <label className="flex flex-col gap-1 text-[10px] text-gray-500 uppercase tracking-wider font-medium">
          Trigger Condition
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setError('');
            }}
            className={inputClass}
            style={{ backgroundColor: '#111827' }}
          >
            <option value="above">Rises to / above (≥)</option>
            <option value="below">Falls to / below (≤)</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[10px] text-gray-500 uppercase tracking-wider font-medium">
          Price Threshold (₹)
          <input
            type="number"
            step="any"
            min="0"
            value={threshold}
            onChange={(e) => {
              setThreshold(e.target.value);
              setError('');
            }}
            placeholder={Number.isFinite(currentPrice) ? currentPrice.toFixed(2) : 'Price'}
            className={`${inputClass} w-32 font-mono`}
            style={{ backgroundColor: '#111827' }}
          />
        </label>

        <button
          type="submit"
          disabled={busy === 'add' || mode === 'checking'}
          className="px-3 py-1.5 text-xs rounded font-bold cursor-pointer disabled:opacity-50"
          style={{ backgroundColor: 'rgba(0, 230, 118, 0.15)', color: '#00e676' }}
        >
          {busy === 'add' ? 'Saving…' : '+ Add Price Alert'}
        </button>

        <span className="text-xs text-gray-400 font-mono self-center pb-1">
          {Number.isFinite(currentPrice) ? `Current LTP: ${fmtPrice(currentPrice)}` : ''}
        </span>

        {error && (
          <span role="alert" className="text-xs w-full font-medium" style={{ color: '#ff1744' }}>
            {error}
          </span>
        )}
      </form>

      {/* Channel Status and Feed Health */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-xs text-gray-500 flex-shrink-0"
        style={rule}
      >
        <div className="flex items-center gap-2">
          <span>Browser Notifications:</span>
          {permission === 'granted' && <span className="text-emerald-400 font-semibold">Enabled</span>}
          {permission === 'denied' && <span className="text-rose-400 font-semibold">Blocked in browser</span>}
          {permission === 'default' && (
            <button onClick={requestNotifications} className={smallButton}>
              Enable Notifications
            </button>
          )}
        </div>

        {note && (
          <span role="status" className="text-emerald-400 font-medium">
            {note}
          </span>
        )}
      </div>

      {/* Triggered recently banner */}
      {recent.length > 0 && (
        <div
          className="px-4 py-2.5 flex-shrink-0"
          style={{ ...rule, backgroundColor: 'rgba(255, 214, 0, 0.08)' }}
        >
          <h3 className="text-[10px] text-amber-400 uppercase tracking-wider font-bold mb-1">
            Triggered In Current Session ({recent.length})
          </h3>
          <div className="space-y-1">
            {recent.map((r, i) => (
              <p key={`${r.id}-${r.at}-${i}`} className="text-xs text-gray-200">
                <span className="font-bold text-amber-300">{r.symbol}</span> {describeAlert(r)} — Hit{' '}
                <span className="font-mono font-bold">{fmtPrice(r.price)}</span> at {fmtTime(r.at)}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Active Alerts Table */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider" style={rule}>
          Configured Alerts ({alerts.length})
        </div>

        {alerts.length === 0 && mode !== 'checking' && (
          <div className="p-8 text-center text-xs text-gray-500">
            No price alerts created yet. Enter a symbol and target level above to arm an alert.
          </div>
        )}

        {alerts.map((a) => {
          const style = STATUS_STYLE[a.status];
          const live = priceOf(a.symbol);
          return (
            <div
              key={a.id}
              className="grid grid-cols-[6rem_1fr_6rem_auto] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/2"
              style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}
            >
              <div>
                <div className="text-xs font-bold text-gray-100">{a.symbol}</div>
                <div className="text-[10px] font-mono text-gray-400">
                  {fmtPrice(Number.isFinite(live) ? live : server ? a.lastPrice : undefined)}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-gray-200">{describeAlert(a)}</div>
                {a.triggeredAt && (
                  <div className="text-[10px] text-amber-400">
                    Triggered {fmtTime(a.triggeredAt)} at {fmtPrice(a.triggeredPrice)}
                    {a.triggerCount > 1 ? ` (${a.triggerCount}x)` : ''}
                  </div>
                )}
              </div>
              <div>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded uppercase"
                  style={{ color: style.color, backgroundColor: `${style.color}1f` }}
                >
                  {style.label}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {a.status === 'active' && (
                  <IconButton label="Pause Alert" onClick={() => pause(a.id)}>
                    <Pause size={13} />
                  </IconButton>
                )}
                {a.status === 'paused' && (
                  <IconButton label="Resume Alert" onClick={() => activate(a.id)}>
                    <Play size={13} />
                  </IconButton>
                )}
                {a.status === 'triggered' && (
                  <IconButton label="Re-arm Alert" onClick={() => activate(a.id)}>
                    <RotateCcw size={13} />
                  </IconButton>
                )}
                <IconButton label="Delete Alert" onClick={() => removeAlert(a.id)}>
                  <Trash2 size={13} className="text-gray-500 hover:text-red-400" />
                </IconButton>
              </div>
            </div>
          );
        })}
      </div>

      {/* History Log */}
      {server && events.length > 0 && (
        <div className="flex-shrink-0" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.4)', maxHeight: '180px', overflowY: 'auto' }}>
          <div className="px-4 py-1.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider" style={{ backgroundColor: '#0d1117' }}>
            Event Audit Trail ({events.length})
          </div>
          <div className="divide-y divide-gray-800/30">
            {events.slice(0, 20).map((ev) => (
              <p key={ev.id} className="px-4 py-1 text-[11px] text-gray-400 font-mono">
                <span className="text-gray-500">{fmtTime(ev.at)}</span> ·{' '}
                {ev.kind === 'feed' || ev.kind === 'broker' ? (
                  <span style={{ color: '#ffd600' }}>{ev.kind === 'feed' ? 'FEED: ' : 'BROKER: '}</span>
                ) : null}
                {eventLine(ev)} · <span className="text-gray-500">{deliveryLabel(ev.delivery)}</span>
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
