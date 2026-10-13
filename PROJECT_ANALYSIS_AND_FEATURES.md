# 📊 StockPulse — Complete Project Analysis & Exhaustive Features Specification

> **System Classification:** Institutional-Grade Indian Stock Market (NSE / BSE) Trading Terminal, Smart Money Concepts (SMC) Order Block Detector, Options Chain Derivatives Screener & Portfolio Analysis Suite.  
> **Repository:** [https://github.com/palashmore/stockpulse-orderblock-dashboard](https://github.com/palashmore/stockpulse-orderblock-dashboard)  
> **Production URL:** [https://stock-market-dashboard-murex-seven.vercel.app](https://stock-market-dashboard-murex-seven.vercel.app)

---

## 1. Executive Summary

**StockPulse** is a full-stack algorithmic market intelligence platform engineered as an enhanced, open-source alternative to proprietary institutional terminals such as [OrderBlock.com](https://order-block.com/app/orderblock).

The platform bridges retail trading with institutional quantitative analytics by calculating:
1. **Smart Money Concepts (SMC) & Institutional Order Blocks** (High-probability demand/supply zones where banks and institutional algorithms place orders).
2. **Options Open Interest (OI) Quadrants** (Real-time classification into Long Build-Up, Short Build-Up, Long Unwinding, and Short Covering).
3. **Multi-Timeframe Concordance** across intraday ($1\text{m}, 5\text{m}, 15\text{m}$), swing ($1\text{h}, 4\text{h}$), and positional ($1\text{D}, 1\text{W}$) horizons.
4. **Grey Market Premium (GMP) & IPO Tracking** for primary market intelligence.
5. **Broker Direct Books & Automated Alerting** with webhook/ntfy push triggers and ICICI Direct Breeze integration.

---

## 2. Technical Architecture & System Blueprint

```
                      ┌──────────────────────────────────────────┐
                      │             CLIENT LAYER                 │
                      │  React 19 + Vite 8 + Tailwind CSS v4     │
                      └────────────────────┬─────────────────────┘
                                           │ WebSocket / HTTP REST
                                           ▼
                      ┌──────────────────────────────────────────┐
                      │             GATEWAY & PROXY              │
                      │     Node.js 22+ / Express 5 API Server   │
                      │  (Provider Guards, Caching, Rate Limits) │
                      └───────┬────────────┬─────────────┬───────┘
                              │            │             │
              ┌───────────────┴────┐       │      ┌──────┴───────────────┐
              ▼                    ▼       │      ▼                      ▼
     ┌─────────────────┐ ┌───────────────┐ │ ┌───────────────┐ ┌────────────────┐
     │  Yahoo Finance  │ │   NSE India   │ │ │ ICICI Breeze  │ │  InvestorGain  │
     │  (Tick & Chart) │ │(Options/Index)│ │ │ (Stream/Books)│ │   (IPO GMP)    │
     └─────────────────┘ └───────────────┘ │ └───────────────┘ └────────────────┘
                                           ▼
                      ┌──────────────────────────────────────────┐
                      │           QUANTITATIVE CORE              │
                      │  • ATR(14) Impulsive Displacement Engine │
                      │  • Options Max Pain & PCR Solver         │
                      │  • 4-Quadrant OI Classifier              │
                      │  • Strategy Gate & Backtest Simulator    │
                      └──────────────────────────────────────────┘
```

### Technology Matrix

| Layer | Technologies | Rationale |
| :--- | :--- | :--- |
| **Frontend Framework** | React 19.2, Vite 8.3 | Concurrent rendering, zero-lag state transitions, ultra-fast HMR |
| **Styling & Aesthetics** | Tailwind CSS v4, Custom CSS Tokens | Hardware-accelerated glassmorphism, responsive high-density grid |
| **Charting Subsystem** | TradingView `lightweight-charts` v5.2 | WebGL/Canvas rendering, handles 50,000+ data points at 60 FPS |
| **Icons & Symbols** | `lucide-react` | Standardized SVG iconography |
| **Backend API** | Node.js (>=22), Express 5.3, CORS | Asynchronous non-blocking I/O with native `--env-file` support |
| **Derivatives & Real-Time** | ICICI Breeze SDK / REST, NSE Cookie Sessions | Low-latency market depth, streaming ticks, and options chains |
| **Testing & Quality** | Vitest 5.0 (850 tests, 63 suites), Oxlint | Rigorous mathematical verification and zero regressions |
| **Deployment Targets** | Vercel Serverless, Docker Compose, Render.com | Cloud-native multi-cloud deployment compatibility |

---

## 3. Exhaustive Features Catalog

### 🕯️ 3.1 Advanced Charting & Multi-Timeframe Analytics
* **TradingView Lightweight Charts v5 Engine:** High-performance canvas charting with responsive resizing.
* **Multi-Timeframe Selection:** 7 time horizons: `1m`, `5m`, `15m`, `1H`, `4H`, `1D`, `1W`.
* **Dynamic Indicators Overlay:**
  * **SMA 20 & SMA 50:** Short and medium-term trend regime boundaries.
  * **Volume Weighted Average Price (VWAP):** Cumulative intraday institutional benchmark.
  * **Volume Histogram:** Color-synchronized volume profiles with surge detection.
* **On-Chart Order Block Overlay Markers:** Interactive tags directly on chart candles marking detected institutional zones.

---

### 🟢🔴 3.2 Smart Money Concepts (SMC) & Order Block Engine
* **Bullish Order Block (Long Build-Up):**
  * Detects the last down (bearish) candle before an aggressive upward displacement.
  * Threshold filter: Body size $> 1.2\times$ prior candle and displacement $> 0.8\times \text{ATR}(14)$.
* **Bearish Order Block (Short Build-Up):**
  * Detects the last up (bullish) candle before an institutional downward flush.
* **Order Block Testing & Mitigation Tracker:**
  * Automatically tags zones as `TESTED` when subsequent wicks tap the zone.
  * Marks zones as `MITIGATED` or invalid once price closes beyond the invalidation level.
* **Strength & Volume Scoring:** Computes confidence rating ($0\text{--}100\%$) based on volume confirmation and impulsive velocity.

---

### ⚡ 3.3 Derivatives & Options Open Interest (OI) Suite
* **Put-Call Ratio (PCR) Needle Gauge:**
  * Real-time ratio of Total Put OI to Total Call OI.
  * Sentiment triggers: $> 1.2$ (Bullish Oversold), $< 0.8$ (Bearish Overbought), $0.8\text{--}1.2$ (Neutral).
* **Max Pain Strike Optimizer:**
  * Calculates the exact strike price where option sellers encounter minimum liability at expiration.
* **Dual-Sided Horizontal OI Distribution Bar Chart:**
  * Canvas-rendered comparative visual of Put OI (Demand / Green) vs. Call OI (Supply / Red) per strike centered around CMP.
* **4-Quadrant Derivatives Flow Matrix:**
  * **LONG BUILD-UP:** Price Up $\uparrow$, OI Up $\uparrow$ (Aggressive Institutional Buying)
  * **SHORT BUILD-UP:** Price Down $\downarrow$, OI Up $\uparrow$ (Aggressive Short Additions)
  * **LONG UNWINDING:** Price Down $\downarrow$, OI Down $\downarrow$ (Long Liquidation / Profit Booking)
  * **SHORT COVERING:** Price Up $\uparrow$, OI Down $\downarrow$ (Short Squeeze / Forced Covering)
* **Dynamic Support & Resistance (from OI):** Extracts high-volume Call open interest strikes (resistance ceiling) and Put open interest strikes (support floor).

---

### 🎯 3.4 Tactical Trading Signal Cards
* **Custom Mini-Sparklines:** High-speed 2D canvas sparkline rendering past 20 sessions of momentum.
* **Calculated S/R Levels:** Precise targets: Support 1 (`S1`), Support 2 (`S2`), Resistance 1 (`R1`), Resistance 2 (`R2`).
* **Execution Zone & Risk Rating:**
  * Entry zone proximity.
  * Dynamic risk classification (`LOW`, `MEDIUM`, `HIGH`) derived from options volatility and PCR.

---

### 🔍 3.5 Discovery, Screeners & Market Boards
* **Rapid Command Palette Search (`Ctrl + K`):** Global instantaneous fuzzy search across Nifty 50, Nifty Next 50, and F&O universe.
* **Top Market Boards:** Real-time categorized tabs for **Top Gainers**, **Top Losers**, **High Volume Surges**, and **Sector Leaders**.
* **Daily Multi-Metric Screener:** Filter stocks by RSI (Overbought/Oversold), Distance from 52-Week High/Low, and Volume Multipliers.
* **Multi-Chart Simultaneous View:** Grid view comparing multiple tickers concurrently on synchronized time scales.

---

### 🔔 3.6 Automated Alert Engine & Notification System
* **Threshold Triggers:** Price Above, Price Below, Volume Spike, and Order Block Tap alerts.
* **Multi-Channel Dispatch:**
  * In-app audible and visual toaster notifications.
  * Server-side `ntfy` push notification webhooks for mobile devices without native apps.
* **Persistent Alert Storage:** Alerts saved to server-side JSON storage with auto-recovery on restart.

---

### 💼 3.7 Broker Books & Portfolio Diagnostics
* **ICICI Breeze Broker Interop:** Live positions, order history, trade books, and funds availability.
* **Cost Basis & P&L Attribution:** Realized round-trip tracking and mark-to-market portfolio valuation.
* **Hosted Session Support:** Secure client-side credential storage with zero server credential leaks.

---

### 🚀 3.8 IPO & Grey Market Premium (GMP) Intelligence
* **Active & Forthcoming IPO Tracker:** Fetches listing dates, issue prices, lot sizes, and subscription multiples from official NSE feeds.
* **Grey Market Premium (GMP) Analysis:** Real-time parser for estimated listing gains and demand sentiment.

---

### 🛡️ 3.9 System Resilience, Data Status & Rate Limiting
* **Tiered Data Fallback:** If live upstream feeds throttle or close, the system automatically falls back to deterministic mathematical models, visibly badging the feed (`LIVE`, `STALE`, or `DEMO`).
* **Provider Guard:** Automatic exponential backoff and circuit breaking to prevent upstream HTTP 429 rate limit bans.
* **Market Calendar & Holiday Automation:** Built-in IST market holiday calendar to distinguish between market closed hours and network failures.

---

## 4. Quantitative & Mathematical Formulation

### 4.1 Order Block Invalidation & Displacement Model

$$\text{ATR}_{14}(t) = \frac{\text{ATR}_{14}(t-1) \times 13 + \text{TR}(t)}{14}$$

Where True Range ($\text{TR}$):
$$\text{TR}(t) = \max \left( H_t - L_t, \, |H_t - C_{t-1}|, \, |L_t - C_{t-1}| \right)$$

Displacement Criterion for Bullish Order Block at candle $i$:
$$C_{i} > O_{i} \quad \text{and} \quad C_{i-1} < O_{i-1} \quad \text{and} \quad |C_i - O_i| > 1.2 \times |C_{i-1} - O_{i-1}| \quad \text{and} \quad \frac{|C_i - O_i|}{\text{ATR}_{14}(i)} \ge 0.8$$

### 4.2 Max Pain Mathematical Formulation

For strike candidate $K$:
$$\text{Pain}(K) = \sum_{S_i < K} \text{CallOI}(S_i) \times (K - S_i) + \sum_{S_j > K} \text{PutOI}(S_j) \times (S_j - K)$$

$$\text{MaxPainStrike} = \arg\min_K \text{Pain}(K)$$

### 4.3 Put-Call Ratio (PCR)

$$\text{PCR} = \frac{\sum_{k=1}^N \text{PutOI}_k}{\sum_{k=1}^N \text{CallOI}_k}$$

---

## 5. API Endpoints Specification

| Method | Endpoint | Description | Cache Policy |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Service health, server uptime, and timestamp | None |
| `GET` | `/api/market-status` | IST Market session state (`OPEN`, `PRE-OPEN`, `CLOSED`, `HOLIDAY`) | Real-time |
| `GET` | `/api/quote/:symbol` | Real-time quote, CMP, change, OHLC, VWAP, dataStatus | 30s TTL |
| `GET` | `/api/history/:symbol` | Historical OHLCV candles (`range=6mo&interval=1d`) | 5m TTL |
| `GET` | `/api/options/:symbol` | Option chain, PCR, Max Pain, and Call/Put OI distribution | 60s TTL |
| `GET` | `/api/nifty50` | Batch quotes for all 50 index constituents | 30s TTL |
| `GET` | `/api/search?q=:query` | Global stock symbol and name search | 10m TTL |
| `GET` | `/api/ipos` | Mainboard & SME IPO pipeline with GMP analysis | 10m TTL |
| `GET` | `/api/index-levels` | Benchmark index readings (Nifty 50, Bank Nifty, Sensex) | 60s TTL |
| `GET` | `/api/alerts` | Active price alerts list and notification logs | Real-time |

---

## 6. Project Directory Tree

```
stock-market-dashboard/
├── api/
│   └── index.js                 # Vercel serverless entrypoint
├── server/
│   ├── alertEngine.js           # Threshold check engine & ntfy dispatcher
│   ├── app.js                   # Master Express router & provider guard
│   ├── breeze.js                # ICICI Direct Breeze API connector
│   ├── breezeStream.js          # Live streaming ticks & depth hub
│   ├── brokerBooks.js           # Position & trade book mapper
│   ├── cache.js                 # In-memory TTL cache with stale-on-error
│   ├── dataStatus.js            # Classification: LIVE, STALE, DEMO
│   ├── index.js                 # Node entrypoint with SIGTERM handling
│   ├── indexLevels.js           # Major indices parser
│   ├── indices.js               # Nifty indices constituents
│   ├── ipo.js                   # Primary market pipeline parser
│   ├── ipoGmp.js                # Grey Market Premium scraper
│   ├── limits.js                # Concurrency & rate limiter
│   ├── marketCalendar.js        # NSE calendar & holiday schedule
│   ├── options.js               # NSE options chain & PCR solver
│   ├── portfolio.js             # Portfolio & funds aggregator
│   ├── providerGuard.js         # Circuit breaker for external APIs
│   └── validators.js            # Input sanitize & validation
├── src/
│   ├── components/
│   │   ├── AlertsPanel.jsx      # Alert rule builder & event feed
│   │   ├── DailyScreener.jsx    # Advanced RSI/Volume/Range screener
│   │   ├── IpoPanel.jsx         # IPO intelligence & listing estimator
│   │   ├── MarketBoards.jsx     # Gainers, Losers, and Volume leaders
│   │   ├── MetricsBar.jsx       # Header ticker tape & quick stats
│   │   ├── MultiChart.jsx       # 2x2 multi-symbol sync view
│   │   ├── OIAnalysisPanel.jsx  # PCR gauge, Max Pain, and OI chart
│   │   ├── OrderBlockPanel.jsx  # SMC bullish & bearish block matrix
│   │   ├── PortfolioPanel.jsx   # Broker positions & holdings
│   │   ├── SearchBar.jsx        # Ctrl+K modal search
│   │   ├── Sidebar.jsx          # Navigation rail
│   │   ├── SignalCards.jsx      # Tactical signals with canvas sparklines
│   │   ├── StockChart.jsx       # TradingView chart with v5 series
│   │   ├── StrategyWorkspace.jsx# Strategy backtester & rule engine
│   │   ├── ThemeToggle.jsx      # Obsidian dark & Day mode toggle
│   │   └── Watchlist.jsx        # User custom stock watchlist
│   ├── data/
│   │   ├── marketAnalysis.js    # SMC & quantitative math functions
│   │   └── stockData.js         # Universe metadata & synthetic models
│   ├── hooks/                   # Reactive state hooks (useLiveTick, useAlerts...)
│   ├── services/api.js          # Axios/Fetch client with graceful retries
│   ├── App.jsx                  # Master UI orchestration layout
│   ├── index.css                # Tailwind CSS v4 design tokens
│   └── main.jsx                 # React root DOM initialization
├── CLAUDE_MASTER_PROMPT.md      # Master context document for Claude LLMs
├── Dockerfile                   # Production container definition
├── docker-compose.yml           # Multi-service container orchestration
├── package.json                 # Dependencies, test scripts, and engines
├── render.yaml                  # Render.com deployment manifest
├── vercel.json                  # Vercel serverless build rules
└── vite.config.js               # Vite 8 + Tailwind v4 plugin config
```

---

## 7. How to Operate & Extend

### Local Development
```powershell
# Run both Frontend & Backend concurrently
npm run dev:all

# Run Vitest test suite (850 tests)
npm test

# Build production bundle
npm run build
```

### Production Deployment
```powershell
# Deploy latest build to Vercel
npx vercel --prod
```
