import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useRefresh } from './hooks/useRefresh';
import Sidebar from './components/Sidebar';
import SearchBar from './components/SearchBar';
import StockChart, { TimeframeBar } from './components/StockChart';
import OrderBlockPanel from './components/OrderBlockPanel';
import SignalCards from './components/SignalCards';
import MetricsBar from './components/MetricsBar';
import Watchlist from './components/Watchlist';
import OIAnalysisPanel from './components/OIAnalysisPanel';
import RankedBoard from './components/RankedBoard';
import MarketDashboard from './components/MarketDashboard';
import AlertsPanel from './components/AlertsPanel';
import ScannerPanel from './components/ScannerPanel';
import SettingsPanel from './components/SettingsPanel';
import PortfolioPanel from './components/PortfolioPanel';
import DiagnosticsPanel from './components/DiagnosticsPanel';
import StrategyWorkspace from './components/StrategyWorkspace';
import NormalAnalysis from './components/NormalAnalysis';
import BrokerBooks from './components/BrokerBooks';
import StockLists from './components/StockLists';
import MyWatchlist from './components/MyWatchlist';
import MultiChart from './components/MultiChart';
import IpoPanel from './components/IpoPanel';
import ErrorBoundary from './components/ErrorBoundary';
import IndexSelect from './components/IndexSelect';
import MarketTickerStrip from './components/dashboard/MarketTickerStrip';
import { useUniverseSelection, useUniverseStocks } from './hooks/useUniverse';
import { TAB_IDS } from './components/Sidebar';
import MobileNav from './components/MobileNav';
import ThemeToggle from './components/ThemeToggle';
import { useLiveTick } from './hooks/useLiveTick';
import { loadSettings, saveSettings } from './data/settings';
import MultiTimeframePanel from './components/MultiTimeframePanel';
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
    return TAB_IDS.includes(tab) ? tab : loadSettings(window.localStorage).startTab;
  });
  const [selectedStock, setSelectedStock] = useState(NIFTY_STOCKS[0]);

  // Simulated data is only used when explicitly requested with ?demo=1
  const [demoMode] = useState(() => isDemoModeRequested(window.location.search));

  const [today] = useState(() =>
    new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  );
  const [chartIndicators, setChartIndicators] = useState(() => loadSettings(window.localStorage).chartIndicators);
  const changeIndicators = (next) => {
    setChartIndicators(next);
    saveSettings({ ...loadSettings(window.localStorage), chartIndicators: next }, window.localStorage);
  };
  const nifty = useNifty50(demoMode);
  const alertsApi = useAlerts(nifty);
  const [screenerPanel, setScreenerPanel] = useState('board');
  const universeSelection = useUniverseSelection();
  const { stocks: universeStocks, labels: universeLabels } = useUniverseStocks(universeSelection.universe);

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
  // Options/OI is off by default (no reliable source on this setup, and the NSE request only times out
  // and floods the error log). Add ?options=1 to the address to try it.
  const [optionsEnabled] = useState(() => new URLSearchParams(window.location.search).get('options') === '1');
  const [timeframe, setTimeframe] = useState(() => {
    const tf = new URLSearchParams(window.location.search).get('tf');
    return getTimeframe(tf ?? loadSettings(window.localStorage).defaultTimeframe).id;
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
  useRefresh('market-status', async () => {
    const m = await fetchMarketStatus();
    if (m) setMarketStatus(m);
    return m;
  }, !demoMode && backendUp);

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
      optionsEnabled ? fetchOptions(symbol) : Promise.resolve(null),
    ]);
    // Ignore responses for a stock/timeframe the user has already navigated away from
    if (requestKey.current !== key) return;

    if (historyData) setHistory(historyData);
    if (quoteData) setRealQuote(quoteData);
    if (optData) setOptionsData(optData);
    setRefreshFailed(!historyData && !quoteData);
    if (historyData || quoteData) setLastUpdate(new Date());
    setAttempted(true);
    setLoading(false);
    return Boolean(historyData || quoteData);
  },[demoMode, backendUp, timeframe, optionsEnabled]);

  useEffect(() => {
    if (!marketStatus) return;
    if (wasOpen.current !== null && wasOpen.current !== marketStatus.isOpen) {
      loadRealData(selectedStock.symbol);
      nifty.retry();
    }
    wasOpen.current = marketStatus.isOpen;
  }, [marketStatus, loadRealData, selectedStock.symbol, nifty]);

  // Refresh on the shared 60 s scheduler (same symbol/timeframe, in place); re-check the backend
  // on the same schedule if it was unreachable.
  useRefresh(
    `stock:${selectedStock.symbol}|${timeframe}`,
    async () => ((await loadRealData(selectedStock.symbol)) ? { ok: true } : null),
    !demoMode && backendUp,
  );
  useRefresh('backend-health', async () => ((await checkBackend()) ? { ok: true } : null), !demoMode && !backendUp);

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

  // Live ticks from the broker stream (only when it exists and its exchange timestamp is verified)
  const { tick } = useLiveTick(selectedStock.symbol, !demoMode && backendUp === true);
  const liveQuote = useMemo(() => {
    if (!realQuote || !tick || !tick.trusted) return realQuote;
    const price = tick.price;
    const change = realQuote.previousClose > 0 ? price - realQuote.previousClose : realQuote.change;
    return {
      ...realQuote,
      price,
      high: tick.high ?? realQuote.high,
      low: tick.low ?? realQuote.low,
      open: tick.open ?? realQuote.open,
      volume: tick.volume ?? realQuote.volume,
      change,
      changePct: realQuote.previousClose > 0 ? (change / realQuote.previousClose) * 100 : realQuote.changePct,
      asOf: tick.asOf ?? realQuote.asOf,
      dataStatus: tick.status,
      provider: 'ICICI Direct Breeze (live stream)',
    };
  }, [realQuote, tick]);

  const metrics = useMemo(() => {
    return computeMetrics(analysisCandles, demoMode ? null : liveQuote);
  }, [demoMode, analysisCandles, liveQuote]);

  const headlineStatus = resolveHeadlineStatus({
    demoMode,
    backendUp,
    attempted,
    hasData: candleData.length > 0,
    refreshFailed,
    quote: liveQuote,
    history,
  });

  // Timestamp of the data on screen (provider time), falling back to nothing rather than the fetch time
  const dataAsOf = liveQuote?.asOf ?? history?.asOf ?? null;

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
        <TimeframeBar timeframe={timeframe} onTimeframeChange={handleTimeframeChange} demoMode={demoMode} indicators={chartIndicators} onIndicatorsChange={changeIndicators} />
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
        indicators={chartIndicators}
        onIndicatorsChange={changeIndicators}
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

  // Select a stock and go to the screen that suits where the click came from
  const openStockFromOverview = (stock, tab = 'orderblock') => {
    handleSelectStock(stock);
    setActiveTab(tab);
  };

  // Order block view (orderblock tab)
  const renderDashboard = () => (
    <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-y-auto md:overflow-hidden">
      {/* Left: Chart + Order Blocks */}
      <div className="flex flex-col flex-1 min-w-0 md:min-h-0">
        {/* Chart Area */}
        <div className="flex-1 min-h-[380px] md:min-h-0 md:[min-height:55%]">
          {renderChart()}
        </div>
        {/* Order Blocks Panel */}
        <div
          className="overflow-hidden h-[420px] md:h-[45%]"
          style={{ borderTop: '1px solid rgba(30, 45, 61, 0.3)' }}
        >
          <OrderBlockPanel orderBlocks={orderBlocks} />
        </div>
      </div>

      {/* Middle: OI analysis when options data was loaded, otherwise the multi-timeframe trend */}
      <div
        className="flex-shrink-0 overflow-hidden w-full md:w-[300px] h-[460px] md:h-auto"
        style={{
          borderLeft: '1px solid rgba(30, 45, 61, 0.3)',
          backgroundColor: '#0d1117',
        }}
      >
        {optionsData ? <OIAnalysisPanel optionsData={optionsData} priceChange={priceChange} /> : <MultiTimeframePanel symbol={selectedStock.symbol} demoMode={demoMode} />}
      </div>

      {/* Right: option-based signal cards, shown only when there are signals to show */}
      {signals.length > 0 && (
        <div
          className="flex-shrink-0 overflow-hidden w-full md:w-[300px] h-[460px] md:h-auto"
          style={{
            borderLeft: '1px solid rgba(30, 45, 61, 0.3)',
            backgroundColor: '#0d1117',
          }}
        >
          <SignalCards signals={signals} />
        </div>
      )}
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
    <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-y-auto md:overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 min-h-[420px] md:min-h-0">
        <div className="flex-1 min-h-0">
          {renderChart()}
        </div>
      </div>
      <div
        className="flex flex-col flex-shrink-0 overflow-hidden w-full md:w-[340px] h-[480px] md:h-auto"
        style={{
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

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <MarketDashboard onSelectStock={openStockFromOverview} demoMode={demoMode} market={marketStatus} />;
      case 'orderblock':
        return renderDashboard();
      case 'screener':
        return renderScreener();
      case 'watchlist':
        return demoMode ? renderWatchlist() : <MyWatchlist onOpen={openStockFromOverview} />;
      case 'lists':
        return demoMode ? <p className="px-4 py-6 text-xs text-gray-500">Stock Lists need real market data and are off in simulated mode.</p> : <StockLists onOpen={openStockFromOverview} market={marketStatus} />;
      case 'diagnostics':
        return <DiagnosticsPanel />;
      case 'books':
        return <BrokerBooks selectedStock={selectedStock} />;
      case 'analysis':
        return <NormalAnalysis key={selectedStock.symbol} selectedStock={selectedStock} nifty={nifty} demoMode={demoMode} />;
      case 'intraday':
        return <StrategyWorkspace key="intraday" mode="intraday" selectedStock={selectedStock} demoMode={demoMode} onSelectStock={handleSelectStock} />;
      case 'swing':
        return <StrategyWorkspace key="swing" mode="swing" selectedStock={selectedStock} demoMode={demoMode} onSelectStock={handleSelectStock} />;
      case 'portfolio':
        return <PortfolioPanel onSelectStock={openStockFromOverview} />;
      case 'multichart':
        return demoMode ? <p className="px-4 py-6 text-xs text-gray-500">Multi-Chart needs real market data and is off in simulated mode.</p> : <MultiChart initialSymbol={null} />;
      case 'ipo':
        return <IpoPanel />;
      case 'scanner':
        return (
          <ScannerPanel
            nifty={nifty}
            universeSelection={universeSelection}
            universeStocks={universeStocks}
            universeLabels={universeLabels}
            demoMode={demoMode}
            onSelectStock={openStockFromOverview}
          />
        );
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
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} marketLabel={demoMode ? 'Simulated data' : describeMarketState(marketStatus)} marketOpen={demoMode ? null : marketStatus ? marketStatus.isOpen : null} />

      {/* Main Content */}
      <MobileNav activeTab={activeTab} onTabChange={setActiveTab} marketLabel={demoMode ? 'Simulated data' : describeMarketState(marketStatus)} marketOpen={demoMode ? null : marketStatus ? marketStatus.isOpen : null} />

      <div className="flex flex-col flex-1 min-w-0 md:ml-14" style={{ paddingBottom: 'var(--mobile-nav, 0px)' }}>
        {/* Top Bar */}
        <div
          className="relative z-[65] flex items-center justify-between gap-2 px-3 md:px-4 h-14 flex-shrink-0"
          style={{
            backgroundColor: 'rgba(13, 17, 23, 0.95)',
            borderBottom: '1px solid rgba(30, 45, 61, 0.3)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
            <SearchBar selectedStock={selectedStock} onSelectStock={handleSelectStock} />
            <div className="hidden sm:block">
              <IndexSelect selection={universeSelection} labels={universeLabels} count={universeStocks?.length ?? 0} />
            </div>
          </div>

          {/* Persistent Benchmark Ticker Strip */}
          <div className="hidden xl:flex flex-1 justify-center min-w-0 px-2 overflow-hidden">
            <MarketTickerStrip demoMode={demoMode} />
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <ThemeToggle />

            {/* Data status indicator */}
            <DataStatusBadge
              status={headlineStatus}
              loading={loading}
              detail={{
                provider: liveQuote?.provider ?? history?.provider,
                asOf: realQuote?.asOf ?? history?.asOf,
                staleAgeSec: liveQuote?.staleAgeSec ?? history?.staleAgeSec,
              }}
            />

            {/* Exchange state */}
            {marketStatus && !demoMode && (
              <div className="hidden lg:flex items-center gap-1.5 px-2 py-1 rounded-lg"
                style={{ backgroundColor: 'rgba(30, 45, 61, 0.2)' }}
                title={marketStatus.calendar === 'nse' ? 'NSE holiday calendar loaded' : 'Exchange holidays are not detected (calendar unavailable); only weekends are'}>
                <div className={`w-1.5 h-1.5 rounded-full ${marketStatus.isOpen ? 'bg-green-500' : marketStatus.isPreOpen ? 'bg-yellow-500' : 'bg-red-500'}`} />
                <span className="text-[10px] text-gray-500">{describeMarketState(marketStatus)}</span>
                {marketStatus.calendar !== 'nse' && <span className="text-[10px]" style={{ color: '#ffd600' }}>(holidays not checked)</span>}
              </div>
            )}

            {/* Data timestamp and last session */}
            {!demoMode && !noData && (
              <span className="hidden xl:inline text-[10px] text-gray-600">
                {dataAsOf ? `Data as of ${formatDataTime(dataAsOf)}` : lastUpdate ? `Fetched ${lastUpdate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}
                {marketStatus?.lastSession ? ` · Last session ${formatSessionDate(marketStatus.lastSession)}` : ''}
              </span>
            )}

            <div className="hidden xl:block text-xs text-gray-600">
              {today}
            </div>
          </div>
        </div>

        {demoMode && <SimulationBanner />}

        {/* Metrics Bar */}
        <MetricsBar metrics={metrics} stockInfo={selectedStock} optionsData={optionsData} />

        {/* Content */}
        <ErrorBoundary resetKey={activeTab}>{renderContent()}</ErrorBoundary>
      </div>
    </div>
  );
}
