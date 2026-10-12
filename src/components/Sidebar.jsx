import { useState } from 'react';
import {
  Home,
  Activity,
  BarChart3,
  PlayCircle,
  MessageSquare,
  Settings,
  ChevronRight,
  TrendingUp,
  Layers,
  Eye,
  Wallet,
  Gauge,
  Zap,
  CandlestickChart,
  FileSearch,
} from 'lucide-react';

const menuItems = [
  { icon: Home, label: 'Dashboard', id: 'dashboard' },
  { icon: Activity, label: 'Order Blocks', id: 'orderblock' },
  { icon: Zap, label: 'Intraday', id: 'intraday' },
  { icon: CandlestickChart, label: 'Swing', id: 'swing' },
  { icon: BarChart3, label: 'Screener', id: 'screener' },
  { icon: FileSearch, label: 'Market Analysis', id: 'analysis' },
  { icon: Layers, label: 'Multi-Chart', id: 'multichart' },
  { icon: PlayCircle, label: 'Watchlist', id: 'watchlist' },
  { icon: Wallet, label: 'Portfolio', id: 'portfolio' },
  { icon: Eye, label: 'Scanner', id: 'scanner' },
  { icon: MessageSquare, label: 'Alerts', id: 'alerts' },
  { icon: Gauge, label: 'API Diagnostics', id: 'diagnostics' },
];

const bottomItems = [
  { icon: Settings, label: 'Settings', id: 'settings' },
];

export default function Sidebar({ activeTab, onTabChange }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`fixed left-0 top-0 h-full z-50 flex flex-col transition-all duration-300 ${
        expanded ? 'w-52' : 'w-14'
      }`}
      style={{
        backgroundColor: '#0d1117',
        borderRight: '1px solid rgba(30, 45, 61, 0.5)',
      }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {/* Logo */}
      <div className="flex items-center h-14 px-3 gap-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #00e676, #00b0ff)' }}>
          <TrendingUp size={18} color="#0a0e17" strokeWidth={2.5} />
        </div>
        {expanded && (
          <span className="text-sm font-bold tracking-wide text-white whitespace-nowrap">
            StockPulse
          </span>
        )}
      </div>

      {/* Toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-center w-6 h-6 rounded-full absolute -right-3 top-16 z-10 cursor-pointer"
        style={{ backgroundColor: '#1a2332', border: '1px solid #1e2d3d' }}
      >
        <ChevronRight
          size={12}
          className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Main Nav */}
      <nav className="flex-1 flex flex-col gap-1 px-2 mt-4">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`flex items-center gap-3 h-10 rounded-lg px-2 transition-all duration-200 cursor-pointer ${
                isActive
                  ? 'text-green-400'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
              style={{
                backgroundColor: isActive ? 'rgba(0, 230, 118, 0.12)' : 'transparent',
              }}
              title={!expanded ? item.label : undefined}
            >
              <Icon size={20} className="flex-shrink-0" />
              {expanded && (
                <span className="text-sm whitespace-nowrap">{item.label}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="flex flex-col gap-1 px-2 pb-4">
        {/* Market status indicator */}
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
          {expanded && (
            <span className="text-xs text-gray-500">Market Open</span>
          )}
        </div>
        {bottomItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className="flex items-center gap-3 h-10 rounded-lg px-2 text-gray-400 hover:text-gray-200 transition-all cursor-pointer"
              title={!expanded ? item.label : undefined}
            >
              <Icon size={20} className="flex-shrink-0" />
              {expanded && (
                <span className="text-sm whitespace-nowrap">{item.label}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
