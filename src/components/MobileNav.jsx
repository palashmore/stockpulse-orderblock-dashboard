import { useState } from 'react';
import { Grid2x2, X } from 'lucide-react';
import { NAV_ITEMS } from './Sidebar';

// Bottom navigation for phones and small tablets (the side bar is hidden below the "md" breakpoint).
// Four main screens stay one tap away; "More" opens every screen.
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
      {open && (
        <div className="md:hidden fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="All screens">
          <button aria-label="Close menu" className="absolute inset-0 w-full h-full" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 bottom-0 rounded-t-2xl px-3 pt-3 max-h-[80vh] overflow-y-auto" style={{ backgroundColor: '#0d1117', border: '1px solid #1e2d3d', paddingBottom: 'calc(env(safe-area-inset-bottom) + 72px)' }}>
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="flex items-center gap-2 text-xs text-gray-400">
                <span className={`w-2 h-2 rounded-full ${marketOpen === true ? 'bg-green-500' : marketOpen === false ? 'bg-red-500' : 'bg-gray-500'}`} />
                {marketLabel ?? 'Market status unknown'}
              </span>
              <button onClick={() => setOpen(false)} aria-label="Close" className="p-1.5 text-gray-400 cursor-pointer"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button key={item.id} onClick={() => go(item.id)} className={`flex flex-col items-center justify-center gap-1.5 rounded-lg py-3 px-1 min-h-[68px] cursor-pointer ${active ? 'text-green-400' : 'text-gray-300'}`} style={{ backgroundColor: active ? 'rgba(0, 230, 118, 0.12)' : 'rgba(30, 45, 61, 0.35)' }}>
                    <Icon size={20} />
                    <span className="text-[11px] text-center leading-tight">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[70] flex items-stretch" aria-label="Main" style={{ backgroundColor: 'rgba(13, 17, 23, 0.97)', borderTop: '1px solid rgba(30, 45, 61, 0.6)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {primary.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button key={item.id} onClick={() => go(item.id)} aria-current={active ? 'page' : undefined} className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px] cursor-pointer ${active ? 'text-green-400' : 'text-gray-400'}`}>
              <Icon size={20} />
              <span className="text-[10px]">{item.label}</span>
            </button>
          );
        })}
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px] cursor-pointer ${inMore || open ? 'text-green-400' : 'text-gray-400'}`}>
          <Grid2x2 size={20} />
          <span className="text-[10px]">More</span>
        </button>
      </nav>
    </>
  );
}
