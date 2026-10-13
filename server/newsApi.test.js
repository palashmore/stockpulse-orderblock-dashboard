import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp } from './app.js';

describe('/api/news', () => {
  let server;
  let base;

  const sampleRss = `<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0">
    <channel>
      <title>Google News</title>
      <item>
        <title><![CDATA[Reliance Industries Q2 net profit jumps 15% - Economic Times]]></title>
        <link>https://example.com/reliance-q2</link>
        <pubDate>Tue, 13 Oct 2026 10:00:00 GMT</pubDate>
      </item>
      <item>
        <title><![CDATA[RBI MPC maintains status quo on repo rate - Reuters]]></title>
        <link>https://example.com/rbi-mpc</link>
        <pubDate>Tue, 13 Oct 2026 09:30:00 GMT</pubDate>
      </item>
    </channel>
  </rss>`;

  beforeEach(async () => {
    const customFetch = async (url) => {
      if (url.includes('news.google.com/rss')) {
        return new Response(sampleRss, { status: 200, headers: { 'content-type': 'application/xml' } });
      }
      return new Response('Not found', { status: 404 });
    };

    const { app } = createApp({ fetchFn: customFetch });
    server = app.listen(0);
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(() => {
    server?.close();
  });

  it('serves parsed financial news with tags, source and links', async () => {
    const res = await fetch(`${base}/api/news?category=All`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.news).toHaveLength(2);
    expect(data.news[0]).toMatchObject({
      text: 'Reliance Industries Q2 net profit jumps 15%',
      source: 'Economic Times',
      tag: 'RELIANCE',
      link: 'https://example.com/reliance-q2',
    });
    expect(data.news[1]).toMatchObject({
      text: 'RBI MPC maintains status quo on repo rate',
      source: 'Reuters',
      tag: 'RBI',
      link: 'https://example.com/rbi-mpc',
    });
  });

  it('handles category queries and serves cached results', async () => {
    const res1 = await fetch(`${base}/api/news?category=Company`);
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(data1.category).toBe('Company');

    // Repeat query gets served from cache
    const res2 = await fetch(`${base}/api/news?category=Company`);
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2.news[0].text).toBe(data1.news[0].text);
  });
});
