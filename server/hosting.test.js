import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from './app.js';

const realFetch = globalThis.fetch;

describe('serving the built app', () => {
  let dir;
  let server;
  let base;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-dist-'));
    fs.mkdirSync(path.join(dir, 'assets'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<html><body>StockPulse shell</body></html>');
    fs.writeFileSync(path.join(dir, 'assets', 'app-abc123.js'), 'console.log(1)');
    fs.writeFileSync(path.join(dir, 'sw.js'), 'self.addEventListener("fetch", () => {})');
    const { app } = createApp({ fetchFn: async () => new Response('{}', { status: 404 }), staticDir: dir, alertIntervalMs: 0 });
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(() => {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('serves the page at the root and for any app route, so a refresh on ?tab= or a deep link works', async () => {
    for (const p of ['/', '/?tab=dashboard', '/some/deep/link']) {
      const res = await realFetch(`${base}${p}`);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('StockPulse shell');
      expect(res.headers.get('cache-control')).toBe('no-cache');
    }
  });

  it('caches hashed assets for a year and always revalidates the service worker', async () => {
    const asset = await realFetch(`${base}/assets/app-abc123.js`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get('cache-control')).toContain('immutable');
    const sw = await realFetch(`${base}/sw.js`);
    expect(sw.headers.get('cache-control')).toBe('no-cache');
  });

  it('keeps the API where it is: API routes are not swallowed by the page fallback', async () => {
    const health = await realFetch(`${base}/api/health`);
    expect(health.status).toBe(200);
    expect((await health.json()).status).toBe('ok');
    const unknown = await realFetch(`${base}/api/not-a-route`);
    expect(unknown.status).toBe(404);
    expect(await unknown.text()).not.toContain('StockPulse shell');
  });
});

describe('without a built app', () => {
  it('serves only the API when there is no dist folder', async () => {
    const { app } = createApp({ fetchFn: async () => new Response('{}'), staticDir: path.join(os.tmpdir(), 'sp-nonexistent-dist'), alertIntervalMs: 0 });
    const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    try {
      const base = `http://127.0.0.1:${server.address().port}`;
      expect((await realFetch(`${base}/api/health`)).status).toBe(200);
      expect((await realFetch(`${base}/`)).status).toBe(404);
    } finally {
      server.close();
    }
  });
});

describe('personal endpoints behind a reverse proxy', () => {
  let server;
  let port;
  beforeAll(async () => {
    const { app } = createApp({ fetchFn: async () => new Response('{}'), alertIntervalMs: 0 });
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    port = server.address().port;
  });
  afterAll(() => server.close());

  const get = (headers = {}) => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: '/api/alerts', headers }, (res) => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });

  it('answers a direct local request', async () => {
    expect(await get()).toBe(200);
  });

  it('refuses a request relayed by a proxy on the same machine, whichever forwarding header it adds', async () => {
    for (const headers of [{ 'X-Forwarded-For': '203.0.113.9' }, { 'X-Forwarded-Host': 'example.com' }, { Forwarded: 'for=203.0.113.9' }, { 'X-Real-IP': '203.0.113.9' }]) {
      expect(await get(headers)).toBe(403);
    }
  });
});
