import { describe, it, expect } from 'vitest';
import http from 'node:http';
import handler from '../api/index.js';

const call = (path, headers = {}) => new Promise((resolve, reject) => {
  const server = http.createServer((req, res) => handler(req, res));
  server.listen(0, '127.0.0.1', () => {
    http.get({ host: '127.0.0.1', port: server.address().port, path, headers }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => { server.close(); resolve({ status: res.statusCode, body }); });
    }).on('error', (e) => { server.close(); reject(e); });
  });
});

describe('Vercel serverless entry', () => {
  it('serves the API on the original /api path with no broker session and no backend of its own', async () => {
    const r = await call('/api/health');
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body).status).toBe('ok');
    expect((await call('/api/market-status')).status).toBe(200);
    expect((await call('/api/history/TCS%3Bx')).status).toBe(400); // a multi-part path reaches the right route
  });
  it('keeps personal endpoints closed to visitors arriving through the platform proxy', async () => {
    for (const p of ['/api/alerts']) {
      expect((await call(p, { 'x-forwarded-for': '203.0.113.7' })).status).toBe(403);
    }
  });
});
