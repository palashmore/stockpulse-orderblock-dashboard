import { useIndexMenu } from '../hooks/useIndexUniverse';

// Dropdown of NSE indices grouped by type (broad market, mid cap, small cap, sectors, themes).
export default function IndexSelect({ value, onChange }) {
  const menu = useIndexMenu();
  const groups = menu ? [...new Set(menu.map((m) => m.group))] : [];

  return (
    <label className="flex items-center gap-2 text-[10px] text-gray-500 uppercase tracking-wider">
      Index
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!menu}
        aria-label="Index"
        className="px-2 py-1.5 text-xs rounded text-gray-200 border border-gray-700 outline-none normal-case tracking-normal"
        style={{ backgroundColor: '#0d1117', maxWidth: 260 }}
      >
        {!menu && <option value={value}>Loading…</option>}
        {groups.map((g) => (
          <optgroup key={g} label={g}>
            {menu.filter((m) => m.group === g).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
