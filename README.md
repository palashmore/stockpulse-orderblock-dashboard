# 📈 StockPulse — Daily Stock Market Analysis & Order Block Terminal

> Real-time Indian Stock Market (NSE / Nifty 50) institutional order flow analysis, Smart Money Concepts (SMC) order blocks, and Options Chain Open Interest (OI) buildup trading dashboard.

![StockPulse Terminal](https://img.shields.io/badge/Status-Live-00e676?style=for-the-badge)
![React 19](https://img.shields.io/badge/React-19-61dafb?style=for-the-badge&logo=react)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8?style=for-the-badge&logo=tailwindcss)
![TradingView](https://img.shields.io/badge/TradingView-Lightweight_Charts-2196f3?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-ffd600?style=for-the-badge)

---

## 🌟 Key Features

* **🕯️ Interactive TradingView Lightweight Charts (v5):** Candlestick charting with SMA 20, SMA 50, dynamic VWAP, and volume histograms.
* **🟢 Bullish Order Blocks (LONG BUILD-UP):** Automated algorithmic detection of institutional demand zones with mitigation/test status and strength score.
* **🔴 Bearish Order Blocks (SHORT BUILD-UP):** Detection of institutional supply zones with risk metrics.
* **⚡ Derivatives & Options Open Interest (OI) Analysis:**
  * **Put-Call Ratio (PCR)** needle gauge with real-time bullish/bearish sentiment.
  * **Max Pain Strike** calculation minimizing total option loss.
  * **Dual-sided Put OI vs Call OI** horizontal distribution bar chart centered by Strike Price.
  * **OI Buildup Matrix:** Instant classification of *Long Build-up*, *Short Build-up*, *Long Unwinding*, and *Short Covering*.
* **🎯 Tactical Signal Cards:** Live signals featuring custom Canvas mini sparklines, Key Support (S1/S2), Resistance (R1/R2), Zone, and Risk ratings.
* **🔍 Instant Ticker Navigation:** Fast Nifty 50 stock searching with `Ctrl + K`.
* **📱 Responsive Screener & Watchlist:** Top gainers/losers, volume analysis, and sector filtering.

---

## 🛠️ Architecture & Tech Stack

* **Frontend:** React 19, Vite 8, Tailwind CSS v4, Lucide Icons, TradingView Lightweight Charts v5
* **Backend:** Node.js, Express 5, CORS, Yahoo Finance & NSE Derivatives Proxy with in-memory caching
* **Quant Algorithms:** ATR(14) displacement filters, Max Pain optimization, Put-Call Ratio mathematical models

---

## Data sources and status labels

By default quotes and charts come from Yahoo Finance and are labeled `DELAYED` (or `HISTORICAL` when the market is closed). Every response carries a status: `LIVE`, `DELAYED`, `HISTORICAL`, `STALE`, `SIMULATED` or `UNAVAILABLE`. Simulated data appears only with `?demo=1`.

### Optional: ICICI Direct (Breeze API) as a live source
1. Register an app at https://api.icicidirect.com/apiuser/home with redirect URL `https://127.0.0.1`.
2. Copy `.env.example` to `.env` and set `BREEZE_API_KEY` and `BREEZE_API_SECRET` (the file is git-ignored).
3. Run `npm run dev:all`, open **Settings**, follow the sign-in steps (once a day), and paste the redirect address.

Signed in, quotes and 1m / 5m / 30m / daily charts for mapped Nifty 50 stocks come from Breeze and are labeled `LIVE` only while the market is open and the exchange's last-trade time is under two minutes old. Anything else falls back to Yahoo. The integration is read-only (no orders). The Breeze request formats follow ICICI's published documentation and are tested with mocked responses; verify against your account.

### Price alerts that keep running with the browser closed
Alerts created on the **Alerts** screen are saved by the server (default `data/alerts.json`, git-ignored) and checked about once a minute while the market is open, so they work with the page closed as long as the server process is running (`npm run dev:all` or `npm run server`).

* Only `LIVE` or `DELAYED` prices are used. Stale, closed-market, historical or simulated data never fires an alert, and nothing is checked while the market is closed.
* An alert fires once and is saved as triggered *before* any notification is sent, so a failed notification never causes a repeat. A gap between two checks (for example after a restart) counts as a crossing.
* Alerts previously saved in the browser can be moved to the server from the Alerts screen. If the server's alert service is unreachable (for example the page is opened from a phone), the screen falls back to browser-only alerts that run while the tab is open, and says so.
* Optional push to your phone through [ntfy](https://ntfy.sh) (free): set `NTFY_TOPIC` in `.env` (see `.env.example`), subscribe to the same topic in the ntfy app, and use **Send test** on the Alerts screen. The alert text is sent to that topic, so use a long random name.
* **Feed alerts** (on by default, 5 minutes, adjustable on the Alerts screen): during market hours the server also watches that live or delayed prices keep arriving. If they stop for the set time it raises one notice (and a push, if configured), and one more when they return. It also tells you if a signed-in ICICI Direct session drops mid-session. Nothing is said while the market is closed.
* The alert endpoints answer only on the machine running the server, like the other personal endpoints. Alerts never place orders.

### Multi-Chart linking
On the **Multi-Chart** screen, "Link crosshair and zoom" (on by default) makes the pointer on one chart show the same moment on all the others, and scrolling or zooming one moves them all. Charts on different timeframes line up on the nearest earlier bar. "Same stock in every chart" shows one stock everywhere: turn off "Same timeframe for all" to compare its timeframes side by side.

### Mainboard IPO tracking
The **IPOs** tab lists mainboard issues only (SME, debt and withdrawal windows are dropped) from NSE's public IPO feeds, through the server. Tabs: open now, upcoming, closed (awaiting listing), listed, tracked, all (history from 2023). Each issue shows its price band, lot, minimum investment, subscription while open, and a timeline: opening, closing, allotment, refund/credit and listing.

* Opening, closing and listing dates are as NSE publishes them. Allotment, refund/credit and a listing date not yet announced are marked **exp.**: they are worked out from SEBI's T+3 timeline on the exchange trading calendar and can change.
* The feed is an unofficial website source, so it is labelled `DELAYED` (or `STALE` when a cached copy is shown after a failure) and never presented as live. If NSE cannot be reached nothing is shown instead of a guess.
* Recently listed issues show the latest price against the issue price, and the listing-day result as reported by InvestorGain.
* **Grey-market premium (GMP)**, the announced allotment and listing dates, and mainboard issues NSE does not list yet come from [InvestorGain](https://www.investorgain.com/)'s public GMP report page (read at most every 15 minutes; its robots.txt allows it). GMP is an unofficial dealer quote: it can be wrong or manipulated and does not guarantee a listing gain. If the page cannot be read, no premium is shown rather than a guess.
* **Analysis** on each issue is a rule-based checklist (grey-market premium, subscription, anchor demand, ticket size, issue size, and the listing result for listed issues). It always lists "the business" (financials, valuation, use of proceeds) as not assessed and links the offer document. It is not a recommendation to apply.
* **Allotment status** appears for closed and recently listed issues with the registrar's name (from NSE) and links to the registrar's own check page. Your PAN or application number is typed on the registrar's site, never here.

### Portfolio review, allocation and correlation
With the Breeze sign-in, the **Portfolio** screen has four tabs: Holdings, **Review: buy, hold, sell**, Allocation, and Correlation & risk.

* **Review** gives each holding a long-term view (50- and 200-day averages), a short-term view (the Swing screen's rules, RSI, distance from the 20-day average) and a rule-based action: add (rule match), hold, hold-don't-add, hold-watch-closely, consider trimming, or review reduce/exit. Every label lists the reasons, and the rules are written on the screen under "How each label is decided".
* **Allocation** shows weight by stock, sector and size (from NSE index membership) and how concentrated the portfolio is. **Correlation & risk** shows a heatmap of daily-return correlation, closely correlated pairs, and the volatility and worst fall of today's weights replayed over the last year.
* ICICI's holdings feed has no buy price, so profit or loss needs your average buy price: type it into the optional column. It is saved in this browser only.
* These are rule matches on past daily prices, not investment advice. They do not know your goals, time horizon or taxes. The app is read-only and cannot place orders.

### Day / night theme
The sun/moon button in the top bar flips between the night (dark) and day (light) theme; **Settings** also offers "Follow my device". The choice is saved in this browser.

---

## 🚀 Quick Start Guide

### 1. Clone the repository
```bash
git clone https://github.com/palashmore/stockpulse-orderblock-dashboard.git
cd stockpulse-orderblock-dashboard
```

### 2. Install dependencies
```bash
npm install
```

### 3. Run the development server
```bash
# Run both Frontend & Backend API concurrently
npm run dev:all

# Or run frontend only
npm run dev
```

* Frontend: `http://localhost:5173`
* Backend API: `http://localhost:3001`

### Phone / tablet (installable web app)

The layout is responsive: below 768 px wide the side bar is replaced by a bottom navigation bar (four main screens plus a **More** sheet).
The app is also a PWA (manifest + a service worker that caches only the app shell, never market data or account data), so a production build can be installed to the home screen.

```bash
# Serve the app and the API on your local network, then open http://<this-computer-ip>:5173 on the phone
npm run dev:lan

# Installable build (service worker is registered only in production builds)
npm run build && npm run preview:all
```

* The page finds the API at the same host on port `3001`. Set `VITE_API_BASE` to override it.
* Account endpoints (broker session, portfolio, order/trade books) answer only on the computer running the server (loopback), so on a phone you see market data and analysis but not your account. This is deliberate.
* Browsers only offer "Install" on `https://` or `localhost`; over plain LAN HTTP you can still use the app from the browser.

---

## 📦 Production Build & Deploy

```bash
# Build production bundle
npm run build

# Deploy to Vercel
npx vercel --prod
```

---

## 📄 License

This project is licensed under the MIT License.
