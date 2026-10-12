import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useIndexMenu } from '../hooks/useIndexUniverse';
import { describeUniverse, parseSymbols, MAX_INDICES } from '../data/universe';

// Pick one or more NSE indices (or whole groups), add your own symbols and save the selection as a preset.
// The index lists come from NSE's official files through the server, not from this app's code.
export default function IndexSelect({ selection, labels, count }) {
  const menu = useIndexMenu();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [presetName, setPresetName] = useState('');
  const [customText, setCustomText] = useState('');
  const [note, setNote] = useState('');
  const box = useRef(null);
  const { universe } = selection;

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const menuLabels = menu ? Object.fromEntries(menu.map((m) => [m.id, m.label])) : {};
  const groups = menu ? [...new Set(menu.map((m) => m.group))] : [];
  const needle = filter.trim().toLowerCase();

  const addCustom = () => {
    const { valid, skipped } = parseSymbols(customText);
    if (valid.length === 0) { setNote(skipped.length ? `Could not read: ${skipped.join(', ')}` : 'Type or paste NSE symbols, such as TCS, IRFC'); return; }
    selection.setCustom([...new Set([...universe.custom, ...valid])]);
    setCustomText('');
    setNote(skipped.length ? `Added ${valid.length}. Skipped: ${skipped.join(', ')}` : `Added ${valid.length}`);
  };

  return (
    <div className="relative" ref={box}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Choose indices" className="flex items-center gap-2 px-3 py-1.5 text-xs rounded border border-gray-700 text-gray-200 hover:border-gray-500 cursor-pointer" style={{ backgroundColor: '#0d1117', maxWidth: 'min(70vw, 360px)' }}>
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Universe</span>
        <span className="truncate">{describeUniverse(universe, { ...menuLabels, ...labels }, count)}</span>
        <ChevronDown size={12} />
      </button>

      {open && (
        <div className="absolute z-40 mt-1 w-[min(92vw,420px)] max-h-[70vh] overflow-y-auto rounded-md p-3 space-y-3" style={{ backgroundColor: '#151d2b', border: '1px solid #1e2d3d', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
          <div className="flex items-center gap-2">
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find an index" aria-label="Find an index" className="flex-1 px-2 py-1.5 text-xs rounded bg-transparent text-gray-200 border border-gray-700 focus:border-green-500 outline-none" />
            <span className="text-[10px] text-gray-500">{universe.ids.length}/{MAX_INDICES} indices</span>
          </div>

          {universe.presets.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Saved presets</p>
              <div className="flex flex-wrap gap-1.5">
                {universe.presets.map((p) => (
                  <span key={p.name} className="inline-flex items-center rounded bg-green-500/10 text-green-300 text-xs">
                    <button onClick={() => selection.applyPreset(p.name)} className="pl-2 pr-1 py-1 cursor-pointer">{p.name}</button>
                    <button onClick={() => selection.deletePreset(p.name)} aria-label={`Delete preset ${p.name}`} className="px-1.5 py-1 text-gray-500 hover:text-red-400 cursor-pointer">×</button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {!menu && <p className="text-xs text-gray-500">Loading the index list…</p>}
          {groups.map((g) => {
            const members = menu.filter((m) => m.group === g);
            const shown = members.filter((m) => !needle || m.label.toLowerCase().includes(needle));
            if (shown.length === 0) return null;
            const allOn = members.every((m) => universe.ids.includes(m.id));
            return (
              <div key={g}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">{g}</p>
                  <button onClick={() => selection.toggleGroup(members.map((m) => m.id))} className="text-[10px] underline cursor-pointer" style={{ color: '#00e5ff' }}>{allOn ? 'Clear group' : 'Select group'}</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
                  {shown.map((m) => (
                    <label key={m.id} className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
                      <input type="checkbox" checked={universe.ids.includes(m.id)} onChange={() => selection.toggle(m.id)} />
                      <span className="truncate">{m.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}

          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Custom symbols ({universe.custom.length})</p>
            <div className="flex gap-1.5">
              <input value={customText} onChange={(e) => setCustomText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCustom()} placeholder="TCS, IRFC, ..." aria-label="Custom symbols" className="flex-1 px-2 py-1.5 text-xs rounded bg-transparent text-gray-200 border border-gray-700 focus:border-green-500 outline-none" />
              <button onClick={addCustom} className="px-2.5 py-1.5 text-xs rounded bg-white/5 text-gray-300 hover:bg-white/10 cursor-pointer">Add</button>
            </div>
            {universe.custom.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {universe.custom.map((s) => (
                  <span key={s} className="inline-flex items-center rounded bg-white/5 text-gray-300 text-[11px]">
                    <span className="pl-2">{s}</span>
                    <button onClick={() => selection.setCustom(universe.custom.filter((x) => x !== s))} aria-label={`Remove ${s}`} className="px-1.5 text-gray-500 hover:text-red-400 cursor-pointer">×</button>
                  </span>
                ))}
              </div>
            )}
            {note && <p className="text-[10px] text-gray-500 mt-1">{note}</p>}
          </div>

          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Save this selection</p>
            <div className="flex gap-1.5">
              <input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Preset name" aria-label="Preset name" className="flex-1 px-2 py-1.5 text-xs rounded bg-transparent text-gray-200 border border-gray-700 focus:border-green-500 outline-none" />
              <button onClick={() => { if (selection.savePreset(presetName)) setPresetName(''); }} disabled={!presetName.trim()} className="px-2.5 py-1.5 text-xs rounded bg-green-500/15 text-green-400 enabled:hover:bg-green-500/25 enabled:cursor-pointer disabled:opacity-40">Save</button>
            </div>
          </div>
          {!selection.storageOk && <p className="text-[11px]" style={{ color: '#ff1744' }}>Browser storage is blocked, so this selection will not be remembered.</p>}
        </div>
      )}
    </div>
  );
}
