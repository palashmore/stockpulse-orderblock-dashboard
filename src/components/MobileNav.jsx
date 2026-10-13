import { useState } from 'react';
import { Grid2x2, X, Compass, ChevronRight } from 'lucide-react';
import { NAV_ITEMS } from './Sidebar';

// Bottom navigation for phones and mobile tablets (sidebar is hidden below 'md' breakpoint)
// Primary high-frequency trading screens stay one tap away; 'More' displays all modules
const PRIMARY = ['lists', 'orderblock', 'intraday', 'swing'];

export default function MobileNav({ activeTab, onTabChange, marketLabel = null, marketOpen = null }) {
  const [open, setOpen] = useState(false);
  const primary = PRIMARY.map((id) => NAV_ITEMS.find((i) => i.id === id)).filter(Boolean);
  const inMore = !PRIMARY.includes(activeTab);

  const go = (id) => {
    onTabChange(id);
    setOpen(false);
  };

  return (
    <>
      {/* Full Module Drawer Modal */}
      {open && (
        <div className="md:hidden fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="All screens">
          <button
            aria-label="Close menu"
            className="absolute inset-0 w-full h-full cursor-pointer transition-opacity"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
            onClick={() => setOpen(false)}
          />

          <div
            className="absolute left-0 right-0 bottom-0 rounded-t-2xl px-4 pt-3 max-h-[85vh] overflow-y-auto shadow-2xl"
            style={{
              backgroundColor: '#0d1117',
              borderTop: '1px solid #1e2d3d',
              borderLeft: '1px solid #1e2d3d',
              borderRight: '1px solid #1e2d3d',
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 76px)',
            }}
          >
            {/* Grab handle indicator */}
            <div className="w-10 h-1 rounded-full mx-auto mb-3" style={{ backgroundColor: 'rgba(100, 116, 139, 0.4)' }} />

            {/* Header */}
            <div className="flex items-center justify-between pb-3 mb-3" style={{ borderBottom: '1px solid rgba(30, 45, 61, 0.5)' }}>
              <div className="flex items-center gap-2">
                <Compass size={16} style={{ color: '#00e676' }} />
                <span className="text-xs font-bold uppercase tracking-wider text-white">All Terminal Modules</span>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-medium"
                  style={{
                    backgroundColor: marketOpen === true ? 'rgba(0, 230, 118, 0.12)' : 'rgba(100, 116, 139, 0.12)',
                    color: marketOpen === true ? '#00e676' : '#94a3b8',
                  }}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${marketOpen === true ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
                  {marketLabel ?? 'Status Unknown'}
                </span>

                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-white/5 cursor-pointer transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Grid of All Screens */}
            <div className="grid grid-cols-3 gap-2 pb-2">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => go(item.id)}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-xl py-3 px-1.5 min-h-[72px] cursor-pointer transition-all ${
                      active ? 'text-green-400 font-bold' : 'text-gray-300 hover:text-white'
                    }`}
                    style={{
                      backgroundColor: active ? 'rgba(0, 230, 118, 0.12)' : 'rgba(30, 45, 61, 0.35)',
                      border: `1px solid ${active ? '#00e676' : 'rgba(30, 45, 61, 0.5)'}`,
                    }}
                  >
                    <Icon size={20} className={active ? 'text-green-400' : 'text-gray-400'} />
                    <span className="text-[11px] text-center leading-tight">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Fixed Bottom Glassmorphic Navigation Bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-[70] flex items-stretch backdrop-blur-md"
        aria-label="Main"
        style={{
          backgroundColor: 'rgba(13, 17, 23, 0.95)',
          borderTop: '1px solid rgba(30, 45, 61, 0.6)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.4)',
        }}
      >
        {primary.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => go(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-[58px] cursor-pointer transition-all relative ${
                active ? 'text-green-400 font-medium' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {/* Active top glowing bar */}
              {active && (
                <span
                  className="absolute top-0 left-1/4 right-1/4 h-[2px] rounded-full"
                  style={{
                    backgroundColor: '#00e676',
                    boxShadow: '0 0 8px #00e676',
                  }}
                />
              )}

              <Icon size={19} className={active ? 'text-green-400' : 'text-gray-400'} />
              <span className="text-[10px] tracking-tight">{item.label}</span>
            </button>
          );
        })}

        {/* 'More' Button */}
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-[58px] cursor-pointer transition-all relative ${
            inMore || open ? 'text-green-400 font-medium' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          {(inMore || open) && (
            <span
              className="absolute top-0 left-1/4 right-1/4 h-[2px] rounded-full"
              style={{
                backgroundColor: '#00e676',
                boxShadow: '0 0 8px #00e676',
              }}
            />
          )}

          <Grid2x2 size={19} className={inMore || open ? 'text-green-400' : 'text-gray-400'} />
          <span className="text-[10px] tracking-tight">More</span>
        </button>
      </nav>
    </>
  );
}
