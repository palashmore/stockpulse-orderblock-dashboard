import { useCallback, useEffect, useState } from 'react';
import { fetchAuthStatus, submitBrokerSession, disconnectBroker } from '../services/api';
import { STATUS_META } from '../data/dataStatus';
import { TIMEFRAMES } from '../data/timeframes';
import { loadSettings, saveSettings, START_TABS, THEME_PREFS } from '../data/settings';
import { useTheme, THEME_LABELS } from '../hooks/useTheme';

const BREEZE_PORTAL_HOME = 'https://api.icicidirect.com/apiuser/home';

// Data source settings: sign in to the broker feed for the day. Your broker password is typed only
// on ICICI Direct's own page; this app and the server never see it.
export default function SettingsPanel({ demoMode, headlineStatus, onConnectionChange }) {
  const [auth, setAuth] = useState(undefined); // undefined = loading, null = server unreachable
  const [pasted, setPasted] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState(() => loadSettings(window.localStorage));
  const [prefsSaved, setPrefsSaved] = useState(true);
  const { pref: themePref, setPref: setThemePref } = useTheme();

  const updatePrefs = (patch) => {
    // Merge into what is stored now, so a change made elsewhere (the day/night button) is not overwritten
    const next = { ...loadSettings(window.localStorage), ...patch };
    setPrefs(next);
    setPrefsSaved(saveSettings(next, window.localStorage));
  };

  const refresh = useCallback(async () => {
    setAuth(await fetchAuthStatus());
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchAuthStatus().then((status) => { if (!cancelled) setAuth(status); });
    return () => { cancelled = true; };
  }, []);

  const connect = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    const result = await submitBrokerSession(pasted);
    setBusy(false);
    if (result.connected) {
      setPasted('');
      await refresh();
      onConnectionChange();
    } else {
      setMessage(result.error || 'Sign-in failed');
    }
  };

  const disconnect = async () => {
    await disconnectBroker();
    await refresh();
    onConnectionChange();
  };

  const statusMeta = STATUS_META[headlineStatus];
  const card = { border: '1px solid rgba(30, 45, 61, 0.5)', backgroundColor: 'rgba(17, 24, 39, 0.5)' };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4" style={{ backgroundColor: '#0a0e17' }}>
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Settings · Data source</h2>

      {demoMode && (
        <p className="text-xs mb-3" style={{ color: '#ff9100' }}>Simulated data is on (?demo=1). Broker data is not used in this mode.</p>
      )}

      <section className="rounded-md px-4 py-3 max-w-2xl" style={card}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-200">ICICI Direct (Breeze API)</h3>
          {auth && (
            <span className="text-[10px] font-medium" style={{ color: auth.connected ? '#00e676' : '#64748b' }}>
              {auth.connected ? 'SIGNED IN' : 'NOT SIGNED IN'}
            </span>
          )}
        </div>

        {auth === undefined && <p className="text-xs text-gray-500">Checking…</p>}
        {auth === null && (
          <p className="text-xs" style={{ color: '#ff1744' }}>The StockPulse server is not reachable, or this page is not running on the same machine as the server.</p>
        )}

        {auth && !auth.configured && (
          <div className="text-xs text-gray-400 space-y-2">
            <p>No API key is set up yet. To use your ICICI Direct account as the data source:</p>
            <ol className="list-decimal ml-5 space-y-1">
              <li>Register an app on the Breeze API portal (api.icicidirect.com) with redirect URL <code className="text-gray-300">https://127.0.0.1</code>.</li>
              <li>Copy <code className="text-gray-300">.env.example</code> to <code className="text-gray-300">.env</code> and fill in <code className="text-gray-300">BREEZE_API_KEY</code> and <code className="text-gray-300">BREEZE_API_SECRET</code>.</li>
              <li>Restart the server (<code className="text-gray-300">npm run dev:all</code>), then come back here.</li>
            </ol>
          </div>
        )}

        {auth && auth.configured && !auth.connected && (
          <div className="text-xs text-gray-400 space-y-3">
            <p>Signing in is optional. Without it every screen works with delayed Yahoo Finance data, labelled as such. Signing in adds ICICI Direct quotes for supported stocks, your portfolio and order books. Sign in once each day; the session expires overnight.</p>
            <ol className="list-decimal ml-5 space-y-1">
              <li>
                <a href={auth.loginUrl} target="_blank" rel="noreferrer" className="underline" style={{ color: '#00e5ff' }}>Open the ICICI Direct sign-in page</a>{' '}
                and log in there. Your password goes only to ICICI. This link carries your app key, which is what produces the <code className="text-gray-300">apisession</code> value; the portal home page alone does not.
              </li>
              <li>After signing in, the browser lands on an address starting with <code className="text-gray-300">https://127.0.0.1/?apisession=…</code> (the page itself will not load). Copy that whole address.</li>
              <li>Paste it below.</li>
            </ol>
            <form onSubmit={connect} className="flex gap-2">
              <input
                value={pasted}
                onChange={(e) => { setPasted(e.target.value); setMessage(''); }}
                placeholder="https://127.0.0.1/?apisession=…"
                aria-label="Redirect address after sign-in"
                className="flex-1 px-2 py-1.5 text-xs rounded bg-transparent text-gray-200 border border-gray-700 focus:border-green-500 outline-none"
              />
              <button type="submit" disabled={busy || !pasted.trim()} className="px-3 py-1.5 text-xs rounded bg-green-500/15 text-green-400 enabled:hover:bg-green-500/25 enabled:cursor-pointer disabled:opacity-40">
                {busy ? 'Connecting…' : 'Connect'}
              </button>
            </form>
            {message && <p role="alert" style={{ color: '#ff1744' }}>{message}</p>}
            <p className="text-gray-500">
              Need to check your app, key or Primary IP?{' '}
              <a href={BREEZE_PORTAL_HOME} target="_blank" rel="noreferrer" className="underline" style={{ color: '#00e5ff' }}>Open the Breeze API portal home</a>.
              ICICI&apos;s sign-in page asks for a static IP for API use; the Primary IP on your app should be the public IP of the computer running this server.
            </p>
          </div>
        )}

        {auth && auth.connected && (
          <div className="text-xs text-gray-400 space-y-2">
            <p>
              Signed in{auth.connectedAt ? ` at ${new Date(auth.connectedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}.
              Quotes and 1m / 5m / 30m / daily charts for mapped Nifty 50 stocks come from ICICI Direct; everything else uses Yahoo (delayed). Each screen shows its own data status.
            </p>
            <button onClick={disconnect} className="px-3 py-1.5 text-xs rounded bg-white/5 text-gray-300 hover:bg-white/10 cursor-pointer">Sign out of broker feed</button>
          </div>
        )}
      </section>

      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-6 mb-3">Settings · Preferences</h2>
      <section className="rounded-md px-4 py-3 max-w-2xl space-y-3" style={card}>
        <label className="flex items-center justify-between gap-4 text-xs text-gray-300">
          Default chart timeframe
          <select value={prefs.defaultTimeframe} onChange={(e) => updatePrefs({ defaultTimeframe: e.target.value })} className="px-2 py-1 rounded text-gray-200 border border-gray-700 outline-none" style={{ backgroundColor: '#0d1117' }}>
            {TIMEFRAMES.map((t) => <option key={t.id} value={t.id}>{t.id}</option>)}
          </select>
        </label>
        <label className="flex items-center justify-between gap-4 text-xs text-gray-300">
          Colour theme
          <select value={themePref} onChange={(e) => setThemePref(e.target.value)} className="px-2 py-1 rounded text-gray-200 border border-gray-700 outline-none" style={{ backgroundColor: '#0d1117' }}>
            {THEME_PREFS.map((t) => <option key={t} value={t}>{THEME_LABELS[t]}</option>)}
          </select>
        </label>
        <label className="flex items-center justify-between gap-4 text-xs text-gray-300">
          Open on this screen
          <select value={prefs.startTab} onChange={(e) => updatePrefs({ startTab: e.target.value })} className="px-2 py-1 rounded text-gray-200 border border-gray-700 outline-none" style={{ backgroundColor: '#0d1117' }}>
            {START_TABS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <p className="text-[11px] text-gray-500">
          Saved in this browser only and applied the next time the app opens. Secrets such as your API key are never stored here.
          {!prefsSaved && <span style={{ color: '#ff1744' }}> Could not save: browser storage is blocked.</span>}
        </p>
      </section>

      <p className="text-[11px] text-gray-500 mt-3 max-w-2xl">
        Current feed status on the chart screens:{' '}
        <span style={{ color: statusMeta ? statusMeta.color : '#64748b' }}>{statusMeta ? statusMeta.label : 'none yet'}</span>.
        The feed is read-only market data: this app cannot place orders. Your API secret stays in the local <code>.env</code> file on the server and is never sent to the browser.
      </p>
    </div>
  );
}
