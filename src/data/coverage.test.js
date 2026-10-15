import { describe, expect, it } from 'vitest';
import { scanCoverage } from './coverage';

describe('scanCoverage', () => {
  it('reports "245 of 250 loaded" with the failures', () => {
    const c = scanCoverage({ universe: 250, scanned: 250, failed: 5, reasons: ['no data'] });
    expect(c.text).toBe('245 of 250 loaded · 5 failed (no data)');
    expect(c.complete).toBe(false);
    expect(c.pct).toBe(98);
  });
  it('counts stocks beyond the scan limit against coverage', () => {
    const c = scanCoverage({ universe: 500, scanned: 400, failed: 0 });
    expect(c.text).toBe('400 of 500 loaded · 100 beyond the scan limit');
    expect(c.loaded).toBe(400);
  });
  it('is complete only when everything loaded', () => {
    expect(scanCoverage({ universe: 50, scanned: 50 }).complete).toBe(true);
    expect(scanCoverage({ universe: 0, scanned: 0 }).complete).toBe(false);
  });
});
