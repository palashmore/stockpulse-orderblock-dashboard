import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import TradingChart from './TradingChart';
import { fetchHistory } from '../services/api';
import { analyse, observations, relativeToPeers } from '../data/analysis';
import { detectOrderBlocks } from '../data/marketAnalysis';
import { NIFTY_STOCKS } from '../data/stockData';
import { STATUS_META } from '../data/dataStatus';

const GREEN = '#00e676';
const RED = '#ff1744';
const fx = (n, d = 2) => (Number.isFinite(n) ? n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }) : 'not available');
const pctx = (n, d = 2) => (Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(d)}%` : 'not available');
const tone = (n) => (!Number.isFinite(n) || n === 0 ? '#9ca3af' : n > 0 ? GREEN : RED);
const volume = (v) => (!Number.isFinite(v) ? 'not available' : v >= 1e7 ? `${(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(2)} L` : v.toLocaleString('en-IN'));

function Card({ title, children }) {
  return (
    <section className="rounded-md px-4 py-3" style={{ border: '1px solid rgba(30, 45, 61, 0.5)', backgroundColor: 'rgba(17, 24, 39, 0.5)' }}>
      <h3 className="text-xs font-semibold text-gray-300 mb-1">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, value, color }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.2)' }}>
      <span className="text-[11px] text-gray-500">{label}</span>
      <span className="text-xs font-mono text-right" style={{ color: color || '#d1d5db' }}>{value}</span>
    </div>
  );
}

// A descriptive page about one stock. It works whether or not any trade setup exists, and makes no
// buy/sell statement: observations, readings, levels and history only.
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

  if (demoMode) return <p className="px-4 py-6 text-xs text-gray-500">Analysis needs real market data and is off in simulated mode.</p>;

  const statusMeta = STATUS_META[history?.dataStatus] ?? STATUS_META.UNAVAILABLE;
  const trendColor = (t) => (t === 'up' || t === 'uptrend' ? GREEN : t === 'down' || t === 'downtrend' ? RED : '#9ca3af');

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3" style={{ backgroundColor: '#0a0e17' }}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Market Analysis · {symbol}</h2>
        <span className="text-xs text-gray-500">{selectedStock.name}{info?.sector ? ` · ${info.sector}` : ''}</span>
        <div className="flex-1" />
        <span className="text-[10px] px-2 py-0.5 rounded" style={{ color: statusMeta.color, backgroundColor: 'rgba(30,45,61,0.4)' }} title={statusMeta.description}>{statusMeta.label}</span>
        {history && <span className="text-[10px] text-gray-600">{history.provider} · daily candles to {history.asOf}</span>}
        <button onClick={load} disabled={loading} aria-label="Refresh" className="p-1.5 rounded text-gray-500 hover:text-gray-200 hover:bg-white/5 cursor-pointer"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      {!a && !loading && <p className="text-xs text-gray-500">Not enough daily history for {symbol} to analyse (about 30 completed candles are needed), or the data could not be loaded.</p>}
      {loading && !a && <p className="text-xs text-gray-500">Loading…</p>}

      {a && (
        <>
          <div className="rounded-md overflow-hidden flex flex-col" style={{ border: '1px solid rgba(30, 45, 61, 0.5)', height: 360 }}>
            <TradingChart candleData={candles} orderBlocks={orderBlocks} indicators={{ sma20: true, sma50: true, ema200: true, vwap: false, rsi: true }} resetKey={symbol} />
          </div>

          <Card title="What the history shows">
            <ul className="text-xs text-gray-300 list-disc ml-4 space-y-1">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            <p className="text-[10px] text-gray-600 mt-2">Observations describe what already happened. They are not predictions or recommendations.</p>
          </Card>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Card title="Trend">
              <Row label="Daily" value={a.trend.daily ?? 'not available'} color={trendColor(a.trend.daily)} />
              <Row label="Weekly (completed weeks)" value={a.trend.weekly ?? 'not available'} color={trendColor(a.trend.weekly)} />
              <Row label="Market structure" value={`${a.trend.structure.state}`} color={trendColor(a.trend.structure.state)} />
              <Row label="ADX" value={a.indicators.adx ? `${fx(a.indicators.adx.adx, 1)} (+DI ${fx(a.indicators.adx.plusDI, 1)} / −DI ${fx(a.indicators.adx.minusDI, 1)})` : 'not available'} />
            </Card>

            <Card title="Moving averages (vs last close)">
              {a.movingAverages.map((m) => (
                <Row key={m.name} label={m.name} value={Number.isFinite(m.value) ? `₹${fx(m.value)} · price ${m.above ? 'above' : 'below'}` : 'not available (history too short)'} color={Number.isFinite(m.value) ? (m.above ? GREEN : RED) : '#64748b'} />
              ))}
              <Row label="VWAP (20-day)" value={a.indicators.vwap20 ? `₹${fx(a.indicators.vwap20)}` : 'not available'} />
            </Card>

            <Card title="Momentum and range">
              <Row label="RSI (14)" value={fx(a.indicators.rsi, 1)} />
              <Row label="MACD / signal" value={a.indicators.macd ? `${fx(a.indicators.macd.macd)} / ${fx(a.indicators.macd.signal)}` : 'not available'} />
              <Row label="MACD histogram" value={a.indicators.macd ? fx(a.indicators.macd.hist) : 'not available'} color={a.indicators.macd ? tone(a.indicators.macd.hist) : undefined} />
              <Row label="ATR (14)" value={a.indicators.atr ? `₹${fx(a.indicators.atr)} (${fx(a.indicators.atrPct)}%)` : 'not available'} />
            </Card>

            <Card title="Support and resistance (confirmed swing levels)">
              {a.levels.resistances.length === 0 && a.levels.supports.length === 0 && <p className="text-xs text-gray-600">No confirmed levels near the price.</p>}
              {[...a.levels.resistances].reverse().map((v, i) => <Row key={`r${i}`} label={`Resistance ${a.levels.resistances.length - i}`} value={`₹${fx(v)} (${pctx(((v - a.close) / a.close) * 100)})`} color={RED} />)}
              <Row label="Last close" value={`₹${fx(a.close)}`} />
              {a.levels.supports.map((v, i) => <Row key={`s${i}`} label={`Support ${i + 1}`} value={`₹${fx(v)} (${pctx(((v - a.close) / a.close) * 100)})`} color={GREEN} />)}
            </Card>

            <Card title="Volume">
              <Row label="Latest volume" value={volume(a.volume.last)} />
              <Row label="20-day average" value={volume(a.volume.average20)} />
              <Row label="Relative volume" value={Number.isFinite(a.volume.relative) ? `${fx(a.volume.relative)}×` : 'not available'} />
            </Card>

            <Card title="Returns and volatility">
              {Object.entries(a.returns).map(([k, v]) => <Row key={k} label={k} value={pctx(v)} color={tone(v)} />)}
              <Row label="Volatility 20D (annualised)" value={Number.isFinite(a.volatility.d20) ? `${fx(a.volatility.d20, 1)}%` : 'not available'} />
              <Row label="Volatility 60D (annualised)" value={Number.isFinite(a.volatility.d60) ? `${fx(a.volatility.d60, 1)}%` : 'not available'} />
              <Row label={`From ${a.range52.partial ? `${a.candles}-day` : '52-week'} high`} value={pctx(a.range52.fromHighPct)} color={tone(a.range52.fromHighPct)} />
              <Row label={`From ${a.range52.partial ? `${a.candles}-day` : '52-week'} low`} value={pctx(a.range52.fromLowPct)} color={tone(a.range52.fromLowPct)} />
            </Card>

            <Card title="Today versus peers (Nifty 50 quotes)">
              {me && Number.isFinite(me.changePct) ? (
                <>
                  <Row label={`${symbol} today`} value={pctx(me.changePct)} color={tone(me.changePct)} />
                  <Row label={`Rest of ${info?.sector ?? 'sector'} (equal-weighted)`} value={peers ? `${pctx(peers.peerAverage)} (${peers.peers} stocks)` : 'not available (fewer than 2 peers)'} />
                  <Row label="Nifty 50 average (equal-weighted)" value={market === null ? 'not available' : pctx(market)} />
                  <p className="text-[10px] text-gray-600 mt-1">An equal-weighted average of stocks in this app&apos;s Nifty 50 list, not the official index or sector index.</p>
                </>
              ) : <p className="text-xs text-gray-600">Peer comparison is only available for Nifty 50 stocks with a current quote.</p>}
            </Card>

            <Card title="Instrument and data">
              <Row label="Symbol" value={`NSE:${symbol}`} />
              <Row label="Name" value={selectedStock.name} />
              <Row label="Sector (this app&apos;s grouping)" value={info?.sector ?? 'not available'} />
              <Row label="Candles analysed" value={`${a.candles} completed daily`} />
              <Row label="Last candle" value={a.asOf} />
              <Row label="Source" value={history?.provider ?? 'not available'} />
              <Row label="Status" value={statusMeta.label} color={statusMeta.color} />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
