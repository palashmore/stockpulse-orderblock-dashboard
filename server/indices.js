// Index constituent lists from NSE Indices' official files (niftyindices.com, ind_<name>list.csv).
// Each list is the index's current membership; NSE revises them periodically, so lists are refreshed
// daily and the last good copy is kept if a refresh fails.
//
// Sensex and other BSE indices are not offered: BSE blocks scripted access, so no verified list exists.
export const INDEX_BASE = 'https://www.niftyindices.com/IndexConstituent';

export const INDEX_DEFS = [
  { id: 'nifty50', file: 'nifty50', label: 'Nifty 50', group: 'Broad market' },
  { id: 'niftynext50', file: 'niftynext50', label: 'Nifty Next 50', group: 'Broad market' },
  { id: 'nifty100', file: 'nifty100', label: 'Nifty 100', group: 'Broad market' },
  { id: 'nifty200', file: 'nifty200', label: 'Nifty 200', group: 'Broad market' },
  { id: 'nifty500', file: 'nifty500', label: 'Nifty 500', group: 'Broad market' },
  { id: 'largemidcap250', file: 'niftylargemidcap250', label: 'Nifty LargeMidcap 250', group: 'Broad market' },
  { id: 'midsmallcap400', file: 'niftymidsmallcap400', label: 'Nifty MidSmallcap 400', group: 'Broad market' },

  { id: 'midcap50', file: 'niftymidcap50', label: 'Nifty Midcap 50', group: 'Mid cap' },
  { id: 'midcap100', file: 'niftymidcap100', label: 'Nifty Midcap 100', group: 'Mid cap' },
  { id: 'midcap150', file: 'niftymidcap150', label: 'Nifty Midcap 150', group: 'Mid cap' },

  { id: 'smallcap50', file: 'niftysmallcap50', label: 'Nifty Smallcap 50', group: 'Small cap' },
  { id: 'smallcap100', file: 'niftysmallcap100', label: 'Nifty Smallcap 100', group: 'Small cap' },
  { id: 'smallcap250', file: 'niftysmallcap250', label: 'Nifty Smallcap 250', group: 'Small cap' },

  { id: 'bank', file: 'niftybank', label: 'Nifty Bank', group: 'Sector' },
  { id: 'psubank', file: 'niftypsubank', label: 'Nifty PSU Bank', group: 'Sector' },
  { id: 'financeservices', file: 'niftyfinance', label: 'Nifty Financial Services', group: 'Sector' },
  { id: 'financeservices2550', file: 'niftyfinancialservices25-50', label: 'Nifty Financial Services 25/50', group: 'Sector' },
  { id: 'it', file: 'niftyit', label: 'Nifty IT', group: 'Sector' },
  { id: 'auto', file: 'niftyauto', label: 'Nifty Auto', group: 'Sector' },
  { id: 'pharma', file: 'niftypharma', label: 'Nifty Pharma', group: 'Sector' },
  { id: 'healthcare', file: 'niftyhealthcare', label: 'Nifty Healthcare', group: 'Sector' },
  { id: 'fmcg', file: 'niftyfmcg', label: 'Nifty FMCG', group: 'Sector' },
  { id: 'metal', file: 'niftymetal', label: 'Nifty Metal', group: 'Sector' },
  { id: 'realty', file: 'niftyrealty', label: 'Nifty Realty', group: 'Sector' },
  { id: 'energy', file: 'niftyenergy', label: 'Nifty Energy', group: 'Sector' },
  { id: 'oilgas', file: 'niftyoilgas', label: 'Nifty Oil & Gas', group: 'Sector' },
  { id: 'media', file: 'niftymedia', label: 'Nifty Media', group: 'Sector' },
  { id: 'infra', file: 'niftyinfra', label: 'Nifty Infrastructure', group: 'Sector' },
  { id: 'consumerdurables', file: 'niftyconsumerdurables', label: 'Nifty Consumer Durables', group: 'Sector' },

  { id: 'commodities', file: 'niftycommodities', label: 'Nifty Commodities', group: 'Theme' },
  { id: 'consumption', file: 'niftyconsumption', label: 'Nifty India Consumption', group: 'Theme' },
  { id: 'mnc', file: 'niftymnc', label: 'Nifty MNC', group: 'Theme' },
  { id: 'pse', file: 'niftypse', label: 'Nifty PSE', group: 'Theme' },
];

export const MAX_SYMBOLS_PER_REQUEST = 300;

export function indexDef(id) {
  return INDEX_DEFS.find((d) => d.id === id) ?? null;
}

const HEADER = 'Company Name,Industry,Symbol,Series,ISIN Code';
const SYMBOL = /^[A-Z0-9&.-]{1,20}$/;

function splitLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/**
 * Parse an NSE constituent file. Throws when the header is not the expected one (for example when the
 * site returns an HTML error page), so a changed or broken file is never read as an empty index.
 */
export function parseIndexCsv(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2 || lines[0].replace(/\s+/g, '') !== HEADER.replace(/\s+/g, '')) {
    throw new Error('Unexpected index file format');
  }
  const seen = new Set();
  const stocks = [];
  for (const line of lines.slice(1)) {
    const [name, industry, symbol, series] = splitLine(line);
    if (!SYMBOL.test(symbol ?? '') || series !== 'EQ' || seen.has(symbol)) continue;
    seen.add(symbol);
    stocks.push({ symbol, name, industry: industry || '' });
  }
  if (stocks.length === 0) throw new Error('Index file had no stocks');
  return stocks;
}
