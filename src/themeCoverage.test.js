import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The day theme maps the app's dark neutrals to light ones in src/theme-day.css. If a component starts using a new
// dark surface or light-grey text colour inline, it would look wrong (or be unreadable) in the day theme. This test
// finds every neutral hex colour used in a component and requires a mapping for it.
const root = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.join(root, 'theme-day.css'), 'utf8');

function* files(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else if (/\.jsx$/.test(entry.name)) yield full;
  }
}

const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
const isNeutral = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return Math.max(r, g, b) - Math.min(r, g, b) < 50;
};
const luminance = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).reduce((s, v) => s + v, 0) / 765;

// Neutrals that look right on both a dark and a light page (mid greys), or that are only drawn on coloured fills
const FINE_BOTH = new Set(['#64748b', '#475569', '#334155', '#4a5568', '#ffffff', '#000000']);

describe('day theme coverage', () => {
  const used = new Map();
  for (const file of files(path.join(root, 'components'))) {
    const text = fs.readFileSync(file, 'utf8');
    for (const [hex] of text.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
      const key = hex.toLowerCase();
      if (!used.has(key)) used.set(key, path.basename(file));
    }
  }
  const neutrals = [...used].filter(([hex]) => isNeutral(hex) && !FINE_BOTH.has(hex) && (luminance(hex) < 0.2 || luminance(hex) > 0.5));

  it('finds the neutral colours the components use', () => {
    expect(neutrals.length).toBeGreaterThan(5);
  });

  it.each(neutrals)('maps %s (used in %s)', (hex) => {
    expect(css).toContain(rgb(hex));
  });

  // translucent dark neutrals (panels, bars, hover tints) must be mapped too; pure black overlays work on both themes
  const translucent = new Map();
  for (const file of files(path.join(root, 'components'))) {
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/rgba\(\s*(\d+),\s*(\d+),\s*(\d+),/g)) {
      const [r, g, b] = [m[1], m[2], m[3]].map(Number);
      if (Math.max(r, g, b) - Math.min(r, g, b) < 50 && (r + g + b) / 3 < 80 && r + g + b > 0) translucent.set(`rgba(${r}, ${g}, ${b},`, path.basename(file));
    }
  }
  it.each([...translucent])('maps translucent %s (used in %s)', (prefix) => {
    expect(css).toContain(prefix);
  });

  it('keeps the Tailwind scale and page variables remapped', () => {
    for (const name of ['--color-gray-300', '--color-gray-500', '--color-white', '--bg-primary', '--text-primary']) expect(css).toContain(name);
  });
});
