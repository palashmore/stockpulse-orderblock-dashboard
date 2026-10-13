import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Plus, ExternalLink, Calendar, Newspaper, Wallet, ListChecks, RefreshCw, ArrowUpRight } from 'lucide-react';
import { fetchNews } from '../../services/api';

const GREEN = '#00e676';
const RED = '#ff1744';

function SparklinePath({ isUp = true }) {
  const points = isUp ? [15, 12, 14, 10, 12, 7, 9, 4] : [4, 7, 6, 11, 9, 13, 12, 16];
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const width = 50;
  const height = 18;
  const step = width / (points.length - 1);

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(((p - min) / range) * (height - 4) + 2).toFixed(1)}`)
    .join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible">
      <path d={path} fill="none" stroke={isUp ? GREEN : RED} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const FALLBACK_NEWS = [
  { id: 'fb_1', time: '11:18 AM', text: 'HAL shares surge 6% on strong Q2 order book and major defence ministry agreements', source: 'Economic Times', tag: 'HAL', tagColor: 'bg-blue-500/20 text-blue-300', link: 'https://www.moneycontrol.com' },
  { id: 'fb_2', time: '10:52 AM', text: 'RBI keeps repo rate unchanged at 6.50%, maintains neutral policy stance on liquidity', source: 'Reuters', tag: 'RBI', tagColor: 'bg-emerald-500/20 text-emerald-300', link: 'https://www.reuters.com' },
  { id: 'fb_3', time: '10:34 AM', text: 'FIIs net sell ₹1,245 Cr in cash market; domestic institutions DII net buy ₹2,185 Cr', source: 'Livemint', tag: 'FII/DII', tagColor: 'bg-amber-500/20 text-amber-300', link: 'https://www.livemint.com' },
  { id: 'fb_4', time: '10:12 AM', text: 'IT sector gains momentum as global cloud spending and consulting outlook improves', source: 'Moneycontrol', tag: 'IT', tagColor: 'bg-cyan-500/20 text-cyan-300', link: 'https://www.moneycontrol.com' },
  { id: 'fb_5', time: '09:48 AM', text: 'Crude oil prices slip on global demand concerns; upstream energy producers under pressure', source: 'CNBC-TV18', tag: 'ONGC', tagColor: 'bg-purple-500/20 text-purple-300', link: 'https://www.cnbctv18.com' },
];

export default function DashboardBottomGrid({ onOpen = null }) {
  const [wlTab, setWlTab] = useState('My Stocks');
  const [newsTab, setNewsTab] = useState('All');
  const [portTab, setPortTab] = useState('Holdings');
  const [equityTf, setEquityTf] = useState('1M');

  // Real News State
  const [news, setNews] = useState(FALLBACK_NEWS);
  const [newsLoading, setNewsLoading] = useState(false);
  const [isLiveNews, setIsLiveNews] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setNewsLoading(true);
    fetchNews(newsTab)
      .then((res) => {
        if (cancelled) return;
        setNewsLoading(false);
        if (res && res.news && res.news.length > 0) {
          setNews(res.news);
          setIsLiveNews(true);
        }
      })
      .catch(() => {
        if (!cancelled) setNewsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [newsTab]);

  const watchlistItems = [
    { symbol: 'RELIANCE', ltp: 2846.80, chg: 18.40, chgPct: 0.73, isUp: true },
    { symbol: 'HDFCBANK', ltp: 1678.25, chg: 21.15, chgPct: 1.28, isUp: true },
    { symbol: 'TCS', ltp: 3512.40, chg: 24.60, chgPct: 0.71, isUp: true },
    { symbol: 'INFY', ltp: 1442.65, chg: 10.85, chgPct: 0.76, isUp: true },
    { symbol: 'ICICIBANK', ltp: 1096.30, chg: 14.25, chgPct: 1.32, isUp: true },
  ];

  const calendarEvents = [
    { time: '10:00', event: 'India CPI (YoY) SEP', actual: '5.02%', forecast: '5.10%', previous: '5.27%', isPositive: true },
    { time: '12:00', event: 'US Initial Jobless Claims', actual: '—', forecast: '225K', previous: '218K' },
    { time: '14:30', event: 'US Core CPI (MoM) SEP', actual: '—', forecast: '0.3%', previous: '0.3%' },
    { time: '15:45', event: 'US Fed Chair Powell Speech', actual: '—', forecast: '—', previous: '—' },
    { time: '16:30', event: 'India Industrial Production AUG', actual: '—', forecast: '4.8%', previous: '4.7%' },
  ];

  const cardStyle = {
    backgroundColor: '#0d1117',
    border: '1px solid rgba(30, 45, 61, 0.5)',
  };

  const innerBoxStyle = {
    backgroundColor: 'rgba(17, 24, 39, 0.6)',
    border: '1px solid rgba(30, 45, 61, 0.4)',
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 px-4 py-2">
      {/* 1. Watchlist */}
      <div className="flex flex-col rounded-lg p-3 shadow-sm" style={cardStyle}>
        <div className="flex items-center justify-between mb-2 pb-1.5" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.4)' }}>
          <div className="flex items-center gap-1.5">
            <ListChecks size={13} className="text-amber-400" />
            <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
              Watchlist
            </h3>
          </div>
          <button className="text-gray-400 hover:text-white cursor-pointer" aria-label="Add symbol">
            <Plus size={13} />
          </button>
        </div>

        <div className="flex items-center gap-1 mb-2 rounded p-0.5 text-[9px]" style={innerBoxStyle}>
          {['My Stocks', 'F&O', 'Sectors', 'Indices'].map((t) => (
            <button
              key={t}
              onClick={() => setWlTab(t)}
              className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                wlTab === t ? 'bg-white/15 text-white font-semibold' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-1.5 text-xs font-mono">
          {watchlistItems.map((item) => (
            <div
              key={item.symbol}
              onClick={() => onOpen && onOpen(item.symbol)}
              className="flex items-center justify-between p-1 rounded hover:bg-white/[0.04] cursor-pointer transition-colors"
            >
              <div>
                <div className="font-bold text-gray-200 font-sans">{item.symbol}</div>
                <div className="text-[10px] text-gray-400">₹{item.ltp.toFixed(2)}</div>
              </div>
              <SparklinePath isUp={item.isUp} />
              <div className="text-right">
                <div className="font-semibold" style={{ color: item.isUp ? GREEN : RED }}>
                  {item.isUp ? '+' : ''}{item.chg.toFixed(2)}
                </div>
                <div className="text-[10px]" style={{ color: item.isUp ? GREEN : RED }}>
                  {item.isUp ? '+' : ''}{item.chgPct.toFixed(2)}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Real-Time News Feed */}
      <div className="flex flex-col rounded-lg p-3 shadow-sm" style={cardStyle}>
        <div className="flex items-center justify-between mb-2 pb-1.5" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.4)' }}>
          <div className="flex items-center gap-1.5">
            <Newspaper size={13} className="text-cyan-400" />
            <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
              Recent News
            </h3>
            {isLiveNews && (
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" title="Real-time news active" />
            )}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-gray-400">
            {newsLoading && <RefreshCw size={10} className="animate-spin text-cyan-400" />}
            <span className="text-[10px] font-mono text-gray-500">
              {isLiveNews ? 'LIVE' : 'CACHED'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 mb-2 rounded p-0.5 text-[9px]" style={innerBoxStyle}>
          {['All', 'Company', 'Market', 'F&O', 'Economy'].map((t) => (
            <button
              key={t}
              onClick={() => setNewsTab(t)}
              className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                newsTab === t ? 'bg-white/15 text-white font-semibold' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto no-scrollbar max-h-60">
          {news.map((n, i) => (
            <div
              key={n.id || i}
              className="flex items-start gap-2 text-[11px] p-1.5 rounded transition-colors hover:bg-white/[0.04] group"
              style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.25)' }}
            >
              <span className="font-mono text-gray-500 text-[10px] whitespace-nowrap pt-0.5">{n.time}</span>
              <div className="flex-1 min-w-0">
                <a
                  href={n.link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-gray-200 leading-snug line-clamp-2 hover:text-cyan-400 transition-colors inline-block"
                >
                  {n.text}
                </a>
                {n.source && (
                  <div className="text-[9px] text-gray-500 mt-0.5 flex items-center gap-1">
                    <span>{n.source}</span>
                    {n.link && <ArrowUpRight size={8} className="opacity-0 group-hover:opacity-100 transition-opacity" />}
                  </div>
                )}
              </div>
              {n.tag && (
                <button
                  type="button"
                  onClick={() => onOpen && onOpen(n.tag)}
                  className={`text-[8px] px-1 py-0.5 rounded font-bold uppercase whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity ${n.tagColor || 'bg-cyan-500/20 text-cyan-300'}`}
                  title={`Open ${n.tag} analysis`}
                >
                  {n.tag}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 3. Economic Calendar */}
      <div className="flex flex-col rounded-lg p-3 shadow-sm" style={cardStyle}>
        <div className="flex items-center justify-between mb-2 pb-1.5" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.4)' }}>
          <div className="flex items-center gap-1.5">
            <Calendar size={13} className="text-yellow-400" />
            <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
              Economic Calendar
            </h3>
          </div>
          <span className="text-[10px] text-gray-400">Today</span>
        </div>

        <div className="flex-1 overflow-x-auto no-scrollbar">
          <table className="w-full text-left text-[10px] font-mono">
            <thead>
              <tr className="text-gray-500 pb-1" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.4)' }}>
                <th className="py-1 font-normal">Time</th>
                <th className="py-1 font-normal font-sans">Event</th>
                <th className="py-1 text-right font-normal">Actual</th>
                <th className="py-1 text-right font-normal">Forecast</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {calendarEvents.map((ev, i) => (
                <tr key={i} className="hover:bg-white/[0.02]">
                  <td className="py-1.5 text-gray-400">{ev.time}</td>
                  <td className="py-1.5 font-sans text-gray-300 truncate max-w-[110px]">{ev.event}</td>
                  <td className="py-1.5 text-right font-bold" style={{ color: ev.isPositive ? GREEN : '#e2e8f0' }}>
                    {ev.actual}
                  </td>
                  <td className="py-1.5 text-right text-gray-500">{ev.forecast}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Portfolio Summary */}
      <div className="flex flex-col rounded-lg p-3 shadow-sm" style={cardStyle}>
        <div className="flex items-center justify-between mb-2 pb-1.5" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.4)' }}>
          <div className="flex items-center gap-1.5">
            <Wallet size={13} className="text-emerald-400" />
            <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
              Portfolio Summary
            </h3>
          </div>

          <div className="flex items-center rounded p-0.5 text-[9px]" style={innerBoxStyle}>
            {['Holdings', 'Positions'].map((t) => (
              <button
                key={t}
                onClick={() => setPortTab(t)}
                className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                  portTab === t ? 'bg-white/15 text-white font-semibold' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Valuation & Returns */}
        <div className="mb-2">
          <div className="text-[9px] uppercase tracking-wider text-gray-500 font-semibold">Total Value</div>
          <div className="text-xl font-bold font-mono text-white tracking-tight">₹18,45,320</div>
          <div className="flex items-center justify-between text-[11px] font-mono mt-1">
            <span className="text-emerald-400 font-semibold">Day P&L: +₹32,450 (+1.76%)</span>
            <span className="text-emerald-400 font-semibold">Total P&L: +₹2,15,680 (+13.23%)</span>
          </div>
        </div>

        {/* Equity curve preview */}
        <div className="flex items-center justify-between text-[9px] mb-1">
          <div className="flex items-center gap-1 rounded p-0.5" style={innerBoxStyle}>
            {['1D', '1W', '1M', '3M', '1Y'].map((tf) => (
              <button
                key={tf}
                onClick={() => setEquityTf(tf)}
                className={`px-1 py-0.5 rounded cursor-pointer ${
                  equityTf === tf ? 'bg-white/15 text-white font-semibold' : 'text-gray-500'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
          <SparklinePath isUp={true} />
        </div>

        {/* Cash vs Invested */}
        <div className="grid grid-cols-2 gap-2 pt-2 text-[10px] font-mono" style={{ borderTop: '1px solid rgba(30, 45, 61, 0.4)' }}>
          <div>
            <div className="text-gray-500">Cash Balance</div>
            <div className="font-semibold text-gray-200">₹3,45,210</div>
          </div>
          <div className="text-right">
            <div className="text-gray-500">Invested Amount</div>
            <div className="font-semibold text-gray-200">₹15,00,110</div>
          </div>
        </div>
      </div>
    </div>
  );
}
