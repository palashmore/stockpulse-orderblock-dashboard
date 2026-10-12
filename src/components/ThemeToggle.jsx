import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

// Top-bar button that flips between the night (dark) and day (light) themes. "Follow my device" is chosen in Settings.
export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const night = theme === 'night';
  return (
    <button
      onClick={toggle}
      aria-label={night ? 'Switch to day theme' : 'Switch to night theme'}
      title={night ? 'Switch to day theme' : 'Switch to night theme'}
      className="p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/5 cursor-pointer flex-shrink-0"
    >
      {night ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
