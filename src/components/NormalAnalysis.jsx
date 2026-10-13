import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, Layers, Activity, BarChart2, Shield, Compass, FileText, ChevronRight } from 'lucide-react';
import TradingChart from './TradingChart';
import { fetchHistory } from '../services/api';
import { analyse, observations, relativeToPeers } from '../data/analysis';
import { detectOrderBlocks } from '../data/marketAnalysis';
import { NIFTY_STOCKS } from '../data/stockData';
import { STATUS_META } from '../data/dataStatus';

const GREEN = '#00e676';
const RED = '#ff1744';
const fx = (n, d = 2) => (Number.isFinite(n) ? n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const pctx = (n, d = 2) => (Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(d)}%` : '—');
const tone = (n) => (!Number.isFinite(n) || n === 0 ? '#9ca3af' : n > 0 ? GREEN : RED);
const volume = (v) => (!Number.isFinite(v) ? '—' : v >= 1e7 ? `${(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(2)} L` : v.toLocaleString('en-IN'));

function DossierCard({ title, icon: Icon, children }) {
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
          {Icon && <Icon size={13} className="text-cyan-400" />}
          <h3 className="text-xs font-bold text-gray-200 uppercase tracking-wider">{title}</h3>
        </div>
        <div className="space-y-1">{children}</div>
      </div>
    </section>
  );
}

function StatRow({ label, value, color, badge }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 px-1 rounded hover:bg-white/2" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}>
      <span className="text-[11px] text-gray-400">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-mono font-medium text-right" style={{ color: color || '#e2e8f0' }}>
          {value}
        </span>
        {badge && (
          <span className="text-[9px] px-1 py-0.2 rounded font-semibold uppercase" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', color }}>
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}

export default function NormalAnalysis({ selectedStock, nifty, demoMode }) {
  const symbol = selectedStock.symbol;
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setHistory(await fetchHistory(symbol, '2y', '1d'));
    setLoading(false);
  }, [symbol]);

  useEffect(() => {
    if (demoMode) return;
    load();
  }, [load, demoMode]);

  const candles = useMemo(() => (history?.candles ?? []).filter((c) => !c.partial), [history]);
  const a = useMemo(() => analyse(candles), [candles]);
  const orderBlocks = useMemo(() => detectOrderBlocks(candles), [candles]);
  const notes = useMemo(() => observations(a), [a]);

  const info = NIFTY_STOCKS.find((s) => s.symbol === symbol);
  const peers = useMemo(() => {
    if (!info?.sector) return null;
    const sectorSymbols = NIFTY_STOCKS.filter((s) => s.sector === info.sector).map((s) => s.symbol);
    return relativeToPeers(symbol, nifty.quotes, sectorSymbols);
  }, [symbol, info, nifty.quotes]);
  const market = useMemo(() => {
    const valid = nifty.quotes.filter((q) => Number.isFinite(q.changePct));
    return valid.length ? valid.reduce((s, q) => s + q.changePct, 0) / valid.length : null;
  }, [nifty.quotes]);
  const me = nifty.quotes.find((q) => q.symbol === symbol);

  if (demoMode) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-xs text-gray-500">
        Analysis requires real market data and is deactivated in simulated mode.
      </div>
    );
  }

  const statusMeta = STATUS_META[history?.dataStatus] ?? STATUS_META.UNAVAILABLE;
  const trendColor = (t) => (t === 'up' || t === 'uptrend' ? GREEN : t === 'down' || t === 'downtrend' ? RED : '#9ca3af');

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3" style={{ backgroundColor: '#0a0e17' }}>
      {/* Executive Header Banner */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg"
        style={{ backgroundColor: '#0d1117', border: '1px solid rgba(30, 45, 61, 0.5)' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md flex items-center justify-center font-bold text-xs" style={{ backgroundColor: 'rgba(0, 230, 118, 0.15)', color: '#00e676' }}>
            {symbol.slice(0, 3)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-gray-100">{symbol}</h2>
              {info?.sector && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-gray-400 font-medium">
                  {info.sector}
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500">{selectedStock.name} · NSE India</div>
          </div>
        </div>

        {/* Live quote metrics if available */}
        {me && Number.isFinite(me.price) && (
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-mono font-bold text-gray-100">₹{fx(me.price)}</div>
              <div className="text-xs font-mono font-semibold" style={{ color: tone(me.changePct) }}>
                {pctx(me.changePct)}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <span
            className="text-[10px] px-2.5 py-1 rounded font-medium"
            style={{ color: statusMeta.color, backgroundColor: 'rgba(30, 45, 61, 0.5)' }}
            title={statusMeta.description}
          >
            {statusMeta.label}
          </span>
          {history && (
            <span className="text-[10px] text-gray-500 hidden sm:inline">
              {history.provider} · to {history.asOf}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            aria-label="Refresh"
            className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/5 cursor-pointer"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {!a && !loading && (
        <div className="p-8 text-center text-xs text-gray-500">
          Not enough daily history for {symbol} to analyse (at least 30 completed daily candles required), or the data could not be loaded.
        </div>
      )}
      {loading && !a && <div className="p-8 text-center text-xs text-gray-500">Loading historical candles…</div>}

      {a && (
        <>
          {/* Institutional Chart Container */}
          <div
            className="rounded-lg overflow-hidden flex flex-col"
            style={{ border: '1px solid rgba(30, 45, 61, 0.5)', height: 380, backgroundColor: '#0d1117' }}
          >
            <TradingChart
              candleData={candles}
              orderBlocks={orderBlocks}
              indicators={{ sma20: true, sma50: true, ema200: true, vwap: false, rsi: true }}
              resetKey={symbol}
            />
          </div>

          {/* Key Observations Briefing */}
          <section
            className="rounded-lg p-3.5"
            style={{ border: '1px solid rgba(30, 45, 61, 0.5)', backgroundColor: '#111827' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <FileText size={14} className="text-emerald-400" />
              <h3 className="text-xs font-bold text-gray-200 uppercase tracking-wider">Executive Observations</h3>
            </div>
            <div className="grid sm:grid-cols-2 gap-2 mt-2">
              {notes.map((n, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 p-2 rounded text-xs text-gray-300"
                  style={{ backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(30, 45, 61, 0.3)' }}
                >
                  <ChevronRight size={13} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span>{n}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-gray-500 mt-2.5">
              Observations describe objective historical price action and indicator relationships. They do not constitute financial advice or price targets.
            </p>
          </section>

          {/* Grid of 6 Quantitative Dossier Cards */}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {/* 1. Trend & Structure */}
            <DossierCard title="Trend & Market Structure" icon={Compass}>
              <StatRow label="Daily Trend" value={a.trend.daily ?? '—'} color={trendColor(a.trend.daily)} badge={a.trend.daily} />
              <StatRow label="Weekly Trend" value={a.trend.weekly ?? '—'} color={trendColor(a.trend.weekly)} badge={a.trend.weekly} />
              <StatRow label="Structure State" value={a.trend.structure.state} color={trendColor(a.trend.structure.state)} />
              <StatRow
                label="ADX (14)"
                value={a.indicators.adx ? `${fx(a.indicators.adx.adx, 1)} (+DI ${fx(a.indicators.adx.plusDI, 1)} / −DI ${fx(a.indicators.adx.minusDI, 1)})` : '—'}
                color={a.indicators.adx?.adx >= 25 ? '#00e5ff' : '#9ca3af'}
              />
            </DossierCard>

            {/* 2. Moving Averages */}
            <DossierCard title="Moving Averages (vs Close)" icon={Activity}>
              {a.movingAverages.map((m) => (
                <StatRow
                  key={m.name}
                  label={m.name}
                  value={Number.isFinite(m.value) ? `₹${fx(m.value)}` : '—'}
                  color={Number.isFinite(m.value) ? (m.above ? GREEN : RED) : '#64748b'}
                  badge={Number.isFinite(m.value) ? (m.above ? 'ABOVE' : 'BELOW') : null}
                />
              ))}
              <StatRow label="VWAP (20-day)" value={a.indicators.vwap20 ? `₹${fx(a.indicators.vwap20)}` : '—'} />
            </DossierCard>

            {/* 3. Momentum & Volatility */}
            <DossierCard title="Momentum & Volatility" icon={BarChart2}>
              <StatRow
                label="RSI (14)"
                value={fx(a.indicators.rsi, 1)}
                color={a.indicators.rsi >= 70 ? RED : a.indicators.rsi <= 30 ? GREEN : '#ffd600'}
                badge={a.indicators.rsi >= 70 ? 'OVERBOUGHT' : a.indicators.rsi <= 30 ? 'OVERSOLD' : 'NEUTRAL'}
              />
              <StatRow
                label="MACD / Signal"
                value={a.indicators.macd ? `${fx(a.indicators.macd.macd)} / ${fx(a.indicators.macd.signal)}` : '—'}
              />
              <StatRow
                label="MACD Histogram"
                value={a.indicators.macd ? fx(a.indicators.macd.hist) : '—'}
                color={a.indicators.macd ? tone(a.indicators.macd.hist) : undefined}
              />
              <StatRow
                label="ATR (14)"
                value={a.indicators.atr ? `₹${fx(a.indicators.atr)} (${fx(a.indicators.atrPct)}%)` : '—'}
              />
            </DossierCard>

            {/* 4. S/R Levels Ladder */}
            <DossierCard title="Support & Resistance Levels" icon={Shield}>
              {a.levels.resistances.length === 0 && a.levels.supports.length === 0 && (
                <p className="text-xs text-gray-500 py-2">No confirmed swing levels near current price.</p>
              )}
              {[...a.levels.resistances].reverse().map((v, i) => (
                <StatRow
                  key={`r${i}`}
                  label={`Resistance R${a.levels.resistances.length - i}`}
                  value={`₹${fx(v)} (${pctx(((v - a.close) / a.close) * 100)})`}
                  color={RED}
                />
              ))}
              <StatRow label="Current Close" value={`₹${fx(a.close)}`} color="#00e5ff" badge="LTP" />
              {a.levels.supports.map((v, i) => (
                <StatRow
                  key={`s${i}`}
                  label={`Support S${i + 1}`}
                  value={`₹${fx(v)} (${pctx(((v - a.close) / a.close) * 100)})`}
                  color={GREEN}
                />
              ))}
            </DossierCard>

            {/* 5. Returns & 52-Week Range */}
            <DossierCard title="Returns & Volatility Profile" icon={TrendingUp}>
              {Object.entries(a.returns).map(([k, v]) => (
                <StatRow key={k} label={`Return (${k})`} value={pctx(v)} color={tone(v)} />
              ))}
              <StatRow
                label="20D Volatility (Ann.)"
                value={Number.isFinite(a.volatility.d20) ? `${fx(a.volatility.d20, 1)}%` : '—'}
              />
              <StatRow
                label={`From ${a.range52.partial ? `${a.candles}-day` : '52W'} High`}
                value={pctx(a.range52.fromHighPct)}
                color={tone(a.range52.fromHighPct)}
              />
              <StatRow
                label={`From ${a.range52.partial ? `${a.candles}-day` : '52W'} Low`}
                value={pctx(a.range52.fromLowPct)}
                color={tone(a.range52.fromLowPct)}
              />
            </DossierCard>

            {/* 6. Peers & Volume */}
            <DossierCard title="Peers & Volume Benchmark" icon={Layers}>
              <StatRow label="Latest Traded Volume" value={volume(a.volume.last)} />
              <StatRow label="20-Day Average Volume" value={volume(a.volume.average20)} />
              <StatRow
                label="Relative Volume"
                value={Number.isFinite(a.volume.relative) ? `${fx(a.volume.relative)}x` : '—'}
                color={a.volume.relative >= 1.5 ? '#ffd600' : '#e2e8f0'}
              />
              {me && Number.isFinite(me.changePct) && (
                <>
                  <StatRow label={`${symbol} Today`} value={pctx(me.changePct)} color={tone(me.changePct)} />
                  <StatRow
                    label={`Sector Avg (${info?.sector ?? ''})`}
                    value={peers ? `${pctx(peers.peerAverage)} (${peers.peers} peers)` : '—'}
                  />
                  <StatRow label="Nifty 50 Avg" value={market === null ? '—' : pctx(market)} />
                </>
              )}
            </DossierCard>
          </div>
        </>
      )}
    </div>
  );
}
