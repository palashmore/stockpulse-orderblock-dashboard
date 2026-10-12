// Day / night colour theme (pure helpers). The preference is "night", "day" or "auto" (follow the device); the
// resolved theme is always "night" or "day". The page palette is switched in CSS (index.css, `data-theme` on <html>);
// the chart is drawn by a library and takes its colours from here.
export const THEME_COLORS = { night: '#0a0e17', day: '#f1f5f9' }; // browser toolbar colour

/** "night" or "day" from the saved preference and whether the device is in dark mode. */
export function resolveTheme(pref, prefersDark) {
  if (pref === 'day') return 'day';
  if (pref === 'auto') return prefersDark ? 'night' : 'day';
  return 'night';
}

/** Colours for the price chart. Up/down colours stay green/red in both themes, darker on a light background. */
export function chartColors(theme) {
  if (theme === 'day') {
    return {
      text: '#475569', grid: 'rgba(148, 163, 184, 0.35)', border: '#cbd5e1', labelBg: '#e2e8f0', separator: '#cbd5e1',
      up: '#089981', down: '#f23645', volumeUp: 'rgba(8, 153, 129, 0.25)', volumeDown: 'rgba(242, 54, 69, 0.25)', crosshair: 'rgba(71, 85, 105, 0.4)',
    };
  }
  return {
    text: '#64748b', grid: 'rgba(30, 45, 61, 0.3)', border: '#1e2d3d', labelBg: '#1a2332', separator: '#1e2d3d',
    up: '#00e676', down: '#ff1744', volumeUp: 'rgba(0, 230, 118, 0.15)', volumeDown: 'rgba(255, 23, 68, 0.15)', crosshair: 'rgba(0, 230, 118, 0.3)',
  };
}

/** Next preference when the day/night button is pressed: flips what is on screen (so "auto" becomes the opposite). */
export function toggledPref(resolved) {
  return resolved === 'night' ? 'day' : 'night';
}
