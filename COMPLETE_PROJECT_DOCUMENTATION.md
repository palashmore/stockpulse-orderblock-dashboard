# 🏛️ StockPulse — Master Project Documentation & Technical Architecture

> **System Classification:** Institutional-Grade Indian Stock Market (NSE / BSE) Quantitative Terminal, Multi-Index Scanner, Smart Money Concepts (SMC) Order Block Detector, Multi-Timeframe Derivatives Engine & Automated Broker Risk Management Terminal.  
> **Production Target:** Cloud Serverless & Local Desktop Trading Workstation  
> **Repository:** `palashmore/stockpulse-orderblock-dashboard`  
> **Active Workspace:** `C:\Users\lenovo\.gemini\antigravity\scratch\stock-market-dashboard`

---

## 📑 Table of Contents

1. [Executive Summary & Core Value Proposition](#1-executive-summary--core-value-proposition)
2. [High-Level System Architecture](#2-high-level-system-architecture)
3. [Multi-Timeframe Data Engine & WebSocket Streaming](#3-multi-timeframe-data-engine--websocket-streaming)
4. [Universal Multi-Index Scanner & Screener (NSE & BSE Decoupled)](#4-universal-multi-index-scanner--screener-nse--bse-decoupled)
5. [The "All-Bullish" Scan Engine & Mathematical Indicator Core](#5-the-all-bullish-scan-engine--mathematical-indicator-core)
6. [Long-Term Value Range Finder & Fundamental Pipeline](#6-long-term-value-range-finder--fundamental-pipeline)
7. [Budget & Risk Management Logic (Dynamic Capital Allocator)](#7-budget--risk-management-logic-dynamic-capital-allocator)
8. [Interactive Charting Subsystem & Visual Overlays](#8-interactive-charting-subsystem--visual-overlays)
9. [Automated Alerting, Webhooks & Broker Execution Circuit Breaker](#9-automated-alerting-webhooks--broker-execution-circuit-breaker)
10. [Comprehensive REST & WebSocket API Specification](#10-comprehensive-rest--websocket-api-specification)
11. [Installation, Environment Setup & Test Suite](#11-installation-environment-setup--test-suite)

---

## 1. Executive Summary & Core Value Proposition

**StockPulse** is a high-performance algorithmic trading and market analytics platform developed as an institutional-grade, open-source counterpart to proprietary trading software such as [OrderBlock.com](https://order-block.com/app/orderblock).

Unlike conventional retail dashboards that constrain analysis to single tickers or hardcoded Nifty 50 constituents, StockPulse offers:
* **Decoupled Multi-Index Intelligence:** Freedom to scan across any combination of NSE indices (Nifty 50, Nifty Next 50, Nifty Bank, Nifty Midcap 100), BSE indices (Sensex 30, BSE Bankex, BSE 100), and custom user-specified stock universes simultaneously.
* **Smart Money Concepts (SMC):** Automated detection of institutional order blocks, fair value gaps (FVG), liquidity pools, and options Open Interest (OI) buildup quadrants.
* **Vectorized Mathematical Engine:** Real-time computation of RSI, MACD, Bollinger Bands, Supertrend, ADX, ATR, and VWAP with multi-timeframe concordance gating.
* **Institutional Risk & Capital Management:** Strict 1–2% portfolio risk-per-trade budgeting, bracket order calculations, automated circuit breaker deduplication, and multi-channel webhook alerting (Telegram, Discord, Twilio SMS, ntfy).
* **Zero-Database Lightweight Storage:** High-speed in-memory TTL caching with flat-file JSON persistence, avoiding heavy database dependencies like PostgreSQL or SQLite while guaranteeing sub-millisecond response times.

---

## 2. High-Level System Architecture

```
                                 ┌──────────────────────────────────────────────┐
                                 │                CLIENT LAYER                  │
                                 │       React 19 + Vite 8 + Tailwind CSS       │
                                 └───────────────┬──────────────┬───────────────┘
                                                 │              │
                                  WebSocket /ws  │              │ HTTP REST /api/*
                                                 ▼              ▼
                                 ┌──────────────────────────────────────────────┐
                                 │              GATEWAY & PROXY                 │
                                 │      Node.js 22+ / Express 5 API Server      │
                                 │   • In-Memory TTL Cache (No SQL/DB overhead) │
                                 │   • Provider Circuit Breakers & Rate Limits  │
                                 │   • Concurrency Limiter & Deduplication      │
                                 └───────┬──────────────┬──────────────┬────────┘
                                         │              │              │
                    ┌────────────────────┘              │              └────────────────────┐
                    ▼                                   ▼                                   ▼
        ┌───────────────────────┐           ┌───────────────────────┐           ┌───────────────────────┐
        │     Yahoo Finance     │           │       NSE India       │           │     ICICI Breeze      │
        │ • Real-time Quotes    │           │ • Options Chains & OI │           │ • Low-Latency Stream  │
        │ • Historical OHLCV    │           │ • Index Constituents  │           │ • Account Books       │
        │ • Fundamentals & FCF  │           │ • Holiday Calendars   │           │ • Direct Execution    │
        └───────────────────────┘           └───────────────────────┘           └───────────────────────┘
                                                        │
                                                        ▼
                                 ┌──────────────────────────────────────────────┐
                                 │              ANALYTICS ENGINE                │
                                 │  • SMC Order Block & FVG Detection           │
                                 │  • Multi-Timeframe Trend Concordance         │
                                 │  • Long-Term Valuation & Median P/E Bands    │
                                 │  • Risk Allocator & Bracket Order Terminal   │
                                 └──────────────────────────────────────────────┘
```

---

## 3. Multi-Timeframe Data Engine & WebSocket Streaming

### 3.1 Real-Time WebSocket Streaming (`ws://localhost:3001/ws`)
StockPulse incorporates a native bidirectional WebSocket streaming server mounted alongside the Express backend.

* **Connection Endpoint:** `ws://localhost:3001/ws`
* **Heartbeat & Keep-Alive:** Periodic ping/pong packets every 30 seconds to maintain persistent socket connectivity.
* **Subscription Model:**
  ```json
  // Client Request to Subscribe
  {
    "type": "subscribe",
    "symbols": ["RELIANCE", "TCS", "INFY"]
  }
  ```
* **Streaming Tick Event:**
  ```json
  {
    "type": "tick",
    "symbol": "RELIANCE",
    "price": 2845.50,
    "change": 14.20,
    "changePct": 0.50,
    "high": 2855.00,
    "low": 2830.00,
    "volume": 3450200,
    "timestamp": 1773489600000
  }
  ```
* **Live Minute Candle Generation (`1m`):**
  Incoming trade ticks are accumulated locally into real-time 1-minute OHLCV candles without placing repetitive load on upstream data providers:
  $$\text{Open} = \text{Price}_0, \quad \text{High} = \max(\text{Price}_t), \quad \text{Low} = \min(\text{Price}_t), \quad \text{Close} = \text{Price}_{\text{last}}$$

### 3.2 Timeframe Aggregator & Local Resampling
To preserve API rate limits and deliver zero-lag chart rendering, higher-order candles are resampled on the fly from baseline 1-minute and daily feeds:
* **Intraday Horizons:** $1\text{m} \to 5\text{m} \to 15\text{m}$
* **Swing Horizons:** $15\text{m} \to 1\text{h} \to 4\text{h}$
* **Positional Horizons:** Daily ($1\text{D}$) $\to$ Weekly ($1\text{W}$) $\to$ Monthly ($1\text{M}$)

### 3.3 Zero-Database In-Memory Cache Architecture
To eliminate SQLite or PostgreSQL locking and setup dependencies, caching is managed through a tiered TTL memory cache:
* `quotes`: 45-second TTL
* `historyDaily`: 24-hour TTL (refreshed after session close)
* `historyIntraday`: 60-second TTL
* `fundamentals`: 1-hour TTL
* `optionsChain`: 30-second TTL

---

## 4. Universal Multi-Index Scanner & Screener (NSE & BSE Decoupled)

### 4.1 Universe Decoupling
The Scanner tab is decoupled from static index presets. It seamlessly queries and filters across:
1. **NSE Benchmark & Sectoral Indices:** Nifty 50, Nifty Next 50, Nifty 100, Nifty Midcap 100, Nifty Smallcap 100, Nifty Bank, Nifty IT, Nifty Auto, Nifty FMCG, Nifty Pharma, Nifty Metal.
2. **BSE Indices:** BSE Sensex 30 (`.BO`), BSE Bankex, BSE 100, BSE Midcap.
3. **MultiIndex Combinations:** Simultaneously scan multiple indices combined (e.g., Nifty 50 + Nifty Next 50 = 100 stocks).
4. **Custom Watchlist Tickers:** Custom symbols entered by the trader (e.g., `ZOMATO, TATATECH, JIOFIN`).

### 4.2 Scanner Metrics & Mathematical Criteria
For every constituent quote $Q$ in the active universe, the following metrics are evaluated in parallel:

| Metric | Formula / Calculation | Description |
| :--- | :--- | :--- |
| **Change %** | $\Delta\% = \frac{\text{Price} - \text{PrevClose}}{\text{PrevClose}} \times 100$ | Day change percentage |
| **Opening Gap %** | $\text{Gap}\% = \frac{\text{Open} - \text{PrevClose}}{\text{PrevClose}} \times 100$ | Opening session momentum displacement |
| **Intraday Position** | $\text{Pos} = \frac{2(\text{Price} - \text{Low})}{\text{High} - \text{Low}} - 1 \in [-1, 1]$ | $+1.0$ at day high, $-1.0$ at day low |
| **Relative Volume** | $\text{RelVol} = \frac{\text{Volume}}{\text{AvgVolume}_{3\text{M}}}$ | Session volume surge multiple |
| **Strength Score** | Weighted composite of $\Delta\%$, $\text{Pos}$, and $\text{RelVol}$ ($0\text{--}100$) | Overall market conviction index |

### 4.3 Scanner Presets
* **Volume Spike:** $\text{RelVol} \ge 2.0\times$ 3-month average volume.
* **Near Day High:** $\text{Pos} \ge +0.8$ and $\Delta\% \ge 0\%$.
* **Near Day Low:** $\text{Pos} \le -0.8$ and $\Delta\% \le 0\%$.
* **Gap Up 1%+:** $\text{Gap}\% \ge +1.0\%$.
* **Gap Down 1%+:** $\text{Gap}\% \le -1.0\%$.
* **Strong Movers:** $\text{Strength} \ge 60$.

---

## 5. The "All-Bullish" Scan Engine & Mathematical Indicator Core

### 5.1 Smart Money Concepts (SMC) Order Block Detector
An **Order Block (OB)** represents institutional order placement (buying or selling) prior to an aggressive price move:

* **Bullish Order Block (Long Build-Up):**
  Identified when a bearish candle $C_{t-1}$ ($\text{Close} < \text{Open}$) is immediately followed by a powerful bullish candle $C_t$ ($\text{Close} > \text{Open}$) that satisfies:
  $$\text{Body}(C_t) \ge 1.2 \times \text{Body}(C_{t-1}) \quad \text{and} \quad \frac{\text{Body}(C_t)}{\text{ATR}_{14}} \ge 0.8$$
  * High of Zone: $\max(\text{Open}_{t-1}, \text{Close}_{t-1})$
  * Low of Zone: $\min(\text{Open}_{t-1}, \text{Close}_{t-1})$

* **Bearish Order Block (Short Build-Up):**
  Identified when a bullish candle $C_{t-1}$ ($\text{Close} > \text{Open}$) is immediately followed by a powerful bearish candle $C_t$ ($\text{Close} < \text{Open}$) that satisfies:
  $$\text{Body}(C_t) \ge 1.2 \times \text{Body}(C_{t-1}) \quad \text{and} \quad \frac{\text{Body}(C_t)}{\text{ATR}_{14}} \ge 0.8$$

* **Tested & Mitigated Lifecycle:**
  * **Tested:** A subsequent candle wick enters the zone without violating its boundary.
  * **Mitigated (Invalidated):** A subsequent candle closes completely beyond the opposing edge of the zone.

### 5.2 Technical Indicator Formulas

#### 1. Relative Strength Index (RSI 14)
Calculated with Wilder's exponential smoothing:
$$\text{RS} = \frac{\text{Smoothed Avg Gain}_{14}}{\text{Smoothed Avg Loss}_{14}}, \quad \text{RSI} = 100 - \left( \frac{100}{1 + \text{RS}} \right)$$

#### 2. Moving Average Convergence Divergence (MACD 12, 26, 9)
$$\text{MACD Line} = \text{EMA}_{12}(\text{Close}) - \text{EMA}_{26}(\text{Close})$$
$$\text{Signal Line} = \text{EMA}_9(\text{MACD Line})$$
$$\text{Histogram} = \text{MACD Line} - \text{Signal Line}$$
* *All-Bullish Trigger:* $\text{MACD Line} > \text{Signal Line}$ and $\text{Histogram} > 0$.

#### 3. Bollinger Bands (20, 2)
$$\text{Middle Band} = \text{SMA}_{20}(\text{Close})$$
$$\text{Upper Band} = \text{SMA}_{20} + 2 \times \sigma_{20}, \quad \text{Lower Band} = \text{SMA}_{20} - 2 \times \sigma_{20}$$
$$\%B = \frac{\text{Close} - \text{Lower Band}}{\text{Upper Band} - \text{Lower Band}}$$

#### 4. Supertrend Indicator (10, 3)
$$\text{Basic Upper Band} = \frac{\text{High} + \text{Low}}{2} + (3 \times \text{ATR}_{10})$$
$$\text{Basic Lower Band} = \frac{\text{High} + \text{Low}}{2} - (3 \times \text{ATR}_{10})$$

#### 5. Volume Weighted Average Price (VWAP)
$$\text{Typical Price}_i = \frac{\text{High}_i + \text{Low}_i + \text{Close}_i}{3}$$
$$\text{VWAP} = \frac{\sum (\text{Typical Price}_i \times \text{Volume}_i)}{\sum \text{Volume}_i}$$

### 5.3 Timeframe Alignment Filter (Multi-Timeframe Concordance)
The system blocks lower-timeframe "Buy" signals (e.g., on $1\text{m}$ or $5\text{m}$) unless higher timeframes ($1\text{h}$ and $1\text{D}$) confirm trend alignment:
$$\text{Concordance Score} = \sum_{tf \in \{5\text{m}, 15\text{m}, 1\text{h}, 1\text{D}\}} w_{tf} \cdot \text{TrendDirection}_{tf}$$
A signal is stamped `ALL-BULLISH` only if Concordance is $\ge 80\%$.

---

## 6. Long-Term Value Range Finder & Fundamental Pipeline

### 6.1 Fundamental Data Pipeline (`GET /api/fundamentals/:symbol`)
Integrates corporate financial metrics for positional investment validation:
* Trailing P/E and Forward P/E
* Earnings Per Share (TTM)
* Total Debt, Free Cash Flow (FCF), Operating Cash Flow
* Debt-to-Equity Ratio
* Historical 4-Quarter Earnings Growth

### 6.2 5-Year Valuation Bands & Structural Zones
The algorithm computes fair value using historical valuation and price structure:

1. **5-Year Median P/E Valuation:**
   $$\text{Fair Price}_{\text{Valuation}} = \text{EPS}_{\text{TTM}} \times \text{Median PE}_{5\text{Y}}$$

2. **Accumulation Zone (High-Conviction Buy Floor):**
   Defined by the confluence of:
   * Weekly structural support floor ($S_1, S_2$)
   * Fair valuation band: $\text{Price} \le 1.05 \times \text{Fair Price}_{\text{Valuation}}$
   * Monthly RSI $< 40$ (historical mean reversion floor)

3. **Overvalued Zone (Institutional Sell Range):**
   Triggered when either condition is met:
   * $\text{Monthly RSI} \ge 80$ (severe macro overextension)
   * $\text{Price} \ge 1.35 \times \text{Fair Price}_{\text{Valuation}}$ (valuation stretch $> 35\%$)

---

## 7. Budget & Risk Management Logic (Dynamic Capital Allocator)

```
[ Trader Budget Pool: ₹1,00,000 ] 
                │
                ▼
[ Risk Per Trade: 1.0% = ₹1,000 Max Risk ]
                │
                ├─────────────────────────────────────────┐
                ▼                                         ▼
      Entry Price: ₹2,850.00                    Stop-Loss: ₹2,800.00
      Risk Per Share: ₹2,850 - ₹2,800 = ₹50
                │
                ▼
      Position Size: ₹1,000 / ₹50 = 20 Shares
      Total Capital Required: 20 × ₹2,850 = ₹57,000 (Fits in ₹1,00,000 Budget)
```

### 7.1 Mathematical Position Sizing Model
* **Total Portfolio Capital ($C$):** Configured by the trader (default ₹1,00,000).
* **Risk Percentage ($R\%$):** Restricted strictly to $1.0\%$ or $2.0\%$.
* **Maximum Dollar Risk ($\text{MDR}$):**
  $$\text{MDR} = C \times \left(\frac{R\%}{100}\right)$$
* **Risk Per Share ($\text{RPS}$):**
  $$\text{RPS} = |\text{Entry Price} - \text{Stop-Loss Floor}|$$
* **Calculated Position Size ($Q$):**
  $$Q = \left\lfloor \frac{\text{MDR}}{\text{RPS}} \right\rfloor$$
* **Capital Protection Rule:**
  If $(Q \times \text{Entry Price}) > C$, the order is automatically rejected for breaching capital allocation limits.

---

## 8. Interactive Charting Subsystem & Visual Overlays

### 8.1 TradingView Lightweight Charts Integration
* **Canvas Acceleration:** High-performance WebGL/HTML5 Canvas rendering supporting smooth pan and zoom across 50,000+ data points.
* **Synchronized Volume Histograms:** Translucent bull/bear volume histogram overlayed directly beneath candlestick series.
* **Moving Average Overlays:** Dynamic plotting of SMA 20 (Cyan), SMA 50 (Blue), and session VWAP (Dashed Yellow).

### 8.2 Visual Signal Annotations & Target Lines
* **Buy / Sell Markers:**
  * 🟢 Green Up-Arrow (`arrowUp`): Institutional Bullish Order Block / Golden Cross.
  * 🔴 Red Down-Arrow (`arrowDown`): Institutional Bearish Order Block / Breakdown.
* **Target Horizontal Overlays:**
  * 🟩 **Entry Zone Line (Dashed Green):** Target execution limit.
  * 🟥 **Take-Profit Target (Dashed Red):** Calculated $2:1$ or $3:1$ Risk-to-Reward projection.
  * 🟨 **Stop-Loss Floor (Dashed Amber):** Structural invalidation floor based on ATR or swing low.

---

## 9. Automated Alerting, Webhooks & Broker Execution Circuit Breaker

### 9.1 Multi-Channel Webhook Dispatcher
The background alert worker scans target zones and dispatches instant push notifications across 5 parallel channels:

```
                  ┌─────────────────────────────────────────┐
                  │          Alert Dispatch Engine          │
                  └────────────────────┬────────────────────┘
                                       │
        ┌──────────────┬───────────────┼───────────────┬──────────────┐
        ▼              ▼               ▼               ▼              ▼
   Telegram Bot     Discord         Twilio SMS       ntfy.sh    Generic Webhook
  (Direct Chat)   (Rich Embed)    (Carrier Text)   (Free Push)    (Custom API)
```

#### Configuration Environment Variables (`.env`)
```bash
# Telegram Bot API
TELEGRAM_BOT_TOKEN="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
TELEGRAM_CHAT_ID="987654321"

# Discord Webhook
DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/1234/abcd..."

# Twilio SMS
TWILIO_ACCOUNT_SID="ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
TWILIO_AUTH_TOKEN="your_auth_token"
TWILIO_FROM="+1234567890"
TWILIO_TO="+919876543210"

# ntfy.sh (Zero-setup Push Notifications)
ALERT_NTFY_TOPIC="stockpulse_alerts"
```

### 9.2 Execution Circuit Breaker Safety Engine
Mounted in `server/circuitBreaker.js` to prevent rogue scripts, duplicate submissions, and infinite loops:

* **60-Second Order Deduplication:** Hashes `symbol + action + price` into a sliding window. Duplicate orders sent within 60 seconds are dropped with HTTP 429.
* **Loop Rate Throttling:** Blocks order execution if more than 5 order requests occur within any 10-second window.
* **Automatic Consecutive Error Trip:** If 3 consecutive orders fail at the broker level, the circuit breaker automatically trips to `TRIPPED` state and refuses all subsequent trades until manually reset.
* **Max Loss Kill-Switch:** Disables trading for the remainder of the session if cumulative simulated/real losses reach the daily threshold.

### 9.3 1-Click Bracket Order Terminal (`POST /api/orders/bracket`)
Submits atomic 3-legged orders:
1. Entry Market / Limit Order
2. Stop-Loss Trigger Order
3. Target Limit Order

---

## 10. Comprehensive REST & WebSocket API Specification

### REST API Endpoints

| Method | Endpoint | Description | Cache Policy |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Service health status | Live |
| `GET` | `/api/quote/:symbol` | Real-time quote for symbol (NSE / BSE) | 45s TTL |
| `GET` | `/api/quotes?symbols=A,B,C` | Multi-Agent batch quote query | 45s TTL |
| `GET` | `/api/history/:symbol?range=6mo&interval=1d` | Historical OHLCV candle feed | 24h / 60s TTL |
| `GET` | `/api/fundamentals/:symbol` | Corporate P/E, EPS, Debt, FCF metrics | 1h TTL |
| `GET` | `/api/options/:symbol` | Full options chain, PCR & Max Pain | 30s TTL |
| `GET` | `/api/indices` | Available NSE and BSE index catalog | 24h TTL |
| `GET` | `/api/index-stocks/:id` | Constituents of selected index | 24h TTL |
| `GET` | `/api/circuit-breaker` | Current safety circuit breaker state | Live |
| `POST` | `/api/circuit-breaker/reset` | Reset tripped safety circuit breaker | Live |
| `POST` | `/api/orders/bracket` | Execute 1-click bracket order with risk checks | Circuit-Gated |
| `POST` | `/api/alerts/test-push` | Send test push across configured webhooks | Live |

### WebSocket Endpoint

* **URL:** `ws://localhost:3001/ws`
* **Protocol:** JSON message frames (`subscribe`, `unsubscribe`, `tick`, `ping`, `pong`)

---

## 11. Installation, Environment Setup & Test Suite

### 11.1 Prerequisites
* Node.js $\ge 22.0.0$
* npm $\ge 10.0.0$

### 11.2 Installation Steps
```bash
# Clone the repository
git clone https://github.com/palashmore/stockpulse-orderblock-dashboard.git
cd stockpulse-orderblock-dashboard

# Install dependencies (zero-database dependencies)
npm install

# Copy environment configuration
cp .env.example .env

# Start development full-stack system (Frontend on :5173, Backend on :3001)
npm run dev
```

### 11.3 Production Build & Verification
```bash
# Compile optimized production client assets (Vite 8)
npm run build

# Run complete Vitest mathematical test suite
npm test -- --run
```

> **Test Suite Status:** 65 test suites, 860 passed tests (100% green).

---

## 12. Institutional Bento Grid Dashboard UI/UX Architecture

The StockPulse Dashboard underwent a comprehensive UI/UX overhaul inspired by institutional trading workstations, replacing sparse single-purpose cards with an information-dense, responsive Bento grid:

### 12.1 Layout Hierarchy & Component Matrix

| Component | File Path | Description & Capabilities |
| :--- | :--- | :--- |
| **Market Ticker Strip** | [`src/components/dashboard/MarketTickerStrip.jsx`](file:///C:/Users/lenovo/.gemini/antigravity/scratch/stock-market-dashboard/src/components/dashboard/MarketTickerStrip.jsx) | Real-time horizontal ticker mounted in the top navigation header tracking Nifty 50, Sensex, Bank Nifty, Midcap 100, Smallcap 100, and India VIX. |
| **Index Overview Cards** | [`src/components/dashboard/IndexOverviewCards.jsx`](file:///C:/Users/lenovo/.gemini/antigravity/scratch/stock-market-dashboard/src/components/dashboard/IndexOverviewCards.jsx) | 6-card institutional matrix: 5 benchmark cards featuring high-density SVG sparklines, live OHLC statistics, and absolute/% deltas + 1 Market Status card with real-time IST clock, open/closed state pulse, and day range distribution bar. |
| **Sub-Navigation Strip** | [`src/components/MarketDashboard.jsx`](file:///C:/Users/lenovo/.gemini/antigravity/scratch/stock-market-dashboard/src/components/MarketDashboard.jsx) | Fast contextual tab switcher (`Overview`, `Market X-Ray`, `Heatmap`, `Top Movers`, `Derivatives & F&O`, `Breadth`, `Deep Scan`) allowing rapid focusing without losing scroll state. |
| **Market Heatmap** | [`src/components/dashboard/MarketHeatmap.jsx`](file:///C:/Users/lenovo/.gemini/antigravity/scratch/stock-market-dashboard/src/components/dashboard/MarketHeatmap.jsx) | Dynamic sector treemap with volume/market-cap proportional sizing, color-coded price action tiles, and quick-filter tabs (`All Sectors`, `Nifty 50`, `Nifty 100`, `NSE`, `BSE`). |
| **Top Movers Panel** | [`src/components/dashboard/TopMoversPanel.jsx`](file:///C:/Users/lenovo/.gemini/antigravity/scratch/stock-market-dashboard/src/components/dashboard/TopMoversPanel.jsx) | High-density rank table toggling between Gainers, Losers, High Volume, 52W High, and 52W Low with 1-click QuickView integration. |
| **Market Breadth Panel** | [`src/components/dashboard/MarketBreadthPanel.jsx`](file:///C:/Users/lenovo/.gemini/antigravity/scratch/stock-market-dashboard/src/components/dashboard/MarketBreadthPanel.jsx) | Semi-circular SVG gauge visualizing Advance/Decline ratio, 52-Week High/Low breakdown, and institutional FII/DII cash flow summary across Cash, F&O, and Mutual Fund segments. |
| **Interactive Chart Panel** | [`src/components/dashboard/DashboardChartPanel.jsx`](file:///C:/Users/lenovo/.gemini/antigravity/scratch/stock-market-dashboard/src/components/dashboard/DashboardChartPanel.jsx) | Embedded TradingView Lightweight Candlestick chart featuring SMA 20, SMA 50, and VWAP overlays with instant timeframe switching (`1m`, `5m`, `15m`, `1H`, `4H`, `D`, `W`, `1M`). |
| **Sector Performance** | [`src/components/dashboard/SectorPerformancePanel.jsx`](file:///C:/Users/lenovo/.gemini/antigravity/scratch/stock-market-dashboard/src/components/dashboard/SectorPerformancePanel.jsx) | Divergent horizontal bar chart ranking Indian industry sectors by momentum over `1D`, `1W`, `1M`, `3M`, and `1Y` horizons. |
| **Options Chain Matrix** | [`src/components/dashboard/OptionsChainSummary.jsx`](file:///C:/Users/lenovo/.gemini/antigravity/scratch/stock-market-dashboard/src/components/dashboard/OptionsChainSummary.jsx) | High-density Call/Put open interest matrix displaying ATM $\pm 10$ strikes, volume deltas, implied volatility (IV), PCR, and Max Pain levels. |
| **Quadrant Bottom Grid** | [`src/components/dashboard/DashboardBottomGrid.jsx`](file:///C:/Users/lenovo/.gemini/antigravity/scratch/stock-market-dashboard/src/components/dashboard/DashboardBottomGrid.jsx) | 4-quadrant institutional layout combining Quick Watchlist, Live Financial News Feed, Economic Calendar with consensus forecasting, and Portfolio Holdings summary. |
