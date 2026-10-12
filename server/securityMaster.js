import { inflateRawSync } from 'node:zlib';

// ICICI Direct publishes a daily "security master" zip (refreshed about 08:00) that maps ICICI's own
// stock codes to NSE symbols, company names and ISINs. Breeze holdings come back with ICICI codes
// and ISINs only, so this is how they become readable names.
export const SECURITY_MASTER_URL = 'https://directlink.icicidirect.com/NewSecurityMaster/SecurityMaster.zip';
export const NSE_MASTER_FILE = 'NSEScripMaster.txt';

/** Extract one entry from a zip held in memory (stored or deflated, non-zip64). Null when absent. */
export function readZipEntry(buf, name) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip file');

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Corrupt zip directory');
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLength = buf.readUInt16LE(p + 28);
    const extraLength = buf.readUInt16LE(p + 30);
    const commentLength = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const entryName = buf.toString('utf8', p + 46, p + 46 + nameLength);
    if (entryName === name) {
      const dataStart = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
      const data = buf.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data);
      throw new Error(`Unsupported zip compression ${method}`);
    }
    p += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

/** Split one CSV line, honouring double quotes and "" escapes. */
export function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/**
 * Parse NSEScripMaster.txt into lookups. Only series EQ (and BE, SM, etc. are ignored) rows are kept.
 *   byCode: ICICI stock code (the file's ShortName) -> { symbol, name, isin }
 *   byIsin: ISIN -> same
 */
export function parseNseMaster(text) {
  const lines = String(text).split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { byCode: new Map(), byIsin: new Map() };
  const header = splitCsvLine(lines[0]);
  const col = (name) => header.indexOf(name);
  const iCode = col('ShortName');
  const iSeries = col('Series');
  const iName = col('CompanyName');
  const iIsin = col('ISINCode');
  const iSymbol = header.length - 1; // ExchangeCode: the NSE trading symbol
  if (header[iSymbol] !== 'ExchangeCode' || [iCode, iSeries, iName, iIsin].some((i) => i < 0)) {
    throw new Error('Unexpected security master layout');
  }

  const byCode = new Map();
  const byIsin = new Map();
  for (const line of lines.slice(1)) {
    const f = splitCsvLine(line);
    if (f.length < header.length || f[iSeries] !== 'EQ' || !f[iSymbol]) continue;
    const info = { symbol: f[iSymbol], name: f[iName], isin: f[iIsin] };
    byCode.set(f[iCode], info);
    if (f[iIsin]) byIsin.set(f[iIsin], info);
  }
  return { byCode, byIsin };
}

/** Download and parse the master. `fetchFn` is injectable. */
export async function loadSecurityMaster(fetchFn) {
  const response = await fetchFn(SECURITY_MASTER_URL, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Security master HTTP ${response.status}`);
  const entry = readZipEntry(Buffer.from(await response.arrayBuffer()), NSE_MASTER_FILE);
  if (!entry) throw new Error(`${NSE_MASTER_FILE} missing from the security master`);
  return parseNseMaster(entry.toString('utf8'));
}
