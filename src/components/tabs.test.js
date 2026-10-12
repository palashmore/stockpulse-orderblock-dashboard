import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { TAB_IDS } from './Sidebar.jsx';
import { START_TABS } from '../data/settings';

const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');

describe('navigation', () => {
  it('has unique screen ids and includes the Multi-Chart and Stock Lists screens', () => {
    expect(new Set(TAB_IDS).size).toBe(TAB_IDS.length);
    for (const id of ['lists', 'multichart', 'watchlist', 'books', 'diagnostics']) expect(TAB_IDS).toContain(id);
  });

  it('App renders a screen for every sidebar id (no sidebar item falls through to the default)', () => {
    for (const id of TAB_IDS) expect(app, `no case for "${id}"`).toMatch(new RegExp(`case '${id}':`));
  });

  it('only offers start screens that exist', () => {
    for (const id of START_TABS) expect(TAB_IDS).toContain(id);
  });

  it('no sidebar item still points at a "Coming soon" placeholder', () => {
    const placeholders = [...app.matchAll(/renderPlaceholder\('([^']+)'\)/g)].map((m) => m[1]);
    expect(placeholders).toEqual([]);
  });
});
