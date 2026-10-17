// Settings, last-good-data cache, Plan a row choices and install bar snooze
// in localStorage. Every access is guarded.
import { DEFAULTS, SET_KEY, CACHE_KEY, PLAN_KEY, INSTALL_KEY } from './config.js';

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SET_KEY) || 'null');
    if (s && typeof s === 'object') return { ...DEFAULTS, ...s };
  } catch (e) { /* storage blocked */ }
  return { ...DEFAULTS };
}
// True once the viewer has saved Settings in this browser, even unchanged.
export function hasSavedSettings() {
  try { return localStorage.getItem(SET_KEY) !== null; } catch (e) { return false; }
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

// Plan a row choices: session length in minutes and time of day.
export function loadPlan() {
  try {
    const p = JSON.parse(localStorage.getItem(PLAN_KEY) || 'null');
    if (p && typeof p === 'object') return { minutes: 90, when: 'any', ...p };
  } catch (e) { /* storage blocked */ }
  return { minutes: 90, when: 'any' };
}
export function savePlan(p) {
  try { localStorage.setItem(PLAN_KEY, JSON.stringify(p)); } catch (e) { /* storage blocked */ }
}

// Time until which the install bar stays hidden, or 0.
export function loadInstallSnooze() {
  try { return Number(localStorage.getItem(INSTALL_KEY)) || 0; } catch (e) { return 0; }
}
export function saveInstallSnooze(until) {
  try { localStorage.setItem(INSTALL_KEY, String(until)); } catch (e) { /* storage blocked */ }
}
