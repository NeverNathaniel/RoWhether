// Settings and last-good-data cache in localStorage. Every access is guarded.
import { DEFAULTS, SET_KEY, CACHE_KEY } from './config.js';

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
