import { validateConfig, SWING_DEFAULTS, INTRADAY_DEFAULTS } from './strategies';

// Strategy parameters, saved in this browser. Swing and intraday have separate keys and separate
// defaults and never read each other's values. Loaded values pass through validateConfig, so
// anything corrupt or out of range is clamped or replaced by the default.
const KEYS = { swing: 'stockpulse.strategy.swing.v1', intraday: 'stockpulse.strategy.intraday.v1' };
export const DEFAULTS = { swing: SWING_DEFAULTS, intraday: INTRADAY_DEFAULTS };

export function loadStrategyConfig(mode, storage) {
  try {
    return validateConfig(JSON.parse(storage.getItem(KEYS[mode])), DEFAULTS[mode]);
  } catch {
    return validateConfig({}, DEFAULTS[mode]);
  }
}

export function saveStrategyConfig(mode, config, storage) {
  try {
    storage.setItem(KEYS[mode], JSON.stringify(validateConfig(config, DEFAULTS[mode])));
    return true;
  } catch {
    return false;
  }
}

export const SLIPPAGE_KEY = 'stockpulse.strategy.slippageBps.v1';
export function loadSlippage(storage) {
  try {
    const raw = storage.getItem(SLIPPAGE_KEY);
    const v = raw === null ? NaN : Number(JSON.parse(raw));
    return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 5;
  } catch {
    return 5;
  }
}
