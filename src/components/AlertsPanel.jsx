import { useState } from 'react';
import { Trash2, Pause, Play, RotateCcw } from 'lucide-react';
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
      className="p-1.5 rounded text-gray-500 hover:text-gray-200 hover:bg-white/5 cursor-pointer"
    >
      {children}
    </button>
  );
}

const smallButton = 'px-2 py-1 rounded cursor-pointer bg-white/5 text-gray-300 hover:bg-white/10 disabled:opacity-50 disabled:cursor-default';

export default function AlertsPanel({ nifty, alertsApi, selectedStock, demoMode }) {
  const {
    mode, alerts, events, engine, offline, recent, evaluating, saveFailed, permission, browserAlertCount,
    addAlert, removeAlert, pause, activate, checkNow, sendTest, migrate, requestNotifications,
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

  const inputClass = 'px-2 py-1.5 text-xs rounded bg-transparent text-gray-200 border border-gray-700 focus:border-green-500 outline-none';
  const rule = { borderBottom: '1px solid rgba(30, 45, 61, 0.3)' };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto" style={{ backgroundColor: '#0a0e17' }}>
      <div className="flex items-center justify-between px-4 py-2" style={rule}>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {server ? 'Price Alerts · checked by the server' : 'Price Alerts · Nifty 50'}
        </h2>
        {mode === 'checking' && <span className="text-[10px] text-gray-500">CONNECTING TO THE SERVER…</span>}
        {server && (
          <span className="text-[10px]" style={{ color: offline ? '#ff1744' : TONE_COLOR[engineInfo.tone] }}>
            {offline ? 'SERVER NOT REACHABLE' : engineInfo.label.toUpperCase()}
          </span>
        )}
        {mode === 'local' && (
          <span className="text-[10px]" style={{ color: evaluating ? '#00e676' : '#ffd600' }}>
            {evaluating ? 'CHECKING ON EACH REFRESH' : 'NOT CHECKING'}
          </span>
        )}
      </div>

      {server ? (
        <div className="px-4 py-3 text-[11px] text-gray-500 space-y-1" style={rule}>
          <p>
            The server checks your alerts about every {engine?.intervalSec ?? 60} seconds while the market is open, so they keep working with
            this page closed, as long as the server is running on your computer. Only LIVE or DELAYED prices are used; stale or closed-market
            data never fires an alert.
          </p>
          <p>An alert fires once when the price crosses the level; re-arm it to use it again. An alert is a price level being reached, not advice.</p>
          {offline && <p style={{ color: '#ff1744' }}>The server did not answer the last refresh. What you see may be out of date.</p>}
          {saveFailed && <p style={{ color: '#ff1744' }}>The server could not save alerts to disk; they will be lost when it restarts.</p>}
          <p className="flex flex-wrap items-center gap-2">
            <span>
              {engine?.lastCheckAt
                ? <>Last check {fmtTime(engine.lastCheckAt)}: <span style={{ color: TONE_COLOR[engineInfo.tone] }}>{engineInfo.label}</span></>
                : 'Not checked yet since the server started.'}
            </span>
            <button
              disabled={busy === 'check'}
              onClick={() => run('check', checkNow, (r) => (r.ok ? `Checked now: ${describeEngine({ outcome: r.body.outcome, detail: r.body.detail }).label}` : 'Could not check right now'))}
              className={smallButton}
            >
              {busy === 'check' ? 'Checking…' : 'Check now'}
            </button>
          </p>
        </div>
      ) : (
        <div className="px-4 py-3 text-[11px] text-gray-500 space-y-1" style={rule}>
          {mode === 'local' && (
            <p style={{ color: '#ffd600' }}>
              The server&apos;s alert service is not available here, so these alerts live in this browser only. It is available when the app is
              opened on the computer that runs the server (use localhost, not a network address) and the server is running.
            </p>
          )}
          <p>
            Browser alerts are checked each time Nifty 50 quotes refresh (about once a minute) while this tab is open.
            Nothing runs when the app is closed, so a move can be noticed late.
          </p>
          <p>Prices come from an unofficial, delayed feed. An alert fires once when the price crosses the level; re-arm it to use it again.</p>
          {mode === 'local' && !evaluating && (
            <p style={{ color: '#ffd600' }}>
              Alerts are paused because the quote data is {statusMeta ? statusMeta.label : 'unavailable'}
              {demoMode ? ' (simulated data is never checked)' : ' (only LIVE or DELAYED data is checked, so nothing fires while the market is closed)'}.
            </p>
          )}
          {saveFailed && <p style={{ color: '#ff1744' }}>Could not save alerts in this browser; they will be lost on reload.</p>}
        </div>
      )}

      {server && browserAlertCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-2 text-[11px] text-gray-300" style={{ ...rule, backgroundColor: 'rgba(0, 176, 255, 0.07)' }}>
          <span>{browserAlertCount} alert{browserAlertCount === 1 ? ' is' : 's are'} saved only in this browser. Move {browserAlertCount === 1 ? 'it' : 'them'} to the server so {browserAlertCount === 1 ? 'it keeps' : 'they keep'} working with the page closed.</span>
          <button
            disabled={busy === 'migrate'}
            onClick={() => run('migrate', migrate, (r) => (r.ok ? `Moved ${r.body.added} to the server${r.body.skipped ? `, ${r.body.skipped} already there` : ''}` : (r.body?.error || 'Could not move them')))}
            className={smallButton}
          >
            {busy === 'migrate' ? 'Moving…' : 'Move to server'}
          </button>
        </div>
      )}

      <form onSubmit={submit} className="flex flex-wrap items-end gap-3 px-4 py-3" style={rule}>
        <label className="flex flex-col gap-1 text-[10px] text-gray-500 uppercase tracking-wider">
          Stock
          {server ? (
            <>
              <input
                value={symbol}
                list="alert-symbols"
                onChange={(e) => { setSymbol(e.target.value.toUpperCase()); setError(''); }}
                placeholder="e.g. RELIANCE"
                className={`${inputClass} w-36`}
                autoComplete="off"
                spellCheck={false}
              />
              <datalist id="alert-symbols">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
            </>
          ) : (
            <select value={symbol} onChange={(e) => { setSymbol(e.target.value); setError(''); }} className={inputClass} style={{ backgroundColor: '#0d1117' }}>
              {NIFTY_STOCKS.map((s) => <option key={s.symbol} value={s.symbol}>{s.symbol}</option>)}
            </select>
          )}
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-gray-500 uppercase tracking-wider">
          Condition
          <select value={type} onChange={(e) => { setType(e.target.value); setError(''); }} className={inputClass} style={{ backgroundColor: '#0d1117' }}>
            <option value="above">Rises to / above</option>
            <option value="below">Falls to / below</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-gray-500 uppercase tracking-wider">
          Price (₹)
          <input
            type="number"
            step="any"
            min="0"
            value={threshold}
            onChange={(e) => { setThreshold(e.target.value); setError(''); }}
            placeholder={Number.isFinite(currentPrice) ? currentPrice.toFixed(2) : 'Price'}
            className={`${inputClass} w-32`}
          />
        </label>
        <button
          type="submit"
          disabled={busy === 'add' || mode === 'checking'}
          className="px-3 py-1.5 text-xs rounded cursor-pointer bg-green-500/15 text-green-400 hover:bg-green-500/25 disabled:opacity-50"
        >
          {busy === 'add' ? 'Adding…' : 'Add alert'}
        </button>
        <span className="text-[11px] text-gray-500">
          {Number.isFinite(currentPrice) ? `Now: ${fmtPrice(currentPrice)}` : server ? 'The server reads the current price when it saves the alert' : 'Now: —'}
        </span>
        {error && <span role="alert" className="text-[11px] w-full" style={{ color: '#ff1744' }}>{error}</span>}
      </form>

      <div className="flex flex-wrap items-center gap-3 px-4 py-2 text-[11px] text-gray-500" style={rule}>
        <span>Browser notifications:</span>
        {permission === 'granted' && <span className="text-green-400">on</span>}
        {permission === 'denied' && <span className="text-red-400">blocked in browser settings</span>}
        {permission === 'unsupported' && <span>not supported here</span>}
        {permission === 'default' && (
          <button onClick={requestNotifications} className={smallButton}>Enable</button>
        )}
        {server && (
          <>
            <span className="text-gray-700">|</span>
            <span>
              Phone push:{' '}
              {engine?.channel === 'ntfy' ? <span className="text-green-400">on (ntfy)</span> : <span>off</span>}
            </span>
            {engine?.channel === 'ntfy' && (
              <button
                disabled={busy === 'test'}
                onClick={() => run('test', sendTest, (r) => (r.ok ? 'Test notification sent' : `Test failed: ${r.body?.error || 'unknown error'}`))}
                className={smallButton}
              >
                Send test
              </button>
            )}
            {engine?.channelError && <span style={{ color: '#ff1744' }}>{engine.channelError}</span>}
            {engine?.channel !== 'ntfy' && !engine?.channelError && (
              <span>To get alerts on your phone with this page closed, set NTFY_TOPIC in .env (see the README).</span>
            )}
          </>
        )}
        {note && <span role="status" className="text-gray-300">{note}</span>}
      </div>

      {recent.length > 0 && (
        <div className="px-4 py-2" style={{ ...rule, backgroundColor: 'rgba(255, 214, 0, 0.06)' }}>
          <h3 className="text-[10px] text-yellow-400 uppercase tracking-wider mb-1">Triggered this session</h3>
          {recent.map((r, i) => (
            <p key={`${r.id}-${r.at}-${i}`} className="text-xs text-gray-300">
              <span className="font-medium">{r.symbol}</span> {describeAlert(r).toLowerCase()} — last price {fmtPrice(r.price)} at {fmtTime(r.at)}
            </p>
          ))}
        </div>
      )}

      <section className="py-2">
        <h3 className="px-4 py-1 text-[11px] text-gray-500 uppercase tracking-wider">Your alerts ({alerts.length})</h3>
        {alerts.length === 0 && mode !== 'checking' && (
          <p className="px-4 py-3 text-xs text-gray-600">No alerts yet. Pick a stock, a condition and a price above.</p>
        )}
        {alerts.map((a) => {
          const style = STATUS_STYLE[a.status];
          const live = priceOf(a.symbol);
          return (
            <div key={a.id} className="grid grid-cols-[6rem_1fr_6rem_auto] items-center gap-3 px-4 py-2" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}>
              <div>
                <div className="text-xs font-medium text-gray-200">{a.symbol}</div>
                <div className="text-[10px] font-mono text-gray-500" title={Number.isFinite(live) ? 'Latest quote' : 'Last price the server saw'}>
                  {fmtPrice(Number.isFinite(live) ? live : server ? a.lastPrice : undefined)}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-xs text-gray-300">{describeAlert(a)}</div>
                {a.triggeredAt && (
                  <div className="text-[10px] text-gray-500">
                    Last triggered {fmtTime(a.triggeredAt)} at {fmtPrice(a.triggeredPrice)}
                    {a.triggerCount > 1 ? ` (${a.triggerCount} times)` : ''}
                  </div>
                )}
              </div>
              <span className="text-[10px] font-medium" style={{ color: style.color }}>{style.label}</span>
              <div className="flex">
                {a.status === 'active' && <IconButton label="Pause alert" onClick={() => pause(a.id)}><Pause size={13} /></IconButton>}
                {a.status === 'paused' && <IconButton label="Resume alert" onClick={() => activate(a.id)}><Play size={13} /></IconButton>}
                {a.status === 'triggered' && <IconButton label="Re-arm alert" onClick={() => activate(a.id)}><RotateCcw size={13} /></IconButton>}
                <IconButton label="Delete alert" onClick={() => removeAlert(a.id)}><Trash2 size={13} /></IconButton>
              </div>
            </div>
          );
        })}
      </section>

      {server && events.length > 0 && (
        <section className="py-2" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.3)' }}>
          <h3 className="px-4 py-1 text-[11px] text-gray-500 uppercase tracking-wider">History ({events.length})</h3>
          {events.slice(0, 30).map((ev) => (
            <p key={ev.id} className="px-4 py-1 text-xs text-gray-400">
              <span className="text-gray-500">{fmtTime(ev.at)}</span> · {eventLine(ev)} · <span className="text-gray-500">{deliveryLabel(ev.delivery)}</span>
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
