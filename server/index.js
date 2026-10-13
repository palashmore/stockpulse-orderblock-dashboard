import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { createFileAlertStore, createNotifier } from './alertEngine.js';
import { setupWebSocketServer } from './websocket.js';

const PORT = process.env.PORT || 3001;
const ALERTS_FILE = process.env.ALERTS_FILE || 'data/alerts.json';
const notifier = createNotifier(process.env);
const STATIC_DIR = process.env.STATIC_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const { app, refreshNSECookies, breeze, streamHub, alerts, circuitBreaker } = createApp({ alertStore: createFileAlertStore(ALERTS_FILE), alertNotifier: notifier, staticDir: STATIC_DIR });

const server = app.listen(PORT, () => {
  console.log(`\n  🚀 StockPulse API Server running at http://localhost:${PORT}`);
  console.log(`  📊 Endpoints:`);
  console.log(`     GET /api/quote/:symbol       - Stock quote (with fundamentals)`);
  console.log(`     GET /api/fundamentals/:symbol - Deep fundamental data & median P/E bands`);
  console.log(`     GET /api/history/:symbol     - Historical OHLCV data`);
  console.log(`     GET /api/options/:symbol     - Options chain & OI data (NSE)`);
  console.log(`     GET /api/nifty50             - All Nifty 50 quotes`);
  console.log(`     GET /api/search?q=query      - Search stocks`);
  console.log(`     GET /api/market-status       - Market open/close status`);
  console.log(`     WS  /ws                      - Real-Time WebSocket live ticks & bars`);
  console.log(`     GET /api/broker/circuit-breaker - Execution circuit breaker status`);
  console.log(`     POST /api/broker/order       - Actionable bracket order terminal`);
  console.log(`     /api/alerts                  - Price alerts checked by this server (saved in ${ALERTS_FILE})\n`);
  if (notifier.error) console.warn(`  ⚠ Push notifications warning: ${notifier.error}`);
  else if (notifier.channel !== 'none') console.log(`  🔔 Push notifications: ${notifier.channel}`);

  // Setup WebSocket Server attached to HTTP server
  setupWebSocketServer({
    server,
    breeze,
    streamHub,
  });

  // Pre-warm NSE cookies
  refreshNSECookies();
  alerts.start();
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    alerts.stop();
    server.close(() => process.exit(0));
  });
}
