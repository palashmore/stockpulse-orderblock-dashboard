import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// React requires hooks to run in the same order on every render. A hook placed after an early `return` makes the
// component throw the first time its data arrives ("Rendered more hooks than during the previous render").
// This guard scans each listed component for a hook call that appears after a top-level early return.
const COMPONENTS = ['src/components/ScannerPanel.jsx'];

describe('hook order', () => {
  for (const file of COMPONENTS) {
    it(`${file} calls every hook before its first early return`, () => {
      const lines = readFileSync(file, 'utf8').split('\n');
      const start = lines.findIndex((l) => /^export default function|^function [A-Z]/.test(l));
      let returned = -1;
      lines.slice(start).forEach((line, i) => {
        if (returned < 0 && /^  if \(.*\) \{?$/.test(line) && /return/.test(lines[start + i + 1] ?? '')) returned = start + i;
        if (returned >= 0 && start + i > returned && /^  const .*= use(Memo|Callback|State|Effect|Ref)\(/.test(line)) {
          throw new Error(`${file}:${start + i + 1} calls a hook after the early return at line ${returned + 1}`);
        }
      });
      expect(true).toBe(true);
    });
  }
});
