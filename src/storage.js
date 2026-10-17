// Settings, last-good-data cache and install bar snooze in localStorage. Every access is guarded.
import { DEFAULTS, SET_KEY, CACHE_KEY, INSTALL_KEY } from './config.js';

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SET_KEY) || 'null');
    if (s && typeof s === 'object') return { ...DEFAULTS, ...s };
  } catch (e) { /* storage blocked */ }
  return { ...DEFAULTS };
}
export function saveSettings(s) {
  try { localStorage.setItem(SET_KEY, JSON.stringify(s)); } catch (e) { /* storage blocked */ }
}

export function loadCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (c && c.data) return c;
  } catch (e) { /* ignore */ }
  return null;
}
export function saveCache(data, updated) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data, updated })); } catch (e) { /* quota or blocked */ }
}

// Time until which the install bar stays hidden, or 0.
export function loadInstallSnooze() {
  try { return Number(localStorage.getItem(INSTALL_KEY)) || 0; } catch (e) { return 0; }
}
export function saveInstallSnooze(until) {
  try { localStorage.setItem(INSTALL_KEY, String(until)); } catch (e) { /* storage blocked */ }
}
