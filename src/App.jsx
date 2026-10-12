import { useState, useMemo, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import SearchBar from './components/SearchBar';
import StockChart from './components/StockChart';
import OrderBlockPanel from './components/OrderBlockPanel';
import SignalCards from './components/SignalCards';
import MetricsBar from './components/MetricsBar';
import Watchlist from './components/Watchlist';
import OIAnalysisPanel from './components/OIAnalysisPanel';
import {
  NIFTY_STOCKS,
  generateCandlestickData,
  generateOrderBlocks,
  generateSignals,
  getMarketMetrics,
} from './data/stockData';
import {
  detectOrderBlocks,
  generateSignalsFromOptions,
  computeMetrics,
} from './data/marketAnalysis';
import {
  checkBackendHealth,
  fetchQuote,
  fetchHistory,
  fetchOptions,
  fetchMarketStatus,
} from './services/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('orderblock');
  const [selectedStock, setSelectedStock] = useState(NIFTY_STOCKS[0]);

  // Real data state
  const [isLive, setIsLive] = useState(false);
  const [realCandles, setRealCandles] = useState(null);
  const [realQuote, setRealQuote] = useState(null);
  const [optionsData, setOptionsData] = useState(null);
  const [marketStatus, setMarketStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  // Check backend availability on mount
  useEffect(() => {
    checkBackendHealth().then((healthy) => {
      setIsLive(healthy);
      if (healthy) {
        console.log('✅ Backend connected — using LIVE data');
        fetchMarketStatus().then(setMarketStatus);
      } else {
        console.log('⚠️ Backend not available — using DEMO data');
      }
    });
  }, []);

  // Fetch real data when stock changes or backend becomes available
  const loadRealData = useCallback(async (symbol) => {
    if (!isLive) return;
    setLoading(true);
    try {
      const [historyData, quoteData, optData] = await Promise.allSettled([
        fetchHistory(symbol, '6mo', '1d'),
        fetchQuote(symbol),
        fetchOptions(symbol),
      ]);

      if (historyData.status === 'fulfilled' && historyData.value) {
        setRealCandles(historyData.value);
      }
      if (quoteData.status === 'fulfilled' && quoteData.value) {
        setRealQuote(quoteData.value);
      }
      if (optData.status === 'fulfilled' && optData.value) {
        setOptionsData(optData.value);
      }
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error loading real data:', error);
    } finally {
      setLoading(false);
    }
  }, [isLive]);

  useEffect(() => {
    loadRealData(selectedStock.symbol);
  }, [selectedStock.symbol, loadRealData]);

  // Auto-refresh every 60 seconds when live
  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(() => {
      loadRealData(selectedStock.symbol);
    }, 60000);
    return () => clearInterval(interval);
  }, [isLive, selectedStock.symbol, loadRealData]);

  // Use real data if available, fall back to demo
  const candleData = useMemo(() => {
    if (realCandles && realCandles.length > 0) return realCandles;
    return generateCandlestickData(selectedStock.symbol);
  }, [realCandles, selectedStock.symbol]);

  const orderBlocks = useMemo(() => {
    return detectOrderBlocks(candleData);
  }, [candleData]);

  const signals = useMemo(() => {
    if (optionsData) {
      return generateSignalsFromOptions(optionsData, candleData);
    }
    return generateSignals(candleData);
  }, [optionsData, candleData]);

  const metrics = useMemo(() => {
    return computeMetrics(candleData, realQuote);
  }, [candleData, realQuote]);

  const priceChange = useMemo(() => {
    if (candleData.length >= 2) {
      return candleData[candleData.length - 1].close - candleData[candleData.length - 2].close;
    }
    return 0;
  }, [candleData]);

  const handleSelectStock = (stock) => {
    // Reset real data when switching
    setRealCandles(null);
    setRealQuote(null);
    setOptionsData(null);
    setSelectedStock(stock);
  };

  // Main dashboard view (orderblock tab)
  const renderDashboard = () => (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Left: Chart + Order Blocks */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Chart Area */}
        <div className="flex-1 min-h-0" style={{ minHeight: '55%' }}>
          <StockChart
            candleData={candleData}
            orderBlocks={orderBlocks}
            stockSymbol={selectedStock.symbol}
          />
        </div>
        {/* Order Blocks Panel */}
        <div
          className="overflow-hidden"
          style={{
            height: '45%',
            borderTop: '1px solid rgba(30, 45, 61, 0.3)',
          }}
        >
          <OrderBlockPanel orderBlocks={orderBlocks} />
        </div>
      </div>

      {/* Middle: OI Analysis (when live data available) */}
      <div
        className="flex-shrink-0 overflow-hidden"
        style={{
          width: '300px',
          borderLeft: '1px solid rgba(30, 45, 61, 0.3)',
          backgroundColor: '#0d1117',
        }}
      >
        <OIAnalysisPanel optionsData={optionsData} priceChange={priceChange} />
      </div>

      {/* Right: Signal Cards */}
      <div
        className="flex-shrink-0 overflow-hidden"
        style={{
          width: '300px',
          borderLeft: '1px solid rgba(30, 45, 61, 0.3)',
          backgroundColor: '#0d1117',
        }}
      >
        <SignalCards signals={signals} />
      </div>
    </div>
  );

  // Watchlist view
  const renderWatchlist = () => (
    <div className="flex-1 min-h-0 overflow-hidden">
      <Watchlist onSelectStock={handleSelectStock} selectedStock={selectedStock} isLive={isLive} />
    </div>
  );

  // Screener view
  const renderScreener = () => (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <div className="flex-1 flex flex-col">
        <div className="flex-1 min-h-0">
          <StockChart
            candleData={candleData}
            orderBlocks={orderBlocks}
            stockSymbol={selectedStock.symbol}
          />
        </div>
      </div>
      <div
        className="flex-shrink-0 overflow-hidden"
        style={{
          width: '320px',
          borderLeft: '1px solid rgba(30, 45, 61, 0.3)',
          backgroundColor: '#0d1117',
        }}
      >
        <Watchlist onSelectStock={handleSelectStock} selectedStock={selectedStock} isLive={isLive} />
      </div>
    </div>
  );

  // Placeholder view
  const renderPlaceholder = (title) => (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <div
          className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, rgba(0,230,118,0.15), rgba(0,176,255,0.15))',
          }}
        >
          <span className="text-2xl">📊</span>
        </div>
        <h2 className="text-lg font-semibold text-gray-300 mb-1">{title}</h2>
        <p className="text-sm text-gray-600">Coming soon — select Order Blocks or Screener to get started</p>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
      case 'orderblock':
        return renderDashboard();
      case 'screener':
        return renderScreener();
      case 'watchlist':
        return renderWatchlist();
      case 'multichart':
        return renderPlaceholder('Multi-Chart View');
      case 'scanner':
        return renderPlaceholder('Live Scanner');
      case 'alerts':
        return renderPlaceholder('Price Alerts');
      case 'settings':
        return renderPlaceholder('Settings');
      default:
        return renderDashboard();
    }
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#0a0e17' }}>
      {/* Sidebar */}
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Main Content */}
      <div className="flex flex-col flex-1 min-w-0" style={{ marginLeft: '56px' }}>
        {/* Top Bar */}
        <div
          className="flex items-center justify-between px-4 h-14 flex-shrink-0"
          style={{
            backgroundColor: 'rgba(13, 17, 23, 0.95)',
            borderBottom: '1px solid rgba(30, 45, 61, 0.3)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <SearchBar selectedStock={selectedStock} onSelectStock={handleSelectStock} />
          <div className="flex items-center gap-3">
            {/* Live / Demo indicator */}
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: 'rgba(30, 45, 61, 0.3)' }}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-green-500' : 'bg-yellow-500'} animate-pulse`}
              />
              <span className="text-xs text-gray-400">NSE</span>
              <span className="text-xs text-gray-600">|</span>
              <span className={`text-xs ${isLive ? 'text-green-400' : 'text-yellow-400'}`}>
                {isLive ? 'LIVE' : 'DEMO'}
              </span>
              {loading && (
                <>
                  <span className="text-xs text-gray-600">|</span>
                  <span className="text-xs text-blue-400 animate-pulse">Loading...</span>
                </>
              )}
            </div>

            {/* Market status */}
            {marketStatus && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
                style={{ backgroundColor: 'rgba(30, 45, 61, 0.2)' }}>
                <div className={`w-1.5 h-1.5 rounded-full ${marketStatus.isOpen ? 'bg-green-500' : marketStatus.isPreOpen ? 'bg-yellow-500' : 'bg-red-500'}`} />
                <span className="text-[10px] text-gray-500">
                  {marketStatus.isOpen ? 'Market Open' : marketStatus.isPreOpen ? 'Pre-Open' : 'Market Closed'}
                </span>
              </div>
            )}

            {/* Last update time */}
            {lastUpdate && (
              <span className="text-[10px] text-gray-600">
                Updated: {lastUpdate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}

            <div className="text-xs text-gray-600">
              {new Date().toLocaleDateString('en-IN', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </div>
          </div>
        </div>

        {/* Metrics Bar */}
        <MetricsBar metrics={metrics} stockInfo={selectedStock} optionsData={optionsData} />

        {/* Content */}
        {renderContent()}
      </div>
    </div>
  );
}
