/**
 * How much of the selected universe a scan actually covers, in one honest sentence.
 * `universe` is every stock in the selection, `scanned` how many were attempted (the scan limit
 * caps it), `failed` the attempted ones with no usable data (`reasons` lists the distinct causes).
 */
export function scanCoverage({ universe, scanned, failed = 0, reasons = [] }) {
  const total = Math.max(universe ?? 0, scanned ?? 0);
  const loaded = Math.max(0, (scanned ?? 0) - failed);
  const beyondLimit = Math.max(0, total - (scanned ?? 0));
  const pct = total > 0 ? Math.round((loaded / total) * 1000) / 10 : 0;
  const parts = [`${loaded} of ${total} loaded`];
  if (failed > 0) parts.push(`${failed} failed${reasons.length ? ` (${reasons.join(', ')})` : ''}`);
  if (beyondLimit > 0) parts.push(`${beyondLimit} beyond the scan limit`);
  return { loaded, total, failed, beyondLimit, pct, complete: loaded === total && total > 0, text: parts.join(' · ') };
}
