import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import SearchBar from './components/SearchBar';
import StockChart, { TimeframeBar } from './components/StockChart';
import OrderBlockPanel from './components/OrderBlockPanel';
import SignalCards from './components/SignalCards';
import MetricsBar from './components/MetricsBar';
import Watchlist from './components/Watchlist';
import OIAnalysisPanel from './components/OIAnalysisPanel';
import RankedBoard from './components/RankedBoard';
import MarketXRay from './components/MarketXRay';
import AlertsPanel from './components/AlertsPanel';
import ScannerPanel from './components/ScannerPanel';
import SettingsPanel from './components/SettingsPanel';
import { useAlerts } from './hooks/useAlerts';
import { useNifty50 } from './hooks/useNifty50';
import { getTimeframe, aggregateCandles } from './data/timeframes';
import { DataStatusBadge, SimulationBanner, UnavailableState } from './components/DataStatusBadge';
import {
  NIFTY_STOCKS,
  generateCandlestickData,
  generateSignals,
} from './data/stockData';
import { resolveHeadlineStatus, isDemoModeRequested, describeMarketState, formatSessionDate } from './data/dataStatus';
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

function formatDataTime(asOf) {
  // asOf is an ISO instant for quotes/intraday and a YYYY-MM-DD date for daily candles
  if (/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return formatSessionDate(asOf);
  const d = new Date(asOf);
  if (Number.isNaN(d.getTime())) return asOf;
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST';
}

export default function App() {
  const [activeTab, setActiveTab] = useState(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    return ['dashboard', 'orderblock', 'screener', 'watchlist', 'alerts', 'scanner', 'settings'].includes(tab) ? tab : 'orderblock';
  });
  const [selectedStock, setSelectedStock] = useState(NIFTY_STOCKS[0]);

  // Simulated data is only used when explicitly requested with ?demo=1
  const [demoMode] = useState(() => isDemoModeRequested(window.location.search));

  const [today] = useState(() =>
    new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  );
  const nifty = useNifty50(demoMode);
  const alertsApi = useAlerts(nifty);
  const [screenerPanel, setScreenerPanel] = useState('board');

  // Real data state. backendUp is null until the first health check completes.
  const [backendUp, setBackendUp] = useState(null);
  const [history, setHistory] = useState(null);
  const [realQuote, setRealQuote] = useState(null);
  const [optionsData, setOptionsData] = useState(null);
  const [marketStatus, setMarketStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [timeframe, setTimeframe] = useState(() => {
    const tf = new URLSearchParams(window.location.search).get('tf');
    return getTimeframe(tf).id;
  });
  // Identifies the stock + timeframe the latest request was made for, so late responses are ignored
  const requestKey = useRef('');

  const checkBackend = useCallback(() => {
    return checkBackendHealth().then((healthy) => {
      setBackendUp(healthy);
      if (healthy) fetchMarketStatus().then(setMarketStatus);
      return healthy;
    });
  }, []);

  // Keep the exchange state current: re-check every 30 s so the app moves between open and closed
  // modes by itself, and reload the data whenever the market opens or closes.
  const wasOpen = useRef(null);
  useEffect(() => {
    if (demoMode || !backendUp) return;
    const poll = () => fetchMarketStatus().then((m) => { if (m) setMarketStatus(m); });
    poll();
    const interval = setInterval(poll, 30000);
    return () => clearInterval(interval);
  }, [demoMode, backendUp]);

  // Check backend availability on mount
  useEffect(() => {
    if (!demoMode) checkBackend();
  }, [demoMode, checkBackend]);

  // Fetch real data when stock changes or backend becomes available
  const loadRealData = useCallback(async (symbol) => {
    if (demoMode || !backendUp) return;
    const tf = getTimeframe(timeframe);
    const key = `${symbol}|${tf.id}`;
    requestKey.current = key;
    setLoading(true);
    const [historyData, quoteData, optData] = await Promise.all([
      fetchHistory(symbol, tf.range, tf.interval),
      fetchQuote(symbol),
      fetchOptions(symbol),
    ]);
    // Ignore responses for a stock/timeframe the user has already navigated away from
    if (requestKey.current !== key) return;

    if (historyData) setHistory(historyData);
    if (quoteData) setRealQuote(quoteData);
    if (optData) setOptionsData(optData);
    setRefreshFailed(!historyData && !quoteData);
    setLastUpdate(new Date());
    setAttempted(true);
    setLoading(false);
  }, [demoMode, backendUp, timeframe]);

  useEffect(() => {
    loadRealData(selectedStock.symbol);
  }, [selectedStock.symbol, loadRealData]);

  useEffect(() => {
    if (!marketStatus) return;
    if (wasOpen.current !== null && wasOpen.current !== marketStatus.isOpen) {
      loadRealData(selectedStock.symbol);
      nifty.retry();
    }
    wasOpen.current = marketStatus.isOpen;
  }, [marketStatus, loadRealData, selectedStock.symbol, nifty]);

  // Refresh every 60 seconds; re-check the backend if it was unreachable
  useEffect(() => {
    if (demoMode) return;
    const interval = setInterval(() => {
      if (backendUp) loadRealData(selectedStock.symbol);
      else checkBackend();
    }, 60000);
    return () => clearInterval(interval);
  }, [demoMode, backendUp, selectedStock.symbol, loadRealData, checkBackend]);

  // Real candles, or generated ones only in explicit demo mode. Never mixed.
  const candleData = useMemo(() => {
    if (demoMode) return generateCandlestickData(selectedStock.symbol);
    if (!history) return [];
    const aggregate = getTimeframe(timeframe).aggregate;
    return aggregate ? aggregateCandles(history.candles, aggregate) : history.candles;
  }, [demoMode, history, selectedStock.symbol, timeframe]);

  // Analysis (order blocks, indicators) uses completed candles only: the server flags the
  // in-progress daily/weekly candle `partial`, which is drawn on the chart but never analysed.
  const analysisCandles = useMemo(() => candleData.filter((c) => !c.partial), [candleData]);

  const orderBlocks = useMemo(() => {
    return detectOrderBlocks(analysisCandles);
  }, [analysisCandles]);

  const signals = useMemo(() => {
    if (demoMode) return generateSignals(candleData);
    return optionsData ? generateSignalsFromOptions(optionsData, candleData) : [];
  }, [demoMode, optionsData, candleData]);

  const metrics = useMemo(() => {
    return computeMetrics(analysisCandles, demoMode ? null : realQuote);
  }, [demoMode, analysisCandles, realQuote]);

  const headlineStatus = resolveHeadlineStatus({
    demoMode,
    backendUp,
    attempted,
    hasData: candleData.length > 0,
    refreshFailed,
    quote: realQuote,
    history,
  });

  // Timestamp of the data on screen (provider time), falling back to nothing rather than the fetch time
  const dataAsOf = realQuote?.asOf ?? history?.asOf ?? null;

  const retry = () => {
    if (backendUp) loadRealData(selectedStock.symbol);
    else checkBackend();
  };

  const noData = candleData.length === 0;
  const renderUnavailable = () => (
    <UnavailableState
      status={headlineStatus}
      loading={headlineStatus === null}
      onRetry={retry}
    />
  );

  // Day change from the quote when available, so the OI buildup reading does not depend on the chart timeframe
  const priceChange = useMemo(() => {
    if (Number.isFinite(realQuote?.change)) return realQuote.change;
    if (candleData.length >= 2) {
      return candleData[candleData.length - 1].close - candleData[candleData.length - 2].close;
    }
    return 0;
  }, [realQuote, candleData]);

  const handleTimeframeChange = (id) => {
    if (id === timeframe) return;
    requestKey.current = `${selectedStock.symbol}|${id}`;
    setHistory(null);
    setRefreshFailed(false);
    setAttempted(false);
    setTimeframe(id);
  };

  // Chart area: the timeframe bar stays usable while data is loading or unavailable
  const renderChart = () => (
    noData ? (
      <div className="flex flex-col h-full">
        <TimeframeBar timeframe={timeframe} onTimeframeChange={handleTimeframeChange} demoMode={demoMode} />
        {renderUnavailable()}
      </div>
    ) : (
      <StockChart
        candleData={candleData}
        orderBlocks={orderBlocks}
        stockSymbol={selectedStock.symbol}
        timeframe={timeframe}
        onTimeframeChange={handleTimeframeChange}
        demoMode={demoMode}
      />
    )
  );

  const handleSelectStock = (stock) => {
    // Reset real data when switching
    requestKey.current = `${stock.symbol}|${timeframe}`;
    setHistory(null);
    setRealQuote(null);
    setOptionsData(null);
    setRefreshFailed(false);
    setAttempted(false);
    setSelectedStock(stock);
  };

  const openStockFromOverview = (stock) => {
    handleSelectStock(stock);
    setActiveTab('orderblock');
  };

  // Order block view (orderblock tab)
  const renderDashboard = () => (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Left: Chart + Order Blocks */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Chart Area */}
        <div className="flex-1 min-h-0" style={{ minHeight: '55%' }}>
          {renderChart()}
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
      <Watchlist onSelectStock={handleSelectStock} selectedStock={selectedStock} nifty={nifty} />
    </div>
  );

  // Screener view: chart plus the ranked board (or the full watchlist)
  const renderScreener = () => (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 min-h-0">
          {renderChart()}
        </div>
      </div>
      <div
        className="flex flex-col flex-shrink-0 overflow-hidden"
        style={{
          width: '340px',
          borderLeft: '1px solid rgba(30, 45, 61, 0.3)',
          backgroundColor: '#0d1117',
        }}
      >
        <div className="flex gap-1 px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.3)' }}>
          {[['board', 'Bullish / Bearish'], ['watchlist', 'Watchlist']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setScreenerPanel(id)}
              className={`px-2 py-1 text-xs rounded cursor-pointer ${
                screenerPanel === id ? 'bg-green-500/15 text-green-400' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          {screenerPanel === 'board' ? (
            <RankedBoard
              nifty={nifty}
              selectedStock={selectedStock}
              onSelectStock={handleSelectStock}
              candleData={candleData}
              orderBlocks={orderBlocks}
            />
          ) : (
            <Watchlist onSelectStock={handleSelectStock} selectedStock={selectedStock} nifty={nifty} />
          )}
        </div>
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
        return <MarketXRay nifty={nifty} onSelectStock={openStockFromOverview} />;
      case 'orderblock':
        return renderDashboard();
      case 'screener':
        return renderScreener();
      case 'watchlist':
        return renderWatchlist();
      case 'multichart':
        return renderPlaceholder('Multi-Chart View');
      case 'scanner':
        return <ScannerPanel nifty={nifty} onSelectStock={openStockFromOverview} />;
      case 'alerts':
        return <AlertsPanel nifty={nifty} alertsApi={alertsApi} selectedStock={selectedStock} demoMode={demoMode} />;
      case 'settings':
        return <SettingsPanel demoMode={demoMode} headlineStatus={headlineStatus} onConnectionChange={retry} />;
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
            {/* Data status indicator */}
            <DataStatusBadge
              status={headlineStatus}
              loading={loading}
              detail={{
                provider: realQuote?.provider ?? history?.provider,
                asOf: realQuote?.asOf ?? history?.asOf,
                staleAgeSec: realQuote?.staleAgeSec ?? history?.staleAgeSec,
              }}
            />

            {/* Exchange state */}
            {marketStatus && !demoMode && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
                style={{ backgroundColor: 'rgba(30, 45, 61, 0.2)' }}
                title={marketStatus.calendar === 'nse' ? 'NSE holiday calendar loaded' : 'Exchange holidays are not detected (calendar unavailable); only weekends are'}>
                <div className={`w-1.5 h-1.5 rounded-full ${marketStatus.isOpen ? 'bg-green-500' : marketStatus.isPreOpen ? 'bg-yellow-500' : 'bg-red-500'}`} />
                <span className="text-[10px] text-gray-500">{describeMarketState(marketStatus)}</span>
                {marketStatus.calendar !== 'nse' && <span className="text-[10px]" style={{ color: '#ffd600' }}>(holidays not checked)</span>}
              </div>
            )}

            {/* Data timestamp and last session */}
            {!demoMode && !noData && (
              <span className="text-[10px] text-gray-600">
                {dataAsOf ? `Data as of ${formatDataTime(dataAsOf)}` : lastUpdate ? `Fetched ${lastUpdate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}
                {marketStatus?.lastSession ? ` · Last session ${formatSessionDate(marketStatus.lastSession)}` : ''}
              </span>
            )}

            <div className="text-xs text-gray-600">
              {today}
            </div>
          </div>
        </div>

        {demoMode && <SimulationBanner />}

        {/* Metrics Bar */}
        <MetricsBar metrics={metrics} stockInfo={selectedStock} optionsData={optionsData} />

        {/* Content */}
        {renderContent()}
      </div>
    </div>
  );
}
