import { useState, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { NIFTY_STOCKS } from '../data/stockData';
import { searchStocks } from '../services/api';
import { mergeSearchResults } from '../data/search';

export default function SearchBar({ selectedStock, onSelectStock }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0); // highlighted result for the arrow keys
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  const [remote, setRemote] = useState({ query: '', results: [], done: true });

  // Local Nifty 50 matches show instantly; every NSE-listed stock comes from the server search,
  // debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const results = await searchStocks(q);
      if (!cancelled) setRemote({ query: q, results, done: true });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const q = query.trim();
  const remoteForQuery = remote.query === q ? remote.results : [];
  const searching = q.length >= 2 && remote.query !== q;
  const filtered = mergeSearchResults(NIFTY_STOCKS, remoteForQuery, query, 10);
  const highlighted = Math.min(active, Math.max(0, filtered.length - 1));

  const choose = (stock) => {
    onSelectStock(stock);
    setQuery('');
    setActive(0);
    setIsOpen(false);
    inputRef.current?.blur();
  };

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative min-w-0 flex-1 sm:flex-none" ref={dropdownRef}>
      <div
        className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-all w-full sm:w-80 ${
          focused ? 'ring-1 ring-green-500/30' : ''
        }`}
        style={{
          backgroundColor: '#111827',
          border: '1px solid rgba(30, 45, 61, 0.6)',
        }}
      >
        <Search size={16} className="text-gray-500" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search stocks"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setIsOpen(true);
          }}
          onFocus={() => {
            setFocused(true);
            setIsOpen(true);
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && filtered.length > 0) {
              e.preventDefault();
              setActive((highlighted + 1) % filtered.length);
            } else if (e.key === 'ArrowUp' && filtered.length > 0) {
              e.preventDefault();
              setActive((highlighted - 1 + filtered.length) % filtered.length);
            } else if (e.key === 'Enter' && filtered.length > 0) {
              choose(filtered[highlighted]);
            }
          }}
          role="combobox"
          aria-expanded={isOpen && filtered.length > 0}
          aria-controls="stock-search-results"
          aria-autocomplete="list"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="Search stocks"
          className="bg-transparent text-sm text-gray-200 placeholder-gray-500 outline-none flex-1 min-w-0 w-0"
        />
        {query && (
          <button onClick={() => { setQuery(''); setIsOpen(false); }} className="cursor-pointer" aria-label="Clear search">
            <X size={14} className="text-gray-500 hover:text-gray-300" />
          </button>
        )}
        <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-xs text-gray-500 rounded"
          style={{ backgroundColor: 'rgba(30, 45, 61, 0.5)', border: '1px solid #1e2d3d' }}>
          Ctrl K
        </kbd>
      </div>

      {isOpen && q.length > 0 && filtered.length === 0 && (
        <div className="absolute top-full left-0 mt-1 rounded-lg px-3 py-3 text-xs text-gray-500 z-50 w-[calc(100vw-1.5rem)] sm:w-full" style={{ backgroundColor: '#151d2b', border: '1px solid #1e2d3d' }}>
          {searching ? 'Searching…' : 'No NSE stock found. Try the company name or the exact symbol.'}
        </div>
      )}

      {isOpen && filtered.length > 0 && (
        <div
          id="stock-search-results"
          role="listbox"
          className="absolute top-full left-0 mt-1 rounded-lg overflow-y-auto z-50 w-[calc(100vw-1.5rem)] sm:w-full sm:min-w-[22rem]"
          style={{
            backgroundColor: '#151d2b',
            border: '1px solid #1e2d3d',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            maxHeight: 'min(70vh, 28rem)',
          }}
        >
          {filtered.map((stock, i) => (
            <button
              key={stock.symbol}
              role="option"
              aria-selected={i === highlighted}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(stock)}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer ${
                i === highlighted
                  ? 'bg-green-500/15 text-green-400'
                  : selectedStock?.symbol === stock.symbol
                    ? 'bg-green-500/10 text-green-400'
                    : 'text-gray-300 hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ backgroundColor: 'rgba(0, 230, 118, 0.1)', color: '#00e676' }}>
                  {stock.symbol.slice(0, 2)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{stock.symbol}</div>
                  <div className="text-xs text-gray-500 truncate">{stock.name}</div>
                </div>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 max-w-[7rem] truncate"
                style={{ backgroundColor: 'rgba(30, 45, 61, 0.5)', color: '#94a3b8' }}>
                {stock.sector || 'NSE'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
