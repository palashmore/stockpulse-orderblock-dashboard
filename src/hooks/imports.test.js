import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// A module that calls useRefresh without importing it builds fine and lints clean but blanks the whole app.
function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(jsx?)$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });
}

describe('shared hook imports', () => {
  it('every file that calls useRefresh imports it', () => {
    const missing = files('src').filter((f) => {
      const s = readFileSync(f, 'utf8');
      return /\buseRefresh\(/.test(s) && !/import[^;]*\buseRefresh\b/.test(s) && !/export function useRefresh/.test(s);
    });
    expect(missing).toEqual([]);
  });
});
