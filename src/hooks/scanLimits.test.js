import { describe, expect, it } from 'vitest';
import { MAX_SCAN } from './useScreenerData';
import { MAX_INTRADAY_SCAN } from './useIntradayScan';

describe('scan limits', () => {
  it('daily scan covers up to 500 stocks and intraday up to 300', () => {
    expect(MAX_SCAN).toBe(500);
    expect(MAX_INTRADAY_SCAN).toBe(300);
  });
});
