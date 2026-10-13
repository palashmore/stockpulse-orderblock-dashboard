import { useCallback, useEffect, useState } from 'react';
import {
  KeyRound,
  ShieldCheck,
  Sliders,
  ExternalLink,
  Lock,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Palette,
  Wifi,
  WifiOff,
  Database,
  RefreshCw,
  Terminal,
  Zap,
  Globe,
  Server,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { fetchAuthStatus, submitBrokerSession, disconnectBroker } from '../services/api';
import { STATUS_META } from '../data/dataStatus';
import { TIMEFRAMES } from '../data/timeframes';
import { loadSettings, saveSettings, START_TABS, THEME_PREFS } from '../data/settings';
import { useTheme, THEME_LABELS } from '../hooks/useTheme';
import { NAV_ITEMS } from './Sidebar';

const BREEZE_PORTAL_HOME = 'https://api.icicidirect.com/apiuser/home';

export default function SettingsPanel({ demoMode, headlineStatus, onConnectionChange }) {
  const [auth, setAuth] = useState(undefined); // undefined = loading, null = server unreachable
  const [pasted, setPasted] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState(() => loadSettings(window.localStorage));
  const [prefsSaved, setPrefsSaved] = useState(true);
  const { pref: themePref, setPref: setThemePref } = useTheme();

  const updatePrefs = (patch) => {
    const next = { ...loadSettings(window.localStorage), ...patch };
    setPrefs(next);
    setPrefsSaved(saveSettings(next, window.localStorage));
  };

  const refresh = useCallback(async () => {
    setAuth(await fetchAuthStatus());
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchAuthStatus().then((status) => {
      if (!cancelled) setAuth(status);
    });
    return () => {
      cancelled = true;
    };
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

  const cardStyle = {
    backgroundColor: 'rgba(17, 24, 39, 0.6)',
    border: '1px solid rgba(30, 45, 61, 0.6)',
  };

  const innerCardStyle = {
    backgroundColor: '#0d1117',
    border: '1px solid rgba(30, 45, 61, 0.5)',
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-6" style={{ backgroundColor: '#0a0e17' }}>
      {/* Hero Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.6)' }}>
        <div>
          <div className="flex items-center gap-2">
            <Sliders size={18} style={{ color: '#00e676' }} />
            <h1 className="text-base font-bold text-white tracking-wide uppercase">
              Terminal Settings & System Gateway
            </h1>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            Broker data feeds, execution preferences, appearance themes and local storage security
          </p>
        </div>

        {/* Telemetry Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {demoMode && (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono font-medium"
              style={{ backgroundColor: 'rgba(255, 145, 0, 0.12)', border: '1px solid rgba(255, 145, 0, 0.3)', color: '#ff9100' }}
            >
              <Zap size={12} />
              SIMULATED (?demo=1)
            </span>
          )}

          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono font-medium"
            style={{
              backgroundColor: auth?.connected ? 'rgba(0, 230, 118, 0.12)' : 'rgba(30, 45, 61, 0.5)',
              border: `1px solid ${auth?.connected ? 'rgba(0, 230, 118, 0.3)' : 'rgba(30, 45, 61, 0.6)'}`,
              color: auth?.connected ? '#00e676' : '#94a3b8',
            }}
          >
            {auth?.connected ? <Wifi size={12} /> : <WifiOff size={12} />}
            {auth?.connected ? 'ICICI BREEZE LIVE' : 'DELAYED FALLBACK'}
          </span>

          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono font-medium"
            style={{
              backgroundColor: 'rgba(0, 229, 255, 0.1)',
              border: '1px solid rgba(0, 229, 255, 0.25)',
              color: '#00e5ff',
            }}
          >
            <ShieldCheck size={12} />
            READ-ONLY GATEWAY
          </span>
        </div>
      </div>

      {/* Main Grid: 2 Columns on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-7xl">
        {/* CARD 1: Broker Gateway Feed (ICICI Direct Breeze API) */}
        <section className="rounded-xl p-5 flex flex-col justify-between" style={cardStyle}>
          <div>
            <div className="flex items-center justify-between pb-3 mb-4" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.5)' }}>
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: 'rgba(0, 230, 118, 0.1)', border: '1px solid rgba(0, 230, 118, 0.25)' }}
                >
                  <KeyRound size={16} style={{ color: '#00e676' }} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-200">ICICI Direct Breeze Gateway</h2>
                  <p className="text-[11px] text-gray-500">Live tick streaming & institutional portfolio feed</p>
                </div>
              </div>

              {auth && !auth.remote && (
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold"
                  style={{
                    backgroundColor: auth.connected ? 'rgba(0, 230, 118, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                    border: `1px solid ${auth.connected ? 'rgba(0, 230, 118, 0.3)' : 'rgba(100, 116, 139, 0.3)'}`,
                    color: auth.connected ? '#00e676' : '#64748b',
                  }}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${auth.connected ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
                  {auth.connected ? 'AUTHENTICATED' : 'NOT SIGNED IN'}
                </span>
              )}
            </div>

            {/* State: Checking */}
            {auth === undefined && (
              <div className="flex items-center gap-3 py-6 text-xs text-gray-400">
                <RefreshCw size={16} className="animate-spin text-gray-500" />
                <span>Checking gateway connectivity with ICICI Direct…</span>
              </div>
            )}

            {/* State: Unreachable Server */}
            {auth === null && (
              <div className="rounded-lg p-3 text-xs space-y-1" style={{ backgroundColor: 'rgba(255, 23, 68, 0.08)', border: '1px solid rgba(255, 23, 68, 0.25)', color: '#ff1744' }}>
                <div className="flex items-center gap-2 font-medium">
                  <AlertCircle size={14} />
                  <span>StockPulse local server unreachable</span>
                </div>
                <p className="text-gray-400 text-[11px]">
                  Ensure the backend node process is running locally on port 3001 (<code className="text-gray-300">npm run dev:all</code>).
                </p>
              </div>
            )}

            {/* State: Remote Host */}
            {auth?.remote && (
              <div className="rounded-lg p-4 text-xs text-gray-400 space-y-2.5" style={innerCardStyle}>
                <div className="flex items-center gap-2" style={{ color: '#ffd600' }}>
                  <Globe size={14} />
                  <span className="font-medium">Hosted Instance Detected</span>
                </div>
                <p className="leading-relaxed">
                  Broker sign-in is restricted to your own machine for credential isolation. Run StockPulse locally via{' '}
                  <code className="px-1 py-0.5 rounded text-gray-200" style={{ backgroundColor: '#151d2b' }}>npm start</code> and visit{' '}
                  <code className="px-1 py-0.5 rounded text-gray-200" style={{ backgroundColor: '#151d2b' }}>http://localhost:3001</code>.
                </p>
                <p className="text-[11px] text-gray-500">
                  Without local sign-in, all terminal charts operate cleanly on delayed Yahoo Finance feeds.
                </p>
              </div>
            )}

            {/* State: Not Configured (.env missing keys) */}
            {auth && !auth.remote && !auth.configured && (
              <div className="rounded-lg p-4 text-xs text-gray-400 space-y-3" style={innerCardStyle}>
                <div className="flex items-center gap-2 text-gray-200 font-medium">
                  <Terminal size={14} style={{ color: '#00e5ff' }} />
                  <span>API Keys Not Configured</span>
                </div>
                {auth.hosted && (
                  <p className="text-[11px]" style={{ color: '#ffd600' }}>
                    Hosted instance: Add <code className="text-gray-300">BREEZE_API_KEY</code> and <code className="text-gray-300">BREEZE_API_SECRET</code> in your Vercel Environment Variables and redeploy.
                  </p>
                )}
                <ol className="list-decimal ml-5 space-y-1.5 text-gray-400 text-[11px]">
                  <li>
                    Register an app on the Breeze API portal (<a href={BREEZE_PORTAL_HOME} target="_blank" rel="noreferrer" className="underline hover:text-cyan-400" style={{ color: '#00e5ff' }}>api.icicidirect.com</a>) with redirect URL <code className="text-gray-300">https://127.0.0.1</code>.
                  </li>
                  <li>
                    Copy <code className="text-gray-300">.env.example</code> to <code className="text-gray-300">.env</code> in the project root and populate your <code className="text-gray-300">BREEZE_API_KEY</code> and <code className="text-gray-300">BREEZE_API_SECRET</code>.
                  </li>
                  <li>
                    Restart the terminal server (<code className="text-gray-300">npm run dev:all</code>) and return to this page.
                  </li>
                </ol>
              </div>
            )}

            {/* State: Configured but Not Connected */}
            {auth && !auth.remote && auth.configured && !auth.connected && (
              <div className="space-y-4 text-xs text-gray-400">
                <div className="rounded-lg p-3 space-y-2" style={innerCardStyle}>
                  <p className="text-[11px] leading-relaxed text-gray-300">
                    Sign in once each trading morning. The session token is generated directly on ICICI Direct&apos;s portal and expires at midnight IST. Your password is never seen by StockPulse.
                  </p>

                  <div className="space-y-2 pt-1 text-[11px]">
                    <div className="flex items-start gap-2">
                      <span className="flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold text-gray-200" style={{ backgroundColor: '#1e2d3d' }}>1</span>
                      <div>
                        <a
                          href={auth.loginUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 font-medium underline hover:text-cyan-300"
                          style={{ color: '#00e5ff' }}
                        >
                          Open ICICI Direct Sign-In Portal
                          <ExternalLink size={12} />
                        </a>
                        <p className="text-gray-500 text-[10px] mt-0.5">
                          Authenticate with your ICICI Direct trading credentials on their secure domain.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <span className="flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold text-gray-200" style={{ backgroundColor: '#1e2d3d' }}>2</span>
                      <p className="text-gray-400">
                        After login, copy the redirected URL from your browser address bar starting with <code className="text-gray-300">https://127.0.0.1/?apisession=…</code>
                      </p>
                    </div>

                    <div className="flex items-start gap-2">
                      <span className="flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold text-gray-200" style={{ backgroundColor: '#1e2d3d' }}>3</span>
                      <p className="text-gray-400">
                        Paste the address into the authorization box below:
                      </p>
                    </div>
                  </div>
                </div>

                {/* Form */}
                <form onSubmit={connect} className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      value={pasted}
                      onChange={(e) => {
                        setPasted(e.target.value);
                        setMessage('');
                      }}
                      placeholder="https://127.0.0.1/?apisession=…"
                      aria-label="Redirect address after sign-in"
                      className="flex-1 px-3 py-2 text-xs font-mono rounded-lg text-gray-200 border border-gray-700 focus:border-green-500 outline-none transition-colors"
                      style={{ backgroundColor: '#0d1117' }}
                    />
                    <button
                      type="submit"
                      disabled={busy || !pasted.trim()}
                      className="px-4 py-2 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: 'rgba(0, 230, 118, 0.15)',
                        border: '1px solid rgba(0, 230, 118, 0.3)',
                        color: '#00e676',
                      }}
                    >
                      {busy ? (
                        <>
                          <RefreshCw size={12} className="animate-spin" />
                          <span>Connecting…</span>
                        </>
                      ) : (
                        <>
                          <ArrowRight size={12} />
                          <span>Connect</span>
                        </>
                      )}
                    </button>
                  </div>

                  {message && (
                    <div
                      role="alert"
                      className="flex items-center gap-2 p-2 rounded text-xs font-medium"
                      style={{ backgroundColor: 'rgba(255, 23, 68, 0.1)', border: '1px solid rgba(255, 23, 68, 0.25)', color: '#ff1744' }}
                    >
                      <AlertCircle size={14} />
                      <span>{message}</span>
                    </div>
                  )}
                </form>
              </div>
            )}

            {/* State: Connected */}
            {auth && !auth.remote && auth.connected && (
              <div className="space-y-4">
                <div
                  className="rounded-lg p-4 space-y-2"
                  style={{
                    backgroundColor: 'rgba(0, 230, 118, 0.05)',
                    border: '1px solid rgba(0, 230, 118, 0.25)',
                  }}
                >
                  <div className="flex items-center gap-2" style={{ color: '#00e676' }}>
                    <CheckCircle2 size={16} />
                    <span className="text-xs font-bold uppercase tracking-wider">Gateway Active & Synchronized</span>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed">
                    Connected{auth.connectedAt ? ` at ${new Date(auth.connectedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} IST` : ''}.
                    Real-time market ticks, historical 1m/5m candles and order books are actively streamed via Breeze API.
                  </p>
                </div>

                <button
                  onClick={disconnect}
                  className="px-3.5 py-1.5 text-xs font-medium rounded-lg text-gray-300 transition-colors cursor-pointer"
                  style={{ backgroundColor: 'rgba(255, 23, 68, 0.1)', border: '1px solid rgba(255, 23, 68, 0.25)', color: '#ff1744' }}
                >
                  Sign Out of Broker Feed
                </button>
              </div>
            )}
          </div>

          {/* Footer note */}
          <div className="pt-3 mt-4 flex items-center justify-between text-[11px] text-gray-500" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.5)' }}>
            <span>Portal Management:</span>
            <a
              href={BREEZE_PORTAL_HOME}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-cyan-400 transition-colors"
              style={{ color: '#00e5ff' }}
            >
              Breeze Developer Console
              <ExternalLink size={10} />
            </a>
          </div>
        </section>

        {/* CARD 2: Terminal Preferences & Defaults */}
        <section className="rounded-xl p-5 flex flex-col justify-between" style={cardStyle}>
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 pb-3" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.5)' }}>
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'rgba(33, 150, 243, 0.1)', border: '1px solid rgba(33, 150, 243, 0.25)' }}
              >
                <Sliders size={16} style={{ color: '#2196f3' }} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-gray-200">Terminal & Execution Defaults</h2>
                <p className="text-[11px] text-gray-500">Workspace launch behavior & analysis parameters</p>
              </div>
            </div>

            <div className="space-y-3.5">
              {/* Default Timeframe */}
              <div className="flex items-center justify-between gap-4 p-3 rounded-lg" style={innerCardStyle}>
                <div>
                  <div className="text-xs font-medium text-gray-200">Default Chart Timeframe</div>
                  <div className="text-[11px] text-gray-500">Initial resolution for single and multi-charts</div>
                </div>
                <select
                  value={prefs.defaultTimeframe}
                  onChange={(e) => updatePrefs({ defaultTimeframe: e.target.value })}
                  className="px-2.5 py-1.5 text-xs font-mono font-medium rounded text-gray-200 border border-gray-700 outline-none cursor-pointer"
                  style={{ backgroundColor: '#151d2b' }}
                >
                  {TIMEFRAMES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.id} ({t.label})
                    </option>
                  ))}
                </select>
              </div>

              {/* Startup Screen */}
              <div className="flex items-center justify-between gap-4 p-3 rounded-lg" style={innerCardStyle}>
                <div>
                  <div className="text-xs font-medium text-gray-200">Launch Screen</div>
                  <div className="text-[11px] text-gray-500">Module displayed when StockPulse opens</div>
                </div>
                <select
                  value={prefs.startTab}
                  onChange={(e) => updatePrefs({ startTab: e.target.value })}
                  className="px-2.5 py-1.5 text-xs font-medium rounded text-gray-200 border border-gray-700 outline-none cursor-pointer"
                  style={{ backgroundColor: '#151d2b' }}
                >
                  {START_TABS.map((tabId) => {
                    const nav = NAV_ITEMS.find((n) => n.id === tabId);
                    return (
                      <option key={tabId} value={tabId}>
                        {nav ? nav.label : tabId}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Privacy Mask Toggle */}
              <div className="flex items-center justify-between gap-4 p-3 rounded-lg" style={innerCardStyle}>
                <div>
                  <div className="text-xs font-medium text-gray-200">Privacy Mask (Portfolio Figures)</div>
                  <div className="text-[11px] text-gray-500">Hides rupee values & share counts on display</div>
                </div>
                <button
                  type="button"
                  onClick={() => updatePrefs({ hideAmounts: !prefs.hideAmounts })}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                  style={{
                    backgroundColor: prefs.hideAmounts ? 'rgba(0, 230, 118, 0.12)' : 'rgba(100, 116, 139, 0.15)',
                    border: `1px solid ${prefs.hideAmounts ? 'rgba(0, 230, 118, 0.3)' : 'rgba(100, 116, 139, 0.3)'}`,
                    color: prefs.hideAmounts ? '#00e676' : '#94a3b8',
                  }}
                >
                  {prefs.hideAmounts ? <EyeOff size={14} /> : <Eye size={14} />}
                  <span>{prefs.hideAmounts ? 'Masked' : 'Visible'}</span>
                </button>
              </div>

              {/* Theme Selector */}
              <div className="p-3 rounded-lg space-y-2" style={innerCardStyle}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-gray-200">Interface Color Theme</div>
                    <div className="text-[11px] text-gray-500">Dark institutional trading terminal or crisp day palette</div>
                  </div>
                  <Palette size={14} className="text-gray-400" />
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {THEME_PREFS.map((mode) => {
                    const isSelected = themePref === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setThemePref(mode)}
                        className={`px-3 py-2 rounded-lg text-xs font-medium text-center transition-all cursor-pointer ${
                          isSelected
                            ? 'text-green-400 font-bold'
                            : 'text-gray-400 hover:text-gray-200'
                        }`}
                        style={{
                          backgroundColor: isSelected ? 'rgba(0, 230, 118, 0.12)' : 'rgba(30, 45, 61, 0.35)',
                          border: `1px solid ${isSelected ? '#00e676' : 'rgba(30, 45, 61, 0.6)'}`,
                        }}
                      >
                        {THEME_LABELS[mode] || mode}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Storage notice */}
          <div className="pt-3 mt-4 text-[11px] text-gray-500" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.5)' }}>
            Preferences persist in local browser storage (<code className="text-gray-400">stockpulse.settings.v1</code>).
            {!prefsSaved && <span style={{ color: '#ff1744' }}> Could not save: browser storage is restricted.</span>}
          </div>
        </section>

        {/* CARD 3: Feed Architecture & Data Contract */}
        <section className="rounded-xl p-5 flex flex-col justify-between" style={cardStyle}>
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 pb-3" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.5)' }}>
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'rgba(0, 229, 255, 0.1)', border: '1px solid rgba(0, 229, 255, 0.25)' }}
              >
                <Server size={16} style={{ color: '#00e5ff' }} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-gray-200">Execution Feed Architecture</h2>
                <p className="text-[11px] text-gray-500">Exchange connectivity & data pipeline specifications</p>
              </div>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded" style={innerCardStyle}>
                <span className="text-gray-400">Current Feed Status</span>
                <span className="font-mono font-medium" style={{ color: statusMeta ? statusMeta.color : '#64748b' }}>
                  {statusMeta ? statusMeta.label : 'INITIALIZING'}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded" style={innerCardStyle}>
                <span className="text-gray-400">Primary Provider</span>
                <span className="text-gray-200 font-mono">ICICI Direct (Breeze API REST + WS)</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded" style={innerCardStyle}>
                <span className="text-gray-400">Fallback Provider</span>
                <span className="text-gray-200 font-mono">Yahoo Finance (Delayed OHLCV)</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded" style={innerCardStyle}>
                <span className="text-gray-400">Option Chain Engine</span>
                <span className="text-gray-200 font-mono">NSE Live OI / Max Pain / PCR Model</span>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-gray-500 mt-4 pt-3" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.5)' }}>
            Each dashboard screen explicitly reports its source and freshness badge in its top metadata strip.
          </p>
        </section>

        {/* CARD 4: Security & Zero-Database Architecture */}
        <section className="rounded-xl p-5 flex flex-col justify-between" style={cardStyle}>
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 pb-3" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.5)' }}>
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'rgba(0, 230, 118, 0.1)', border: '1px solid rgba(0, 230, 118, 0.25)' }}
              >
                <ShieldCheck size={16} style={{ color: '#00e676' }} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-gray-200">Security & Zero-Database Policy</h2>
                <p className="text-[11px] text-gray-500">Stateless telemetry & credential isolation guarantee</p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-gray-400">
              <div className="flex items-start gap-2.5">
                <Database size={14} className="text-green-400 flex-shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong className="text-gray-200 font-medium">Zero Database Architecture: </strong>
                  StockPulse does not store historical prices, financial credentials, or logs in SQL/NoSQL databases. All data uses in-memory TTL caching.
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <Lock size={14} className="text-cyan-400 flex-shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong className="text-gray-200 font-medium">Read-Only Safety: </strong>
                  The connection carries strictly read-only market intelligence privileges. The application cannot execute buy/sell orders or initiate capital movement.
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <ShieldCheck size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong className="text-gray-200 font-medium">Credential Containment: </strong>
                  Your Breeze API Secret stays strictly on your local machine in the <code className="text-gray-300">.env</code> file and is never transmitted to client browsers.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-3 mt-4 text-[11px] text-gray-500" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.5)' }}>
            Compliance: Follows SEBI and ICICI Securities API guidelines for research terminals.
          </div>
        </section>
      </div>
    </div>
  );
}
