import { useEffect, useState } from 'react';
import { freshness } from '../data/freshness';

const COLORS = { fresh: '#00e676', delayed: '#ffd600', stale: '#ff1744', unknown: '#64748b' };

// One display clock shared by every label (it only redraws the age text, it never fetches anything)
const listeners = new Set();
let clock = null;
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    listeners.add(setNow);
    if (!clock) clock = setInterval(() => listeners.forEach((fn) => fn(Date.now())), 10000);
    return () => {
      listeners.delete(setNow);
      if (listeners.size === 0) { clearInterval(clock); clock = null; }
    };
  }, []);
  return now;
}

/** "Updated 11:02:05 · 12s ago" with a colour dot: green fresh, amber delayed, red stale. */
export default function Freshness({ lastSuccessAt, failures = 0, intervalMs = 60000 }) {
  const now = useNow();
  const f = freshness({ lastSuccessAt, now, intervalMs, failures });
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] text-gray-500" aria-live="off" title={`Data is ${f.state}`}>
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: COLORS[f.state] }} />
      {f.text}
    </span>
  );
}
