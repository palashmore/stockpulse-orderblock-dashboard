import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The dashboard must never show invented market or account figures when a feed is down.
const FAKE = [/25623\.45/, /83912\.14/, /57234\.60/, /18,45,320/, /3,45,210/, /15,00,110/, /1245\.32/, /RELIANCE.{0,20}2846/, /fallback:\s*\{/, /generateCandlestickData\('RELIANCE'/, /FALLBACK_NEWS/];

describe('dashboard has no placeholder figures', () => {
  const dir = 'src/components/dashboard';
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.jsx'))) {
    it(`${f} contains no hardcoded market or account numbers`, () => {
      const s = readFileSync(`${dir}/${f}`, 'utf8');
      expect(FAKE.filter((re) => re.test(s)).map(String)).toEqual([]);
    });
  }
});
