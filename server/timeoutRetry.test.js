import { describe, it, expect } from 'vitest';
import { createApp } from './app.js';

const realFetch = globalThis.fetch;

// A provider that never answers must cost one timeout, not three (the old ~30 s wait).
describe('provider timeouts', () => {
  it('does not retry an attempt that already timed out', async () => {
    let calls = 0;
    const fetchFn = async () => {
      calls++;
      const error = new Error('The operation was aborted due to timeout');
      error.name = 'TimeoutError';
      throw error;
    };
    const { app } = createApp({ fetchFn, retryDelayMs: 0 });
    const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
    try {
      const res = await realFetch(`http://127.0.0.1:${server.address().port}/api/history/TCS?range=1mo&interval=1d`);
      await res.text();
      expect(calls).toBe(1);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
