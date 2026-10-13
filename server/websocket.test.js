import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { WebSocket } from 'ws';
import { setupWebSocketServer } from './websocket.js';

describe('Real-Time WebSocket Streaming Engine', () => {
  let server;
  let port;
  let wsHub;

  beforeEach(async () => {
    server = http.createServer();
    await new Promise((resolve) => server.listen(0, resolve));
    port = server.address().port;

    wsHub = setupWebSocketServer({
      server,
      getLatestQuote: async (sym) => ({
        price: 2500,
        open: 2490,
        high: 2510,
        low: 2480,
        volume: 500000,
      }),
      tickIntervalMs: 100, // fast for testing
    });
  });

  afterEach(() => {
    wsHub.stop();
    server.close();
  });

  it('connects and handles ping/pong', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    const messages = [];

    await new Promise((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({ action: 'ping' }));
      });
      ws.on('message', (data) => {
        const parsed = JSON.parse(data.toString());
        messages.push(parsed);
        if (parsed.type === 'pong') {
          ws.close();
          resolve();
        }
      });
    });

    expect(messages.some((m) => m.type === 'connected')).toBe(true);
    expect(messages.some((m) => m.type === 'pong')).toBe(true);
  });

  it('subscribes and streams ticks for equity symbol', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    const ticks = [];

    await new Promise((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({ action: 'subscribe', symbol: 'RELIANCE' }));
      });
      ws.on('message', (data) => {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === 'tick' && parsed.symbol === 'RELIANCE') {
          ticks.push(parsed);
          if (ticks.length >= 2) {
            ws.close();
            resolve();
          }
        }
      });
    });

    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(ticks[0].price).toBeGreaterThan(0);
    expect(ticks[0].status).toBe('LIVE');
  });
});
