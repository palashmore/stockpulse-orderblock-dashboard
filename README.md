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
