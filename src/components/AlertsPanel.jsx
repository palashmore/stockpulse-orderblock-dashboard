import { useState } from 'react';
import { Trash2, Pause, Play, RotateCcw } from 'lucide-react';
import { describeAlert } from '../data/alerts';
import { NIFTY_STOCKS } from '../data/stockData';
import { STATUS_META } from '../data/dataStatus';

const STATUS_STYLE = {
  active: { label: 'ACTIVE', color: '#00e676' },
  paused: { label: 'PAUSED', color: '#64748b' },
  triggered: { label: 'TRIGGERED', color: '#ffd600' },
};

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

export default function AlertsPanel({ nifty, alertsApi, selectedStock, demoMode }) {
  const { alerts, recent, evaluating, saveFailed, permission, addAlert, removeAlert, pause, activate, requestNotifications } = alertsApi;
  const [symbol, setSymbol] = useState(selectedStock?.symbol || NIFTY_STOCKS[0].symbol);
  const [type, setType] = useState('above');
  const [threshold, setThreshold] = useState('');
  const [error, setError] = useState('');

  const priceOf = (sym) => nifty.quotes.find((q) => q.symbol === sym)?.price;
  const currentPrice = priceOf(symbol);
  const statusMeta = STATUS_META[nifty.status];

  const submit = (e) => {
    e.preventDefault();
    const result = addAlert({ symbol, type, threshold: Number(threshold) });
    if (result.error) {
      setError(result.error);
      return;
    }
    setError('');
    setThreshold('');
  };

  const inputClass = 'px-2 py-1.5 text-xs rounded bg-transparent text-gray-200 border border-gray-700 focus:border-green-500 outline-none';

  return (
    <div className="flex-1 min-h-0 overflow-y-auto" style={{ backgroundColor: '#0a0e17' }}>
      <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Price Alerts · Nifty 50</h2>
        <span className="text-[10px]" style={{ color: evaluating ? '#00e676' : '#ffd600' }}>
          {evaluating ? 'CHECKING ON EACH REFRESH' : 'NOT CHECKING'}
        </span>
      </div>

      <div className="px-4 py-3 text-[11px] text-gray-500 space-y-1" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <p>
          Alerts are checked each time Nifty 50 quotes refresh (about once a minute) while this tab is open.
          Nothing runs when the app is closed, so a move can be noticed late.
        </p>
        <p>Prices come from an unofficial, delayed feed. An alert fires once when the price crosses the level; re-arm it to use it again.</p>
        {!evaluating && (
          <p style={{ color: '#ffd600' }}>
            Alerts are paused because the quote data is {statusMeta ? statusMeta.label : 'unavailable'}
            {demoMode ? ' (simulated data is never checked)' : ' (only LIVE or DELAYED data is checked, so nothing fires while the market is closed)'}.
          </p>
        )}
        {saveFailed && <p style={{ color: '#ff1744' }}>Could not save alerts in this browser; they will be lost on reload.</p>}
      </div>

      <form onSubmit={submit} className="flex flex-wrap items-end gap-3 px-4 py-3" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <label className="flex flex-col gap-1 text-[10px] text-gray-500 uppercase tracking-wider">
          Stock
          <select value={symbol} onChange={(e) => { setSymbol(e.target.value); setError(''); }} className={inputClass} style={{ backgroundColor: '#0d1117' }}>
            {NIFTY_STOCKS.map((s) => <option key={s.symbol} value={s.symbol}>{s.symbol}</option>)}
          </select>
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
        <button type="submit" className="px-3 py-1.5 text-xs rounded cursor-pointer bg-green-500/15 text-green-400 hover:bg-green-500/25">
          Add alert
        </button>
        <span className="text-[11px] text-gray-500">Now: {fmtPrice(currentPrice)}</span>
        {error && <span role="alert" className="text-[11px] w-full" style={{ color: '#ff1744' }}>{error}</span>}
      </form>

      <div className="flex items-center gap-3 px-4 py-2 text-[11px] text-gray-500" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
        <span>Browser notifications:</span>
        {permission === 'granted' && <span className="text-green-400">on</span>}
        {permission === 'denied' && <span className="text-red-400">blocked in browser settings</span>}
        {permission === 'unsupported' && <span>not supported here</span>}
        {permission === 'default' && (
          <button onClick={requestNotifications} className="px-2 py-1 rounded cursor-pointer bg-white/5 text-gray-300 hover:bg-white/10">
            Enable
          </button>
        )}
      </div>

      {recent.length > 0 && (
        <div className="px-4 py-2" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)', backgroundColor: 'rgba(255, 214, 0, 0.06)' }}>
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
        {alerts.length === 0 && (
          <p className="px-4 py-3 text-xs text-gray-600">No alerts yet. Pick a stock, a condition and a price above.</p>
        )}
        {alerts.map((a) => {
          const style = STATUS_STYLE[a.status];
          return (
            <div key={a.id} className="grid grid-cols-[6rem_1fr_6rem_auto] items-center gap-3 px-4 py-2" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}>
              <div>
                <div className="text-xs font-medium text-gray-200">{a.symbol}</div>
                <div className="text-[10px] font-mono text-gray-500">{fmtPrice(priceOf(a.symbol))}</div>
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
    </div>
  );
}
