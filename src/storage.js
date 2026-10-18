// Settings overrides, last-good-data cache, Plan a row choices, install bar
// state and the Settings reminder in localStorage (08 section 8). Every access
// is guarded. Every loader first calls migrateStorage(), which moves the old
// putney-rowing-* keys to the new ones once.
import { KEYS, OLD_KEYS } from './config.js';
import { PUTNEY_DEFAULTS } from './putney.js';

// The one location the old keys held.
const OLD_SLUG = 'putney-landing';
const OLD_PREFIX = 'putney-rowing-';

// One value from the old settings, as it is stored now: a number, or '' for a
// level turned off. The dock reading was typed text ("55"); it becomes a number
// as waterOverridden() reads it, and text that is not a number is dropped.
function oldValue(key, v) {
  if (key === 'waterOverride') { const n = parseFloat(v); return Number.isFinite(n) ? n : undefined; }
  if (v === '' || Number.isFinite(v)) return v;
}

// The values in S that differ from Putney's defaults. Numbers compare as
// numbers, and '' (a level turned off) is a real override.
export function overridesOf(S) {
  const values = {};
  for (const k of Object.keys(PUTNEY_DEFAULTS)) if (S[k] !== undefined && S[k] !== PUTNEY_DEFAULTS[k]) values[k] = S[k];
  return values;
}

// Copies the old keys to the new ones (08 8.3). Each step has its own try/catch
// and writes its target only when that key is absent, so a rerun after a failed
// step never overwrites something saved since. The marker waits for every step.
// Safe to call from every loader. The old keys stay until phase 2.
export function migrateStorage() {
  try { if (localStorage.getItem(KEYS.migrated) !== null) return; } catch (e) { return; } // done, or storage blocked
  let failed = false;
  const step = fn => { try { fn(); } catch (e) { failed = true; /* the next start tries again */ } };
  const absent = key => localStorage.getItem(key) === null;
  // The old value, unchanged, when there is one and the new key has none.
  const copy = (from, to) => step(() => {
    const v = localStorage.getItem(from);
    if (v !== null && absent(to)) localStorage.setItem(to, v);
  });

  // Settings: only what differs from Putney's defaults. `saved` keeps the
  // reminder hidden for people who saved before.
  step(() => {
    const raw = localStorage.getItem(OLD_KEYS.settings);
    if (raw === null || !absent(KEYS.settings)) return;
    let old = {};
    try { const s = JSON.parse(raw); if (s && typeof s === 'object') old = s; } catch (e) { /* unreadable, as it was before */ }
    const S = { ...PUTNEY_DEFAULTS };
    for (const k of Object.keys(S)) { const v = oldValue(k, old[k]); if (v !== undefined) S[k] = v; }
    localStorage.setItem(KEYS.settings, JSON.stringify({ [OLD_SLUG]: { saved: Date.now(), values: overridesOf(S) } }));
  });
  copy(OLD_KEYS.cache, KEYS.cache(OLD_SLUG));
  copy(OLD_KEYS.plan, KEYS.plan);
  copy(OLD_KEYS.install, KEYS.install);
  copy(OLD_KEYS.nudge, KEYS.nudge);
  // Anyone who used the old app opens on Putney.
  step(() => {
    if (!absent(KEYS.last)) return;
    for (let i = 0; i < localStorage.length; i++) {
      if (String(localStorage.key(i)).startsWith(OLD_PREFIX)) { localStorage.setItem(KEYS.last, OLD_SLUG); return; }
    }
  });
  if (!failed) step(() => localStorage.setItem(KEYS.migrated, '1'));
}

// { "<slug>": { saved, values } }, or {} when there is none or storage is blocked.
function settingsMap() {
  try {
    const s = JSON.parse(localStorage.getItem(KEYS.settings) || 'null');
    if (s && typeof s === 'object') return s;
  } catch (e) { /* storage blocked */ }
  return {};
}
// What the viewer changed from one location's defaults, as { key: value }.
export function loadOverrides(slug) {
  migrateStorage();
  const v = settingsMap()[slug]?.values;
  return v && typeof v === 'object' ? { ...v } : {};
}
export function saveOverrides(slug, values) {
  try {
    const all = settingsMap();
    all[slug] = { saved: Date.now(), values };
    localStorage.setItem(KEYS.settings, JSON.stringify(all));
  } catch (e) { /* storage blocked */ }
}
// True once the viewer has saved Settings for this location in this browser,
// even unchanged.
export function hasSavedSettings(slug) {
  migrateStorage();
  return Boolean(settingsMap()[slug]?.saved);
}
// True once the Settings reminder has been dismissed in this browser.
export function nudgeDismissed() {
  migrateStorage();
  try { return localStorage.getItem(KEYS.nudge) !== null; } catch (e) { return false; }
}
export function dismissNudge() {
  try { localStorage.setItem(KEYS.nudge, '1'); } catch (e) { /* storage blocked */ }
}

export function loadCache(slug) {
  migrateStorage();
  try {
    const c = JSON.parse(localStorage.getItem(KEYS.cache(slug)) || 'null');
    if (c && c.data) return c;
  } catch (e) { /* ignore */ }
  return null;
}
export function saveCache(slug, data, updated) {
  try { localStorage.setItem(KEYS.cache(slug), JSON.stringify({ data, updated })); } catch (e) { /* quota or blocked */ }
}

// Plan a row choices: session length in minutes and time of day.
export function loadPlan() {
  migrateStorage();
  try {
    const p = JSON.parse(localStorage.getItem(KEYS.plan) || 'null');
    if (p && typeof p === 'object') return { minutes: 90, when: 'any', ...p };
  } catch (e) { /* storage blocked */ }
  return { minutes: 90, when: 'any' };
}
export function savePlan(p) {
  try { localStorage.setItem(KEYS.plan, JSON.stringify(p)); } catch (e) { /* storage blocked */ }
}

// Install bar: how many times it was dismissed, and whether to never show it.
export function loadInstall() {
  migrateStorage();
  try {
    const s = JSON.parse(localStorage.getItem(KEYS.install) || 'null');
    if (s && typeof s === 'object') return { dismissed: Number(s.dismissed) || 0, never: s.never === true };
  } catch (e) { /* storage blocked */ }
  return { dismissed: 0, never: false };
}
export function saveInstall(s) {
  try { localStorage.setItem(KEYS.install, JSON.stringify(s)); } catch (e) { /* storage blocked */ }
}
