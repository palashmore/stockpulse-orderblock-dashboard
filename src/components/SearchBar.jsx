import { useState, useRef, useEffect } from 'react';
import { Search, X, TrendingUp, TrendingDown } from 'lucide-react';
import { NIFTY_STOCKS } from '../data/stockData';

export default function SearchBar({ selectedStock, onSelectStock }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  const filtered = NIFTY_STOCKS.filter(
    (s) =>
      s.symbol.toLowerCase().includes(query.toLowerCase()) ||
      s.name.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 8);

  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.key === 'k') {
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
    <div className="relative" ref={dropdownRef}>
      <div
        className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-all ${
          focused ? 'ring-1 ring-green-500/30' : ''
        }`}
        style={{
          backgroundColor: '#111827',
          border: '1px solid rgba(30, 45, 61, 0.6)',
          width: '320px',
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
            setIsOpen(true);
          }}
          onFocus={() => {
            setFocused(true);
            setIsOpen(true);
          }}
          onBlur={() => setFocused(false)}
          className="bg-transparent text-sm text-gray-200 placeholder-gray-500 outline-none flex-1"
        />
        {query && (
          <button onClick={() => { setQuery(''); setIsOpen(false); }} className="cursor-pointer">
            <X size={14} className="text-gray-500 hover:text-gray-300" />
          </button>
        )}
        <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-xs text-gray-500 rounded"
          style={{ backgroundColor: 'rgba(30, 45, 61, 0.5)', border: '1px solid #1e2d3d' }}>
          Ctrl K
        </kbd>
      </div>

      {isOpen && filtered.length > 0 && (
        <div
          className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-50"
          style={{
            backgroundColor: '#151d2b',
            border: '1px solid #1e2d3d',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}
        >
          {filtered.map((stock) => (
            <button
              key={stock.symbol}
              onClick={() => {
                onSelectStock(stock);
                setQuery('');
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors cursor-pointer ${
                selectedStock?.symbol === stock.symbol
                  ? 'bg-green-500/10 text-green-400'
                  : 'text-gray-300 hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold"
                  style={{ backgroundColor: 'rgba(0, 230, 118, 0.1)', color: '#00e676' }}>
                  {stock.symbol.slice(0, 2)}
                </div>
                <div>
                  <div className="text-sm font-medium">{stock.symbol}</div>
                  <div className="text-xs text-gray-500">{stock.name}</div>
                </div>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full"
                style={{ backgroundColor: 'rgba(30, 45, 61, 0.5)', color: '#94a3b8' }}>
                {stock.sector}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
