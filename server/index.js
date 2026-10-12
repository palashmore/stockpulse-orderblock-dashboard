import { createApp } from './app.js';

const PORT = process.env.PORT || 3001;
const { app, refreshNSECookies } = createApp();

const server = app.listen(PORT, () => {
  console.log(`\n  🚀 StockPulse API Server running at http://localhost:${PORT}`);
  console.log(`  📊 Endpoints:`);
  console.log(`     GET /api/quote/:symbol     - Stock quote (with dataStatus)`);
  console.log(`     GET /api/history/:symbol   - Historical OHLCV data`);
  console.log(`     GET /api/options/:symbol   - Options chain & OI data (NSE)`);
  console.log(`     GET /api/nifty50           - All Nifty 50 quotes`);
  console.log(`     GET /api/search?q=query    - Search stocks`);
  console.log(`     GET /api/market-status     - Market open/close status\n`);

  // Pre-warm NSE cookies
  refreshNSECookies();
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
