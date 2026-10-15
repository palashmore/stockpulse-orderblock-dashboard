import { useState, useRef, useEffect } from 'react';
import { Search, X, Loader2, CornerDownLeft } from 'lucide-react';
import { NIFTY_STOCKS } from '../data/stockData';
import { searchStocks } from '../services/api';
import { mergeSearchResults } from '../data/search';

export default function SearchBar({ selectedStock, onSelectStock }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0); // highlighted result for arrow keys
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  const [remote, setRemote] = useState({ query: '', results: [], done: true });

  // Local Nifty 50 matches show instantly; remote NSE matches debounce at 250ms
  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) return;
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
  const searching = q.length >= 1 && remote.query !== q;
  const filtered = mergeSearchResults(NIFTY_STOCKS, remoteForQuery, query, 15);
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
        className={`flex items-center gap-2 rounded-lg px-3 py-1.5 transition-all w-full sm:w-80 ${
          focused ? 'ring-1 ring-green-500/40 shadow-[0_0_15px_rgba(0,230,118,0.1)]' : ''
        }`}
        style={{
          backgroundColor: '#111827',
          border: '1px solid rgba(30, 45, 61, 0.6)',
        }}
      >
        {searching ? (
          <Loader2 size={15} className="animate-spin" style={{ color: '#00e676' }} />
        ) : (
          <Search size={15} style={{ color: focused ? '#00e676' : '#64748b' }} />
        )}

        <input
          ref={inputRef}
          type="text"
          placeholder="Search stocks (e.g. RELIANCE, TCS)"
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
          className="bg-transparent text-xs text-gray-200 placeholder-gray-500 outline-none flex-1 min-w-0 w-0"
        />

        {query && (
          <button
            onClick={() => {
              setQuery('');
              setIsOpen(false);
            }}
            className="p-0.5 rounded hover:bg-white/5 cursor-pointer transition-colors"
            aria-label="Clear search"
          >
            <X size={13} className="text-gray-400 hover:text-gray-200" />
          </button>
        )}

        <kbd
          className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono text-gray-400 rounded select-none"
          style={{ backgroundColor: 'rgba(30, 45, 61, 0.5)', border: '1px solid #1e2d3d' }}
        >
          Ctrl K
        </kbd>
      </div>

      {/* No results popover */}
      {isOpen && q.length > 0 && filtered.length === 0 && (
        <div
          className="absolute top-full left-0 mt-1.5 rounded-lg px-3 py-3 text-xs text-gray-400 z-50 w-[calc(100vw-1.5rem)] sm:w-full shadow-2xl"
          style={{ backgroundColor: '#151d2b', border: '1px solid #1e2d3d' }}
        >
          {searching ? (
            <div className="flex items-center gap-2 text-gray-400">
              <Loader2 size={14} className="animate-spin text-green-400" />
              <span>Querying NSE instruments…</span>
            </div>
          ) : (
            <div>
              <p className="font-medium text-gray-300">No NSE stock found</p>
              <p className="text-[11px] text-gray-500 mt-0.5">Try the company name (e.g. &quot;Tata Motors&quot;) or the exchange ticker (&quot;TATAMOTORS&quot;).</p>
            </div>
          )}
        </div>
      )}

      {/* Results Dropdown */}
      {isOpen && filtered.length > 0 && (
        <div
          id="stock-search-results"
          role="listbox"
          className="absolute top-full left-0 mt-1.5 rounded-xl overflow-hidden z-50 w-[calc(100vw-1.5rem)] sm:w-full sm:min-w-[22rem] shadow-2xl"
          style={{
            backgroundColor: '#151d2b',
            border: '1px solid #1e2d3d',
            boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            maxHeight: 'min(70vh, 28rem)',
          }}
        >
          {/* Header indicator */}
          <div
            className="flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold tracking-wider text-gray-400 uppercase"
            style={{ backgroundColor: '#111827', borderBottom: '1px solid rgba(30, 45, 61, 0.6)' }}
          >
            <span>Instruments ({filtered.length})</span>
            {searching && <span style={{ color: '#00e676' }}>Updating…</span>}
          </div>

          <div className="overflow-y-auto max-h-80">
            {filtered.map((stock, i) => {
              const isHighlighted = i === highlighted;
              const isSelected = selectedStock?.symbol === stock.symbol;

              return (
                <button
                  key={stock.symbol}
                  role="option"
                  aria-selected={isHighlighted}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(stock)}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left transition-colors cursor-pointer border-b ${
                    isHighlighted
                      ? 'bg-green-500/15 text-green-400'
                      : isSelected
                        ? 'bg-green-500/10 text-green-400'
                        : 'text-gray-300 hover:bg-white/5'
                  }`}
                  style={{
                    borderColor: 'rgba(30, 45, 61, 0.3)',
                    borderLeft: isHighlighted ? '3px solid #00e676' : isSelected ? '3px solid rgba(0, 230, 118, 0.5)' : '3px solid transparent',
                  }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                      style={{
                        backgroundColor: 'rgba(0, 230, 118, 0.1)',
                        border: '1px solid rgba(0, 230, 118, 0.25)',
                        color: '#00e676',
                      }}
                    >
                      {stock.symbol.slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-gray-200 truncate flex items-center gap-1.5">
                        <span>{stock.symbol}</span>
                        {isSelected && (
                          <span className="text-[9px] px-1 rounded font-normal" style={{ backgroundColor: 'rgba(0, 230, 118, 0.2)', color: '#00e676' }}>
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-400 truncate">{stock.name}</div>
                    </div>
                  </div>

                  <span
                    className="text-[10px] px-2 py-0.5 rounded font-medium flex-shrink-0 max-w-[7rem] truncate uppercase tracking-wider"
                    style={{ backgroundColor: 'rgba(30, 45, 61, 0.5)', color: '#94a3b8' }}
                  >
                    {stock.sector || 'NSE'}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Keyboard hint footer */}
          <div
            className="flex items-center justify-between px-3 py-1.5 text-[10px] text-gray-500"
            style={{ backgroundColor: '#111827', borderTop: '1px solid rgba(30, 45, 61, 0.6)' }}
          >
            <span>↑↓ Navigate · Enter Select</span>
            <span className="flex items-center gap-1">
              <CornerDownLeft size={10} /> Esc Close
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
